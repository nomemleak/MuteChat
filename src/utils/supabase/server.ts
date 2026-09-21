import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Create it on every request: never store it in a module-level variable.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where writing cookies is not
          // allowed. The middleware takes care of refreshing the session.
        }
      },
    },
  })
}
