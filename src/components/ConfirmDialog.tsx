'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Confirmation dialog for a destructive action.
 *
 * Focus starts on "Cancel": for an irreversible action, pressing Enter must
 * never confirm by reflex.
 *
 * Rendered through a portal into `document.body`. It is opened from the
 * sidebar, which has a `transform`, and a transformed ancestor becomes the
 * containing block of `position: fixed` descendants: without the portal,
 * `inset-0` would cover the sidebar instead of the whole screen.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const [mounted, setMounted] = useState(false)

  // `document` does not exist during server rendering: wait for the mount.
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return

    cancelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="animate-fade fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        className="glass animate-pop relative w-full max-w-sm rounded-2xl p-6 shadow-2xl shadow-black/60"
      >
        <h2 id="confirm-title" className="text-ink text-base font-semibold">
          {title}
        </h2>
        <div
          id="confirm-description"
          className="text-ink-muted mt-2 text-sm leading-relaxed"
        >
          {description}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border-line text-ink-muted hover:bg-surface-2 hover:text-ink rounded-xl border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-950/40 transition-all hover:bg-rose-500 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {busy ? 'Removing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
