import type { MetadataRoute } from 'next'

/**
 * Web app manifest: makes MuteChat installable on Android ("Add to Home
 * screen") and on iOS through Safari → Share → "Add to Home Screen". It is
 * also the groundwork needed if the app is ever packaged for the stores
 * (a Trusted Web Activity on Android, a WKWebView shell on iOS).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MuteChat — The chat app that only speaks GIF',
    short_name: 'MuteChat',
    description: 'The chat app that only speaks GIF. No words, just GIFs.',
    id: '/',
    start_url: '/chat',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d0b17',
    theme_color: '#0d0b17',
    lang: 'en',
    dir: 'ltr',
    categories: ['social', 'communication'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
