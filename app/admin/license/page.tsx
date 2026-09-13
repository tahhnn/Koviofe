'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  adminAssignPlan,
  adminCreateLicenseCodes,
  adminListLicenseCodes,
  adminListPlans,
  adminListSubscriptions,
  adminExportSubscriptionHistoryCsv,
  adminListSubscriptionHistory,
  adminRevokeLicenseCode,
  adminSendLicenseCodes,
  getMyLicense,
  adminUpdatePlan,
  type LicenseCode,
  type RevenueSummary,
  type SubscriptionEvent,
  type LicenseSubscriptionRow,
  type PricingPlan,
} from '@/app/actions/license'
import { Ban, Copy, Download, KeyRound, Mail, RefreshCw, Save } from 'lucide-react'

type DurationKey = '30' | '90' | '365' | 'lifetime'

function formatLimit(n: number) {
  return n < 0 ? '∞' : String(n)
}

function formatVnd(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + '\u0111'
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '\u2014'
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '\u2014'
  }
}

function actionStyle(action: string): { label: string; cls: string } {
  switch (action) {
    case 'grant':
      return { label: 'C\u1ea5p m\u1edbi', cls: 'text-emerald-400' }
    case 'renew':
      return { label: 'Gia h\u1ea1n', cls: 'text-sky-400' }
    case 'downgrade':
      return { label: 'Ng\u1eaft', cls: 'text-rose-400' }
    case 'expire':
      return { label: 'H\u1ebft h\u1ea1n', cls: 'text-amber-400' }
    default:
      return { label: action, cls: 'text-[#9a9eab]' }
  }
}

function sourceLabel(source: string) {
  switch (source) {
    case 'code_redeem':
      return 'Nh\u1eadp m\u00e3'
    case 'admin_assign':
      return 'Admin c\u1ea5p'
    case 'expiry_auto':
      return 'T\u1ef1 h\u1ebft h\u1ea1n'
    default:
      return source
  }
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    // Explicit 2-digit parts: the vi-VN default drops the leading zero on the
    // month, so a column of dates comes out ragged (13/9/2027 next to 13/10/2026).
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export default function AdminLicensePage() {
  const router = useRouter()
  const [tab, setTab] = useState<'subscriptions' | 'plans' | 'codes' | 'history'>('subscriptions')

  const [codes, setCodes] = useState<LicenseCode[]>([])
  const [codeFilter, setCodeFilter] = useState<'' | 'available' | 'used' | 'revoked'>('')
  const [codeSearch, setCodeSearch] = useState('')
  const [mintPlan, setMintPlan] = useState('pro')
  const [mintCount, setMintCount] = useState('10')
  const [mintDuration, setMintDuration] = useState('30')
  const [mintMaxUses, setMintMaxUses] = useState('1')
  const [mintShelfDays, setMintShelfDays] = useState('')
  const [mintBatch, setMintBatch] = useState('')
  const [justMinted, setJustMinted] = useState<LicenseCode[]>([])
  // null = not read yet; the banner stays hidden rather than asserting a state
  // it does not know.
  const [enforcement, setEnforcement] = useState<boolean | null>(null)

  const [mintAmount, setMintAmount] = useState('')
  const [mintRef, setMintRef] = useState('')
  const [sendEmail, setSendEmail] = useState('')
  const [sendName, setSendName] = useState('')

  const [events, setEvents] = useState<SubscriptionEvent[]>([])
  const [summary, setSummary] = useState<RevenueSummary>({ grants: 0, paid_grants: 0, total_vnd: 0 })
  const [histFrom, setHistFrom] = useState('')
  const [histTo, setHistTo] = useState('')
  const [histEmail, setHistEmail] = useState('')
  const [histAction, setHistAction] = useState('')

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
      const [p, s, me] = await Promise.all([
        adminListPlans(),
        adminListSubscriptions(search),
        getMyLicense(),
      ])
      setEnforcement(me?.enforcement ?? null)
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
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  const flash = (ok: string) => {
    setMsg(ok)
    setErr(null)
    setTimeout(() => setMsg(null), 3500)
  }

  const loadCodes = useCallback(async () => {
    try {
      setCodes(
        await adminListLicenseCodes({
          status: codeFilter || undefined,
          q: codeSearch || undefined,
        })
      )
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load codes')
    }
  }, [codeFilter, codeSearch])

  useEffect(() => {
    if (tab !== 'codes') return
    const t = setTimeout(loadCodes, 0)
    return () => clearTimeout(t)
  }, [tab, loadCodes])

  const mintCodes = async () => {
    const count = Number(mintCount)
    if (!Number.isInteger(count) || count < 1 || count > 500) {
      setErr('Số lượng phải từ 1 đến 500')
      return
    }
    setBusyKey('mint')
    try {
      const minted = await adminCreateLicenseCodes({
        planId: mintPlan,
        count,
        durationDays: Number(mintDuration) || 0,
        maxUses: Number(mintMaxUses) || 1,
        expiresInDays: Number(mintShelfDays) || undefined,
        batch: mintBatch,
        amountVnd: Number(mintAmount) || undefined,
        externalRef: mintRef,
      })
      setJustMinted(minted)
      await loadCodes()
      flash(`Đã tạo ${minted.length} mã`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Không tạo được mã')
    } finally {
      setBusyKey(null)
    }
  }

  const loadHistory = useCallback(async () => {
    try {
      const res = await adminListSubscriptionHistory({
        from: histFrom || undefined,
        to: histTo || undefined,
        email: histEmail || undefined,
        action: histAction || undefined,
      })
      setEvents(res.events)
      setSummary(res.summary)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to load history')
    }
  }, [histFrom, histTo, histEmail, histAction])

  useEffect(() => {
    if (tab !== 'history') return
    const t = setTimeout(loadHistory, 0)
    return () => clearTimeout(t)
  }, [tab, loadHistory])

  const exportHistory = async () => {
    setBusyKey('export')
    try {
      const csv = await adminExportSubscriptionHistoryCsv({
        from: histFrom || undefined,
        to: histTo || undefined,
        email: histEmail || undefined,
        action: histAction || undefined,
      })
      // The CSV arrives through a server action as text, so the file is built
      // here. The BOM the API prefixes is preserved — dropping it is what makes
      // Excel mangle Vietnamese names.
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `license-history-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      flash('Đã tải CSV')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Không xuất được CSV')
    } finally {
      setBusyKey(null)
    }
  }

  const sendCodes = async () => {
    if (justMinted.length === 0) return
    setBusyKey('send')
    try {
      const res = await adminSendLicenseCodes({
        codes: justMinted.map((c) => c.code),
        email: sendEmail,
        name: sendName,
      })
      await loadCodes()
      flash(res.message)
      setSendEmail('')
      setSendName('')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Không gửi được email')
    } finally {
      setBusyKey(null)
    }
  }

  const revokeCode = async (code: string) => {
    setBusyKey(`revoke-${code}`)
    try {
      await adminRevokeLicenseCode(code)
      await loadCodes()
      flash(`Đã thu hồi ${code}`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Không thu hồi được')
    } finally {
      setBusyKey(null)
    }
  }

  // Clipboard is unavailable on http:// origins and in some embedded webviews.
  // A silent failure here would look like the button did nothing, so say so.
  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      flash(`Đã copy ${label}`)
    } catch {
      setErr('Trình duyệt chặn clipboard — bôi đen và copy thủ công')
    }
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
      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-10 max-w-6xl">
        <p className="text-[#9a9eab] text-sm">Loading license console…</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-10 max-w-6xl space-y-6 sm:space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#f2f0eb] tracking-tight">Quản lý License</h1>
              <p className="text-sm text-[#9a9eab] mt-2 max-w-2xl">
                Role admin ≠ gói Pro. Tab Subscriptions: <strong className="text-[#c5c2ba] font-semibold">Cấp Pro</strong>{' '}
                hoặc <strong className="text-[#c5c2ba] font-semibold">Ngắt Pro</strong> (về Free ngay). Player vào bằng PIN,
                không cần tài khoản.
              </p>
              {enforcement !== null && (
                <p
                  className={`mt-3 text-xs rounded-xl border px-3 py-2 max-w-2xl ${
                    enforcement
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-200/90'
                  }`}
                >
                  {enforcement ? (
                    <>
                      Enforcement đang <strong>BẬT</strong>. Tài khoản gói{' '}
                      <code className="font-mono">free</code> không tạo được quiz hay phòng chơi — cấp quyền bằng
                      mã kích hoạt hoặc gán gói ở tab User licenses.
                    </>
                  ) : (
                    <>
                      Enforcement đang <strong>TẮT</strong> — mọi host đều được mở khóa, gói không chặn gì.
                      Bật bằng biến môi trường <code className="font-mono break-all">LICENSE_ENFORCEMENT=true</code>{' '}
                      rồi restart backend.
                    </>
                  )}
                </p>
              )}
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

          <div className="flex gap-2 border-b border-white/10 pb-px overflow-x-auto">
            {(
              [
                ['subscriptions', 'User licenses'],
                ['codes', 'Mã kích hoạt'],
                ['history', 'Lịch sử / Đối soát'],
                ['plans', 'Plan catalog'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
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
                  <table className="w-full min-w-[760px] text-left text-sm">
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
                                  className="bg-black/40 border border-white/10 text-[#f2f0eb] h-10 sm:h-9 rounded-lg text-xs px-2"
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
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-xl font-black text-[#f2f0eb]">{p.id}</h2>
                      <label className="flex items-center gap-2 text-xs text-[#9a9eab] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={d.is_active !== false}
                          onChange={(e) => updateDraft(p.id, 'is_active', e.target.checked)}
                          className="size-5 sm:size-4 rounded border-white/20"
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          <label key={key} className="flex items-center gap-2 cursor-pointer min-h-10 sm:min-h-0 py-1 sm:py-0">
                            <input
                              type="checkbox"
                              checked={!!d[key]}
                              onChange={(e) => updateDraft(p.id, key, e.target.checked)}
                              className="size-5 sm:size-4"
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
          {tab === 'codes' && (
            <section className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#e85d4c]" />
                  <h2 className="font-bold text-[#f2f0eb]">Tạo lô mã kích hoạt</h2>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">Gói</Label>
                    <select
                      value={mintPlan}
                      onChange={(e) => setMintPlan(e.target.value)}
                      className="w-full h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-sm text-[#f2f0eb]"
                    >
                      {plans
                        .filter((p) => p.id !== 'free')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">Số lượng</Label>
                    <Input value={mintCount} onChange={(e) => setMintCount(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">Số ngày gói (0 = vĩnh viễn)</Label>
                    <Input value={mintDuration} onChange={(e) => setMintDuration(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">Lượt dùng / mã</Label>
                    <Input value={mintMaxUses} onChange={(e) => setMintMaxUses(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">Hạn dùng mã (ngày)</Label>
                    <Input
                      value={mintShelfDays}
                      onChange={(e) => setMintShelfDays(e.target.value)}
                      placeholder="trống = không hạn"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">Lô</Label>
                    <Input value={mintBatch} onChange={(e) => setMintBatch(e.target.value)} placeholder="thang9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">Số tiền / mã (VND)</Label>
                    <Input
                      value={mintAmount}
                      onChange={(e) => setMintAmount(e.target.value)}
                      placeholder="199000"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">Mã tham chiếu thanh toán</Label>
                    <Input
                      value={mintRef}
                      onChange={(e) => setMintRef(e.target.value)}
                      placeholder="VCB-20260913-8891"
                    />
                  </div>
                </div>

                <p className="text-xs text-[#9a9eab]">
                  Số tiền và mã tham chiếu đi theo mã kích hoạt, rồi đi tiếp vào lịch sử khi khách nhập mã.
                  Đó là thứ duy nhất nối gói đã cấp với khoản tiền đã nhận qua trung gian — bỏ trống
                  thì sau này không đối soát được.
                </p>

                <Button
                  onClick={mintCodes}
                  disabled={busyKey === 'mint'}
                  className="h-11 rounded-xl bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold border-none"
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  {busyKey === 'mint' ? 'Đang tạo…' : 'Tạo mã'}
                </Button>

                {justMinted.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-emerald-300">
                        {justMinted.length} mã vừa tạo — copy và lưu lại ngay
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => copyText(justMinted.map((c) => c.code).join('\n'), 'toàn bộ mã')}
                        className="h-9 rounded-xl border-white/20 text-[#c5c2ba] shrink-0"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy tất cả
                      </Button>
                    </div>
                    <div className="font-mono text-xs text-[#f2f0eb] grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
                      {justMinted.map((c) => (
                        <span key={c.code} className="rounded bg-black/40 px-2 py-1">
                          {c.code}
                        </span>
                      ))}
                    </div>

                    <div className="border-t border-white/10 pt-3 space-y-2">
                      <Label className="text-xs text-[#9a9eab]">Gửi cả lô này qua email</Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          value={sendEmail}
                          onChange={(e) => setSendEmail(e.target.value)}
                          placeholder="buyer@example.com"
                          type="email"
                        />
                        <Input
                          value={sendName}
                          onChange={(e) => setSendName(e.target.value)}
                          placeholder="Tên người mua (tùy chọn)"
                        />
                        <Button
                          disabled={busyKey === 'send' || !sendEmail}
                          onClick={sendCodes}
                          className="shrink-0 h-11 rounded-xl bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold border-none"
                        >
                          <Mail className="w-4 h-4 mr-2" />
                          {busyKey === 'send' ? 'Đang gửi…' : 'Gửi'}
                        </Button>
                      </div>
                      <p className="text-xs text-[#9a9eab]">
                        Gửi tất cả {justMinted.length} mã trong một email. Cột đã gửi chỉ được đánh dấu khi
                        SMTP nhận thành công.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9a9eab]">Lọc</Label>
                  <select
                    value={codeFilter}
                    onChange={(e) => setCodeFilter(e.target.value as typeof codeFilter)}
                    className="h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-sm text-[#f2f0eb]"
                  >
                    <option value="">Tất cả</option>
                    <option value="available">Còn dùng được</option>
                    <option value="used">Đã dùng hết</option>
                    <option value="revoked">Đã thu hồi</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1 min-w-48">
                  <Label className="text-xs text-[#9a9eab]">Tìm mã</Label>
                  <Input value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} placeholder="KOVIO-..." />
                </div>
                <Button variant="outline" onClick={loadCodes} className="h-10 rounded-xl border-white/20 text-[#c5c2ba]">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Tải lại
                </Button>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-[#9a9eab] text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3">Mã</th>
                      <th className="text-left px-4 py-3">Gói</th>
                      <th className="text-left px-4 py-3">Thời hạn</th>
                      <th className="text-left px-4 py-3">Lượt</th>
                      <th className="text-left px-4 py-3">Lô</th>
                      <th className="text-left px-4 py-3">Tiền / Ref</th>
                      <th className="text-left px-4 py-3">Đã gửi</th>
                      <th className="text-left px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {codes.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-[#9a9eab]">
                          Chưa có mã nào.
                        </td>
                      </tr>
                    )}
                    {codes.map((c) => {
                      const exhausted = c.used_count >= c.max_uses
                      const stale = !!c.expires_at && new Date(c.expires_at) < new Date()
                      const status = c.revoked_at
                        ? { label: 'Đã thu hồi', cls: 'text-rose-400' }
                        : exhausted
                          ? { label: 'Hết lượt', cls: 'text-[#9a9eab]' }
                          : stale
                            ? { label: 'Quá hạn', cls: 'text-amber-400' }
                            : { label: 'Còn dùng', cls: 'text-emerald-400' }
                      return (
                        <tr key={c.code} className="border-t border-white/5">
                          <td className="px-4 py-3 font-mono text-[#f2f0eb] whitespace-nowrap">{c.code}</td>
                          <td className="px-4 py-3 text-[#c5c2ba]">{c.plan_id}</td>
                          <td className="px-4 py-3 text-[#c5c2ba] whitespace-nowrap">
                            {c.duration_days === 0 ? 'Vĩnh viễn' : c.duration_days + ' ngày'}
                          </td>
                          <td className="px-4 py-3 text-[#c5c2ba] whitespace-nowrap">
                            {c.used_count} / {c.max_uses}
                          </td>
                          <td className="px-4 py-3 text-[#9a9eab]">{c.batch || '-'}</td>
                          <td className="px-4 py-3 text-[#c5c2ba] whitespace-nowrap">
                            {c.amount_vnd ? formatVnd(c.amount_vnd) : '-'}
                            {c.external_ref && (
                              <div className="text-xs text-[#9a9eab]">{c.external_ref}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">
                            {c.delivered_at ? (
                              <>
                                <span className="text-emerald-400">✓</span> {c.delivered_to}
                              </>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className={'px-4 py-3 font-semibold whitespace-nowrap ' + status.cls}>{status.label}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 justify-end">
                              <Button
                                variant="outline"
                                onClick={() => copyText(c.code, c.code)}
                                className="h-9 px-3 rounded-lg border-white/20 text-[#c5c2ba]"
                                aria-label={'Copy ' + c.code}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              {!c.revoked_at && (
                                <Button
                                  variant="outline"
                                  disabled={busyKey === 'revoke-' + c.code}
                                  onClick={() => revokeCode(c.code)}
                                  className="h-9 px-3 rounded-lg border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                                  aria-label={'Thu hồi ' + c.code}
                                >
                                  <Ban className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-[#9a9eab]">
                Thu hồi chỉ chặn lượt dùng mới. Ai đã kích hoạt bằng mã đó vẫn giữ gói — hạ gói của họ ở tab User
                licenses.
              </p>
            </section>
          )}

          {tab === 'history' && (
            <section className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-[#9a9eab]">Lượt cấp gói</div>
                  <div className="text-2xl font-black text-[#f2f0eb] mt-1">{summary.grants}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-[#9a9eab]">Có ghi tiền</div>
                  <div className="text-2xl font-black text-[#f2f0eb] mt-1">{summary.paid_grants}</div>
                </div>
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-emerald-300/80">Tổng đã ghi nhận</div>
                  <div className="text-2xl font-black text-emerald-300 mt-1">{formatVnd(summary.total_vnd)}</div>
                </div>
              </div>

              <p className="text-xs text-[#9a9eab] rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                Đây là số <strong className="text-[#c5c2ba]">hệ thống ghi nhận</strong>, không phải số ngân hàng nhận được.
                Thanh toán đi qua trung gian, không chạy trên app. Đối chiếu cột này với sao kê — lệch nhau
                chính là thứ cần tìm.
              </p>

              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9a9eab]">Từ ngày</Label>
                  <Input type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9a9eab]">Đến ngày</Label>
                  <Input type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9a9eab]">Hành động</Label>
                  <select
                    value={histAction}
                    onChange={(e) => setHistAction(e.target.value)}
                    className="h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-sm text-[#f2f0eb]"
                  >
                    <option value="">Tất cả</option>
                    <option value="grant">Cấp mới</option>
                    <option value="renew">Gia hạn</option>
                    <option value="downgrade">Ngắt</option>
                    <option value="expire">Hết hạn</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1 min-w-48">
                  <Label className="text-xs text-[#9a9eab]">Email</Label>
                  <Input value={histEmail} onChange={(e) => setHistEmail(e.target.value)} placeholder="buyer@..." />
                </div>
                <Button variant="outline" onClick={loadHistory} className="h-10 rounded-xl border-white/20 text-[#c5c2ba]">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Lọc
                </Button>
                <Button
                  disabled={busyKey === 'export'}
                  onClick={exportHistory}
                  className="h-10 rounded-xl bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold border-none"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {busyKey === 'export' ? 'Đang xuất…' : 'Xuất CSV'}
                </Button>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-[#9a9eab] text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3">Thời điểm</th>
                      <th className="text-left px-4 py-3">Người dùng</th>
                      <th className="text-left px-4 py-3">Hành động</th>
                      <th className="text-left px-4 py-3">Nguồn</th>
                      <th className="text-left px-4 py-3">Gói</th>
                      <th className="text-left px-4 py-3">Hết hạn</th>
                      <th className="text-right px-4 py-3">Số tiền</th>
                      <th className="text-left px-4 py-3">Tham chiếu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-[#9a9eab]">
                          Không có bản ghi nào trong khoảng này.
                        </td>
                      </tr>
                    )}
                    {events.map((e) => (
                      <tr key={e.id} className="border-t border-white/5">
                        <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                        <td className="px-4 py-3 text-[#f2f0eb]">
                          {e.email || `#${e.user_id}`}
                          {e.note && <div className="text-xs text-[#9a9eab]">{e.note}</div>}
                        </td>
                        <td className={'px-4 py-3 font-semibold whitespace-nowrap ' + actionStyle(e.action).cls}>
                          {actionStyle(e.action).label}
                        </td>
                        <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">
                          {sourceLabel(e.source)}
                          {e.source_ref && <div className="font-mono text-xs">{e.source_ref}</div>}
                        </td>
                        <td className="px-4 py-3 text-[#c5c2ba] whitespace-nowrap">
                          {e.previous_plan_id ? `${e.previous_plan_id} → ` : ''}
                          <strong className="text-[#f2f0eb]">{e.plan_id}</strong>
                        </td>
                        <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">
                          {/* A lapse and a revoke both land on Free, which has no
                              expiry — printing "Vĩnh viễn" on a row labelled
                              "Hết hạn" reads as the opposite of what happened. */}
                          {e.action === 'expire' || e.action === 'downgrade'
                            ? '—'
                            : e.ends_at
                              ? formatDate(e.ends_at)
                              : 'Vĩnh viễn'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-[#f2f0eb]">
                          {e.amount_vnd ? formatVnd(e.amount_vnd) : '-'}
                        </td>
                        <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">{e.external_ref || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-[#9a9eab]">
                Bảng này chỉ ghi thêm, không sửa. Một lần sửa sai là một dòng mới, không phải đè lên dòng cũ.
              </p>
            </section>
          )}

    </main>
  )
}
