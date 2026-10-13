'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { LicenseSnapshot } from '@/app/actions/license'
import { isLicenseLocked, isPaidPlan } from '@/lib/license'

/**
 * Whether a plan indicator means anything. With enforcement off every host
 * gets the open entitlements, so "Free" or "Pro" would describe limits that
 * do not exist; an unknown or failed read counts as off, like the banners.
 */
function planKnown(license: LicenseSnapshot | null): license is LicenseSnapshot {
  return license?.enforcement === true && !!license.entitlements
}

/**
 * The current plan as a small pill for the header. Paid plans get the accent
 * and a sparkle; Free stays neutral with a quiet "Upgrade" that only colours
 * on hover. Either way it links to the plan tab of the settings page, never
 * straight to checkout.
 */
export function PlanBadge({ license, className = '' }: { license: LicenseSnapshot | null; className?: string }) {
  const t = useTranslations('dashboard')
  if (!planKnown(license)) return null
  const ents = license.entitlements
  const paid = isPaidPlan(ents.plan_id)

  if (paid) {
    return (
      <Link
        href="/profile/settings#plan"
        title={t('planBadgeTitle', { plan: ents.plan_name })}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-[#f0b429]/30 bg-gradient-to-r from-[#e85d4c]/15 to-[#f0b429]/15 text-xs font-bold text-[#f2f0eb] hover:border-[#f0b429]/60 transition-colors ${className}`}
      >
        <Sparkles className="w-3.5 h-3.5 text-[#f0b429]" />
        {ents.plan_name}
      </Link>
    )
  }

  return (
    <Link
      href="/profile/settings#plan"
      title={t('planBadgeTitle', { plan: ents.plan_name })}
      className={`group inline-flex items-center h-7 rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-[#c5c2ba] hover:border-[#e85d4c]/40 transition-colors ${className}`}
    >
      <span className="px-2.5">{ents.plan_name}</span>
      <span className="h-full inline-flex items-center pl-2 pr-2.5 border-l border-white/10 text-[#9a9eab] group-hover:text-[#e85d4c] group-hover:border-[#e85d4c]/30 transition-colors">
        {t('planUpgrade')}
      </span>
    </Link>
  )
}

/**
 * One muted line under the dashboard greeting for hosts on Free: what the
 * plan allows and how much of it is used, with a link to compare plans. It
 * turns amber only when the quiz allowance is nearly or fully used, which is
 * the moment the limit is about to get in the way. Hidden for paid plans and
 * for a locked account, which already gets the full banner.
 */
export function FreePlanHint({ license }: { license: LicenseSnapshot | null }) {
  const t = useTranslations('dashboard')
  if (!planKnown(license) || isPaidPlan(license.entitlements.plan_id) || isLicenseLocked(license)) return null
  const ents = license.entitlements
  const used = license.usage?.quizzes ?? 0
  const max = ents.max_quizzes
  const limited = max > 0
  const left = limited ? Math.max(0, max - used) : null
  const tight = left !== null && left <= 1

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className={tight ? 'text-amber-300' : 'text-[#9a9eab]'}>
        {tight
          ? left === 0
            ? t('freeHintFull', { plan: ents.plan_name, max })
            : t('freeHintLast', { plan: ents.plan_name })
          : limited
            ? t('freeHint', { plan: ents.plan_name, used, max, players: ents.max_players_per_room })
            : t('freeHintNoQuizCap', { plan: ents.plan_name, players: ents.max_players_per_room })}
      </span>
      <Link
        href="/pricing"
        className="inline-flex items-center gap-1 font-semibold text-[#e85d4c] hover:text-[#f2f0eb] transition-colors"
      >
        {t('comparePlans')}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </p>
  )
}
