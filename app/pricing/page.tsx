'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GameBackground } from '@/components/game-background'
import { PaymentCheckout } from '@/components/payment-checkout'
import { ZaloContact } from '@/components/zalo-contact'
import { authClient } from '@/lib/auth-client'
import { getMyLicense, type LicenseSnapshot } from '@/app/actions/license'
import { listPaymentProducts, type PaymentCatalog, type PaymentProduct } from '@/app/actions/payment'

/**
 * Public price list. Two ways to buy:
 *  - QR checkout (SePay), when the server says checkout is open;
 *  - Zalo, always shown when configured — a link to a person, nothing more.
 * Prices, terms and the Zalo link all come from the API.
 */
export default function PricingPage() {
  const t = useTranslations('payment')
  const format = useFormatter()
  const router = useRouter()
  const [catalog, setCatalog] = useState<PaymentCatalog | null>(null)
  const [license, setLicense] = useState<LicenseSnapshot | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [selected, setSelected] = useState<PaymentProduct | null>(null)

  useEffect(() => {
    ;(async () => {
      const session = await authClient.getSession()
      setEmail(session?.user?.email ?? null)
      const [c, me] = await Promise.all([listPaymentProducts(), session?.user ? getMyLicense() : null])
      setCatalog(c)
      setLicense(me)
    })()
  }, [])

  const signedIn = !!email
  const zaloUrl = catalog?.contact?.zalo_url
  const sub = license?.subscription
  const lifetimePro = sub?.plan_id === 'pro' && !sub?.ends_at

  const buy = (p: PaymentProduct) => {
    if (!signedIn) {
      router.push('/sign-in?redirectTo=/pricing')
      return
    }
    setSelected(p)
  }

  return (
    <GameBackground variant="auth">
      <div className="flex-1 flex items-start justify-center px-4 py-6 sm:py-8">
        <div className="w-full max-w-3xl space-y-6">
          <Card className="bg-white/5 border border-white/10 rounded-3xl p-5 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden space-y-6">
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[#e85d4c]/50" />
            <div>
              <h1 className="text-2xl font-black text-[#f2f0eb]">{t('title')}</h1>
              <p className="text-sm text-[#9a9eab] mt-1">{t('subtitle')}</p>
              {sub && license?.days_remaining != null && sub.plan_id === 'pro' && (
                <p className="text-sm text-[#c5c2ba] mt-2">{t('currentTerm', { days: license.days_remaining })}</p>
              )}
              {lifetimePro && <p className="text-sm text-emerald-400 mt-2">{t('lifetimeOwned')}</p>}
            </div>

            {!catalog && <p className="text-sm text-[#9a9eab]">{t('loading')}</p>}

            {catalog && selected && (
              <PaymentCheckout product={selected} zaloUrl={zaloUrl} onClose={() => setSelected(null)} />
            )}

            {catalog && !selected && catalog.products.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {catalog.products.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-white/10 bg-black/30 p-5 flex flex-col gap-3">
                    <h2 className="text-lg font-black text-[#f2f0eb]">{p.name}</h2>
                    <div>
                      <div className="text-2xl font-black text-[#e85d4c]">{format.number(p.amount_vnd)}đ</div>
                      <div className="text-xs text-[#9a9eab]">{t('termDays', { days: p.duration_days })}</div>
                    </div>
                    {catalog.payment_enabled && !lifetimePro && (
                      <Button
                        type="button"
                        onClick={() => buy(p)}
                        className="mt-auto h-10 rounded-xl text-sm font-bold bg-[#e85d4c] hover:bg-[#e85d4c]/90 text-white"
                      >
                        {signedIn ? t('payQr') : t('signInToPay')}
                      </Button>
                    )}
                  </div>
                ))}
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
