'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
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
  adminGetEnforcement,
  adminListSubscriptionHistory,
  adminClawBackLicenseCode,
  adminRevokeLicenseCode,
  adminSendLicenseCodes,
  adminSetEnforcement,
  getMyLicense,
  adminUpdatePlan,
  type LicenseCode,
  type RevenueSummary,
  type SubscriptionEvent,
  type LicenseSubscriptionRow,
  type PricingPlan,
  type EnforcementState,
  type EnforcementReadiness,
} from '@/app/actions/license'
import { Ban, Copy, Download, KeyRound, Mail, RefreshCw, Save, Undo2 } from 'lucide-react'
import { isPaidPlan } from '@/lib/license'

type DurationKey = '30' | '90' | '365' | 'lifetime'

function formatLimit(n: number) {
  return n < 0 ? '∞' : String(n)
}

// The locale has to be passed in: these are module-level helpers, and the
// reader's language is only known inside the component.
function formatVnd(n: number, locale: string) {
  return new Intl.NumberFormat(locale).format(n) + '\u0111'
}

function formatDateTime(iso: string | null | undefined, locale: string) {
  if (!iso) return '\u2014'
  try {
    return new Date(iso).toLocaleString(locale, {
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

/** One pre-flight check: green tick when satisfied, red cross when it blocks the
 * switch, amber bang when it is only worth knowing. */
function ReadinessLine({ ok, warn, text }: { ok: boolean; warn?: boolean; text: string }) {
  const mark = ok ? '\u2713' : warn ? '!' : '\u2717'
  const cls = ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-rose-400'
  return (
    <div className="flex items-start gap-2 text-xs text-[#c5c2ba]">
      <span className={`font-bold ${cls}`}>{mark}</span>
      <span>{text}</span>
    </div>
  )
}

function actionStyle(action: string, t: (key: string) => string): { label: string; cls: string } {
  switch (action) {
    case 'grant':
      return { label: t('grant'), cls: 'text-emerald-400' }
    case 'renew':
      return { label: t('renew'), cls: 'text-sky-400' }
    case 'downgrade':
      return { label: t('downgrade'), cls: 'text-rose-400' }
    case 'expire':
      return { label: t('expire'), cls: 'text-amber-400' }
    default:
      return { label: action, cls: 'text-[#9a9eab]' }
  }
}

function sourceLabel(source: string, t: (key: string) => string) {
  switch (source) {
    case 'code_redeem':
      return t('sourceCodeRedeem')
    case 'admin_assign':
      return t('sourceAdminAssign')
    case 'expiry_auto':
      return t('sourceExpiryAuto')
    default:
      return source
  }
}

function formatDate(iso: string | null | undefined, locale: string) {
  if (!iso) return '—'
  try {
    // Explicit 2-digit parts: the vi-VN default drops the leading zero on the
    // month, so a column of dates comes out ragged (13/9/2027 next to 13/10/2026).
    return new Date(iso).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export default function AdminLicensePage() {
  const t = useTranslations('adminLicense')
  const locale = useLocale()
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
  const [enf, setEnf] = useState<EnforcementState | null>(null)
  const [enfBusy, setEnfBusy] = useState(false)
  // Set when a PUT came back 409: the freshly recomputed verdict, shown next to
  // the "turn on anyway" button rather than the copy fetched on page load.
  const [enfBlocked, setEnfBlocked] = useState<EnforcementReadiness | null>(null)

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
      const [p, s, me, e] = await Promise.all([
        adminListPlans(),
        adminListSubscriptions(search),
        getMyLicense(),
        adminGetEnforcement(),
      ])
      setEnf(e)
      // Fall back to /license/me so the state still reads true if the newer
      // endpoint is unavailable during a rolling deploy.
      setEnforcement(e?.enforcement ?? me?.enforcement ?? null)
      setPlans(p)
      setDrafts(Object.fromEntries(p.map((x) => [x.id, { ...x }])))
      setSubs(s)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('loadFailed')
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
      setErr(e instanceof Error ? e.message : t('loadCodesFailed'))
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
      setErr(t('countRange'))
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
      flash(t('mintedCount', { count: minted.length }))
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('mintFailed'))
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
      setErr(e instanceof Error ? e.message : t('loadHistoryFailed'))
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
      flash(t('csvDownloaded'))
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('csvFailed'))
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
      setErr(e instanceof Error ? e.message : t('emailFailed'))
    } finally {
      setBusyKey(null)
    }
  }

  const revokeCode = async (code: string) => {
    setBusyKey(`revoke-${code}`)
    try {
      await adminRevokeLicenseCode(code)
      await loadCodes()
      flash(t('revokedCode', { code }))
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('revokeFailed'))
    } finally {
      setBusyKey(null)
    }
  }

  // Clipboard is unavailable on http:// origins and in some embedded webviews.
  // A silent failure here would look like the button did nothing, so say so.
  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      flash(t('copiedLabel', { label }))
    } catch {
      setErr(t('clipboardBlocked'))
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
      flash(t('planSaved', { plan: planId }))
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('saveFailed'))
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
        flash(t('grantedLifetime', { user: userId }))
      } else {
        const days = parseInt(dur, 10)
        await adminAssignPlan({ userId, planId: 'pro', endsAtDays: days })
        flash(t('grantedDays', { days, user: userId }))
      }
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('assignFailed'))
    } finally {
      setBusyKey(null)
    }
  }

  const clawBackCode = async (code: string, used: number) => {
    if (!window.confirm(t('confirmClawBack', { code, count: used }))) return
    setBusyKey(`clawback-${code}`)
    try {
      const r = await adminClawBackLicenseCode(code)
      flash(
        t('clawBackDone', {
          revoked: r.revoked,
          total: r.total,
          skipped: r.skipped,
          rooms: r.rooms_closed,
        }),
      )
      await loadCodes()
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('clawBackFailed'))
    } finally {
      setBusyKey(null)
    }
  }

  const revokeToFree = async (userId: number, email?: string) => {
    const label = email || `#${userId}`
    if (
      !window.confirm(t('confirmRevoke', { label }))
    ) {
      return
    }
    setBusyKey(`free-${userId}`)
    try {
      await adminAssignPlan({ userId, planId: 'free', closeRooms: true })
      flash(t('revokedToFree', { label }))
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('revokeFailed'))
    } finally {
      setBusyKey(null)
    }
  }

  const toggleEnforcement = async (next: boolean, force = false) => {
    const message = next
      ? force
        ? t('confirmEnforcementForce', { count: enf?.readiness.blockers.length ?? 0 })
        : t('confirmEnforcementOn', { hosts: enf?.readiness.active_hosts_on_free ?? 0 })
      : t('confirmEnforcementOff')
    if (!window.confirm(message)) return

    setEnfBusy(true)
    setErr(null)
    try {
      const st = await adminSetEnforcement(next, force)
      setEnf(st)
      setEnforcement(st.enforcement)
      setEnfBlocked(null)
      flash(t(next ? 'enforcementTurnedOn' : 'enforcementTurnedOff'))
      await load()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t('enforcementFailed'))
      // The 409 body does not survive the throw, so re-read to show which
      // checks are actually failing right now.
      const st = await adminGetEnforcement()
      if (st) {
        setEnf(st)
        setEnfBlocked(st.readiness)
      }
    } finally {
      setEnfBusy(false)
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
        <p className="text-[#9a9eab] text-sm">{t('loading')}</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-10 max-w-6xl space-y-6 sm:space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#f2f0eb] tracking-tight">{t('title')}</h1>
              <p className="text-sm text-[#9a9eab] mt-2 max-w-2xl">
                {t.rich('roleNoteFull', {
                  b: (c) => <strong className="text-[#c5c2ba] font-semibold">{c}</strong>,
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              onClick={() => load()}
              className="text-[#9a9eab] hover:text-[#f2f0eb] h-9 rounded-xl text-xs shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              {t('refresh')}
            </Button>
          </div>

          {enforcement !== null && (
            <section
              className={`rounded-2xl border p-4 sm:p-5 space-y-3 ${
                enforcement
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-amber-500/30 bg-amber-500/10'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#9a9eab]">
                    {t('enforcementToggleTitle')}
                  </div>
                  <div
                    className={`text-lg font-black mt-0.5 ${
                      enforcement ? 'text-emerald-300' : 'text-amber-300'
                    }`}
                  >
                    {enforcement ? t('on') : t('off')}
                  </div>
                  {enf?.updated_at && (
                    <div className="text-xs text-[#9a9eab] mt-0.5">
                      {t('enforcementUpdatedAt', { when: formatDateTime(enf.updated_at, locale) })}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-2">
                  <Button
                    disabled={enfBusy || !!enf?.env_pinned}
                    onClick={() => toggleEnforcement(!enforcement)}
                    className={`h-10 rounded-xl text-xs font-bold border-none ${
                      enforcement
                        ? 'bg-rose-500/80 hover:bg-rose-500 text-white'
                        : 'bg-emerald-500/80 hover:bg-emerald-500 text-[#0c1412]'
                    }`}
                  >
                    {enforcement ? t('enforcementTurnOff') : t('enforcementTurnOn')}
                  </Button>
                  {enfBlocked && !enforcement && (
                    <Button
                      variant="outline"
                      disabled={enfBusy}
                      onClick={() => toggleEnforcement(true, true)}
                      className="h-9 rounded-xl text-xs border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                    >
                      {t('enforcementForceOn')}
                    </Button>
                  )}
                </div>
              </div>

              <p className="text-xs text-[#c5c2ba] max-w-2xl">
                {enf?.env_pinned
                  ? t.rich('enforcementEnvPinned', {
                      b: (c) => <strong>{c}</strong>,
                      code: (c) => <code className="font-mono break-all">{c}</code>,
                    })
                  : t.rich(enforcement ? 'enforcementOnFull' : 'enforcementOffFull', {
                      b: (c) => <strong>{c}</strong>,
                      code: (c) => <code className="font-mono break-all">{c}</code>,
                    })}
              </p>

              {!enforcement && !enf?.env_pinned && enf?.readiness && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-widest text-[#9a9eab]">
                    {t('readinessTitle')} ·{' '}
                    <span className={enf.readiness.ready ? 'text-emerald-400' : 'text-rose-400'}>
                      {enf.readiness.ready ? t('readinessReady') : t('readinessNotReady')}
                    </span>
                  </div>
                  <ReadinessLine
                    ok={enf.readiness.free_plan_locked}
                    text={
                      enf.readiness.free_plan_locked
                        ? t('readinessFreePlanLocked')
                        : t('readinessFreePlanOpen')
                    }
                  />
                  <ReadinessLine
                    ok={enf.readiness.admins_without_pro.length === 0}
                    text={
                      enf.readiness.admins_without_pro.length === 0
                        ? t('readinessAdminsOk')
                        : t('readinessAdminsMissing', {
                            count: enf.readiness.admins_without_pro.length,
                            emails: enf.readiness.admins_without_pro.map((a) => a.email).join(', '),
                          })
                    }
                  />
                  <ReadinessLine
                    ok={enf.readiness.active_hosts_on_free === 0}
                    warn
                    text={
                      enf.readiness.active_hosts_on_free === 0
                        ? t('readinessHostsOk')
                        : t('readinessHostsOnFree', {
                            count: enf.readiness.active_hosts_on_free,
                            total: enf.readiness.total_active_hosts,
                          })
                    }
                  />
                  {enf.readiness.live_rooms_at_risk > 0 && (
                    <ReadinessLine
                      ok={false}
                      warn
                      text={t('readinessLiveRooms', { count: enf.readiness.live_rooms_at_risk })}
                    />
                  )}
                  {!enf.readiness.grandfather_ran && (
                    <ReadinessLine ok={false} warn text={t('readinessGrandfatherMissing')} />
                  )}
                </div>
              )}
            </section>
          )}

          <div className="flex gap-2 border-b border-white/10 pb-px overflow-x-auto">
            {(
              [
                ['subscriptions', t('tabSubscriptions')],
                ['codes', t('tabCodes')],
                ['history', t('tabHistory')],
                ['plans', t('tabPlans')],
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
                  placeholder={t('searchUser')}
                  className="bg-black/40 border-white/10 text-[#f2f0eb] h-11 rounded-xl flex-1"
                />
                <Button
                  type="submit"
                  className="h-11 rounded-xl bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold border-none"
                >
                  {t('search')}
                </Button>
              </form>

              {loading ? (
                <p className="text-sm text-[#9a9eab]">{t('loadingShort')}</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#9a9eab]">
                        <th className="px-4 py-3 font-semibold">{t('user')}</th>
                        <th className="px-4 py-3 font-semibold">{t('effectiveLicense')}</th>
                        <th className="px-4 py-3 font-semibold">{t('expires')}</th>
                        <th className="px-4 py-3 font-semibold">{t('grantRevoke')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((s) => {
                        const isPro = isPaidPlan(s.plan_id)
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
                                {t('playersRooms', {
                                  players: s.max_players_per_room,
                                  rooms: s.max_concurrent_rooms ?? '—',
                                })}
                                {' · '}
                                {s.allow_player_paced ? t('soloYes') : t('soloNo')}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top text-[#c5c2ba] text-xs">
                              {s.lifetime || !s.ends_at ? (
                                t('noExpiry')
                              ) : (
                                <>
                                  {formatDate(s.ends_at, locale)}
                                  <div
                                    className={`mt-0.5 ${
                                      s.expired
                                        ? 'text-rose-400'
                                        : (s.days_remaining ?? 99) <= 7
                                          ? 'text-amber-400'
                                          : 'text-[#9a9eab]'
                                    }`}
                                  >
                                    {s.expired
                                      ? t('expiredBadge')
                                      : t('daysLeft', { n: s.days_remaining ?? 0 })}
                                  </div>
                                </>
                              )}
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
                                  <option value="30">{t('pro30')}</option>
                                  <option value="90">{t('pro90')}</option>
                                  <option value="365">{t('pro1y')}</option>
                                  <option value="lifetime">{t('proLifetime')}</option>
                                </select>
                                <div className="flex gap-2">
                                  <Button
                                    disabled={busyKey === `pro-${s.user_id}`}
                                    onClick={() => grantPro(s.user_id)}
                                    className="flex-1 h-9 rounded-lg text-xs font-bold bg-[#e85d4c]/90 hover:bg-[#e85d4c] text-white border-none"
                                  >
                                    {t('grantPro')}
                                  </Button>
                                  <Button
                                    disabled={busyKey === `free-${s.user_id}` || !isPro}
                                    onClick={() => revokeToFree(s.user_id, s.email)}
                                    title={isPro ? t('revokeProTitle') : t('alreadyFree')}
                                    className="flex-1 h-9 rounded-lg text-xs font-bold border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 disabled:opacity-40 disabled:border-white/10 disabled:bg-white/5 disabled:text-[#5c6170]"
                                  >
                                    {t('revokePro')}
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
                            {t('noUsers')}
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
                        {t('planActive')}
                      </label>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-[#9a9eab]">{t('name')}</Label>
                        <Input
                          value={d.name}
                          onChange={(e) => updateDraft(p.id, 'name', e.target.value)}
                          className="mt-1 bg-black/40 border-white/10 text-[#f2f0eb] h-10 rounded-xl"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase tracking-wider text-[#9a9eab]">
                          {t('planDescription')}
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
                            ['price_monthly_vnd', t('priceVnd')],
                            ['max_players_per_room', t('playersPerRoomLabel')],
                            ['max_quizzes', t('maxQuizzesLabel')],
                            ['max_templates', t('maxTemplatesLabel')],
                            ['max_concurrent_rooms', t('concurrentRoomsLabel')],
                            ['max_questions_per_quiz', t('questionsPerQuizLabel')],
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
                            ['allow_player_paced', t('featPlayerPaced')],
                            ['allow_custom_branding', t('featCustomBranding')],
                            ['allow_export_logs', t('featExportLogs')],
                            ['allow_priority_support', t('featPrioritySupport')],
                            ['allow_remove_watermark', t('featRemoveWatermark')],
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
                      {t('savePlanBtn', { plan: p.id, players: formatLimit(d.max_players_per_room) })}
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
                  <h2 className="font-bold text-[#f2f0eb]">{t('mintTitle')}</h2>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">{t('plan')}</Label>
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
                    <Label className="text-xs text-[#9a9eab]">{t('quantity')}</Label>
                    <Input value={mintCount} onChange={(e) => setMintCount(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">{t('durationDays')}</Label>
                    <Input value={mintDuration} onChange={(e) => setMintDuration(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">{t('usesPerCode')}</Label>
                    <Input value={mintMaxUses} onChange={(e) => setMintMaxUses(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">{t('codeShelfLife')}</Label>
                    <Input
                      value={mintShelfDays}
                      onChange={(e) => setMintShelfDays(e.target.value)}
                      placeholder={t('blankNoExpiry')}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">{t('batchLabel')}</Label>
                    <Input value={mintBatch} onChange={(e) => setMintBatch(e.target.value)} placeholder="thang9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">{t('amountPerCode')}</Label>
                    <Input
                      value={mintAmount}
                      onChange={(e) => setMintAmount(e.target.value)}
                      placeholder="199000"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-[#9a9eab]">{t('paymentRef')}</Label>
                    <Input
                      value={mintRef}
                      onChange={(e) => setMintRef(e.target.value)}
                      placeholder="VCB-20260913-8891"
                    />
                  </div>
                </div>

                <p className="text-xs text-[#9a9eab]">{t('amountRefNote')}</p>

                <Button
                  onClick={mintCodes}
                  disabled={busyKey === 'mint'}
                  className="h-11 rounded-xl bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold border-none"
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  {busyKey === 'mint' ? t('minting') : t('mintCodes')}
                </Button>

                {justMinted.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-emerald-300">
                        {t('justMinted', { count: justMinted.length })}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => copyText(justMinted.map((c) => c.code).join('\n'), t('allCodes'))}
                        className="h-9 rounded-xl border-white/20 text-[#c5c2ba] shrink-0"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        {t('copyAll')}
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
                      <Label className="text-xs text-[#9a9eab]">{t('emailBatch')}</Label>
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
                          placeholder={t('buyerName')}
                        />
                        <Button
                          disabled={busyKey === 'send' || !sendEmail}
                          onClick={sendCodes}
                          className="shrink-0 h-11 rounded-xl bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold border-none"
                        >
                          <Mail className="w-4 h-4 mr-2" />
                          {busyKey === 'send' ? t('sending') : t('send')}
                        </Button>
                      </div>
                      <p className="text-xs text-[#9a9eab]">
                        {t('sendBatchNote', { count: justMinted.length })}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9a9eab]">{t('filter')}</Label>
                  <select
                    value={codeFilter}
                    onChange={(e) => setCodeFilter(e.target.value as typeof codeFilter)}
                    className="h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-sm text-[#f2f0eb]"
                  >
                    <option value="">{t('all')}</option>
                    <option value="available">{t('usable')}</option>
                    <option value="used">{t('exhausted')}</option>
                    <option value="revoked">{t('revoked')}</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1 min-w-48">
                  <Label className="text-xs text-[#9a9eab]">{t('findCode')}</Label>
                  <Input value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} placeholder="KOVIO-..." />
                </div>
                <Button variant="outline" onClick={loadCodes} className="h-10 rounded-xl border-white/20 text-[#c5c2ba]">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {t('reload')}
                </Button>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-[#9a9eab] text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3">{t('codeCol')}</th>
                      <th className="text-left px-4 py-3">{t('planCol')}</th>
                      <th className="text-left px-4 py-3">{t('validity')}</th>
                      <th className="text-left px-4 py-3">{t('uses')}</th>
                      <th className="text-left px-4 py-3">{t('batchLabel')}</th>
                      <th className="text-left px-4 py-3">{t('amountRef')}</th>
                      <th className="text-left px-4 py-3">{t('sent')}</th>
                      <th className="text-left px-4 py-3">{t('status')}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {codes.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-[#9a9eab]">
                          {t('noCodes')}
                        </td>
                      </tr>
                    )}
                    {codes.map((c) => {
                      const exhausted = c.used_count >= c.max_uses
                      const stale = !!c.expires_at && new Date(c.expires_at) < new Date()
                      const status = c.revoked_at
                        ? { label: t('revoked'), cls: 'text-rose-400' }
                        : exhausted
                          ? { label: t('outOfUses'), cls: 'text-[#9a9eab]' }
                          : stale
                            ? { label: t('pastDue'), cls: 'text-amber-400' }
                            : { label: t('stillUsable'), cls: 'text-emerald-400' }
                      return (
                        <tr key={c.code} className="border-t border-white/5">
                          <td className="px-4 py-3 font-mono text-[#f2f0eb] whitespace-nowrap">{c.code}</td>
                          <td className="px-4 py-3 text-[#c5c2ba]">{c.plan_id}</td>
                          <td className="px-4 py-3 text-[#c5c2ba] whitespace-nowrap">
                            {c.duration_days === 0 ? t('lifetime') : t('daysSuffix', { n: c.duration_days })}
                          </td>
                          <td className="px-4 py-3 text-[#c5c2ba] whitespace-nowrap">
                            {c.used_count} / {c.max_uses}
                          </td>
                          <td className="px-4 py-3 text-[#9a9eab]">{c.batch || '-'}</td>
                          <td className="px-4 py-3 text-[#c5c2ba] whitespace-nowrap">
                            {c.amount_vnd ? formatVnd(c.amount_vnd, locale) : '-'}
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
                                aria-label={t('copyAria', { code: c.code })}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              {!c.revoked_at && (
                                <Button
                                  variant="outline"
                                  disabled={busyKey === 'revoke-' + c.code}
                                  onClick={() => revokeCode(c.code)}
                                  className="h-9 px-3 rounded-lg border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                                  aria-label={t('revokeAria', { code: c.code })}
                                  title={t('revokeTitle')}
                                >
                                  <Ban className="w-4 h-4" />
                                </Button>
                              )}
                              {/* Gated on used_count, not on revoked_at: a code
                                  nobody redeemed has nothing to take back, and an
                                  already-revoked one still might. */}
                              {c.used_count > 0 && (
                                <Button
                                  variant="outline"
                                  disabled={busyKey === 'clawback-' + c.code}
                                  onClick={() => clawBackCode(c.code, c.used_count)}
                                  className="h-9 px-3 rounded-lg border-rose-500/60 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                                  aria-label={t('clawBackAria', { code: c.code })}
                                  title={t('clawBackTitle')}
                                >
                                  <Undo2 className="w-4 h-4" />
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

              <p className="text-xs text-[#9a9eab]">{t('revokeNote')}</p>
            </section>
          )}

          {tab === 'history' && (
            <section className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-[#9a9eab]">{t('grants')}</div>
                  <div className="text-2xl font-black text-[#f2f0eb] mt-1">{summary.grants}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-[#9a9eab]">{t('withAmount')}</div>
                  <div className="text-2xl font-black text-[#f2f0eb] mt-1">{summary.paid_grants}</div>
                </div>
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="text-[10px] uppercase tracking-widest text-emerald-300/80">{t('totalRecorded')}</div>
                  <div className="text-2xl font-black text-emerald-300 mt-1">{formatVnd(summary.total_vnd, locale)}</div>
                </div>
              </div>

              <p className="text-xs text-[#9a9eab] rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                {t.rich('recordedNoteFull', {
                  b: (c) => <strong className="text-[#c5c2ba]">{c}</strong>,
                })}
              </p>

              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9a9eab]">{t('fromDate')}</Label>
                  <Input type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9a9eab]">{t('toDate')}</Label>
                  <Input type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#9a9eab]">{t('action')}</Label>
                  <select
                    value={histAction}
                    onChange={(e) => setHistAction(e.target.value)}
                    className="h-10 rounded-xl bg-black/40 border border-white/10 px-3 text-sm text-[#f2f0eb]"
                  >
                    <option value="">{t('all')}</option>
                    <option value="grant">{t('grant')}</option>
                    <option value="renew">{t('renew')}</option>
                    <option value="downgrade">{t('downgrade')}</option>
                    <option value="expire">{t('expire')}</option>
                  </select>
                </div>
                <div className="space-y-1.5 flex-1 min-w-48">
                  <Label className="text-xs text-[#9a9eab]">{t('email')}</Label>
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
                  {busyKey === 'export' ? t('exporting') : t('exportCsv')}
                </Button>
              </div>

              <div className="rounded-2xl border border-white/10 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-[#9a9eab] text-xs uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-4 py-3">{t('time')}</th>
                      <th className="text-left px-4 py-3">{t('person')}</th>
                      <th className="text-left px-4 py-3">{t('action')}</th>
                      <th className="text-left px-4 py-3">{t('source')}</th>
                      <th className="text-left px-4 py-3">{t('planCol')}</th>
                      <th className="text-left px-4 py-3">{t('expiresCol')}</th>
                      <th className="text-right px-4 py-3">{t('amount')}</th>
                      <th className="text-left px-4 py-3">{t('reference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-[#9a9eab]">
                          {t('noRecords')}
                        </td>
                      </tr>
                    )}
                    {events.map((e) => (
                      <tr key={e.id} className="border-t border-white/5">
                        <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">{formatDateTime(e.created_at, locale)}</td>
                        <td className="px-4 py-3 text-[#f2f0eb]">
                          {e.email || `#${e.user_id}`}
                          {e.note && <div className="text-xs text-[#9a9eab]">{e.note}</div>}
                        </td>
                        <td className={'px-4 py-3 font-semibold whitespace-nowrap ' + actionStyle(e.action, t).cls}>
                          {actionStyle(e.action, t).label}
                        </td>
                        <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">
                          {sourceLabel(e.source, t)}
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
                              ? formatDate(e.ends_at, locale)
                              : t('lifetime')}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap font-mono text-[#f2f0eb]">
                          {e.amount_vnd ? formatVnd(e.amount_vnd, locale) : '-'}
                        </td>
                        <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">{e.external_ref || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-[#9a9eab]">
                {t('appendOnlyNote')}
              </p>
            </section>
          )}

    </main>
  )
}
