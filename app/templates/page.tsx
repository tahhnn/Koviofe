'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Question Bank was removed — quizzes are the single content list. */
export default function TemplatesRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard')
  }, [router])
  return (
    <main className="min-h-[100dvh] flex items-center justify-center bg-[#0c0e14]">
      <p className="text-sm text-[#9a9eab]">Đang chuyển về Dashboard…</p>
    </main>
  )
}
