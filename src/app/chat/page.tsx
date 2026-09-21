import Image from 'next/image'

import { SidebarToggle } from '@/components/ChatShell'

export default function ChatHomePage() {
  return (
    <>
      <header className="app-header border-line-soft bg-surface-1/80 flex shrink-0 items-center gap-2 border-b px-4 backdrop-blur-xl md:hidden">
        <SidebarToggle />
        <Image
          src="/logo-wordmark.png"
          alt="MuteChat"
          width={618}
          height={144}
          className="h-6 w-auto"
        />
      </header>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8">
        <div className="aura opacity-60" aria-hidden="true" />

        <div className="relative max-w-sm text-center">
          <Image
            src="/mascot.png"
            alt=""
            width={309}
            height={305}
            priority
            className="animate-float mx-auto mb-8 w-40 drop-shadow-[0_24px_60px_rgba(135,68,249,0.4)]"
          />
          <h1 className="text-ink text-2xl font-semibold">Shh. It starts here.</h1>
          <p className="text-ink-muted mt-3 text-sm leading-relaxed">
            Pick a friend from the list to send them a GIF, or add someone by
            their username.
          </p>
        </div>
      </div>
    </>
  )
}
