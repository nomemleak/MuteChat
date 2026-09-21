import { redirect } from 'next/navigation'

import { Avatar } from '@/components/Avatar'
import ChatRoom from '@/components/ChatRoom'
import { SidebarToggle } from '@/components/ChatShell'
import { FriendStatus } from '@/components/FriendStatus'
import { createClient } from '@/utils/supabase/server'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Postgres error code raised by the RPC when the two users are not friends. */
const INSUFFICIENT_PRIVILEGE = '42501'

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header border-line-soft flex items-center border-b px-4 md:hidden">
        <SidebarToggle />
      </header>
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-ink-muted max-w-md text-center text-sm">{children}</p>
      </div>
    </div>
  )
}

export default async function FriendChatPage({
  params,
}: {
  params: Promise<{ friendId: string }>
}) {
  const { friendId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  if (!UUID_PATTERN.test(friendId)) {
    return <ErrorPanel>Conversation not found.</ErrorPanel>
  }

  const { data: friendProfile } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', friendId)
    .maybeSingle()

  if (!friendProfile) {
    return <ErrorPanel>User not found.</ErrorPanel>
  }

  // One atomic RPC: checks the friendship, then finds the existing
  // conversation or creates it. It replaces the three queries that let
  // duplicate conversations through when two tabs were open.
  const { data: conversationId, error } = await supabase.rpc(
    'get_or_create_direct_conversation',
    { p_friend_id: friendId },
  )

  if (error || !conversationId) {
    return (
      <ErrorPanel>
        {error?.code === INSUFFICIENT_PRIVILEGE
          ? 'You can only message your friends.'
          : "We couldn't open this conversation."}
      </ErrorPanel>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="app-header border-line-soft bg-surface-1/80 flex shrink-0 items-center gap-3 border-b px-4 backdrop-blur-xl">
        <SidebarToggle />
        <Avatar userId={friendProfile.id} username={friendProfile.username} />
        <div className="min-w-0">
          <h1 className="text-ink truncate font-semibold">
            @{friendProfile.username}
          </h1>
          <FriendStatus friendId={friendProfile.id} />
        </div>
      </header>

      <ChatRoom
        conversationId={conversationId as string}
        currentUserId={user.id}
        friendUsername={friendProfile.username}
      />
    </div>
  )
}
