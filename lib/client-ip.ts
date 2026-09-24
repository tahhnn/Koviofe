import { headers } from 'next/headers'

/**
 * The visitor's address, passed along when this server calls the Go API.
 *
 * Without it the API sees the frontend container for every request that goes
 * through a server action, and `c.ClientIP()` returns that one address. Every
 * per-IP limiter then shares a single bucket across all of production:
 * JoinRoomRateLimit's 2000/min covered every room at once, and AuthRateLimit's
 * 20/min covered every token refresh on the system. Measured 2026-09-23: three
 * rooms of 1000 joining together produced exactly 2000 successes and 1000
 * "Too many requests".
 *
 * The value is safe to forward. The gateway rewrites X-Forwarded-For from its
 * own real_ip resolution before this process ever sees it, and that resolution
 * only trusts the docker bridge and loopback — so a visitor cannot put an
 * address of their choosing here.
 */
export async function clientIpHeaders(): Promise<Record<string, string>> {
  try {
    const h = await headers()
    const out: Record<string, string> = {}
    const forwarded = h.get('x-forwarded-for')
    if (forwarded) out['X-Forwarded-For'] = forwarded
    const real = h.get('x-real-ip')
    if (real) out['X-Real-IP'] = real
    return out
  } catch {
    // No request to read: a static prerender, or a build-time call. There is
    // no client to attribute the call to, so send nothing and let the API fall
    // back to the peer address.
    return {}
  }
}
