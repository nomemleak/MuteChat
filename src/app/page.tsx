import Image from 'next/image'
import Link from 'next/link'

const FEATURES = [
  { title: 'Zero words', body: 'No keyboard. Just a GIF search, and that’s it.' },
  { title: 'Anonymous', body: 'A username and a password. No email required.' },
  { title: 'Instant', body: 'GIFs arrive in real time, on both sides.' },
]

const GITHUB_URL = 'https://github.com/nomemleak/MuteChat'

/** GitHub mark (lucide-react no longer ships brand icons). */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

export default function Home() {
  return (
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div className="aura" aria-hidden="true" />

      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="border-line bg-surface-1/60 text-ink-muted hover:border-brand-500/50 hover:text-ink absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur transition-all hover:scale-[1.03] active:scale-95 md:right-6"
      >
        <GitHubMark />
        <span>GitHub</span>
      </a>

      <div className="relative flex w-full max-w-5xl flex-col items-center gap-12 md:flex-row md:justify-between md:gap-16">
        <div className="flex max-w-lg flex-col items-center text-center md:items-start md:text-left">
          <Image
            src="/logo-wordmark.png"
            alt="MuteChat"
            width={618}
            height={144}
            priority
            className="animate-rise h-14 w-auto md:h-16"
          />

          <p className="text-ink-muted animate-rise mt-6 text-lg leading-relaxed md:text-xl">
            The chat app that <b className="text-ink">only</b> speaks GIF.
            No words, just reactions.
          </p>

          <div className="animate-rise mt-10 flex w-full flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 shadow-brand-900/50 flex h-13 flex-1 items-center justify-center rounded-full bg-gradient-to-br px-8 py-3.5 font-semibold text-white shadow-xl transition-all hover:scale-[1.02] active:scale-95"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="border-line bg-surface-1/60 text-ink-muted hover:border-brand-500/50 hover:text-ink flex h-13 flex-1 items-center justify-center rounded-full border px-8 py-3.5 font-medium backdrop-blur transition-all"
            >
              I already have an account
            </Link>
          </div>

          <dl className="mt-12 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="border-line-soft bg-surface-1/50 rounded-2xl border p-4 backdrop-blur"
              >
                <dt className="text-brand-300 text-sm font-semibold">
                  {feature.title}
                </dt>
                <dd className="text-ink-faint mt-1 text-xs leading-relaxed">
                  {feature.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <Image
          src="/mascot.png"
          alt=""
          width={309}
          height={305}
          priority
          className="animate-float order-first w-40 shrink-0 drop-shadow-[0_30px_70px_rgba(135,68,249,0.45)] sm:w-48 md:order-none md:w-72"
        />
      </div>
    </main>
  )
}
