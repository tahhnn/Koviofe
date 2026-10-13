'use client'

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Receipt,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GameBackground } from '@/components/game-background'
import {
  getMyLicense,
  listPricingPlans,
  type LicenseSnapshot,
  type PricingPlan,
} from '@/app/actions/license'
import { LicenseRedeem } from '@/components/license-redeem'
import {
  listMyPaymentOrders,
  listPaymentProducts,
  type PaymentOrder,
  type PaymentProduct,
} from '@/app/actions/payment'
import { PurchasedCode } from '@/components/purchased-code'
import { isLicenseExpiringSoon, isLicenseLocked, isPaidPlan } from '@/lib/license'

type Tab = 'plan' | 'billing' | 'security'
const TABS: Tab[] = ['plan', 'billing', 'security']

const panel = 'rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl'

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-[#f2f0eb]">{title}</h2>
      {hint && <p className="text-xs text-[#9a9eab] mt-1 leading-relaxed">{hint}</p>}
    </div>
  )
}

/** One limit: a bar when it is countable usage, just the ceiling otherwise. */
function UsageTile({
  label,
  used,
  max,
  unlimited,
  maxCaption,
}: {
  label: string
  used?: number
  max: number
  unlimited: string
  maxCaption: string
}) {
  const isUnlimited = max < 0
  const hasBar = used !== undefined && !isUnlimited && max > 0
  const pct = hasBar ? Math.min(100, Math.round(((used as number) / max) * 100)) : 0
  const full = hasBar && pct >= 100
  // Fixed rows (label, number, caption, bar) so tiles line up whatever the
  // label length or whether the limit is unlimited.
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 flex flex-col">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9a9eab] truncate" title={label}>
        {label}
      </span>
      <span className="mt-2 text-2xl font-black text-[#f2f0eb] tabular-nums leading-none">
        {used !== undefined ? used : isUnlimited ? '∞' : max}
      </span>
      <span className="mt-1.5 text-xs text-[#9a9eab] truncate">
        {used !== undefined ? (isUnlimited ? unlimited : `/ ${max}`) : isUnlimited ? unlimited : maxCaption}
      </span>
      <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
        {used !== undefined && (
          <div
            className={`h-full rounded-full transition-all ${full ? 'bg-amber-400' : 'bg-[#e85d4c]'}`}
            style={{ width: `${isUnlimited ? 100 : pct}%`, opacity: isUnlimited ? 0.25 : 1 }}
          />
        )}
      </div>
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  minLength,
  autoComplete,
  showLabel,
  hideLabel,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  minLength?: number
  autoComplete: string
  showLabel: string
  hideLabel: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-xs font-semibold text-[#c5c2ba]">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          className="bg-black/40 border-white/10 focus:border-[#e85d4c]/60 text-[#f2f0eb] h-11 rounded-xl pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? hideLabel : showLabel}
          className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-[#9a9eab] hover:text-[#f2f0eb]"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ProfileSettingsPage() {
  const t = useTranslations('settings')
  const format = useFormatter()
  const tLicense = useTranslations('license')
  const tCommon = useTranslations('common')
  const tPay = useTranslations('payment')

  const [tab, setTab] = useState<Tab>('plan')
  const [user, setUser] = useState<{ email?: string; nickname?: string; name?: string } | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  // The price list is the only place prices live; a plan row shows the
  // cheapest term on sale for its plan instead of a separately typed price.
  const [products, setProducts] = useState<PaymentProduct[]>([])
  const [license, setLicense] = useState<LicenseSnapshot | null>(null)
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [planLoading, setPlanLoading] = useState(true)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Abandoned checkouts are noise in a purchase history; keep what paid or
  // what an admin is still looking at.
  const keepOrders = (list: PaymentOrder[]) =>
    list.filter((o) => o.status === 'paid' || o.status === 'needs_review').slice(0, 10)

  const reloadOrders = async () => {
    const [me, myOrders] = await Promise.all([getMyLicense(), listMyPaymentOrders()])
    setLicense(me)
    setOrders(keepOrders(myOrders))
  }

  const fromPrice = (planId: string): number | null => {
    const prices = products.filter((x) => x.plan_id === planId).map((x) => x.amount_vnd)
    return prices.length ? Math.min(...prices) : null
  }

  useEffect(() => {
    // #billing / #security deep-link to a tab; anything else opens the plan.
    const fromHash = window.location.hash.replace('#', '') as Tab
    if (TABS.includes(fromHash)) setTab(fromHash)
    ;(async () => {
      const session = await authClient.getSession()
      setUser(session?.user ?? null)
      setPlanLoading(true)
      const [me, catalog, myOrders, priceList] = await Promise.all([
        getMyLicense(),
        listPricingPlans(),
        listMyPaymentOrders(),
        listPaymentProducts(),
      ])
      setLicense(me)
      setPlans(catalog)
      setProducts(priceList.products)
      setOrders(keepOrders(myOrders))
      setPlanLoading(false)
    })()
  }, [])

  const selectTab = (next: Tab) => {
    setTab(next)
    window.history.replaceState(null, '', `#${next}`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    setLoading(true)
    const result = await authClient.changePassword({ oldPassword, newPassword })
    setLoading(false)

    if (result.error) {
      setError(result.error.message ?? tCommon('unexpectedError'))
      return
    }

    setSuccess(t('passwordChanged'))
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const ents = license?.entitlements
  const usage = license?.usage
  // Plans only mean something while the backend enforces them. With
  // enforcement off every host gets the open entitlements, so a plan card, a
  // redeem box and a price list would describe limits that do not exist. An
  // unknown or failed read counts as off.
  const showPlans = license?.enforcement === true
  const tabs = showPlans ? TABS : (['security'] as Tab[])
  const activeTab = tabs.includes(tab) ? tab : 'security'

  const locked = isLicenseLocked(license)
  const expiringSoon = isLicenseExpiringSoon(license)
  const paid = isPaidPlan(ents?.plan_id)
  const days = license?.days_remaining
  const currentPlan = plans.find((p) => p.id === ents?.plan_id)
  const otherPlans = plans.filter((p) => p.id !== ents?.plan_id && p.id !== 'free')

  const displayName = user?.nickname || user?.name || user?.email?.split('@')[0] || ''
  const initial = (displayName || '?').charAt(0).toUpperCase()

  const navItems: { id: Tab; label: string; icon: typeof Crown }[] = [
    { id: 'plan', label: t('navPlan'), icon: Crown },
    { id: 'billing', label: t('navBilling'), icon: Receipt },
    { id: 'security', label: t('navSecurity'), icon: ShieldCheck },
  ]

  const features: { label: string; ok: boolean }[] = ents
    ? [
        { label: t('featSharing'), ok: !!ents.allow_quiz_sharing },
        { label: t('featPlayerPaced'), ok: ents.allow_player_paced },
        { label: t('exportLogs'), ok: ents.allow_export_logs },
        { label: t('removeWatermark'), ok: ents.allow_remove_watermark },
        { label: t('brandingExtra'), ok: ents.allow_custom_branding },
        { label: t('customExtra'), ok: !!currentPlan?.contact_sales },
      ]
    : []

  return (
    <GameBackground variant="dashboard">
      <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              aria-label={tCommon('back')}
              className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#c5c2ba]"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#f2f0eb] tracking-tight">{t('title')}</h1>
              <p className="text-sm text-[#9a9eab]">{t('subtitle')}</p>
            </div>
          </div>
          {user?.email && (
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] pl-2 pr-4 py-2">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#e85d4c] to-[#f0b429] flex items-center justify-center text-sm font-black text-white">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#f2f0eb] truncate max-w-[200px]">{displayName}</div>
                <div className="text-xs text-[#9a9eab] truncate max-w-[200px]">{user.email}</div>
              </div>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6">
          {/* Navigation: a pill row on phones, a sticky side menu on desktop. */}
          <nav aria-label={t('title')} className="lg:sticky lg:top-6 lg:self-start">
            <ul className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              {navItems
                .filter((n) => tabs.includes(n.id))
                .map(({ id, label, icon: Icon }) => {
                  const active = activeTab === id
                  return (
                    <li key={id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => selectTab(id)}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center gap-2.5 px-3.5 h-10 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-[#e85d4c]/15 text-[#f2f0eb] border border-[#e85d4c]/30'
                            : 'text-[#9a9eab] border border-transparent hover:text-[#f2f0eb] hover:bg-white/5'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${active ? 'text-[#e85d4c]' : ''}`} />
                        {label}
                      </button>
                    </li>
                  )
                })}
            </ul>
          </nav>

          <main className="min-w-0 space-y-6">
            {/* ── Plan & usage ─────────────────────────────────────────── */}
            {activeTab === 'plan' && (
              <>
                {planLoading && (
                  <div className={`${panel} p-6 space-y-4 animate-pulse`}>
                    <div className="h-4 w-24 rounded bg-white/10" />
                    <div className="h-8 w-40 rounded bg-white/10" />
                    <div className="h-3 w-56 rounded bg-white/5" />
                  </div>
                )}

                {!planLoading && ents && (
                  <section
                    className={`relative overflow-hidden rounded-3xl border p-6 sm:p-7 ${
                      locked ? 'border-[#e85d4c]/40' : 'border-white/10'
                    } bg-gradient-to-br from-[#e85d4c]/15 via-white/[0.03] to-[#2dd4bf]/10`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-5">
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#9a9eab]">
                          {t('currentPlan')}
                        </span>
                        <div className="flex items-center gap-3">
                          <h2 className="text-3xl font-black text-[#f2f0eb]">{ents.plan_name}</h2>
                          {paid && <Sparkles className="w-5 h-5 text-[#f0b429]" />}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center h-7 px-3 rounded-full bg-black/30 border border-white/10 text-xs text-[#c5c2ba]">
                            {t('maxPlayersPerRoom', { n: ents.max_players_per_room })}
                          </span>
                          {paid && (
                            <span
                              className={`inline-flex items-center h-7 px-3 rounded-full border text-xs font-semibold ${
                                expiringSoon
                                  ? 'bg-amber-400/10 border-amber-400/30 text-amber-300'
                                  : 'bg-emerald-400/10 border-emerald-400/20 text-emerald-300'
                              }`}
                            >
                              {days === null || days === undefined
                                ? t('planLifetime')
                                : expiringSoon
                                  ? t('planExpiresSoon', { days })
                                  : t('planExpires', { days })}
                            </span>
                          )}
                        </div>
                      </div>
                      <Link
                        href="/pricing"
                        className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-[#e85d4c] hover:bg-[#e85d4c]/90 text-white text-sm font-bold shadow-lg shadow-[#e85d4c]/20"
                      >
                        {paid ? t('renewOrUpgrade') : t('upgrade')}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </section>
                )}

                {!planLoading && ents && usage && (
                  <section className={`${panel} p-5 sm:p-6`}>
                    <SectionTitle title={t('usageTitle')} />
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                      <UsageTile label={t('quizzes')} used={usage.quizzes} max={ents.max_quizzes} unlimited={t('unlimited')} maxCaption={t('maxCaption')} />
                      <UsageTile
                        label={t('openRoomsShort')}
                        used={usage.concurrent_rooms}
                        max={ents.max_concurrent_rooms}
                        unlimited={t('unlimited')}
                        maxCaption={t('maxCaption')}
                      />
                      <UsageTile label={t('questionsShort')} max={ents.max_questions_per_quiz} unlimited={t('unlimited')} maxCaption={t('perQuizMax')} />
                      <UsageTile label={t('playersLimitShort')} max={ents.max_players_per_room} unlimited={t('unlimited')} maxCaption={t('perRoomMax')} />
                    </div>

                    <div className="mt-6">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9a9eab] mb-3">
                        {t('featuresTitle')}
                      </h3>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {features.map((f) => (
                          <li
                            key={f.label}
                            className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3.5 h-11 text-sm"
                          >
                            {f.ok ? (
                              <span className="h-6 w-6 rounded-full bg-emerald-400/15 flex items-center justify-center">
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              </span>
                            ) : (
                              <span className="h-6 w-6 rounded-full bg-white/5 flex items-center justify-center">
                                <Lock className="w-3 h-3 text-[#9a9eab]" />
                              </span>
                            )}
                            <span className={f.ok ? 'text-[#f2f0eb]' : 'text-[#9a9eab]'}>{f.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                )}

                {!planLoading && (
                  <section className={`${panel} p-5 sm:p-6 ${locked ? 'ring-1 ring-[#e85d4c]/40' : ''}`}>
                    <div className="flex items-start gap-3 mb-4">
                      <span className="h-10 w-10 shrink-0 rounded-xl bg-[#e85d4c]/15 flex items-center justify-center">
                        <KeyRound className="w-5 h-5 text-[#e85d4c]" />
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-[#f2f0eb]">{tLicense('codeLabel')}</h2>
                        <p className="text-xs text-[#9a9eab] mt-1 leading-relaxed">
                          {locked ? t('lockedRedeemHint') : t('redeemHint')}
                        </p>
                      </div>
                    </div>
                    <LicenseRedeem
                      onRedeemed={async () => {
                        setLicense(await getMyLicense())
                      }}
                    />
                  </section>
                )}

                {!planLoading && otherPlans.length > 0 && (
                  <section className={`${panel} p-5 sm:p-6`}>
                    <SectionTitle title={t('otherPlans')} hint={t('otherPlansHint')} />
                    <ul className="divide-y divide-white/5">
                      {otherPlans.map((p) => {
                        const price = fromPrice(p.id)
                        return (
                          <li key={p.id}>
                            <Link
                              href="/pricing"
                              className="group flex items-center gap-4 py-3.5 -mx-2 px-2 rounded-xl hover:bg-white/[0.04]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-[#f2f0eb]">{p.name}</div>
                                <div className="text-xs text-[#9a9eab] truncate">
                                  {t('playersPerRoom', {
                                    count: p.max_players_per_room < 0 ? t('unlimited') : String(p.max_players_per_room),
                                  })}
                                  {p.allow_custom_branding && ` · ${t('brandingExtra')}`}
                                  {p.contact_sales && ` · ${t('customExtra')}`}
                                </div>
                              </div>
                              <span className="text-sm font-semibold text-[#c5c2ba] whitespace-nowrap">
                                {p.contact_sales
                                  ? t('contactPlan')
                                  : price !== null
                                    ? t('priceFrom', { price: format.number(price) })
                                    : ''}
                              </span>
                              <ArrowRight className="w-4 h-4 text-[#9a9eab] group-hover:text-[#e85d4c] transition-colors" />
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}

            {/* ── Billing ──────────────────────────────────────────────── */}
            {activeTab === 'billing' && (
              <section className={`${panel} p-5 sm:p-6`}>
                <SectionTitle title={tPay('historyTitle')} hint={t('billingHint')} />
                {planLoading ? (
                  <p className="text-sm text-[#9a9eab]">{t('planLoading')}</p>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center text-center gap-3 py-10">
                    <span className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-[#9a9eab]" />
                    </span>
                    <p className="text-sm text-[#9a9eab]">{t('noOrders')}</p>
                    <Link href="/pricing" className="text-sm font-semibold text-[#e85d4c] hover:underline">
                      {t('pricingLink')}
                    </Link>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {orders.map((o) => (
                      <li key={o.id} className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#f2f0eb]">{o.product_name}</div>
                            <div className="text-xs text-[#9a9eab] font-mono mt-0.5">#{o.order_code}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-[#f2f0eb] tabular-nums">
                              {format.number(o.amount_vnd)}đ
                            </span>
                            <span
                              className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold ${
                                o.status === 'paid'
                                  ? 'bg-emerald-400/10 text-emerald-300'
                                  : 'bg-amber-400/10 text-amber-300'
                              }`}
                            >
                              {tPay(`status_${o.status}`)}
                            </span>
                          </div>
                        </div>
                        {o.license_code && (
                          <PurchasedCode
                            code={o.license_code}
                            used={!!o.code_used}
                            usedByMe={!!o.redeemed_by_me}
                            onRedeemed={reloadOrders}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* ── Security ─────────────────────────────────────────────── */}
            {activeTab === 'security' && (
              <>
                {user?.email && (
                  <section className={`${panel} p-5 sm:p-6`}>
                    <SectionTitle title={t('accountTitle')} />
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                        <dt className="text-[11px] uppercase tracking-wider text-[#9a9eab]">{t('emailLabel')}</dt>
                        <dd className="text-sm text-[#f2f0eb] mt-1 break-all">{user.email}</dd>
                      </div>
                      {displayName && (
                        <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                          <dt className="text-[11px] uppercase tracking-wider text-[#9a9eab]">{t('nameLabel')}</dt>
                          <dd className="text-sm text-[#f2f0eb] mt-1 break-all">{displayName}</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                )}

                <section className={`${panel} p-5 sm:p-6`}>
                  <SectionTitle title={t('securitySubtitle')} hint={t('passwordHint')} />
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
                    <PasswordField
                      id="old-password"
                      label={t('currentPassword')}
                      value={oldPassword}
                      onChange={setOldPassword}
                      autoComplete="current-password"
                      showLabel={t('showPassword')}
                      hideLabel={t('hidePassword')}
                    />
                    <PasswordField
                      id="new-password"
                      label={t('newPassword')}
                      value={newPassword}
                      onChange={setNewPassword}
                      minLength={8}
                      autoComplete="new-password"
                      showLabel={t('showPassword')}
                      hideLabel={t('hidePassword')}
                    />
                    <PasswordField
                      id="confirm-password"
                      label={t('confirmPassword')}
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      minLength={8}
                      autoComplete="new-password"
                      showLabel={t('showPassword')}
                      hideLabel={t('hidePassword')}
                    />

                    {error && (
                      <div
                        role="alert"
                        className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold break-words"
                      >
                        {error}
                      </div>
                    )}
                    {success && (
                      <div
                        role="status"
                        className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold break-words"
                      >
                        {success}
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={loading}
                      className="mt-1 h-11 self-start px-6 bg-[#e85d4c] hover:bg-[#d14e3e] text-white font-bold rounded-xl border-none cursor-pointer"
                    >
                      {loading ? t('updating') : t('changePassword')}
                    </Button>
                  </form>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </GameBackground>
  )
}
