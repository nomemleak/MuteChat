import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar'

import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

const DESCRIPTION = 'The chat app that only speaks GIF. No words, just GIFs.'

export const metadata: Metadata = {
  title: {
    default: 'MuteChat — The chat app that only speaks GIF',
    template: '%s · MuteChat',
  },
  description: DESCRIPTION,
  applicationName: 'MuteChat',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'MuteChat',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  // Next.js picks up `src/app/favicon.ico` automatically.
  icons: { apple: '/apple-icon.png' },
  openGraph: {
    title: 'MuteChat',
    description: DESCRIPTION,
    siteName: 'MuteChat',
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'MuteChat' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MuteChat',
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#0d0b17',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Zooming stays allowed (accessibility); inputs use 16 px text, which is
  // enough to prevent iOS from zooming in on focus.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-surface-0 text-ink flex min-h-full flex-col">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
