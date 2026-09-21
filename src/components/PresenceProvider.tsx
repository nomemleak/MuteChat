'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { createClient } from '@/utils/supabase/client'

const PresenceContext = createContext<ReadonlySet<string>>(new Set())

const CHANNEL = 'presence:mutechat'

/**
 * Online presence through the Supabase Realtime Presence channel.
 *
 * The state lives in Realtime's memory: no table, no writes, and a user is
 * marked offline automatically when their WebSocket drops (tab closed,
 * network lost, device asleep).
 */
export function PresenceProvider({
  currentUserId,
  children,
}: {
  currentUserId: string
  children: React.ReactNode
}) {
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set())
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const channel = supabase.channel(CHANNEL, {
      config: { presence: { key: currentUserId } },
    })

    const sync = () => {
      setOnline(new Set(Object.keys(channel.presenceState())))
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, currentUserId])

  return (
    <PresenceContext.Provider value={online}>{children}</PresenceContext.Provider>
  )
}

/** Ids of the users currently online. */
export function useOnlineUsers() {
  return useContext(PresenceContext)
}

export function useIsOnline(userId: string) {
  return useContext(PresenceContext).has(userId)
}
