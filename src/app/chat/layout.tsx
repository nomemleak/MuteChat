import { redirect } from 'next/navigation'

import { ChatShell } from '@/components/ChatShell'
import { Sidebar } from '@/components/Sidebar'
import { createClient } from '@/utils/supabase/server'

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle()

  // Without a public profile the app has nothing to show. This means the
  // `handle_new_user` SQL trigger never ran (schema not installed): run
  // supabase/setup.sql.
  if (!profile?.username) {
    return (
      <div className="bg-surface-0 text-ink-muted flex h-[100svh] items-center justify-center p-8 text-center">
        <p className="max-w-md">
          We couldn&apos;t load your profile. Please sign in again in a moment.
        </p>
      </div>
    )
  }

  return (
    <ChatShell
      currentUserId={user.id}
      sidebar={
        <Sidebar currentUsername={profile.username} currentUserId={user.id} />
      }
    >
      {children}
    </ChatShell>
  )
}
