'use client'

import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

type ToastTone = 'success' | 'error' | 'info'

type Toast = { id: number; tone: ToastTone; message: string }

const ToastContext = createContext<((tone: ToastTone, message: string) => void) | null>(
  null,
)

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-emerald-500/40 text-emerald-200',
  error: 'border-rose-500/40 text-rose-200',
  info: 'border-brand-500/40 text-brand-200',
}

const TONE_ICONS: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
}

const DURATION = 4000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, tone, message }])
      window.setTimeout(() => dismiss(id), DURATION)
    },
    [dismiss],
  )

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const Icon = TONE_ICONS[toast.tone]
          return (
            <div
              key={toast.id}
              role="status"
              className={`animate-rise glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg shadow-black/40 ${TONE_STYLES[toast.tone]}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" />
              <p className="flex-1">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="text-ink-faint hover:text-ink shrink-0 transition-colors"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/** Shows a short-lived notification. Does nothing if no provider is mounted above. */
export function useToast() {
  const push = useContext(ToastContext)

  return useMemo(
    () => ({
      success: (message: string) => push?.('success', message),
      error: (message: string) => push?.('error', message),
      info: (message: string) => push?.('info', message),
    }),
    [push],
  )
}
