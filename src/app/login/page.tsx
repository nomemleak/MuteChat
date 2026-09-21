'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'

import { createClient } from '@/utils/supabase/client'

import { loginAnonymous, signupAnonymous } from './actions'

export default function LoginPage() {
  const [showAnonForm, setShowAnonForm] = useState(false)
  const [isLogin, setIsLogin] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleGoogleLogin = async () => {
    setError(null)
    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) setError('Google sign-in failed.')
  }

  const handleAnonSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)
    const action = isLogin ? loginAnonymous : signupAnonymous

    startTransition(async () => {
      const result = await action(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="aura" aria-hidden="true" />

      <div className="glass animate-rise relative w-full max-w-sm rounded-3xl p-8 shadow-2xl shadow-black/50">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/">
            <Image
              src="/logo-wordmark.png"
              alt="MuteChat"
              width={618}
              height={144}
              priority
              className="mb-5 h-10 w-auto"
            />
          </Link>
          <p className="text-ink-muted text-sm">
            {isLogin ? 'Welcome back.' : 'Pick a username and you’re in.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-4 py-3 text-sm font-semibold text-zinc-900 transition-all hover:scale-[1.02] hover:bg-zinc-100 active:scale-95"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="border-line w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-surface-1 text-ink-faint px-3 tracking-wider uppercase">
              Or
            </span>
          </div>
        </div>

        {!showAnonForm ? (
          <button
            type="button"
            onClick={() => setShowAnonForm(true)}
            className="border-line text-ink-muted hover:border-brand-500/60 hover:text-ink w-full rounded-full border py-3 text-sm font-medium transition-all"
          >
            Continue anonymously
          </button>
        ) : (
          <form onSubmit={handleAnonSubmit} className="animate-fade space-y-4">
            {error && (
              <p
                role="alert"
                className="animate-pop rounded-xl border border-rose-500/40 bg-rose-950/40 p-3 text-sm text-rose-200"
              >
                {error}
              </p>
            )}

            <div>
              <label
                htmlFor="username"
                className="text-ink-muted mb-1.5 block text-sm font-medium"
              >
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
                minLength={3}
                maxLength={20}
                pattern="[A-Za-z0-9._\-]{3,20}"
                className="border-line bg-surface-0 text-ink placeholder-ink-faint focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-xl border px-4 py-3 text-base transition-colors focus:ring-4 focus:outline-none"
                placeholder="justin99"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="text-ink-muted mb-1.5 block text-sm font-medium"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                className="border-line bg-surface-0 text-ink placeholder-ink-faint focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-xl border px-4 py-3 text-base transition-colors focus:ring-4 focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {!isLogin && (
              <p className="text-ink-faint text-xs leading-relaxed">
                Fully anonymous: since no email is required, your password
                can&apos;t be reset. Keep it somewhere safe.
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 shadow-brand-900/50 w-full rounded-full bg-gradient-to-br py-3 text-sm font-semibold text-white shadow-lg transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            >
              {isPending
                ? 'Loading…'
                : isLogin
                  ? 'Sign in'
                  : 'Create my account'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin((value) => !value)
                  setError(null)
                }}
                className="text-brand-300 hover:text-brand-200 text-sm transition-colors"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
