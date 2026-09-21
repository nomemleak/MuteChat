'use client'

import { Trash2 } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef } from 'react'

import type { Message } from '@/types/database'

export type DisplayMessage = Message & { pending?: boolean }

const DAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
})

function dayLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

  if (sameDay(date, today)) return 'Today'
  if (sameDay(date, yesterday)) return 'Yesterday'
  return DAY_FORMATTER.format(date)
}

function EmptyState({ friendUsername }: { friendUsername: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <Image
        src="/mascot.png"
        alt=""
        width={309}
        height={305}
        className="animate-float mb-6 h-32 w-auto opacity-90 drop-shadow-[0_18px_40px_rgba(135,68,249,0.35)]"
      />
      <p className="text-ink font-medium">
        Nothing to say? Perfect, that&apos;s the point.
      </p>
      <p className="text-ink-faint mt-1 text-sm">
        Send the first GIF to @{friendUsername}.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-hidden p-4" aria-hidden="true">
      {[
        'ml-auto h-32 w-52',
        'h-24 w-40',
        'ml-auto h-28 w-44',
      ].map((shape, index) => (
        <div key={index} className={`skeleton rounded-2xl ${shape}`} />
      ))}
    </div>
  )
}

export function MessageList({
  messages,
  currentUserId,
  friendUsername,
  isLoading,
  onDelete,
}: {
  messages: DisplayMessage[]
  currentUserId: string
  friendUsername: string
  isLoading: boolean
  onDelete: (message: DisplayMessage) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (isLoading) return <LoadingState />

  if (messages.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <EmptyState friendUsername={friendUsername} />
      </div>
    )
  }

  let lastDay = ''

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-6">
      {messages.map((message) => {
        const isMine = message.sender_id === currentUserId
        const day = dayLabel(message.created_at)
        const showDay = day !== lastDay
        lastDay = day

        return (
          <div key={message.id}>
            {showDay && (
              <div className="my-6 flex items-center gap-3 first:mt-0">
                <span className="bg-line-soft h-px flex-1" />
                <span className="text-ink-faint text-[11px] tracking-wide uppercase">
                  {day}
                </span>
                <span className="bg-line-soft h-px flex-1" />
              </div>
            )}

            <div
              className={`group flex items-end gap-2 ${
                isMine ? 'justify-end' : 'justify-start'
              }`}
            >
              {isMine && !message.pending && (
                <button
                  type="button"
                  onClick={() => onDelete(message)}
                  className="text-ink-faint mb-1 shrink-0 p-1 transition-opacity hover:text-rose-400 focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                  aria-label="Delete this GIF"
                >
                  <Trash2 size={15} />
                </button>
              )}

              <figure
                className={`animate-rise max-w-[78%] overflow-hidden rounded-2xl shadow-lg shadow-black/30 sm:max-w-[60%] ${
                  isMine
                    ? 'ring-brand-500/40 ring-1'
                    : 'ring-line ring-1'
                } ${message.pending ? 'opacity-60' : ''}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.gif_url}
                  alt="GIF"
                  loading="lazy"
                  className="bg-surface-2 max-h-72 w-full object-contain"
                />
                <figcaption
                  className={`px-3 py-1 text-[10px] ${
                    isMine
                      ? 'bg-brand-600/30 text-brand-100 text-right'
                      : 'bg-surface-2 text-ink-faint'
                  }`}
                >
                  {message.pending
                    ? 'Sending…'
                    : TIME_FORMATTER.format(new Date(message.created_at))}
                </figcaption>
              </figure>
            </div>
          </div>
        )
      })}

      <div ref={bottomRef} />
    </div>
  )
}
