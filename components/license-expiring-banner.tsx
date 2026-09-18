'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Clock } from 'lucide-react'
import { LicenseRedeem } from '@/components/license-redeem'

/**
 * Shown when a paid term is days from lapsing.
 *
 * Its own component rather than a mode on LicenseLockedBanner: the copy and the
 * call to action differ enough that one component covering both would be mostly
 * branches, and the two states never appear together.
 */
export function LicenseExpiringBanner({
  days,
  onRedeemed,
}: {
  days: number
  onRedeemed?: () => void
}) {
  const t = useTranslations('license')
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <h3 className="font-semibold text-[#f2f0eb]">{t('expiringTitle', { days })}</h3>
          <p className="text-sm text-[#9a9eab]">{t('expiringBody')}</p>
        </div>
      </div>

      <LicenseRedeem onRedeemed={onRedeemed} />

      <p className="text-xs text-[#9a9eab]">
        {t('detailsHint')}{' '}
        <Link href="/profile/settings" className="underline hover:text-[#f2f0eb]">
          {t('accountSettings')}
        </Link>
        .
      </p>
    </div>
  )
}
