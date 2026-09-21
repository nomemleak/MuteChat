'use client'

import { MoreVertical, UserMinus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MENU_HEIGHT = 48
const GAP = 6

/**
 * The "…" menu of a friend row.
 *
 * The menu uses `position: fixed`, placed from the button's bounding box:
 * with `absolute` it would be clipped by the friends list scroll area as soon
 * as the friend sits at the bottom of the column.
 *
 * It is rendered through a portal into `document.body`, and that matters:
 * the sidebar has a `transform` (the mobile drawer animation), and a
 * transformed ancestor becomes the containing block of `position: fixed`
 * descendants. Without the portal, coordinates from
 * `getBoundingClientRect()` — which are relative to the viewport — were
 * applied relative to the sidebar, and the menu landed several hundred
 * pixels off screen.
 */
export function FriendMenu({
  username,
  onRemove,
}: {
  username: string
  onRemove: () => void
}) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(
    null,
  )
  const [mounted, setMounted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // `document` does not exist during server rendering: wait for the mount.
  useEffect(() => setMounted(true), [])

  const close = () => setPosition(null)

  useEffect(() => {
    if (!position) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    // `capture`: also catches the list's own scroll, not just the window's —
    // otherwise the menu would stay stuck at its old position.
    window.addEventListener('scroll', close, true)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [position])

  const toggle = () => {
    if (position) return close()

    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return

    // Flip above the button when there is no room below.
    const openUpwards = rect.bottom + MENU_HEIGHT + GAP > window.innerHeight
    setPosition({
      top: openUpwards ? rect.top - MENU_HEIGHT - GAP : rect.bottom + GAP,
      right: window.innerWidth - rect.right,
    })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={position !== null}
        aria-label={`Options for ${username}`}
        className={`text-ink-faint hover:bg-surface-3 hover:text-ink shrink-0 rounded-lg p-1.5 transition-colors ${
          position ? 'bg-surface-3 text-ink' : 'md:opacity-0 md:group-hover:opacity-100'
        } focus-visible:opacity-100`}
      >
        <MoreVertical size={16} />
      </button>

      {position &&
        mounted &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, right: position.right }}
            className="border-line bg-surface-2 animate-pop fixed z-50 min-w-48 overflow-hidden rounded-xl border p-1 shadow-2xl shadow-black/60"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close()
                onRemove()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-500/15 hover:text-rose-200"
            >
              <UserMinus size={15} />
              Remove friend
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
