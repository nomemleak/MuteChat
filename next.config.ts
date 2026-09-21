import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Remote GIFs are rendered with <img> (animation preserved, no
  // optimization cost); only local images go through next/image.
  images: {
    formats: ['image/webp'],
  },
}

export default nextConfig
