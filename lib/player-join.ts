/**
 * The join page's three calls — open rooms, PIN lookup, join — sent from the
 * browser straight to the Go API.
 *
 * Last of the player calls to leave the server actions (after
 * lib/submit-answer.ts, lib/player-question.ts and lib/player-session.ts), and
 * for the same reason: a room fills as a burst. A hall scanning one QR code
 * sends every join within seconds, through a single Node process that tops out
 * near 140 req/s on this box (measured 2026-09-23); on 2026-09-24 three rooms
 * joining at a modest 50/s already held the frontend at 100% CPU while the Go
 * backend sat at 26%.
 *
 * Safety is unchanged. All three endpoints are public on the API and rate
 * limited per client IP there; going direct puts them back inside the
 * gateway's own `limit_req` zone too, and the backend sees the real address
 * without the X-Forwarded-For relay the server action needed. No credential is
 * involved until the join returns the player token, which the page stores in
 * sessionStorage exactly as before.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '')

/** The locale the page is rendered in, which app/layout.tsx puts on <html>. */
function pageLocale(): string | null {
  if (typeof document === 'undefined') return null
  const lang = document.documentElement.lang
  return lang === 'vi' || lang === 'en' ? lang : null
}

async function publicRequest(path: string, init?: { method?: string; body?: unknown }) {
  const headers: Record<string, string> = {}
  const locale = pageLocale()
  if (locale) headers['X-Locale'] = locale
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method || 'GET',
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    // A host's session cookie has no business on a player's join.
    credentials: 'omit',
    cache: 'no-store',
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(String(data?.error || `Request failed with status ${res.status}`))
  }
  return data
}

export type OpenRoom = {
  id: number
  pin_code: string
  status: string
  quiz_title: string
  player_count: number
  max_players: number
}

export async function listOpenRooms(): Promise<OpenRoom[]> {
  try {
    const data = await publicRequest('/rooms/public')
    return (data?.rooms || []) as OpenRoom[]
  } catch {
    return []
  }
}

/** The room behind a PIN, or null when there is none — or the lookup failed,
 *  which the page has always shown the same way. */
export async function lookupRoomByPin(pin: string): Promise<any | null> {
  try {
    return await publicRequest(`/rooms/pin/${encodeURIComponent(pin)}`)
  } catch {
    return null
  }
}

export type JoinResult =
  | {
      ok: true
      sessionId: string
      participantId: string
      playerToken: string
      centrifugoToken?: string
      centrifugoClientId?: string
    }
  | { ok: false; error: string }

/** Failures come back as data, never thrown, so the caller has one path. */
export async function joinRoom(pin: string, nickname: string): Promise<JoinResult> {
  try {
    const data = await publicRequest('/rooms/join', {
      method: 'POST',
      body: { pin_code: pin, nickname },
    })
    return {
      ok: true,
      sessionId: String(data.room_id),
      participantId: String(data.player_id),
      playerToken: data.player_token,
      centrifugoToken: data.centrifugo_tok,
      centrifugoClientId: data.centrifugo_cli,
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || 'Failed to join room') }
  }
}
