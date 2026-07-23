'use server'

import { apiRequest } from '@/services/api/client'
import { revalidatePath } from 'next/cache'

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
  const data = await apiRequest('/admin/license/assign', 'POST', body)
  revalidatePath('/admin/license')
  revalidatePath('/profile/settings')
  return data
}
