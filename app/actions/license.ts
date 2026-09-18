'use server'

import { apiRequest, apiRequestText } from '@/services/api/client'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'

export type PricingPlan = {
  id: string
  name: string
  description: string
  price_monthly_vnd: number
  max_players_per_room: number
  max_quizzes: number
  max_templates: number
  max_concurrent_rooms: number
  max_questions_per_quiz: number
  allow_player_paced: boolean
  allow_custom_branding: boolean
  allow_export_logs: boolean
  allow_priority_support: boolean
  allow_remove_watermark: boolean
  is_active?: boolean
}

export type LicenseSnapshot = {
  subscription: any
  /** Whether the backend is actually enforcing plan gates. */
  enforcement?: boolean
  /** Days until the term ends; null or absent when the plan has no expiry. */
  days_remaining?: number | null
  entitlements: {
    plan_id: string
    plan_name: string
    max_players_per_room: number
    max_quizzes: number
    max_templates: number
    max_concurrent_rooms: number
    max_questions_per_quiz: number
    allow_player_paced: boolean
    allow_custom_branding: boolean
    allow_export_logs: boolean
    allow_priority_support: boolean
    allow_remove_watermark: boolean
  }
  usage: {
    quizzes: number
    templates: number
    concurrent_rooms: number
  }
}

export type LicenseSubscriptionRow = {
  user_id: number
  email: string
  nickname: string
  role: string
  plan_id: string
  plan_name: string
  status: string
  starts_at?: string
  ends_at?: string | null
  lifetime?: boolean
  /** Past ends_at but not yet swept — the 5-minute cron is what downgrades. */
  expired?: boolean
  days_remaining?: number | null
  max_players_per_room: number
  max_concurrent_rooms?: number
  allow_player_paced: boolean
}

export type AssignPlanInput = {
  userId: number
  planId: string
  /** Timed paid plan. Ignored for free / lifetime. */
  endsAtDays?: number
  /** Paid plan with no expiry. */
  lifetime?: boolean
  /** What the customer paid, for reconciliation against the intermediary. */
  amountVnd?: number
  externalRef?: string
  note?: string
  /** Honored only when planId is 'free': ends the user's live games too. */
  closeRooms?: boolean
}

export async function listPricingPlans(): Promise<PricingPlan[]> {
  try {
    const data = await apiRequest('/license/plans')
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function getMyLicense(): Promise<LicenseSnapshot | null> {
  try {
    return await apiRequest('/license/me')
  } catch {
    return null
  }
}

export async function adminListPlans(): Promise<PricingPlan[]> {
  const data = await apiRequest('/admin/license/plans')
  return Array.isArray(data) ? data : []
}

export async function adminUpdatePlan(planId: string, patch: Partial<PricingPlan>) {
  const data = await apiRequest(`/admin/license/plans/${planId}`, 'PUT', patch)
  revalidatePath('/admin/license')
  return data as PricingPlan
}

export async function adminListSubscriptions(q?: string): Promise<LicenseSubscriptionRow[]> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  const data = await apiRequest(`/admin/license/subscriptions${qs}`)
  return Array.isArray(data?.subscriptions) ? data.subscriptions : []
}

export async function adminAssignPlan(input: AssignPlanInput) {
  const body: Record<string, unknown> = {
    user_id: input.userId,
    plan_id: input.planId,
  }
  if (input.planId === 'free') {
    // revoke — no duration
  } else if (input.lifetime) {
    body.lifetime = true
  } else if (input.endsAtDays && input.endsAtDays > 0) {
    body.ends_at_days = input.endsAtDays
  } else {
    body.ends_at_days = 30
  }
  if (input.amountVnd && input.amountVnd > 0) body.amount_vnd = input.amountVnd
  if (input.externalRef?.trim()) body.external_ref = input.externalRef.trim()
  if (input.note?.trim()) body.note = input.note.trim()
  if (input.closeRooms) body.close_rooms = true
  const data = await apiRequest('/admin/license/assign', 'POST', body)
  revalidatePath('/admin/license')
  revalidatePath('/profile/settings')
  return data
}

export type LicenseCode = {
  code: string
  plan_id: string
  duration_days: number
  max_uses: number
  used_count: number
  expires_at?: string | null
  revoked_at?: string | null
  batch?: string
  note?: string
  amount_vnd?: number
  external_ref?: string
  delivered_to?: string
  delivered_at?: string | null
  created_by?: number
  created_at?: string
}

export type LicenseRedemption = {
  id: number
  code: string
  user_id: number
  email: string
  plan_id: string
  ip_address?: string
  created_at: string
}

export type RedeemResult =
  | { ok: true; planName: string; endsAt: string | null }
  | { ok: false; error: string }

/**
 * Redeem an activation code for the signed-in host.
 *
 * Returns a result object instead of throwing: every failure here is something
 * the buyer needs to read (wrong code, already used, revoked), and the backend
 * already phrases those in Vietnamese. Letting them throw would surface a
 * generic boundary error instead of the message that tells them what to do.
 */
export async function redeemLicenseCode(code: string): Promise<RedeemResult> {
  const t = await getTranslations('license')
  const trimmed = code.trim()
  if (!trimmed) return { ok: false, error: t('codeRequired') }
  try {
    const data = await apiRequest('/license/redeem', 'POST', { code: trimmed })
    revalidatePath('/dashboard')
    revalidatePath('/profile/settings')
    revalidatePath('/profile/license')
    return {
      ok: true,
      planName: data?.entitlements?.plan_name ?? data?.subscription?.plan_id ?? 'Pro',
      endsAt: data?.subscription?.ends_at ?? null,
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : t('redeemFailed')
    return { ok: false, error: message }
  }
}

export type CreateCodesInput = {
  planId: string
  count: number
  /** 0 = the redeemed plan never expires. */
  durationDays: number
  maxUses: number
  /** Shelf life of the code itself. 0 / undefined = never goes stale. */
  expiresInDays?: number
  batch?: string
  note?: string
  /** What the buyer paid, per code. Carried into the history row on redeem. */
  amountVnd?: number
  /** Bank transfer id / invoice number from the payment intermediary. */
  externalRef?: string
}

export async function adminCreateLicenseCodes(input: CreateCodesInput): Promise<LicenseCode[]> {
  const body: Record<string, unknown> = {
    plan_id: input.planId,
    count: input.count,
    duration_days: input.durationDays,
    max_uses: input.maxUses,
  }
  if (input.expiresInDays && input.expiresInDays > 0) body.expires_in_days = input.expiresInDays
  if (input.batch?.trim()) body.batch = input.batch.trim()
  if (input.note?.trim()) body.note = input.note.trim()
  if (input.amountVnd && input.amountVnd > 0) body.amount_vnd = input.amountVnd
  if (input.externalRef?.trim()) body.external_ref = input.externalRef.trim()

  const data = await apiRequest('/admin/license/codes', 'POST', body)
  revalidatePath('/admin/license')
  return Array.isArray(data?.codes) ? data.codes : []
}

export async function adminListLicenseCodes(filters?: {
  status?: 'available' | 'used' | 'revoked'
  batch?: string
  q?: string
}): Promise<LicenseCode[]> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.batch?.trim()) params.set('batch', filters.batch.trim())
  if (filters?.q?.trim()) params.set('q', filters.q.trim())
  const qs = params.toString() ? `?${params.toString()}` : ''
  const data = await apiRequest(`/admin/license/codes${qs}`)
  return Array.isArray(data?.codes) ? data.codes : []
}

export async function adminRevokeLicenseCode(code: string): Promise<LicenseCode> {
  const data = await apiRequest(`/admin/license/codes/${encodeURIComponent(code)}/revoke`, 'POST')
  revalidatePath('/admin/license')
  return data as LicenseCode
}

export type ClawBackResult = {
  user_id: number
  email: string
  outcome: 'revoked' | 'superseded' | 'already_free' | 'failed'
  previous_plan?: string
  reason?: string
  room_ids?: number[]
}

export type ClawBackSummary = {
  code: string
  revoked_at?: string | null
  total: number
  revoked: number
  skipped: number
  failed: number
  rooms_closed: number
  results: ClawBackResult[]
}

/**
 * Revokes a code AND takes the plan back from the users it granted.
 *
 * Separate from adminRevokeLicenseCode, which only blocks further redemptions:
 * this one ends live games, so it is never something to trigger by accident.
 * Redeemers who have since been granted a different plan are left alone and come
 * back marked `superseded`.
 */
export async function adminClawBackLicenseCode(code: string, note?: string): Promise<ClawBackSummary> {
  const data = await apiRequest(
    `/admin/license/codes/${encodeURIComponent(code)}/claw-back`,
    'POST',
    note?.trim() ? { note: note.trim() } : {},
  )
  revalidatePath('/admin/license')
  return data as ClawBackSummary
}

export async function adminListRedemptions(code?: string): Promise<LicenseRedemption[]> {
  const qs = code?.trim() ? `?code=${encodeURIComponent(code.trim())}` : ''
  const data = await apiRequest(`/admin/license/redemptions${qs}`)
  return Array.isArray(data?.redemptions) ? data.redemptions : []
}

export type SubscriptionEvent = {
  id: number
  user_id: number
  email?: string
  /** grant | renew | downgrade | expire */
  action: string
  /** admin_assign | code_redeem | expiry_auto */
  source: string
  source_ref?: string
  previous_plan_id?: string
  plan_id: string
  starts_at: string
  ends_at?: string | null
  amount_vnd: number
  external_ref?: string
  actor_user_id: number
  note?: string
  created_at: string
}

export type RevenueSummary = {
  grants: number
  paid_grants: number
  total_vnd: number
}

export type HistoryFilters = {
  email?: string
  planId?: string
  action?: string
  source?: string
  externalRef?: string
  /** YYYY-MM-DD, inclusive on both ends. */
  from?: string
  to?: string
  limit?: number
}

function historyQuery(f?: HistoryFilters): string {
  const params = new URLSearchParams()
  if (f?.email?.trim()) params.set('email', f.email.trim())
  if (f?.planId?.trim()) params.set('plan_id', f.planId.trim())
  if (f?.action?.trim()) params.set('action', f.action.trim())
  if (f?.source?.trim()) params.set('source', f.source.trim())
  if (f?.externalRef?.trim()) params.set('external_ref', f.externalRef.trim())
  if (f?.from?.trim()) params.set('from', f.from.trim())
  if (f?.to?.trim()) params.set('to', f.to.trim())
  if (f?.limit) params.set('limit', String(f.limit))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function adminListSubscriptionHistory(
  f?: HistoryFilters
): Promise<{ events: SubscriptionEvent[]; summary: RevenueSummary }> {
  const data = await apiRequest(`/admin/license/history${historyQuery(f)}`)
  return {
    events: Array.isArray(data?.events) ? data.events : [],
    summary: data?.summary ?? { grants: 0, paid_grants: 0, total_vnd: 0 },
  }
}

/**
 * Returns the reconciliation CSV as text for the client to save.
 *
 * The download cannot be a plain link: the session token is an httpOnly cookie
 * on this origin, so a browser request straight to the API arrives unauthenticated.
 */
export async function adminExportSubscriptionHistoryCsv(f?: HistoryFilters): Promise<string> {
  return apiRequestText(`/admin/license/history.csv${historyQuery(f)}`)
}

export async function adminSendLicenseCodes(input: {
  codes: string[]
  email: string
  name?: string
}): Promise<{ sent: number; message: string }> {
  const t = await getTranslations('adminLicense')
  const data = await apiRequest('/admin/license/codes/send', 'POST', {
    codes: input.codes,
    email: input.email.trim(),
    name: input.name?.trim() || undefined,
  })
  revalidatePath('/admin/license')
  return { sent: data?.sent ?? 0, message: data?.message ?? t('sent') }
}

export type EnforcementReadiness = {
  ready: boolean
  free_plan_locked: boolean
  grandfather_ran: boolean
  admins_without_pro: { user_id: number; email: string }[]
  active_hosts_on_free: number
  total_active_hosts: number
  live_rooms_at_risk: number
  blockers: string[]
  warnings: string[]
}

export type EnforcementState = {
  enforcement: boolean
  env_pinned: boolean
  source: 'database' | 'env'
  updated_at?: string
  updated_by?: number
  readiness: EnforcementReadiness
}

/**
 * Reads the license kill switch and its pre-flight check.
 *
 * Tolerant on purpose: during a rolling deploy the backend may not have this
 * route yet, and the page must still render its other four tabs rather than
 * showing one red error across the whole console.
 */
export async function adminGetEnforcement(): Promise<EnforcementState | null> {
  try {
    return (await apiRequest('/admin/license/enforcement')) as EnforcementState
  } catch {
    return null
  }
}

/**
 * Flips the kill switch at runtime — no container restart.
 *
 * Throws, unlike the GET: the 409 body carries the readiness verdict the admin
 * needs to read, and the page's catch → setErr path is how every other mutation
 * here reports failure.
 */
export async function adminSetEnforcement(enabled: boolean, force = false): Promise<EnforcementState> {
  const data = await apiRequest('/admin/license/enforcement', 'PUT', { enabled, force })
  revalidatePath('/admin/license')
  return data as EnforcementState
}
