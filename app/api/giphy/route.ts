import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const apiKey = process.env.GIPHY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Giphy is not configured' }, { status: 503 })
  }

  const { searchParams } = request.nextUrl
  const mode = searchParams.get('mode') || 'trending'
  const q = searchParams.get('q') || ''
  const limit = Math.min(Number(searchParams.get('limit') || 20), 50)

  const url =
    mode === 'search' && q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=${limit}&rating=pg`

  try {
    const res = await fetch(url, { next: { revalidate: 60 } })
    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: 'Giphy request failed' }, { status: 502 })
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Giphy unavailable' }, { status: 502 })
  }
}
