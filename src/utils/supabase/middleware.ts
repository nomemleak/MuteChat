import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'

/** Routes reachable without being signed in. */
const PUBLIC_PATHS = ['/', '/login', '/auth']

/**
 * Files the browser requests WITHOUT sending cookies.
 *
 * The manifest is fetched without credentials (unless `crossorigin:
 * use-credentials` is set): the middleware saw no session, redirected to
 * /login, and the browser received HTML instead of JSON — hence
 * "Manifest: Line 1, column 1, Syntax error" and an app that could not be
 * installed.
 */
const UNAUTHENTICATED_ASSETS = [
  '/manifest.webmanifest',
  '/sw.js',
  '/offline.html',
]

function isPublicPath(pathname: string) {
  if (UNAUTHENTICATED_ASSETS.includes(pathname)) return true
  if (pathname.startsWith('/icons/')) return true

  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

/**
 * Refreshes the session token on every request and rewrites the cookies.
 * Without it, the session silently expires and Server Components see a
 * signed-out user after an hour.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Important: `getUser()` validates the token with Supabase.
  // Do not run anything between creating the client and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/chat'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
