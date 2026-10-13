'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Clock } from 'lucide-react'
import { LicenseRedeem } from '@/components/license-redeem'

/**
 * Shown when a paid term is close to lapsing (the window follows the term
 * length, see isLicenseExpiringSoon).
 *
 * One slim line on purpose: the host has a working plan and came to the
 * dashboard to work, so this is a reminder, not a gate. The code box only
 * opens on request.
 *
 * Its own component rather than a mode on LicenseLockedBanner: the copy and the
 * call to action differ enough that one component covering both would be mostly
 * branches, and the two states never appear together.
 */
export function LicenseExpiringBanner({
  days,
  planName,
  endsAt,
  onRedeemed,
}: {
  days: number
  planName?: string
  endsAt?: string | null
  onRedeemed?: () => void
}) {
  const t = useTranslations('license')
  const [redeemOpen, setRedeemOpen] = useState(false)
  const end = endsAt ? new Date(endsAt) : null
  // dd/MM, the way a date is written in Vietnam (Intl renders it as 16-10).
  const endLabel =
    end && !Number.isNaN(end.getTime())
      ? `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`
      : null

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
        <p className="flex-1 min-w-[12rem] text-sm text-[#c5c2ba]" title={t('expiringBody')}>
          <span className="font-semibold text-[#f2f0eb]">
            {t('expiringShort', { plan: planName ?? '', days })}
          </span>
          {endLabel && <span className="text-[#9a9eab]"> · {t('expiringOn', { date: endLabel })}</span>}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRedeemOpen((o) => !o)}
            aria-expanded={redeemOpen}
            className="h-8 px-3 rounded-lg text-xs font-semibold text-[#c5c2ba] hover:text-[#f2f0eb] hover:bg-white/5"
          >
            {t('enterCode')}
          </button>
          <Link
            href="/pricing"
            className="inline-flex items-center h-8 px-3 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-black text-xs font-bold"
          >
            {t('renew')}
          </Link>
        </div>
      </div>
      {redeemOpen && (
        <LicenseRedeem
          onRedeemed={() => {
            setRedeemOpen(false)
            onRedeemed?.()
          }}
        />
      )}
    </div>
  )
}
