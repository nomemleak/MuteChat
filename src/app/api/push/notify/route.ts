import { NextResponse, type NextRequest } from 'next/server'
import webpush from 'web-push'

import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type PushTarget = {
  target_endpoint: string
  target_p256dh: string
  target_auth: string
}

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:contact@mutechat.app'

let configured = false
function configure() {
  if (configured || !PUBLIC_KEY || !PRIVATE_KEY) return
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
  configured = true
}

/**
 * Tells the other participants of a conversation that a GIF just arrived.
 * Called by the sender right after the message is inserted.
 *
 * No service role key is needed: the `get_push_targets` RPC is
 * `security definer` and checks on its own that the caller belongs to the
 * conversation before returning anything.
 */
export async function POST(request: NextRequest) {
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    // Notifications are optional: without VAPID keys, nothing breaks.
    return NextResponse.json({ ok: true, skipped: 'vapid_absent' })
  }
  configure()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let conversationId: string | undefined
  try {
    conversationId = ((await request.json()) as { conversationId?: string })
      .conversationId
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!conversationId) {
    return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })
  }

  const [{ data: targets, error }, { data: profile }] = await Promise.all([
    supabase.rpc('get_push_targets', { p_conversation_id: conversationId }),
    supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
  ])

  if (error) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const payload = JSON.stringify({
    title: `@${profile?.username ?? 'Someone'}`,
    body: 'sent you a GIF',
    url: `/chat/${user.id}`,
    tag: `conversation-${conversationId}`,
  })

  const results = await Promise.allSettled(
    ((targets ?? []) as PushTarget[]).map((target) =>
      webpush.sendNotification(
        {
          endpoint: target.target_endpoint,
          keys: { p256dh: target.target_p256dh, auth: target.target_auth },
        },
        payload,
        { TTL: 600 },
      ),
    ),
  )

  const sent = results.filter((result) => result.status === 'fulfilled').length
  return NextResponse.json({ ok: true, sent, total: results.length })
}
