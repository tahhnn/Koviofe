import type { LicenseSnapshot } from '@/app/actions/license'

/**
 * True when the account has no usable entitlement — the "chưa kích hoạt" state.
 *
 * Reads the resolved limits rather than the plan id, because what blocks a host
 * is the limit the backend gates on, not what the tier happens to be called.
 *
 * Lives here rather than beside the other license helpers: `app/actions/license.ts`
 * is a `'use server'` module, and every export of one must be an async server
 * action. A synchronous predicate there fails the build.
 *
 * A null snapshot is NOT locked. A failed `/license/me` read must not paint the
 * whole dashboard as unlicensed — the host still hits the real 403 if they are.
 */
export function isLicenseLocked(snapshot: LicenseSnapshot | null): boolean {
  const e = snapshot?.entitlements
  if (!e) return false
  return e.max_quizzes === 0 && e.max_concurrent_rooms === 0
}

/**
 * True when the plan id is a paid tier — the one rule both admin consoles use to
 * decide whether there is anything to revoke.
 *
 * A blacklist rather than `=== 'pro'`: a third paid plan must not silently
 * disable the revoke button, which is exactly what /admin/users did.
 *
 * `'open'` is excluded on purpose. It is the placeholder plan id that
 * GetEntitlements returns for every host while enforcement is off; the admin
 * endpoints now report the stored plan instead, and this is the second line of
 * defence if that ever regresses.
 */
export function isPaidPlan(planId?: string | null): boolean {
  const p = (planId || '').trim().toLowerCase()
  return p !== '' && p !== 'free' && p !== 'open'
}

/**
 * True when a paid term ends within `withinDays`.
 *
 * Lives here for the same reason isLicenseLocked does: `app/actions/license.ts`
 * is a `'use server'` module and cannot export a synchronous function.
 *
 * A snapshot with no expiry (lifetime, or no term at all) is never "expiring".
 */
export function isLicenseExpiringSoon(snapshot: LicenseSnapshot | null, withinDays = 7): boolean {
  const days = snapshot?.days_remaining
  if (days === null || days === undefined) return false
  return days >= 0 && days <= withinDays
}
