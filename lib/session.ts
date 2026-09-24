import { cookies } from 'next/headers'
import { clientIpHeaders } from '@/lib/client-ip'

export interface UserSession {
  user: {
    id: string
    email: string
    role: string
    permissions: string[]
    nickname: string
  }
}

function apiBase(): string {
  return (
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8082/api'
  ).replace(/\/$/, '')
}

export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies()
    let token = cookieStore.get('token')?.value

    if (!token) {
      const refreshToken = cookieStore.get('refresh_token')?.value
      if (refreshToken) {
        const refreshRes = await fetch(`${apiBase()}/auth/refresh`, {
          method: 'POST',
          // AuthRateLimit keys on the client IP and allows 20/min; an
          // unattributed refresh spends from a bucket shared by everyone.
          headers: { 'Content-Type': 'application/json', ...(await clientIpHeaders()) },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          cookieStore.set('token', refreshData.token, {
            path: '/',
            maxAge: 900,
            httpOnly: true,
            sameSite: 'lax',
          })
          cookieStore.set('refresh_token', refreshData.refresh_token, {
            path: '/',
            maxAge: 604800,
            httpOnly: true,
            sameSite: 'lax',
          })
          token = refreshData.token
        }
      }
    }

    if (!token) return null

    // Verify with backend (signature + expiry) — never trust client-decoded JWT alone
    const profileRes = await fetch(`${apiBase()}/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!profileRes.ok) {
      const refreshToken = cookieStore.get('refresh_token')?.value
      if (refreshToken) {
        const refreshRes = await fetch(`${apiBase()}/auth/refresh`, {
          method: 'POST',
          // AuthRateLimit keys on the client IP and allows 20/min; an
          // unattributed refresh spends from a bucket shared by everyone.
          headers: { 'Content-Type': 'application/json', ...(await clientIpHeaders()) },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          cookieStore.set('token', refreshData.token, {
            path: '/',
            maxAge: 900,
            httpOnly: true,
            sameSite: 'lax',
          })
          cookieStore.set('refresh_token', refreshData.refresh_token, {
            path: '/',
            maxAge: 604800,
            httpOnly: true,
            sameSite: 'lax',
          })
          token = refreshData.token
          const retry = await fetch(`${apiBase()}/auth/profile`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          })
          if (!retry.ok) return null
          const user = await retry.json()
          return mapUser(user)
        }
      }
      return null
    }

    const user = await profileRes.json()
    return mapUser(user)
  } catch {
    return null
  }
}

function mapUser(user: any): UserSession {
  const roleName = typeof user.role === 'string' ? user.role : user.role?.name || 'host'
  const permissions = Array.isArray(user.permissions)
    ? user.permissions
    : Array.isArray(user.role?.permissions)
      ? user.role.permissions.map((p: any) => p.name || p)
      : []

  return {
    user: {
      id: String(user.id),
      email: user.email,
      role: roleName,
      permissions,
      nickname: user.nickname || 'User',
    },
  }
}
