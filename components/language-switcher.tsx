'use client'

import { useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { setLocaleAction } from '@/app/actions/locale'
import { locales, type Locale } from '@/i18n/config'

const LABEL: Record<Locale, string> = { vi: 'VI', en: 'EN' }

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const active = useLocale() as Locale
  const t = useTranslations('common')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function pick(next: Locale) {
    if (next === active || pending) return
    startTransition(async () => {
      await setLocaleAction(next)
      // Messages are resolved on the server, so the tree has to be re-rendered
      // for the new catalog to reach the client components.
      router.refresh()
    })
  }

  return (
    <div
      className={`inline-flex items-center rounded-lg border border-[#2c313d] p-0.5 ${className}`}
      role="group"
      aria-label={t('language')}
    >
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => pick(code)}
          disabled={pending}
          aria-pressed={code === active}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors disabled:opacity-50 ${
            code === active
              ? 'bg-[#e85d4c] text-[#fff8f5]'
              : 'text-[#9a9eab] hover:text-[#f2f0eb] hover:bg-white/5'
          }`}
        >
          {LABEL[code]}
        </button>
      ))}
    </div>
  )
}
