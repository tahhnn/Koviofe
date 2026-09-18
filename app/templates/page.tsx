'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

/** Question Bank was removed — quizzes are the single content list. */
export default function TemplatesRedirectPage() {
  const t = useTranslations('misc')
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard')
  }, [router])
  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-[#0c0e14]">
      <p className="text-sm text-[#9a9eab]">{t('redirectingDashboard')}</p>
    </main>
  )
}
