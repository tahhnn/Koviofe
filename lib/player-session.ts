/**
 * The player's room-state and standings reads, sent from the browser straight
 * to the Go API.
 *
 * Third and fourth calls to leave the server actions, after lib/submit-answer.ts
 * and lib/player-question.ts, and for the same reason. `game:started` makes
 * every socket in the room ask for the room state in the same second, and the
 * leaderboard slide makes every player ask for standings in the same second —
 * both through a single Node process that tops out near 140 req/s on this box
 * (measured 2026-09-23), while the Go backend has cores to spare.
 *
 * Safety is unchanged. The credential is the player token, already readable by
 * scripts on the page; the backend verifies its signature and rejects a token
 * whose room does not match the URL. The player branch of GET /rooms/:id never
 * returned the roster, pin or host id, so nothing new is exposed.
 *
 * The results screen joined them on 2026-09-25: every player lands on it in the
 * same second the game ends, and through the server action Node re-parsed and
 * re-serialized the full roster (~140KB at 1500 players) per player — measured
 * p95 16s for the action alone. GET /rooms/:id/results already accepted the
 * player token and flags the caller's own row, so nothing new is exposed.
 *
 * All of them throw on failure, as the server actions they replace did, so
 * the call sites keep their existing catch blocks.
 */

import { mapGameSession, mapRoomResults, mapStandings } from '@/lib/game-session'

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '')

/** The locale the page is rendered in, which app/layout.tsx puts on <html>. */
function pageLocale(): string | null {
  if (typeof document === 'undefined') return null
  const lang = document.documentElement.lang
  return lang === 'vi' || lang === 'en' ? lang : null
}

async function playerGet(path: string, playerToken?: string) {
  const headers: Record<string, string> = {}
  if (playerToken) headers['X-Player-Token'] = playerToken
  const locale = pageLocale()
  if (locale) headers['X-Locale'] = locale

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    // The host session cookie has no business on a player's request.
    credentials: 'omit',
    cache: 'no-store',
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new PlayerApiError(
      String(data?.error || `Request failed with status ${res.status}`),
      res.status,
      typeof data?.code === 'string' ? data.code : '',
    )
  }
  return data
}

/** A failed player read, with what the caller needs to decide whether trying
 *  again can help. The message stays the API's text so existing catch blocks
 *  that compare it (ROOM_FINISHED) keep working. */
export class PlayerApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message)
    this.name = 'PlayerApiError'
  }
}

/** True when the server will never accept this player token again: the row
 *  was removed (left the lobby and never came back, or joined elsewhere), the
 *  token is for another room, or it expired. Polling on past this answered 401
 *  every 2.5s for as long as the tab stayed open (B.FEST 2026-10-03). */
export function isPlayerSessionGone(e: unknown): boolean {
  return e instanceof PlayerApiError && (e.status === 401 || e.status === 403)
}

export async function fetchPlayerSession(sessionId: string, playerToken?: string) {
  return mapGameSession(await playerGet(`/rooms/${sessionId}`, playerToken))
}

export async function fetchPlayerStandings(sessionId: string, playerToken?: string) {
  return mapStandings(await playerGet(`/rooms/${sessionId}/standings`, playerToken))
}

export async function fetchPlayerResults(sessionId: string, playerToken: string) {
  return mapRoomResults(await playerGet(`/rooms/${sessionId}/results`, playerToken))
}
