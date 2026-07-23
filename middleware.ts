import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const protectedRoutes = ['/dashboard', '/quizzes', '/host', '/profile', '/templates', '/admin']
const authRoutes = ['/sign-in', '/sign-up']
const adminRoutes = ['/admin']

function apiBase(): string {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8082/api'
  ).replace(/\/$/, '')
}

async function fetchProfile(token: string): Promise<{ ok: boolean; role: string | null }> {
  try {
    const res = await fetch(`${apiBase()}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, role: null }
    const data = await res.json()
    const role =
      (typeof data?.role === 'string' && data.role) ||
      data?.role?.name ||
      data?.Role?.name ||
      null
    return { ok: true, role: role ? String(role).toLowerCase() : null }
  } catch {
    return { ok: false, role: null }
  }
}

async function tryRefresh(refreshToken: string): Promise<{ token: string; refresh_token: string } | null> {
  try {
    const res = await fetch(`${apiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function applyCookies(
  res: NextResponse,
  cookies: { name: string; value: string; maxAge: number }[]
) {
  for (const c of cookies) {
    res.cookies.set(c.name, c.value, {
      path: '/',
      maxAge: c.maxAge,
      httpOnly: true,
      sameSite: 'lax',
    })
  }
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  let token = request.cookies.get('token')?.value
  const refreshToken = request.cookies.get('refresh_token')?.value

  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
  const isAuthRoute = authRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
  const isAdminRoute = adminRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )

  let authenticated = false
  let role: string | null = null
  const responseCookies: { name: string; value: string; maxAge: number }[] = []

  if (token) {
    const profile = await fetchProfile(token)
    if (profile.ok) {
      authenticated = true
      role = profile.role
    }
  }

  if (!authenticated && refreshToken) {
    const refreshed = await tryRefresh(refreshToken)
    if (refreshed?.token) {
      const profile = await fetchProfile(refreshed.token)
      if (profile.ok) {
        authenticated = true
        role = profile.role
        token = refreshed.token
        responseCookies.push(
          { name: 'token', value: refreshed.token, maxAge: 900 },
          { name: 'refresh_token', value: refreshed.refresh_token, maxAge: 604800 }
        )
      }
    }
  }

  if (isProtectedRoute && !authenticated) {
    const signInUrl = new URL('/sign-in', request.url)
    signInUrl.searchParams.set('redirectTo', pathname)
    const res = NextResponse.redirect(signInUrl)
    res.cookies.set('token', '', { path: '/', maxAge: 0 })
    res.cookies.set('refresh_token', '', { path: '/', maxAge: 0 })
    return res
  }

  // Non-admin users cannot open /admin — enforced via profile role
  if (isAdminRoute && authenticated && role !== 'admin') {
    return applyCookies(NextResponse.redirect(new URL('/dashboard', request.url)), responseCookies)
  }

  if (isAuthRoute && authenticated) {
    return applyCookies(NextResponse.redirect(new URL('/dashboard', request.url)), responseCookies)
  }

  return applyCookies(NextResponse.next(), responseCookies)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
