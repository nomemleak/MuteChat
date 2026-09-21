import Image from 'next/image'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="aura opacity-70" aria-hidden="true" />

      <div className="relative max-w-sm">
        <Image
          src="/mascot.png"
          alt=""
          width={309}
          height={305}
          priority
          className="animate-float mx-auto mb-8 w-40 drop-shadow-[0_24px_60px_rgba(135,68,249,0.4)]"
        />
        <p className="text-brand-400 text-sm font-semibold tracking-[0.3em]">404</p>
        <h1 className="text-ink mt-2 text-2xl font-semibold">
          This page has nothing to say
        </h1>
        <p className="text-ink-muted mt-3 text-sm leading-relaxed">
          Mostly because it doesn&apos;t exist. But it&apos;s great at keeping
          secrets.
        </p>
        <Link
          href="/chat"
          className="from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 shadow-brand-900/50 mt-8 inline-flex rounded-full bg-gradient-to-br px-7 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95"
        >
          Back to your chats
        </Link>
      </div>
    </main>
  )
}
