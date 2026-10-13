'use client'

import { Suspense, useEffect, useState } from 'react'
import { ArrowLeft, Check, MessageCircle, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GameBackground } from '@/components/game-background'
import { BrandMark } from '@/components/brand-mark'
import { LanguageSwitcher } from '@/components/language-switcher'
import { PaymentCheckout, type GatewayReturn } from '@/components/payment-checkout'
import { ZaloContact } from '@/components/zalo-contact'
import { authClient } from '@/lib/auth-client'
import { getMyLicense, listPricingPlans, type LicenseSnapshot, type PricingPlan } from '@/app/actions/license'
import { isPaidPlan } from '@/lib/license'
import { listPaymentProducts, type PaymentCatalog, type PaymentProduct } from '@/app/actions/payment'

/**
 * Public price list: one card per plan (limits and features from /license/plans,
 * terms and prices from /payments/products). Two ways to buy:
 *  - online checkout (SePay bank QR, or SePay's hosted payment page), when the
 *    server says checkout is open. The hosted page sends the buyer back to
 *    /pricing?order=<code>&result=success|error|cancel;
 *  - Zalo, always shown when configured — a link to a person, nothing more.
 *    A contact_sales plan (Business) is sold only this way.
 * Prices, terms and the Zalo link all come from the API.
 */
function PricingContent() {
  const t = useTranslations('payment')
  const format = useFormatter()
  const router = useRouter()
  const [catalog, setCatalog] = useState<PaymentCatalog | null>(null)
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [license, setLicense] = useState<LicenseSnapshot | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  // The back button waits for the session read: "dashboard" for a host,
  // "home" for a visitor, never one flashing into the other.
  const [sessionRead, setSessionRead] = useState(false)
  const [selected, setSelected] = useState<PaymentProduct | null>(null)
  const params = useSearchParams()
  const [returned, setReturned] = useState<GatewayReturn | null>(() => {
    const code = params.get('order')
    if (!code || !/^[A-Za-z0-9]{4,16}$/.test(code)) return null
    const r = params.get('result')
    return { orderCode: code, result: r === 'success' || r === 'error' || r === 'cancel' ? r : undefined }
  })
  const closeReturned = () => {
    setReturned(null)
    router.replace('/pricing')
  }

  useEffect(() => {
    ;(async () => {
      const session = await authClient.getSession()
      setEmail(session?.user?.email ?? null)
      setSessionRead(true)
      const [c, p, me] = await Promise.all([
        listPaymentProducts(),
        listPricingPlans(),
        session?.user ? getMyLicense() : null,
      ])
      setPlans(p)
      setCatalog(c)
      setLicense(me)
    })()
  }, [])

  const signedIn = !!email
  const zaloUrl = catalog?.contact?.zalo_url
  const sub = license?.subscription
  const paidPlan = isPaidPlan(sub?.plan_id) && license?.entitlements?.plan_id === sub?.plan_id
  const currentPlan = plans.find((p) => p.id === sub?.plan_id)
  const lifetimePaid = paidPlan && !sub?.ends_at
  // The backend refuses to redeem a lower tier over a live higher one, so the
  // cards below the current paid plan offer no checkout.
  const belowCurrent = (p: PricingPlan) =>
    paidPlan && currentPlan != null && (p.sort_order ?? 0) < (currentPlan.sort_order ?? 0)

  const termLabel = (days: number) =>
    days === 7 ? t('term1w') : days === 30 ? t('term1m') : days === 365 ? t('term1y') : t('termDays', { days })
  const limitLabel = (n: number) => (n < 0 ? t('unlimited') : format.number(n))

  const buy = (p: PaymentProduct) => {
    if (!signedIn) {
      router.push('/sign-in?redirectTo=/pricing')
      return
    }
    setSelected(p)
  }

  return (
    <GameBackground variant="auth">
      {/* Same bar as /luckydraw: the price list is a detour, so the way back
          is always on screen, not only after a purchase. */}
      <header className="border-b border-white/5 bg-[#080c14]/60 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <BrandMark href={signedIn ? '/dashboard' : '/'} />
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageSwitcher />
            {sessionRead && (
              <Link
                href={signedIn ? '/dashboard' : '/'}
                aria-label={signedIn ? t('backToDashboard') : t('backToHome')}
                className="inline-flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-xl border border-[#2c313d] hover:bg-white/5 text-[#9a9eab] hover:text-[#f2f0eb] text-sm font-medium transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{signedIn ? t('backToDashboard') : t('backToHome')}</span>
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="flex-1 flex items-start justify-center px-4 py-6 sm:py-8">
        <div className="w-full max-w-6xl space-y-6">
          <Card className="bg-white/5 border border-white/10 rounded-3xl p-5 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden space-y-6">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[#e85d4c]/50" />
            <div>
              <h1 className="text-2xl font-black text-[#f2f0eb]">{t('title')}</h1>
              <p className="text-sm text-[#9a9eab] mt-1">{t('subtitle')}</p>
              {paidPlan && license?.days_remaining != null && (
                <p className="text-sm text-[#c5c2ba] mt-2">
                  {t('currentTerm', { plan: license.entitlements.plan_name, days: license.days_remaining })}
                </p>
              )}
              {lifetimePaid && (
                <p className="text-sm text-emerald-400 mt-2">
                  {t('lifetimeOwned', { plan: license?.entitlements.plan_name ?? '' })}
                </p>
              )}
            </div>

            {!catalog && <p className="text-sm text-[#9a9eab]">{t('loading')}</p>}

            {catalog && !selected && returned && signedIn && (
              <PaymentCheckout resume={returned} zaloUrl={zaloUrl} onClose={closeReturned} />
            )}

            {catalog && selected && (
              <PaymentCheckout product={selected} zaloUrl={zaloUrl} onClose={() => setSelected(null)} />
            )}

            {catalog && !selected && !(returned && signedIn) && plans.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((plan) => {
                  const terms = catalog.products.filter((x) => x.plan_id === plan.id)
                  const isCurrent = paidPlan ? sub?.plan_id === plan.id : plan.id === 'free' && signedIn
                  const below = belowCurrent(plan)
                  const features: { label: string; ok: boolean }[] = [
                    {
                      label:
                        plan.max_quizzes > 0
                          ? t('featCreateQuizMax', { n: plan.max_quizzes, q: plan.max_questions_per_quiz })
                          : t('featCreateQuiz'),
                      ok: plan.max_quizzes !== 0,
                    },
                    { label: t('featShareQuiz'), ok: !!plan.allow_quiz_sharing },
                    {
                      label:
                        plan.max_concurrent_rooms > 0
                          ? t('featHostRooms', { n: plan.max_concurrent_rooms })
                          : t('featHost'),
                      ok: plan.max_concurrent_rooms !== 0,
                    },
                    {
                      label: t('featPlayers', { n: limitLabel(plan.max_players_per_room) }),
                      ok: plan.max_players_per_room !== 0,
                    },
                    { label: t('featBranding'), ok: plan.allow_custom_branding },
                    { label: t('featCustom'), ok: !!plan.contact_sales },
                  ]
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-2xl border p-5 flex flex-col gap-4 ${
                        isCurrent ? 'border-[#e85d4c]/50 bg-[#e85d4c]/5' : 'border-white/10 bg-black/30'
                      }`}
                    >
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <h2 className="text-lg font-black text-[#f2f0eb]">{plan.name}</h2>
                          {isCurrent && <span className="text-[11px] font-bold text-[#e85d4c]">{t('currentBadge')}</span>}
                        </div>
                        <p className="text-xs text-[#9a9eab] mt-1 leading-relaxed">{plan.description}</p>
                      </div>

                      <ul className="space-y-1.5 text-xs">
                        {features.map((f) => (
                          <li key={f.label} className={`flex items-start gap-2 ${f.ok ? 'text-[#c5c2ba]' : 'text-[#9a9eab]/60'}`}>
                            {f.ok ? (
                              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
                            ) : (
                              <X className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400/70" />
                            )}
                            <span>{f.label}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-auto space-y-2">
                        {plan.contact_sales ? (
                          <>
                            <div className="text-2xl font-black text-[#e85d4c]">{t('contactPrice')}</div>
                            {zaloUrl && (
                              <a
                                href={zaloUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 w-full h-10 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-colors"
                              >
                                <MessageCircle className="w-4 h-4" />
                                {t('contactButton')}
                              </a>
                            )}
                          </>
                        ) : terms.length === 0 ? (
                          <div className="text-2xl font-black text-[#f2f0eb]">{t('freePrice')}</div>
                        ) : below ? (
                          <>
                            {terms.map((p) => (
                              <div key={p.id} className="flex justify-between text-sm text-[#c5c2ba]">
                                <span>{termLabel(p.duration_days)}</span>
                                <span className="font-bold">{format.number(p.amount_vnd)}đ</span>
                              </div>
                            ))}
                            <p className="text-[11px] text-[#9a9eab]">{t('higherPlanActive')}</p>
                          </>
                        ) : (
                          terms.map((p) =>
                            catalog.payment_enabled ? (
                              <Button
                                key={p.id}
                                type="button"
                                onClick={() => buy(p)}
                                className="w-full h-10 rounded-xl text-sm font-bold bg-[#e85d4c] hover:bg-[#e85d4c]/90 text-white flex justify-between"
                              >
                                <span>{termLabel(p.duration_days)}</span>
                                <span>{format.number(p.amount_vnd)}đ</span>
                              </Button>
                            ) : (
                              <div key={p.id} className="flex justify-between text-sm text-[#c5c2ba]">
                                <span>{termLabel(p.duration_days)}</span>
                                <span className="font-bold">{format.number(p.amount_vnd)}đ</span>
                              </div>
                            ),
                          )
                        )}
                        {!plan.contact_sales && terms.length > 0 && !below && catalog.payment_enabled && !signedIn && (
                          <p className="text-[11px] text-[#9a9eab]">{t('signInToPay')}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {catalog && !selected && !catalog.payment_enabled && (
              <p className="text-sm text-[#9a9eab]">{zaloUrl ? t('qrClosedZalo') : t('qrClosed')}</p>
            )}

            {catalog && !selected && <ZaloContact zaloUrl={zaloUrl} email={email} />}

            <p className="text-xs text-[#9a9eab]">
              {t('redeemHint')}{' '}
              <Link href="/profile/settings" className="underline hover:text-[#f2f0eb]">
                {t('accountSettings')}
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </GameBackground>
  )
}

// useSearchParams needs a Suspense boundary for the static prerender; the
// return parameters only exist in the browser anyway.
export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingContent />
    </Suspense>
  )
}
