'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { GifPicker } from '@/components/GifPicker'
import { MessageList, type DisplayMessage } from '@/components/MessageList'
import { useToast } from '@/components/Toast'
import { emitConversationRead } from '@/lib/events'
import { describeSupabaseError } from '@/lib/supabase-error'
import type { Gif, Message } from '@/types/database'
import { createClient } from '@/utils/supabase/client'

/** Inserts a message while avoiding duplicates (Realtime + the send's own echo). */
function upsertMessage(list: DisplayMessage[], incoming: DisplayMessage) {
  if (list.some((message) => message.id === incoming.id)) {
    return list.map((message) =>
      message.id === incoming.id ? { ...message, ...incoming } : message,
    )
  }
  return [...list, incoming]
}

export default function ChatRoom({
  conversationId,
  currentUserId,
  friendUsername,
}: {
  conversationId: string
  currentUserId: string
  friendUsername: string
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)

  const toast = useToast()
  const supabase = useMemo(() => createClient(), [])

  // Avoids firing a read receipt for every single incoming message.
  const lastMarkedRef = useRef(0)

  const markAsRead = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return
    if (Date.now() - lastMarkedRef.current < 1500) return
    lastMarkedRef.current = Date.now()

    const { error } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    })

    if (error) {
      console.warn(
        '[MuteChat] mark_conversation_read failed —',
        describeSupabaseError(error),
      )
      return
    }

    emitConversationRead()
  }, [supabase, conversationId])

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) toast.error("Couldn't load the messages.")
    else setMessages((data ?? []) as Message[])

    setIsLoading(false)
  }, [supabase, conversationId, toast])

  useEffect(() => {
    setIsLoading(true)
    lastMarkedRef.current = 0
    void fetchMessages()
    void markAsRead()

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((current) =>
            upsertMessage(current, payload.new as DisplayMessage),
          )
          // The conversation is on screen: no unread badge.
          void markAsRead()
        },
      )
      .on(
        'postgres_changes',
        // DELETE events only carry the primary key: they can't be filtered
        // by conversation, so messages are removed by id.
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const removedId = (payload.old as { id?: string }).id
          if (!removedId) return
          setMessages((current) => current.filter((m) => m.id !== removedId))
        },
      )
      .subscribe()

    // Coming back to the tab counts as reading.
    const onVisible = () => {
      if (!document.hidden) void markAsRead()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      void supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [supabase, conversationId, fetchMessages, markAsRead])

  const sendGif = async (gif: Gif) => {
    if (isSending) return

    setIsSending(true)

    // Optimistic UI: the GIF shows up right away, semi-transparent.
    const temporaryId = `temp-${crypto.randomUUID()}`
    setMessages((current) => [
      ...current,
      {
        id: temporaryId,
        conversation_id: conversationId,
        sender_id: currentUserId,
        gif_url: gif.url,
        created_at: new Date().toISOString(),
        pending: true,
      },
    ])

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        gif_url: gif.url,
      })
      .select()
      .single()

    setIsSending(false)

    if (error) {
      setMessages((current) => current.filter((m) => m.id !== temporaryId))
      toast.error("Couldn't send your GIF.")
      return
    }

    // Replace the optimistic message with the real row. If Realtime already
    // delivered it, `upsertMessage` prevents a duplicate.
    setMessages((current) =>
      upsertMessage(
        current.filter((m) => m.id !== temporaryId),
        data as Message,
      ),
    )

    // Push notification for the recipient, without blocking the UI.
    void fetch('/api/push/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
      keepalive: true,
    }).catch(() => {
      // Notifications are a bonus: a failure is not the user's concern.
    })
  }

  const deleteMessage = async (message: DisplayMessage) => {
    const snapshot = messages
    setMessages((current) => current.filter((m) => m.id !== message.id))

    const { error } = await supabase.from('messages').delete().eq('id', message.id)

    if (error) {
      setMessages(snapshot)
      toast.error("Couldn't delete this GIF.")
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <MessageList
        messages={messages}
        currentUserId={currentUserId}
        friendUsername={friendUsername}
        isLoading={isLoading}
        onDelete={deleteMessage}
      />

      <GifPicker onSelect={sendGif} disabled={isSending} />
    </div>
  )
}
