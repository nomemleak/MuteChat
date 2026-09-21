'use client'

import { useIsOnline } from '@/components/PresenceProvider'

/** Status line under the username, in the conversation header. */
export function FriendStatus({ friendId }: { friendId: string }) {
  const online = useIsOnline(friendId)

  return (
    <p className="text-ink-faint flex items-center gap-1.5 text-xs">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          online ? 'bg-emerald-400' : 'bg-zinc-600'
        }`}
      />
      {online ? 'Online' : 'Offline'}
    </p>
  )
}
