'use client'

import { Flame, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Gif } from '@/types/database'

type Mode = 'idle' | 'trending' | 'results'

export function GifPicker({
  onSelect,
  disabled,
}: {
  onSelect: (gif: Gif) => void
  disabled?: boolean
}) {
  const [term, setTerm] = useState('')
  const [gifs, setGifs] = useState<Gif[]>([])
  const [mode, setMode] = useState<Mode>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cancel the previous request when the user starts a new one, so a slow
  // response never overwrites more recent results.
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const load = useCallback(async (query: string | null) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const url = query
        ? `/api/gifs?q=${encodeURIComponent(query)}`
        : '/api/gifs?trending=1'

      const response = await fetch(url, { signal: controller.signal })
      const payload = (await response.json()) as { gifs?: Gif[]; error?: string }

      if (!response.ok) {
        setError(payload.error ?? 'Search failed.')
        setGifs([])
        return
      }

      const found = payload.gifs ?? []
      setGifs(found)
      setMode(query ? 'results' : 'trending')
      if (found.length === 0) setError('No GIFs found.')
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError('Search failed.')
      setGifs([])
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [])

  const close = () => {
    abortRef.current?.abort()
    setGifs([])
    setMode('idle')
    setError(null)
    setIsLoading(false)
  }

  const handleSelect = (gif: Gif) => {
    onSelect(gif)
    setTerm('')
    close()
  }

  return (
    <div className="border-line-soft bg-surface-1/90 pb-safe shrink-0 border-t backdrop-blur-xl">
      {(mode !== 'idle' || isLoading) && (
        <div className="border-line-soft animate-rise border-b px-4 pt-3 pb-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-ink-faint flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
              {mode === 'trending' && <Flame size={12} className="text-brand-400" />}
              {mode === 'trending' ? 'Trending' : 'Results'}
            </p>
            <button
              type="button"
              onClick={close}
              className="text-ink-faint hover:text-ink transition-colors"
              aria-label="Close suggestions"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-5">
            {isLoading &&
              Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="skeleton aspect-video w-full rounded-xl"
                  aria-hidden="true"
                />
              ))}

            {!isLoading &&
              gifs.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => handleSelect(gif)}
                  disabled={disabled}
                  title={gif.title}
                  className="group bg-surface-2 hover:ring-brand-500 focus-visible:ring-brand-400 relative aspect-video w-full overflow-hidden rounded-xl ring-2 ring-transparent transition-all hover:scale-[1.03] focus:outline-none disabled:opacity-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gif.previewUrl}
                    alt={gif.title}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </button>
              ))}
          </div>

          {error && !isLoading && (
            <p className="text-ink-faint pt-2 text-sm" role="status">
              {error}
            </p>
          )}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          const query = term.trim()
          if (query) void load(query)
        }}
        className="flex gap-2 p-3 sm:p-4"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="text-ink-faint absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2" />
          <input
            type="text"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onFocus={() => {
              // Instant suggestions: never start from an empty panel.
              if (mode === 'idle' && !isLoading) void load(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') close()
            }}
            placeholder="Search for a GIF…"
            aria-label="Search for a GIF"
            maxLength={100}
            className="border-line bg-surface-0 text-ink placeholder-ink-faint focus:border-brand-500 focus:ring-brand-500/20 w-full rounded-full border py-3 pr-4 pl-11 text-base transition-colors focus:ring-4 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !term.trim()}
          className="from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 shadow-brand-900/50 shrink-0 rounded-full bg-gradient-to-br px-5 font-semibold text-white shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100 sm:px-7"
        >
          {isLoading ? '…' : 'Search'}
        </button>
      </form>
    </div>
  )
}
