'use server'

import { cookies } from 'next/headers'
import { LOCALE_COOKIE, isLocale } from '@/i18n/config'

/**
 * Persist the reader's language choice.
 *
 * A cookie rather than a URL segment: room links are shared as PINs and QR
 * codes and must keep working exactly as handed out. One year, because a
 * language preference is not session state — someone who picks Vietnamese
 * should not be asked again next month.
 */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return { success: false }
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return { success: true }
}
