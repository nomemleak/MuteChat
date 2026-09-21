import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/utils/supabase/server'

/** Exchanges the OAuth code for a session, then redirects into the app. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  // Only internal redirects are accepted, to prevent an open redirect.
  const rawNext = searchParams.get('next') ?? '/chat'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/chat'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // The public profile is created by the `handle_new_user` SQL trigger.
  return NextResponse.redirect(`${origin}${next}`)
}
