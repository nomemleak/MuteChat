'use client'

import { Check, LogOut, Search, UserPlus, X } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'

import { logout } from '@/app/login/actions'
import { Avatar } from '@/components/Avatar'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FriendMenu } from '@/components/FriendMenu'
import { useOnlineUsers } from '@/components/PresenceProvider'
import { PushToggle } from '@/components/PushToggle'
import { useToast } from '@/components/Toast'
import type {
  FriendEntry,
  FriendOverviewRow,
  FriendRequestResult,
} from '@/types/database'
import { CONVERSATION_READ_EVENT } from '@/lib/events'
import { describeSupabaseError } from '@/lib/supabase-error'
import { createClient } from '@/utils/supabase/client'

type FriendshipRow = {
  id: string
  status: FriendEntry['status']
  user_id_1: string
  user_id_2: string
  sender: { id: string; username: string; avatar_url: string | null } | null
  receiver: { id: string; username: string; avatar_url: string | null } | null
}

const REQUEST_FEEDBACK: Record<
  FriendRequestResult,
  { tone: 'success' | 'info'; message: string }
> = {
  sent: { tone: 'success', message: 'Friend request sent!' },
  accepted: { tone: 'success', message: 'You are now friends!' },
  already_pending: { tone: 'info', message: 'A request is already pending.' },
  already_friends: { tone: 'info', message: 'You are already friends.' },
}

/** Errors raised by the `send_friend_request` RPC, keyed by Postgres error code. */
const REQUEST_ERRORS: Record<string, string> = {
  P0002: 'User not found.',
  '22023': "You can't add yourself.",
}

function SidebarSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <li key={index} className="flex items-center gap-3 p-2">
          <span className="skeleton h-8 w-8 rounded-full" />
          <span className="skeleton h-3 flex-1 rounded-full" />
        </li>
      ))}
    </ul>
  )
}

/** Avatar with a presence dot. */
function PresenceAvatar({
  userId,
  username,
  online,
}: {
  userId: string
  username: string
  online: boolean
}) {
  return (
    <span className="relative shrink-0">
      <Avatar userId={userId} username={username} size="sm" />
      <span
        title={online ? 'Online' : 'Offline'}
        className={`border-surface-1 absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 ${
          online ? 'bg-emerald-400' : 'bg-zinc-600'
        }`}
      />
    </span>
  )
}

export function Sidebar({
  currentUsername,
  currentUserId,
}: {
  currentUsername: string
  currentUserId: string
}) {
  const [addQuery, setAddQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [friendships, setFriendships] = useState<FriendshipRow[]>([])
  const [overview, setOverview] = useState<FriendOverviewRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [friendToRemove, setFriendToRemove] = useState<FriendEntry | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isLoggingOut, startLogout] = useTransition()

  const pathname = usePathname()
  const router = useRouter()
  const toast = useToast()
  const online = useOnlineUsers()

  // The Supabase client opens a connection: one instance per mount.
  const supabase = useMemo(() => createClient(), [])

  const fetchFriendships = useCallback(async () => {
    // A single query with a join, instead of one SELECT per friend (N+1).
    const { data, error } = await supabase
      .from('friendships')
      .select(
        `id, status, user_id_1, user_id_2,
         sender:profiles!friendships_user_id_1_fkey(id, username, avatar_url),
         receiver:profiles!friendships_user_id_2_fkey(id, username, avatar_url)`,
      )
      .or(`user_id_1.eq.${currentUserId},user_id_2.eq.${currentUserId}`)
      .order('created_at', { ascending: true })

    setIsLoading(false)
    if (!error && data) setFriendships(data as unknown as FriendshipRow[])
  }, [supabase, currentUserId])

  const fetchOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_friends_overview')

    if (error) {
      // A 404 means PostgREST doesn't know the function. This used to fail
      // silently: the badges just stayed at zero.
      console.warn(
        '[MuteChat] get_friends_overview failed —',
        describeSupabaseError(error),
      )
      return
    }

    if (data) setOverview(data as FriendOverviewRow[])
  }, [supabase])

  useEffect(() => {
    void fetchFriendships()
    void fetchOverview()

    // Friend requests and new messages show up without reloading the page.
    const channel = supabase
      .channel(`sidebar:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => {
          void fetchFriendships()
          void fetchOverview()
        },
      )
      .on(
        // RLS only lets through the user's own conversations.
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => void fetchOverview(),
      )
      .subscribe()

    // Sent by ChatRoom when a conversation is marked as read.
    const onRead = () => void fetchOverview()
    window.addEventListener(CONVERSATION_READ_EVENT, onRead)

    return () => {
      void supabase.removeChannel(channel)
      window.removeEventListener(CONVERSATION_READ_EVENT, onRead)
    }
  }, [supabase, currentUserId, fetchFriendships, fetchOverview])

  const friends = useMemo<FriendEntry[]>(() => {
    const byFriendId = new Map(overview.map((row) => [row.friend_id, row]))

    return friendships
      .map((row): FriendEntry | null => {
        const outgoing = row.user_id_1 === currentUserId
        const other = outgoing ? row.receiver : row.sender
        if (!other) return null

        const stats = byFriendId.get(other.id)
        return {
          friendshipId: row.id,
          status: row.status,
          outgoing,
          friendId: other.id,
          friendUsername: other.username,
          friendAvatarUrl: other.avatar_url,
          unreadCount: stats?.unread_count ?? 0,
          lastMessageAt: stats?.last_message_at ?? null,
        }
      })
      .filter((entry): entry is FriendEntry => entry !== null)
  }, [friendships, overview, currentUserId])

  const handleAddFriend = async (event: React.FormEvent) => {
    event.preventDefault()
    const username = addQuery.trim()
    if (!username) return

    setIsAdding(true)

    // All the business logic (username lookup, detecting an existing request
    // in either direction, creation) runs in a single database transaction:
    // no more `.or().or()` query that overwrote itself.
    const { data, error } = await supabase.rpc('send_friend_request', {
      p_username: username,
    })

    if (error) {
      toast.error(REQUEST_ERRORS[error.code] ?? "Couldn't send the request.")
    } else {
      const feedback = REQUEST_FEEDBACK[data as FriendRequestResult]
      if (feedback?.tone === 'success') toast.success(feedback.message)
      else toast.info(feedback?.message ?? 'Friend request sent!')
      setAddQuery('')
      await fetchFriendships()
    }

    setIsAdding(false)
  }

  const acceptFriend = async (entry: FriendEntry) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', entry.friendshipId)

    if (error) {
      toast.error("Couldn't accept the request.")
      return
    }

    toast.success(`You are now friends with @${entry.friendUsername}.`)
    // The conversation is created on the fly when the chat is opened.
    await fetchFriendships()
    router.refresh()
  }

  const removeFriendship = async (entry: FriendEntry) => {
    setIsRemoving(true)

    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', entry.friendshipId)

    setIsRemoving(false)
    setFriendToRemove(null)

    if (error) {
      toast.error("Couldn't remove this friend.")
      return
    }

    toast.info(
      entry.status === 'accepted'
        ? `@${entry.friendUsername} was removed from your friends.`
        : 'Request cancelled.',
    )
    await fetchFriendships()
  }

  const needle = filter.trim().toLowerCase()
  const accepted = friends
    .filter((friend) => friend.status === 'accepted')
    .filter((friend) => friend.friendUsername.toLowerCase().includes(needle))
    // Most recent conversation first; friends with no messages after.
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
  const pending = friends.filter((friend) => friend.status === 'pending')
  const acceptedCount = friends.filter((f) => f.status === 'accepted').length

  return (
    <div className="flex h-full w-full flex-col">
      <div className="app-header border-line-soft flex shrink-0 items-center justify-between border-b px-4">
        <Link href="/chat" className="transition-opacity hover:opacity-80">
          <Image
            src="/logo-wordmark.png"
            alt="MuteChat"
            width={618}
            height={144}
            priority
            className="h-7 w-auto"
          />
        </Link>
        <button
          type="button"
          onClick={() => startLogout(() => void logout())}
          disabled={isLoggingOut}
          className="text-ink-faint hover:bg-surface-2 hover:text-ink rounded-lg p-2 transition-colors disabled:opacity-50"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>

      <div className="border-line-soft flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <PresenceAvatar
          userId={currentUserId}
          username={currentUsername}
          online
        />
        <div className="min-w-0">
          <p className="text-ink-faint text-[11px] tracking-wide uppercase">
            Signed in as
          </p>
          <p className="text-ink truncate text-sm font-semibold">
            @{currentUsername}
          </p>
        </div>
      </div>

      <div className="border-line-soft shrink-0 space-y-3 border-b p-4">
        <form onSubmit={handleAddFriend} className="flex gap-2">
          <input
            type="text"
            value={addQuery}
            onChange={(event) => setAddQuery(event.target.value)}
            placeholder="Add a username…"
            aria-label="Username to add"
            maxLength={20}
            className="border-line bg-surface-0 text-ink placeholder-ink-faint focus:border-brand-500 min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm transition-colors focus:outline-none"
          />
          <button
            type="submit"
            disabled={isAdding || !addQuery.trim()}
            className="bg-brand-600 hover:bg-brand-500 shadow-brand-900/40 rounded-xl px-3 text-white shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
            aria-label="Send friend request"
          >
            <UserPlus size={18} />
          </button>
        </form>

        <PushToggle />
      </div>

      <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">
              Friends
            </h2>
            {acceptedCount > 4 && (
              <div className="relative">
                <Search className="text-ink-faint absolute top-1.5 left-2 h-3.5 w-3.5" />
                <input
                  type="search"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filter"
                  aria-label="Filter your friends"
                  className="border-line bg-surface-0 text-ink placeholder-ink-faint focus:border-brand-500 w-28 rounded-lg border py-1 pr-2 pl-7 text-xs focus:outline-none"
                />
              </div>
            )}
          </div>

          {isLoading ? (
            <SidebarSkeleton />
          ) : (
            <ul className="space-y-1">
              {accepted.length === 0 && (
                <li className="text-ink-faint text-sm">
                  {needle ? 'No results.' : 'No friends yet.'}
                </li>
              )}
              {accepted.map((friend) => {
                const href = `/chat/${friend.friendId}`
                const isActive = pathname === href
                const hasUnread = friend.unreadCount > 0 && !isActive

                return (
                  <li
                    key={friend.friendshipId}
                    className={`group flex items-center rounded-xl pr-2 transition-colors ${
                      isActive
                        ? 'bg-brand-600/20 ring-brand-500/30 ring-1'
                        : 'hover:bg-surface-2'
                    }`}
                  >
                    <Link
                      href={href}
                      className={`flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-sm ${
                        isActive
                          ? 'text-brand-200'
                          : hasUnread
                            ? 'text-ink font-semibold'
                            : 'text-ink-muted'
                      }`}
                    >
                      <PresenceAvatar
                        userId={friend.friendId}
                        username={friend.friendUsername}
                        online={online.has(friend.friendId)}
                      />
                      <span className="truncate">@{friend.friendUsername}</span>

                      {hasUnread && (
                        <span
                          className="bg-brand-500 animate-pop ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white"
                          aria-label={`${friend.unreadCount} unread message${friend.unreadCount > 1 ? 's' : ''}`}
                        >
                          {friend.unreadCount > 99 ? '99+' : friend.unreadCount}
                        </span>
                      )}
                    </Link>
                    <FriendMenu
                      username={friend.friendUsername}
                      onRemove={() => setFriendToRemove(friend)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {pending.length > 0 && (
          <section>
            <h2 className="text-ink-faint mb-3 text-[11px] font-semibold tracking-wider uppercase">
              Pending
              <span className="bg-brand-600 ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
                {pending.length}
              </span>
            </h2>
            <ul className="space-y-2">
              {pending.map((friend) => (
                <li
                  key={friend.friendshipId}
                  className="border-line bg-surface-2 animate-pop flex items-center justify-between gap-2 rounded-xl border p-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      userId={friend.friendId}
                      username={friend.friendUsername}
                      size="sm"
                    />
                    <span className="text-ink-muted truncate">
                      @{friend.friendUsername}
                    </span>
                  </div>

                  {friend.outgoing ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-ink-faint text-xs">Sent</span>
                      <button
                        type="button"
                        onClick={() => removeFriendship(friend)}
                        className="text-ink-faint hover:text-rose-400"
                        aria-label={`Cancel the request to ${friend.friendUsername}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => acceptFriend(friend)}
                        className="bg-brand-600 hover:bg-brand-500 rounded-lg p-1.5 text-white transition-transform active:scale-90"
                        aria-label={`Accept ${friend.friendUsername}`}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFriendship(friend)}
                        className="bg-surface-3 text-ink-faint hover:text-rose-400 rounded-lg p-1.5 transition-transform active:scale-90"
                        aria-label={`Decline ${friend.friendUsername}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </nav>

      <ConfirmDialog
        open={friendToRemove !== null}
        busy={isRemoving}
        title={`Remove @${friendToRemove?.friendUsername}?`}
        description={
          <>
            You won&apos;t be friends anymore and the conversation will
            disappear from both of your lists. You&apos;ll need a new request
            to talk again.
          </>
        }
        confirmLabel="Remove"
        onCancel={() => setFriendToRemove(null)}
        onConfirm={() => {
          if (friendToRemove) void removeFriendship(friendToRemove)
        }}
      />
    </div>
  )
}
