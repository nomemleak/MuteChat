import type { NextRequest } from 'next/server'

import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Every route except:
     * - Next.js static files (_next/static, _next/image)
     * - the favicon, icons and images from the public folder
     * - the manifest, service worker and offline page, which the browser
     *   requests without cookies (see UNAUTHENTICATED_ASSETS)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|offline\\.html|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
}
