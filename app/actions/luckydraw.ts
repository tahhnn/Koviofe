'use server'

import { getSession } from '@/lib/session'
import { readLuckyDrawRelease, type LuckyDrawRelease } from '@/lib/luckydraw'

export type { LuckyDrawRelease, LuckyDrawBuild, LuckyDrawPlatform } from '@/lib/luckydraw'

/**
 * What the dashboard's LuckyDraw tab shows.
 *
 * Signed-in only: the download URLs themselves are public (a phone scanning
 * the QR code has no session), but the list of what exists is dashboard
 * content and there is no reason to hand it to an anonymous caller.
 */
export async function getLuckyDrawRelease(): Promise<LuckyDrawRelease> {
  const session = await getSession()
  if (!session?.user) return { available: false, builds: [] }
  return readLuckyDrawRelease()
}
