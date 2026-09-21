'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'

import { PresenceProvider } from '@/components/PresenceProvider'
import { ToastProvider } from '@/components/Toast'

const SidebarContext = createContext<{ open: () => void } | null>(null)

/**
 * Opens the drawer. Only visible below the `md` breakpoint.
 * Rendered from page headers (server components).
 */
export function SidebarToggle() {
  const context = useContext(SidebarContext)
  if (!context) return null

  return (
    <button
      type="button"
      onClick={context.open}
      className="text-ink-muted hover:bg-surface-2 hover:text-ink -ml-1 rounded-lg p-2 transition-colors md:hidden"
      aria-label="Open your friends list"
    >
      <Menu size={20} />
    </button>
  )
}

/**
 * Chat shell: two columns on large screens, a sliding drawer on mobile.
 * The drawer closes whenever the conversation changes.
 */
export function ChatShell({
  currentUserId,
  sidebar,
  children,
}: {
  currentUserId: string
  sidebar: React.ReactNode
  children: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => setIsOpen(false), [pathname])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  return (
    <SidebarContext.Provider value={{ open: () => setIsOpen(true) }}>
      <PresenceProvider currentUserId={currentUserId}>
        <ToastProvider>
          <div className="bg-surface-0 text-ink flex h-[100svh] max-h-[100svh] overflow-hidden">
            {/* Backdrop behind the mobile drawer */}
            {isOpen && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close your friends list"
                className="animate-fade fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
              />
            )}

            <aside
              className={`border-line bg-surface-1 fixed inset-y-0 left-0 z-40 flex w-[19rem] max-w-[85vw] flex-col border-r transition-transform duration-300 ease-out md:static md:w-80 md:max-w-none md:translate-x-0 ${
                isOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            >
              {sidebar}
            </aside>

            {/* `min-h-0` / `min-w-0`: without them, a flex child refuses to
                shrink below its content size. The column grew with every
                message and the whole page overflowed, instead of letting only
                the message list scroll. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </ToastProvider>
      </PresenceProvider>
    </SidebarContext.Provider>
  )
}
