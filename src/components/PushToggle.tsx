'use client'

import { Bell, BellOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useToast } from '@/components/Toast'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/** An error whose message can be shown to the user as is. */
class PushError extends Error {}

/** base64url → Uint8Array, the format `applicationServerKey` expects. */
function toApplicationServerKey(base64: string): BufferSource {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Uint8Array/ArrayBuffer → base64url, to compare two VAPID keys. */
function toBase64Url(buffer: ArrayBuffer) {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function normalize(key: string) {
  return key.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function describeSubscribeError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)

  if (name === 'NotAllowedError') {
    return 'Your browser denied the permission.'
  }

  // Brave, and any browser whose push service is turned off, fails here.
  if (name === 'AbortError' || /push service|registration failed/i.test(message)) {
    return (
      "Your browser's push service can't be reached. On Brave: " +
      'brave://settings/privacy → turn on "Use Google services for push ' +
      'messaging", then restart the browser.'
    )
  }

  return "Couldn't enable notifications."
}

type State = 'unsupported' | 'unavailable' | 'off' | 'on' | 'denied' | 'working'

/**
 * Notifications toggle.
 *
 * It only shows up when the browser supports push AND a public VAPID key is
 * configured: without the key, the feature is simply absent rather than
 * broken. Permission is never requested automatically — browsers
 * permanently block unsolicited requests.
 */
export function PushToggle() {
  const [state, setState] = useState<State>('unavailable')
  const toast = useToast()

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return setState('unavailable')
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      return setState('unsupported')
    }

    if (Notification.permission === 'denied') return setState('denied')

    // `getRegistration()` rather than `ready`: `ready` never resolves while no
    // service worker is registered, which kept the button hidden in
    // development.
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription() ?? null)
      .then((subscription) => setState(subscription ? 'on' : 'off'))
      .catch(() => setState('off'))
  }, [])

  const enable = async () => {
    if (!VAPID_PUBLIC_KEY) return
    setState('working')

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }

      // In development `ServiceWorkerRegistrar` does nothing, so register on
      // demand to keep notifications testable.
      const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready

      let subscription = await registration.pushManager.getSubscription()

      // A subscription created with ANOTHER VAPID key can't be reused:
      // `subscribe()` would throw InvalidStateError. Replace it.
      if (subscription) {
        const existing = subscription.options.applicationServerKey
        if (!existing || toBase64Url(existing) !== normalize(VAPID_PUBLIC_KEY)) {
          await subscription.unsubscribe()
          subscription = null
        }
      }

      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: toApplicationServerKey(VAPID_PUBLIC_KEY),
          })
        } catch (error) {
          throw new PushError(describeSubscribeError(error))
        }
      }

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })

      if (!response.ok) {
        throw new PushError("Couldn't enable notifications.")
      }

      setState('on')
      toast.success('Notifications turned on.')
    } catch (error) {
      // The full details stay in the console for debugging.
      console.error('[MuteChat] Enabling notifications:', error)
      setState('off')
      toast.error(
        error instanceof PushError
          ? error.message
          : "Couldn't enable notifications.",
      )
    }
  }

  const disable = async () => {
    setState('working')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()

      if (subscription) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          { method: 'DELETE' },
        )
        await subscription.unsubscribe()
      }

      setState('off')
      toast.info('Notifications turned off.')
    } catch (error) {
      console.error('[MuteChat] Disabling notifications:', error)
      setState('on')
      toast.error("Couldn't turn off notifications.")
    }
  }

  if (state === 'unavailable' || state === 'unsupported') return null

  if (state === 'denied') {
    return (
      <p className="text-ink-faint px-1 text-xs leading-relaxed">
        Notifications are blocked by your browser. Allow them in the site
        settings to hear about new GIFs.
      </p>
    )
  }

  const isOn = state === 'on'

  return (
    <button
      type="button"
      onClick={isOn ? disable : enable}
      disabled={state === 'working'}
      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
        isOn
          ? 'border-brand-500/40 bg-brand-600/15 text-brand-200'
          : 'border-line text-ink-muted hover:border-brand-500/50 hover:text-ink'
      }`}
    >
      {isOn ? <Bell size={14} /> : <BellOff size={14} />}
      {state === 'working'
        ? 'One moment…'
        : isOn
          ? 'Notifications on'
          : 'Turn on notifications'}
    </button>
  )
}
