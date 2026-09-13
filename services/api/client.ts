import { cookies } from 'next/headers'

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082/api'

async function getHeaders() {
  const headersInit: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('token')?.value
    if (token) {
      headersInit['Authorization'] = `Bearer ${token}`
    }
  } catch (e) {
    // Fail silently if cookie store is unavailable (e.g. static pre-render)
  }
  return headersInit
}

export async function apiRequest(
  path: string,
  method: string = 'GET',
  body?: any,
  extraHeaders?: Record<string, string>
) {
  const headers = { ...(await getHeaders()), ...(extraHeaders || {}) }
  // Player play-page calls must not be shadowed by a host session cookie.
  if (extraHeaders?.['X-Player-Token']) {
    delete headers['Authorization']
  }
  const url = `${API_URL}${path}`
  const options: RequestInit = {
    method,
    headers,
    cache: 'no-store',
  }
  if (body) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)
  const text = await res.text()

  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    const snippet = (text || '').replace(/\s+/g, ' ').slice(0, 180)
    throw new Error(
      `Invalid JSON response (${res.status}) ${method} ${path}: ${snippet || '(empty body)'}`
    )
  }

  if (!res.ok) {
    // Don't clear host cookies when a player-token request fails
    const isPlayerCall = !!(extraHeaders && extraHeaders['X-Player-Token'])
    const apiError =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.message === 'string' && data.message) ||
      `Request failed with status ${res.status}`

    // Only 401 is an auth failure. 403 is often a business rule (plan limits, permissions).
    if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login' && !isPlayerCall) {
      try {
        const cookieStore = await cookies()
        const refreshToken = cookieStore.get('refresh_token')?.value
        if (refreshToken) {
          const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          })
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json()
            cookieStore.set('token', refreshData.token, { path: '/', maxAge: 900, httpOnly: true, sameSite: 'lax' })
            cookieStore.set('refresh_token', refreshData.refresh_token, { path: '/', maxAge: 604800, httpOnly: true, sameSite: 'lax' })

            const retryHeaders = {
              ...headers,
              'Authorization': `Bearer ${refreshData.token}`
            }
            const retryRes = await fetch(url, { ...options, headers: retryHeaders })
            const retryText = await retryRes.text()
            if (retryRes.ok) {
              return retryText ? JSON.parse(retryText) : null
            }
          }
        }
      } catch (refreshErr) {
        console.error('Auto token refresh failed:', refreshErr)
      }

      try {
        const cookieStore = await cookies()
        cookieStore.set('token', '', { path: '/', expires: new Date(0) })
        cookieStore.set('refresh_token', '', { path: '/', expires: new Date(0) })
      } catch (e) {}
      throw new Error('UNAUTHORIZED_OR_FORBIDDEN')
    }

    throw new Error(apiError)
  }

  return data
}

/**
 * Fetch a non-JSON response body as text, with the caller's auth cookie.
 *
 * apiRequest always JSON.parses, so a CSV export through it throws before the
 * body is ever seen. The browser cannot fetch the endpoint directly either —
 * the token lives in an httpOnly cookie on this origin, not the API's.
 */
export async function apiRequestText(path: string, method: string = 'GET'): Promise<string> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: await getHeaders(),
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed?.error === 'string') message = parsed.error
    } catch {
      // Body was not JSON — keep the status-based message.
    }
    throw new Error(message)
  }
  return text
}
