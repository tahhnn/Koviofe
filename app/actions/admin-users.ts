'use server'

import { apiRequest } from '@/services/api/client'
import { revalidatePath } from 'next/cache'

export type AdminUserRow = {
  id: number
  email: string
  nickname: string
  role: string // RBAC: host|admin
  account_type?: 'user' | 'admin'
  plan_id: string
  plan_name: string
  is_active: boolean
  is_seed_admin: boolean
  created_at: string
}

export async function adminListUsers(q?: string): Promise<AdminUserRow[]> {
  const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  const data = await apiRequest(`/admin/users${qs}`)
  return Array.isArray(data?.users) ? data.users : []
}

export async function adminUpdateUserRole(userId: number, role: 'user' | 'admin') {
  // Backend accepts product role "user" (maps to RBAC "host") or "admin"
  const data = await apiRequest(`/admin/users/${userId}/role`, 'PATCH', { role })
  revalidatePath('/admin/users')
  revalidatePath('/admin/license')
  return data as { id: number; email: string; nickname: string; role: string; account_type?: string }
}

export async function adminUpdateUserStatus(userId: number, isActive: boolean) {
  const data = await apiRequest(`/admin/users/${userId}/status`, 'PATCH', { is_active: isActive })
  revalidatePath('/admin/users')
  revalidatePath('/admin/license')
  return data as { id: number; email: string; is_active: boolean }
}
