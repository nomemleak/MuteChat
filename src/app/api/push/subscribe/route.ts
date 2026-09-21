import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

type SubscriptionPayload = {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

/** Saves (or updates) the push subscription of the current browser. */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: SubscriptionPayload
  try {
    body = (await request.json()) as SubscriptionPayload
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return NextResponse.json({ error: 'Incomplete subscription' }, { status: 400 })
  }

  // `endpoint` is unique: a given browser updates its row instead of adding
  // a new one every time it signs in.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth_key: keys.auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 255) ?? null,
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    // Details stay in the server logs. 42P01 means the table does not exist:
    // supabase/migrations/0002_unread_presence_push.sql has not been run.
    console.error('Could not save the push subscription:', error)
    return NextResponse.json(
      { error: "Couldn't save the subscription." },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}

/** Deletes the push subscription of the current browser. */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const endpoint = request.nextUrl.searchParams.get('endpoint')
  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  }

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
