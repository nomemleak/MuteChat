import { NextResponse, type NextRequest } from 'next/server'

import type { Gif } from '@/types/database'

type GiphyImage = { url?: string; width?: string; height?: string }
type GiphyGif = {
  id: string
  title?: string
  images?: Record<string, GiphyImage | undefined>
}
type GiphyResponse = { data?: GiphyGif[]; meta?: { status: number; msg: string } }

const LIMIT = 24
const MAX_QUERY_LENGTH = 100
/** Giphy search results rarely change: cache them for an hour. */
const SEARCH_CACHE_SECONDS = 3600
/** Trending GIFs move faster. */
const TRENDING_CACHE_SECONDS = 900

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function toGif(item: GiphyGif): Gif | null {
  const full = item.images?.downsized ?? item.images?.original
  const preview =
    item.images?.fixed_width_downsampled ?? item.images?.fixed_width ?? full

  if (!full?.url) return null

  return {
    id: item.id,
    title: item.title?.trim() || 'GIF',
    url: full.url,
    previewUrl: preview?.url ?? full.url,
    width: toNumber(full.width, 200),
    height: toNumber(full.height, 200),
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const isTrending = params.get('trending') === '1'
  const query = params.get('q')?.trim()

  if (!isTrending && !query) {
    return NextResponse.json({ error: 'Missing "q" parameter.' }, { status: 400 })
  }

  if (query && query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: 'Search is too long.' }, { status: 400 })
  }

  const apiKey = process.env.GIPHY_API_KEY
  if (!apiKey) {
    console.error('GIPHY_API_KEY is missing from the environment variables.')
    return NextResponse.json({ error: 'GIF search is unavailable.' }, { status: 503 })
  }

  const cacheSeconds = isTrending ? TRENDING_CACHE_SECONDS : SEARCH_CACHE_SECONDS
  const url = new URL(
    isTrending
      ? 'https://api.giphy.com/v1/gifs/trending'
      : 'https://api.giphy.com/v1/gifs/search',
  )
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('limit', String(LIMIT))
  url.searchParams.set('rating', 'g')
  url.searchParams.set('bundle', 'messaging_non_clips')
  if (!isTrending && query) {
    url.searchParams.set('q', query)
    url.searchParams.set('lang', 'en')
  }

  try {
    const response = await fetch(url, {
      next: { revalidate: cacheSeconds },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      console.error(`Giphy responded with status ${response.status}`)
      return NextResponse.json({ error: 'GIF search is unavailable.' }, { status: 502 })
    }

    const payload = (await response.json()) as GiphyResponse
    const gifs = (payload.data ?? [])
      .map(toGif)
      .filter((gif): gif is Gif => gif !== null)

    return NextResponse.json(
      { gifs },
      { headers: { 'Cache-Control': `public, max-age=${cacheSeconds}` } },
    )
  } catch (error) {
    console.error('Giphy error:', error)
    return NextResponse.json({ error: 'GIF search is unavailable.' }, { status: 502 })
  }
}
