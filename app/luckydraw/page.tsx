'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, Gift } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/brand-mark'
import { GameBackground } from '@/components/game-background'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LuckyDrawPanel } from '@/components/luckydraw-panel'

/**
 * Its own page rather than a tab inside the dashboard's quiz list: the app
 * download has nothing to do with the quizzes next to it, and a page can be
 * linked to and shared as /luckydraw.
 */
export default function LuckyDrawPage() {
  const t = useTranslations('luckyDraw')

  return (
    <GameBackground variant="dashboard">
      <div className="flex-1 pb-16">
        <header className="border-b border-white/5 bg-[#080c14]/60 backdrop-blur-xl sticky top-0 z-50">
          <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap gap-y-2 items-center justify-between">
            <BrandMark />
            <div className="flex flex-wrap justify-end items-center gap-2 sm:gap-4">
              <LanguageSwitcher />
              <Link href="/dashboard">
                <Button
                  variant="outline"
                  className="border-[#2c313d] hover:bg-white/5 text-[#9a9eab] hover:text-[#f2f0eb] h-11 sm:h-9 rounded-xl transition-all flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('backToDashboard')}</span>
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-12 max-w-7xl space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/5 border border-white/10 rounded-3xl p-5 sm:p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-amber-500 to-orange-500"></div>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Gift className="w-7 h-7 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white md:text-4xl">
                  {t('pageTitle')}
                </h1>
                <p className="text-gray-400 mt-2 text-base max-w-xl">{t('pageSubtitle')}</p>
              </div>
            </div>
          </div>

          <LuckyDrawPanel />
        </main>
      </div>
    </GameBackground>
  )
}
