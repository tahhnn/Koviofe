'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  adminAssignPlan,
  adminListPlans,
  adminListSubscriptions,
  adminUpdatePlan,
  type LicenseSubscriptionRow,
  type PricingPlan,
} from '@/app/actions/license'
import { RefreshCw, Save } from 'lucide-react'

type DurationKey = '30' | '90' | '365' | 'lifetime'

function formatLimit(n: number) {
  return n < 0 ? '∞' : String(n)
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('vi-VN')
  } catch {
    return '—'
  }
}

export default function AdminLicensePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'subscriptions' | 'plans'>('subscriptions')

  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [subs, setSubs] = useState<LicenseSubscriptionRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [drafts, setDrafts] = useState<Record<string, PricingPlan>>({})
  const [durationByUser, setDurationByUser] = useState<Record<number, DurationKey>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const [p, s] = await Promise.all([adminListPlans(), adminListSubscriptions(search)])
      setPlans(p)
      setDrafts(Object.fromEntries(p.map((x) => [x.id, { ...x }])))
      setSubs(s)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load'
      setErr(message)
      if (message === 'UNAUTHORIZED_OR_FORBIDDEN' || /forbidden|insufficient/i.test(message)) {
        router.push('/dashboard')
      }
    } finally {
      setLoading(false)
    }
  }, [search, router])

  useEffect(() => {
    load()
  }, [load])

  const flash = (ok: string) => {
    setMsg(ok)
    setErr(null)
    setTimeout(() => setMsg(null), 3500)
  }

  const savePlan = async (planId: string) => {
    const draft = drafts[planId]
    if (!draft) return
    setBusyKey(`plan-${planId}`)
    try {
      await adminUpdatePlan(planId, {
        name: draft.name,
        description: draft.description,
        price_monthly_vnd: Number(draft.price_monthly_vnd) || 0,
        max_players_per_room: Number(draft.max_players_per_room),
        max_quizzes: Number(draft.max_quizzes),
        max_templates: Number(draft.max_templates),
        max_concurrent_rooms: Number(draft.max_concurrent_rooms),
        max_questions_per_quiz: Number(draft.max_questions_per_quiz),
        allow_player_paced: !!draft.allow_player_paced,
        allow_custom_branding: !!draft.allow_custom_branding,
        allow_export_logs: !!draft.allow_export_logs,
        allow_priority_support: !!draft.allow_priority_support,
        allow_remove_watermark: !!draft.allow_remove_watermark,
        is_active: draft.is_active !== false,
      })
      flash(`Đã lưu gói ${planId}`)
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusyKey(null)
    }
  }

  const grantPro = async (userId: number) => {
    setBusyKey(`pro-${userId}`)
    try {
      const dur = durationByUser[userId] || '30'
      if (dur === 'lifetime') {
        await adminAssignPlan({ userId, planId: 'pro', lifetime: true })
        flash(`Đã cấp Pro vĩnh viễn cho #${userId}`)
      } else {
        const days = parseInt(dur, 10)
        await adminAssignPlan({ userId, planId: 'pro', endsAtDays: days })
        flash(`Đã cấp Pro ${days} ngày cho #${userId}`)
      }
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Assign failed')
    } finally {
      setBusyKey(null)
    }
  }

  const revokeToFree = async (userId: number, email?: string) => {
    const label = email || `#${userId}`
    if (
      !window.confirm(
        `Ngắt license Pro của ${label}?\nUser sẽ về gói Free ngay lập tức.`
      )
    ) {
      return
    }
    setBusyKey(`free-${userId}`)
    try {
      await adminAssignPlan({ userId, planId: 'free' })
      flash(`Đã ngắt Pro → Free · ${label}`)
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setBusyKey(null)
    }
  }

  const updateDraft = (planId: string, key: keyof PricingPlan, value: string | boolean | number) => {
    setDrafts((prev) => ({
      ...prev,
      [planId]: { ...prev[planId], [key]: value },
    }))
  }

  if (loading && plans.length === 0 && subs.length === 0) {
    return (
      <main className="container mx-auto px-6 py-10 max-w-6xl">
        <p className="text-[#9a9eab] text-sm">Loading license console…</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto px-6 py-10 max-w-6xl space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-[#f2f0eb] tracking-tight">Quản lý License</h1>
              <p className="text-sm text-[#9a9eab] mt-2 max-w-2xl">
                Role admin ≠ gói Pro. Tab Subscriptions: <strong className="text-[#c5c2ba] font-semibold">Cấp Pro</strong>{' '}
                hoặc <strong className="text-[#c5c2ba] font-semibold">Ngắt Pro</strong> (về Free ngay). Player vào bằng PIN,
                không cần tài khoản.
              </p>
              <p className="mt-3 text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200/90 px-3 py-2 max-w-2xl">
                Enforcement đang TẮT (license phát triển sau). User chưa bị chặn theo gói Free/Pro.
                Bật lại: <code className="font-mono">EnforcementEnabled=true</code> trong{' '}
                <code className="font-mono">backend/internal/pkg/license/license.go</code>.
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => load()}
              className="text-[#9a9eab] hover:text-[#f2f0eb] h-9 rounded-xl text-xs shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Refresh
            </Button>
          </div>

          <div className="flex gap-2 border-b border-white/10 pb-px">
            {(
              [
                ['subscriptions', 'User licenses'],
                ['plans', 'Plan catalog'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-colors cursor-pointer ${
                  tab === id
                    ? 'bg-white/10 text-[#f2f0eb] border border-b-0 border-white/10'
                    : 'text-[#9a9eab] hover:text-[#f2f0eb]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(msg || err) && (
            <p
              className={`text-sm font-medium px-4 py-3 rounded-xl border ${
                err
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              }`}
            >
              {err || msg}
            </p>
          )}

          {tab === 'subscriptions' && (
            <section className="space-y-4">
              <form
                className="flex flex-col sm:flex-row gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  load()
                }}
              >
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm email / nickname…"
                  className="bg-black/40 border-white/10 text-[#f2f0eb] h-11 rounded-xl flex-1"
                />
                <Button
                  type="submit"
                  className="h-11 rounded-xl bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold border-none"
                >
                  Search
                </Button>
              </form>

              {loading ? (
                <p className="text-sm text-[#9a9eab]">Đang tải…</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#9a9eab]">
                        <th className="px-4 py-3 font-semibold">User</th>
                        <th className="px-4 py-3 font-semibold">Effective license</th>
                        <th className="px-4 py-3 font-semibold">Expires</th>
                        <th className="px-4 py-3 font-semibold">Cấp / Ngắt license</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((s) => {
                        const isPro = s.plan_id === 'pro'
                        return (
                          <tr key={s.user_id} className="border-b border-white/5 hover:bg-white/[0.02]">
                            <td className="px-4 py-3 align-top">
                              <div className="font-semibold text-[#f2f0eb]">{s.email}</div>
                              <div className="text-xs text-[#9a9eab] mt-0.5">
                                #{s.user_id} · {s.nickname || '—'}
                                {s.role === 'admin' ? ' · Admin' : ' · User'}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className={`font-semibold ${isPro ? 'text-[#e85d4c]' : 'text-[#c5c2ba]'}`}>
                                {s.plan_name || s.plan_id}
                              </div>
                              <div className="text-xs text-[#9a9eab] mt-0.5">
                                {s.max_players_per_room} players · {s.max_concurrent_rooms ?? '—'} rooms
                                {s.allow_player_paced ? ' · solo ✓' : ' · solo ✗'}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top text-[#c5c2ba] text-xs">
                              {s.lifetime || !s.ends_at ? 'Không hết hạn' : formatDate(s.ends_at)}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex flex-col gap-2 min-w-[220px]">
                                <select
                                  value={durationByUser[s.user_id] || '30'}
                                  onChange={(e) =>
                                    setDurationByUser((prev) => ({
                                      ...prev,
                                      [s.user_id]: e.target.value as DurationKey,
                                    }))
                                  }
                                  className="bg-black/40 border border-white/10 text-[#f2f0eb] h-9 rounded-lg text-xs px-2"
                                >
                                  <option value="30">Pro · 30 ngày</option>
                                  <option value="90">Pro · 90 ngày</option>
                                  <option value="365">Pro · 1 năm</option>
                                  <option value="lifetime">Pro · vĩnh viễn</option>
                                </select>
                                <div className="flex gap-2">
                                  <Button
                                    disabled={!!busyKey}
                                    onClick={() => grantPro(s.user_id)}
                                    className="flex-1 h-9 rounded-lg text-xs font-bold bg-[#e85d4c]/90 hover:bg-[#e85d4c] text-white border-none"
                                  >
                                    Cấp Pro
                                  </Button>
                                  <Button
                                    disabled={!!busyKey || s.plan_id === 'free'}
                                    onClick={() => revokeToFree(s.user_id, s.email)}
                                    title={
                                      s.plan_id === 'free'
                                        ? 'User đang Free — không cần ngắt'
                                        : 'Ngắt Pro, về Free ngay'
                                    }
                                    className="flex-1 h-9 rounded-lg text-xs font-bold border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 disabled:opacity-40 disabled:border-white/10 disabled:bg-white/5 disabled:text-[#5c6170]"
                                  >
                                    Ngắt Pro
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {subs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-[#9a9eab] text-sm">
                            Không có user phù hợp.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === 'plans' && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {plans.map((p) => {
                const d = drafts[p.id] || p
                return (
                  <div
                    key={p.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-xl font-black text-[#f2f0eb]">{p.id}</h2>
                      <label className="flex items-center gap-2 text-xs text-[#9a9eab] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={d.is_active !== false}
                          onChange={(e) => updateDraft(p.id, 'is_active', e.target.checked)}
                          className="rounded border-white/20"
                        />
                        Active
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-[#9a9eab]">Name</Label>
                        <Input
                          value={d.name}
                          onChange={(e) => updateDraft(p.id, 'name', e.target.value)}
                          className="mt-1 bg-black/40 border-white/10 text-[#f2f0eb] h-10 rounded-xl"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-[#9a9eab]">
                          Description
                        </Label>
                        <textarea
                          value={d.description || ''}
                          onChange={(e) => updateDraft(p.id, 'description', e.target.value)}
                          rows={2}
                          className="mt-1 w-full bg-black/40 border border-white/10 text-[#f2f0eb] text-sm rounded-xl px-3 py-2 resize-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {(
                          [
                            ['price_monthly_vnd', 'Price VND'],
                            ['max_players_per_room', 'Players / room'],
                            ['max_quizzes', 'Max quizzes (-1=∞)'],
                            ['max_templates', 'Max templates'],
                            ['max_concurrent_rooms', 'Concurrent rooms'],
                            ['max_questions_per_quiz', 'Questions / quiz'],
                          ] as const
                        ).map(([key, label]) => (
                          <div key={key}>
                            <Label className="text-[10px] uppercase tracking-wider text-[#9a9eab]">
                              {label}
                            </Label>
                            <Input
                              type="number"
                              value={Number(d[key] ?? 0)}
                              onChange={(e) => updateDraft(p.id, key, Number(e.target.value))}
                              className="mt-1 bg-black/40 border-white/10 text-[#f2f0eb] h-10 rounded-xl"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#c5c2ba]">
                        {(
                          [
                            ['allow_player_paced', 'Player-paced / Solo'],
                            ['allow_custom_branding', 'Custom branding'],
                            ['allow_export_logs', 'Export logs'],
                            ['allow_priority_support', 'Priority support'],
                            ['allow_remove_watermark', 'Remove watermark'],
                          ] as const
                        ).map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!d[key]}
                              onChange={(e) => updateDraft(p.id, key, e.target.checked)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <Button
                      disabled={busyKey === `plan-${p.id}`}
                      onClick={() => savePlan(p.id)}
                      className="w-full h-11 rounded-xl bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold border-none"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save {p.id} ({formatLimit(d.max_players_per_room)} players)
                    </Button>
                  </div>
                )
              })}
            </section>
          )}
    </main>
  )
}
