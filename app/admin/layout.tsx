'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { GameBackground } from '@/components/game-background'
import { authClient } from '@/lib/auth-client'
import { ArrowLeft, Shield, Users, BadgePercent } from 'lucide-react'

// Labels are translated, so the array is built inside the component where the
// hook is available rather than once at module scope.
const navItems = [
  { href: '/admin/users', key: 'users' as const, icon: Users },
  { href: '/admin/license', key: 'license' as const, icon: BadgePercent },
]

export default function AdminLayout(
{ children }: { children: React.ReactNode }) {
  const t = useTranslations('admin')
  const nav = navItems.map((i) => ({ ...i, label: t(i.key) }))
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    ;(async () => {
      const session = await authClient.getSession()
      if (session?.user?.role !== 'admin') {
        router.replace('/dashboard')
        return
      }
      setReady(true)
    })()
  }, [router])

  if (!ready) {
    return (
      <GameBackground variant="dashboard">
        <div className="flex-1 flex items-center justify-center text-[#9a9eab] text-sm">
          {t('checking')}
        </div>
      </GameBackground>
    )
  }

  return (
    <GameBackground variant="dashboard">
      <div className="flex-1 pb-16">
        <header className="border-b border-white/5 bg-[#080c14]/60 backdrop-blur-xl sticky top-0 z-50">
          <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <BrandMark />
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#e85d4c]">
                <Shield className="w-3.5 h-3.5" />
                {t('console')}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-nowrap overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href} className="shrink-0">
                    <Button
                      variant={active ? 'default' : 'ghost'}
                      className={
                        active
                          ? 'bg-[#e85d4c] hover:bg-[#d44e3e] text-white h-11 sm:h-9 rounded-xl text-sm sm:text-xs border-none shrink-0'
                          : 'text-[#9a9eab] hover:text-[#f2f0eb] h-11 sm:h-9 rounded-xl text-sm sm:text-xs shrink-0'
                      }
                    >
                      <Icon className="w-4 h-4 mr-1.5" />
                      {item.label}
                    </Button>
                  </Link>
                )
              })}
              <Link href="/dashboard" className="shrink-0">
                <Button
                  variant="outline"
                  className="border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] h-11 sm:h-9 rounded-xl text-sm sm:text-xs shrink-0"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  {t('dashboard')}
                </Button>
              </Link>
            </div>
          </div>
        </header>
        {children}
      </div>
    </GameBackground>
  )
}
