import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale, LOCALE_COOKIE, locales, type Locale } from './config'

/** Pick the best locale: explicit cookie choice, then the browser's header. */
async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const chosen = cookieStore.get(LOCALE_COOKIE)?.value
  if (isLocale(chosen)) return chosen

  const accept = (await headers()).get('accept-language') || ''
  // "vi-VN,vi;q=0.9,en;q=0.8" -> first supported tag, highest q first.
  const ranked = accept
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=')
      return { tag: tag.split('-')[0].toLowerCase(), q: q ? Number(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)

  for (const { tag } of ranked) {
    if (isLocale(tag)) return tag
  }
  return defaultLocale
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale()
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})

export { locales }
