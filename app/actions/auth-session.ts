'use server'

import { cookies } from 'next/headers'

const isProd = process.env.NODE_ENV === 'production'

export async function setAuthCookies(token: string, refreshToken: string) {
  const cookieStore = await cookies()
  cookieStore.set('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 900,
  })
  cookieStore.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 604800,
  })
}

export async function clearAuthCookies() {
  const cookieStore = await cookies()
  const refresh = cookieStore.get('refresh_token')?.value
  if (refresh) {
    const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082/api'
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      })
    } catch {
      // ignore
    }
  }
  cookieStore.set('token', '', { httpOnly: true, path: '/', maxAge: 0 })
  cookieStore.set('refresh_token', '', { httpOnly: true, path: '/', maxAge: 0 })
}

export async function changePasswordAction(oldPassword: string, newPassword: string) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) {
    return { error: { message: 'Unauthorized' } }
  }

  const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082/api'
  try {
    const res = await fetch(`${API_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { error: { message: data.error || 'Change password failed' } }
    }
    return { data }
  } catch (err: unknown) {
    return { error: { message: err instanceof Error ? err.message : 'Network error' } }
  }
}
