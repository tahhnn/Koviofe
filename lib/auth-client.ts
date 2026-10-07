'use client'

import { isStaleDeploymentError } from '@/lib/api-errors'



const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8082/api`
  }
  return 'http://localhost:8082/api'
}

const API_URL = getApiUrl()

// A tab opened before a frontend deploy still holds the old build's server
// action IDs, so calling one throws "Server Action ... was not found on the
// server". Reload to pick up the new build; never show raw exception text
// (framework internals) to the user — the form falls back to a generic message.
function unexpectedError(err: unknown) {
  console.error(err)
  if (isStaleDeploymentError(err)) {
    window.location.reload()
  }
  return { error: { message: undefined as string | undefined } }
}

export const authClient = {
  signIn: {
    email: async ({ email, password }: { email: string; password?: string }) => {
      try {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const data = await res.json()
        if (!res.ok) {
          return { error: { message: data.error || 'Login failed' } }
        }

        const { setAuthCookies } = await import('@/app/actions/auth-session')
        await setAuthCookies(data.token, data.refresh_token)
        localStorage.setItem('user', JSON.stringify(data.user))

        return { data }
      } catch (err) {
        return unexpectedError(err)
      }
    }
  },
  signUp: {
    email: async ({ email, nickname }: { email: string; nickname: string; password?: string; name?: string }) => {
      try {
        const res = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, nickname }),
        })
        const data = await res.json()
        if (!res.ok) {
          return { error: { message: data.error || 'Registration failed' } }
        }
        return { data }
      } catch (err) {
        return unexpectedError(err)
      }
    }
  },
  verifyOTP: async ({ email, otp }: { email: string; otp: string }) => {
    try {
      const res = await fetch(`${API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { error: { message: data.error || 'Verification failed' } }
      }

      const { setAuthCookies } = await import('@/app/actions/auth-session')
      await setAuthCookies(data.token, data.refresh_token)
      localStorage.setItem('user', JSON.stringify(data.user))

      return { data }
    } catch (err) {
      return unexpectedError(err)
    }
  },
  changePassword: async ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
    try {
      const { changePasswordAction } = await import('@/app/actions/auth-session')
      return await changePasswordAction(oldPassword, newPassword)
    } catch (err) {
      return unexpectedError(err)
    }
  },
  signOut: async () => {
    try {
      const { clearAuthCookies } = await import('@/app/actions/auth-session')
      // Best-effort revoke on backend (refresh cookie is HttpOnly — logout via server action)
      await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
      await clearAuthCookies()
    } catch {}
    localStorage.removeItem('user')
    window.location.href = '/sign-in'
    return { success: true }
  },
  getSession: async () => {
    if (typeof window === 'undefined') return null
    try {
      const user = localStorage.getItem('user')
      return user ? { user: JSON.parse(user) } : null
    } catch {
      localStorage.removeItem('user')
      return null
    }
  }
}

export const { signIn, signUp, verifyOTP, changePassword, signOut, getSession } = authClient
export const useSession = () => {
  if (typeof window === 'undefined') return { data: null, isPending: false }
  try {
    const user = localStorage.getItem('user')
    return {
      data: user ? { user: JSON.parse(user) } : null,
      isPending: false,
    }
  } catch {
    return { data: null, isPending: false }
  }
}
