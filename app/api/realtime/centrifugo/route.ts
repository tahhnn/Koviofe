import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const roomId = request.nextUrl.searchParams.get('room_id')
  if (!roomId) {
    return NextResponse.json({ error: 'room_id is required' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiBase = (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8082/api'
  ).replace(/\/$/, '')

  try {
    const res = await fetch(`${apiBase}/realtime/host-token?room_id=${encodeURIComponent(roomId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to mint realtime token' },
        { status: res.status }
      )
    }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Upstream realtime service unavailable' }, { status: 502 })
  }
}
