'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { GameBackground } from '@/components/game-background'
import { authClient } from '@/lib/auth-client'
import { ArrowLeft, Shield, Users, BadgePercent } from 'lucide-react'

const nav = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/license', label: 'License', icon: BadgePercent },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
          Checking admin access…
        </div>
      </GameBackground>
    )
  }

  return (
    <GameBackground variant="dashboard">
      <div className="flex-1 pb-16">
        <header className="border-b border-white/5 bg-[#080c14]/60 backdrop-blur-xl sticky top-0 z-50">
          <div className="container mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <BrandMark />
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#e85d4c]">
                <Shield className="w-3.5 h-3.5" />
                Admin Console
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                const Icon = item.icon
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={active ? 'default' : 'ghost'}
                      className={
                        active
                          ? 'bg-[#e85d4c] hover:bg-[#d44e3e] text-white h-9 rounded-xl text-xs border-none'
                          : 'text-[#9a9eab] hover:text-[#f2f0eb] h-9 rounded-xl text-xs'
                      }
                    >
                      <Icon className="w-4 h-4 mr-1.5" />
                      {item.label}
                    </Button>
                  </Link>
                )
              })}
              <Link href="/dashboard">
                <Button
                  variant="outline"
                  className="border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] h-9 rounded-xl text-xs"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Dashboard
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
