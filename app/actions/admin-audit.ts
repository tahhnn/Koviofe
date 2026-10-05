'use server'

import { apiRequest, apiRequestText } from '@/services/api/client'

// Admin audit trail. Admin-only on the API (RequireRole("admin") +
// audit:read); these actions only carry the host session cookie across.

export type AuditItem = {
  id: number
  user_id: number
  user_email: string
  action: string
  resource: string
  ip_address: string
  user_agent: string
  status: 'success' | 'failed'
  metadata?: Record<string, unknown>
  created_at: string
}

export type AuditFilters = {
  userId?: number
  action?: string
  status?: '' | 'success' | 'failed'
  ip?: string
  q?: string
  /** ISO timestamps; `to` is exclusive. */
  from?: string
  to?: string
}

function auditQuery(f: AuditFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams()
  if (f.userId) p.set('user_id', String(f.userId))
  if (f.action) p.set('action', f.action)
  if (f.status) p.set('status', f.status)
  if (f.ip?.trim()) p.set('ip', f.ip.trim())
  if (f.q?.trim()) p.set('q', f.q.trim())
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export async function adminListAudit(
  f: AuditFilters,
  cursor = '',
  limit = 50,
): Promise<{ items: AuditItem[]; nextCursor: string }> {
  const data = await apiRequest(`/admin/audit${auditQuery(f, { cursor, limit: String(limit) })}`)
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    nextCursor: typeof data?.next_cursor === 'string' ? data.next_cursor : '',
  }
}

export async function adminListAuditActions(): Promise<string[]> {
  const data = await apiRequest('/admin/audit/actions')
  return Array.isArray(data?.actions) ? data.actions : []
}

/** CSV as text for the client to save — the session is an httpOnly cookie, so
 *  the browser cannot fetch the API endpoint itself. */
export async function adminExportAuditCsv(f: AuditFilters): Promise<string> {
  return apiRequestText(`/admin/audit.csv${auditQuery(f)}`)
}

export type UserActivity = {
  user: {
    id: number
    email: string
    nickname: string
    role: string
    is_active: boolean
    created_at: string
    plan_id: string
    last_login_at: string | null
    last_login_ip: string
  }
  stats: { quizzes: number; rooms: number; rooms_30d: number; players: number; failed_logins_30d: number }
  login_ips: { ip: string; count: number; last_at: string }[]
  rooms: {
    id: number
    pin_code: string
    quiz_id: number
    quiz_title: string
    status: string
    ended_reason: string
    created_at: string
    ended_at: string | null
    player_count: number | null
  }[]
}

export async function adminUserActivity(userId: number): Promise<UserActivity> {
  return (await apiRequest(`/admin/users/${userId}/activity`)) as UserActivity
}
