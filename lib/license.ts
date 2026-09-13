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
