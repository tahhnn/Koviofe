export const locales = ['vi', 'en'] as const
export type Locale = (typeof locales)[number]

// Vietnamese is the product's primary audience; an unknown or missing
// preference lands here rather than on English.
export const defaultLocale: Locale = 'vi'

// Cookie, not a URL segment. Room links (/join, /play/<id>) are shared by PIN
// and QR and already exist in the wild — putting /vi/ or /en/ in front of them
// would break every link that has been handed out.
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value)
}
