'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  adminListUsers,
  adminUpdateUserRole,
  adminUpdateUserStatus,
  type AdminUserRow,
} from '@/app/actions/admin-users'
import { adminAssignPlan } from '@/app/actions/license'
import { RefreshCw, Search, Shield, BadgePercent } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'

type DurationKey = '30' | '90' | '365' | 'lifetime'

/** UI model: Admin (ops) vs User (mua license). DB role "host" = User. */
function accountLabel(u: Pick<AdminUserRow, 'role' | 'account_type'>) {
  if (u.account_type === 'admin' || u.role === 'admin') return 'Admin'
  return 'User'
}

export default function AdminUsersPage() {
  const toast = useToast()
  const router = useRouter()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [durationByUser, setDurationByUser] = useState<Record<number, DurationKey>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await adminListUsers(search)
      setUsers(rows)
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, router])

  useEffect(() => {
    load()
  }, [load])

  const grantPro = async (user: AdminUserRow) => {
    setBusyId(user.id)
    try {
      const dur = durationByUser[user.id] || '30'
      if (dur === 'lifetime') {
        await adminAssignPlan({ userId: user.id, planId: 'pro', lifetime: true })
        toast.success('Đã cấp Pro', `${user.email} · vĩnh viễn`)
      } else {
        const days = parseInt(dur, 10)
        await adminAssignPlan({ userId: user.id, planId: 'pro', endsAtDays: days })
        toast.success('Đã cấp Pro', `${user.email} · ${days} ngày`)
      }
      await load()
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setBusyId(null)
    }
  }

  const revokeToFree = async (user: AdminUserRow) => {
    if (
      !window.confirm(
        `Ngắt license Pro của ${user.email}?\nUser sẽ về gói Free ngay lập tức.`
      )
    ) {
      return
    }
    setBusyId(user.id)
    try {
      await adminAssignPlan({ userId: user.id, planId: 'free' })
      toast.success('Đã ngắt Pro → Free', user.email)
      await load()
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setBusyId(null)
    }
  }

  const makeAdmin = async (user: AdminUserRow) => {
    if (user.role === 'admin') return
    setBusyId(user.id)
    try {
      await adminUpdateUserRole(user.id, 'admin')
      toast.success('Đã cấp quyền Admin hệ thống', user.email)
      await load()
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setBusyId(null)
    }
  }

  const revokeAdmin = async (user: AdminUserRow) => {
    if (user.role !== 'admin' || user.is_seed_admin) return
    setBusyId(user.id)
    try {
      // Product "User" maps to RBAC role "host"
      await adminUpdateUserRole(user.id, 'user')
      toast.success('Đã gỡ Admin → User', user.email)
      await load()
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setBusyId(null)
    }
  }

  const toggleStatus = async (user: AdminUserRow) => {
    if (user.is_seed_admin && user.is_active) return
    const next = !user.is_active
    const action = next ? 'kích hoạt' : 'vô hiệu hóa'
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} tài khoản ${user.email}?`)) {
      return
    }
    setBusyId(user.id)
    try {
      await adminUpdateUserStatus(user.id, next)
      toast.success(`Đã ${action}`, user.email)
      await load()
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="container mx-auto px-6 py-10 max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-black text-[#f2f0eb] tracking-tight">Quản lý Users</h1>
        <p className="text-sm text-[#9a9eab] mt-2 max-w-2xl leading-relaxed">
          Ai đăng ký đều là <strong className="text-[#c5c2ba] font-semibold">User</strong> (có thể tạo quiz /
          mở phòng / chơi). Player vào bằng PIN không cần tài khoản. Việc admin quản lý là{' '}
          <strong className="text-[#c5c2ba] font-semibold">gói license</strong> (Free/Pro) và tuỳ chọn cấp{' '}
          <strong className="text-[#c5c2ba] font-semibold">Admin hệ thống</strong>.
        </p>
        <p className="mt-2 text-xs text-[#5c6170]">
          Chi tiết catalog gói xem{' '}
          <Link href="/admin/license" className="text-[#e85d4c] hover:underline">
            License
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5c6170]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm email hoặc nickname…"
            className="pl-10 h-11 bg-[#1a1d26] border-[#2c313d] text-[#f2f0eb] rounded-xl"
          />
        </div>
        <Button
          onClick={() => load()}
          variant="outline"
          className="border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] h-11 rounded-xl"
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2c313d] text-left text-[11px] uppercase tracking-wider text-[#9a9eab]">
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Tài khoản</th>
                <th className="px-4 py-3 font-semibold">Loại</th>
                <th className="px-4 py-3 font-semibold">License</th>
                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                <th className="px-4 py-3 font-semibold text-right">License & Admin</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#9a9eab]">
                    Loading users…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#9a9eab]">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isAdmin = u.account_type === 'admin' || u.role === 'admin'
                  const isPro = (u.plan_id || '').toLowerCase() === 'pro'
                  return (
                    <tr key={u.id} className="border-b border-[#2c313d]/80 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-[#9a9eab] tabular-nums">#{u.id}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#f2f0eb]">{u.nickname || '—'}</div>
                        <div className="text-xs text-[#9a9eab] flex items-center gap-1.5 mt-0.5">
                          {u.email}
                          {u.is_seed_admin && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide text-[#e85d4c] font-bold">
                              <Shield className="w-3 h-3" />
                              seed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wide ${
                            isAdmin
                              ? 'bg-[#e85d4c]/15 text-[#e85d4c] border border-[#e85d4c]/25'
                              : 'bg-white/5 text-[#c5c2ba] border border-white/10'
                          }`}
                        >
                          {accountLabel(u)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-sm font-medium ${
                            isPro ? 'text-[#2dd4bf]' : 'text-[#c5c2ba]'
                          }`}
                        >
                          <BadgePercent className="w-3.5 h-3.5 opacity-70" />
                          {u.plan_name || u.plan_id || 'Free'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wide ${
                            u.is_active
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                          }`}
                        >
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex flex-wrap justify-end gap-2 items-center">
                            <select
                              value={durationByUser[u.id] || '30'}
                              onChange={(e) =>
                                setDurationByUser((prev) => ({
                                  ...prev,
                                  [u.id]: e.target.value as DurationKey,
                                }))
                              }
                              className="h-8 text-[11px] rounded-lg bg-[#12141a] border border-[#2c313d] text-[#c5c2ba] px-2"
                            >
                              <option value="30">Pro 30d</option>
                              <option value="90">Pro 90d</option>
                              <option value="365">Pro 1y</option>
                              <option value="lifetime">Pro lifetime</option>
                            </select>
                            <Button
                              size="sm"
                              disabled={busyId === u.id}
                              onClick={() => grantPro(u)}
                              className="h-8 text-xs rounded-lg bg-[#2dd4bf]/90 hover:bg-[#2dd4bf] text-[#0c1412] border-none font-bold"
                            >
                              Cấp Pro
                            </Button>
                            <Button
                              size="sm"
                              disabled={busyId === u.id || !isPro}
                              onClick={() => revokeToFree(u)}
                              variant="outline"
                              title={isPro ? 'Ngắt Pro, về Free ngay' : 'User đang Free'}
                              className="h-8 text-xs rounded-lg border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                            >
                              Ngắt Pro
                            </Button>
                          </div>
                          <div className="flex justify-end gap-2">
                            {!isAdmin ? (
                              <Button
                                size="sm"
                                disabled={busyId === u.id}
                                onClick={() => makeAdmin(u)}
                                variant="outline"
                                className="h-8 text-xs rounded-lg border-[#e85d4c]/40 text-[#e85d4c] hover:bg-[#e85d4c]/10"
                              >
                                Cấp Admin hệ thống
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                disabled={busyId === u.id || u.is_seed_admin}
                                onClick={() => revokeAdmin(u)}
                                variant="outline"
                                className="h-8 text-xs rounded-lg border-[#2c313d] text-[#9a9eab] disabled:opacity-40"
                                title={
                                  u.is_seed_admin
                                    ? 'Không thể gỡ admin seed'
                                    : 'Gỡ quyền admin hệ thống'
                                }
                              >
                                Gỡ Admin
                              </Button>
                            )}
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={busyId === u.id || (u.is_seed_admin && u.is_active)}
                              onClick={() => toggleStatus(u)}
                              variant="outline"
                              className={`h-8 text-xs rounded-lg ${
                                u.is_active
                                  ? 'border-rose-500/40 text-rose-300 hover:bg-rose-500/10'
                                  : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                              } disabled:opacity-40`}
                              title={
                                u.is_seed_admin && u.is_active
                                  ? 'Không thể vô hiệu hóa admin seed'
                                  : u.is_active
                                    ? 'Vô hiệu hóa tài khoản'
                                    : 'Kích hoạt tài khoản'
                              }
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
