import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { Button } from '@/components/ui/button'
import { redirect } from 'next/navigation'
import { QuickJoinForm } from '@/components/quick-join-form'
import { BrandMark } from '@/components/brand-mark'
import { GameBackground } from '@/components/game-background'
import { LanguageSwitcher } from '@/components/language-switcher'

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const t = await getTranslations('landing')
  const tNav = await getTranslations('nav')

  if (session?.user) {
    redirect('/dashboard')
  }

  return (
    <GameBackground variant="marketing" showGrid>
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 pt-5 pb-[calc(4rem+env(safe-area-inset-bottom))]">
        <header className="flex h-14 items-center justify-between gap-2 flex-wrap">
          <BrandMark />
          <nav className="flex items-center gap-2">
            <LanguageSwitcher className="mr-1" />
            <Link href="/sign-in">
              <Button variant="ghost" className="text-[#c5c2ba] hover:text-[#f2f0eb] hover:bg-white/5 h-10 sm:h-9 px-3">
                {tNav('signIn')}
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button className="bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] h-11 sm:h-9 px-4 font-semibold">
                {tNav('signUp')}
              </Button>
            </Link>
          </nav>
        </header>

        <section className="mt-10 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 lg:gap-16 items-center lg:min-h-[min(70dvh,640px)]">
          <div className="lg:col-span-7 space-y-6">
            <h1 className="text-3xl sm:text-5xl lg:text-[3.5rem] font-semibold tracking-tight leading-[1.08] text-[#f2f0eb] sm:max-w-[14ch]">
              {t('heroTitle')}
            </h1>
            <p className="text-base sm:text-lg text-[#9a9eab] leading-relaxed max-w-[42ch]">
              {t('heroSubtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-12 px-6 bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl active:scale-[0.98]"
                >
                  {t('startHosting')}
                </Button>
              </Link>
              <Link href="/join" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 px-6 border-[#2c313d] bg-transparent text-[#f2f0eb] hover:bg-white/5 rounded-xl"
                >
                  {t('joinWithPin')}
                </Button>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <QuickJoinForm />
          </div>
        </section>

        <section className="mt-20 md:mt-28 border-t border-[#2c313d] pt-14">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#f2f0eb] sm:max-w-[20ch] text-balance">
            {t('sectionTitle')}
          </h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 md:gap-10">
            {[
              { title: t('featurePinTitle'), body: t('featurePinBody') },
              { title: t('featurePrivacyTitle'), body: t('featurePrivacyBody') },
              { title: t('featureScoringTitle'), body: t('featureScoringBody') },
            ].map((item) => (
              <div key={item.title} className="space-y-2">
                <h3 className="text-lg font-semibold text-[#f2f0eb]">{item.title}</h3>
                <p className="text-sm text-[#9a9eab] leading-relaxed max-w-[36ch]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-24 pt-8 border-t border-[#2c313d] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-[#6b7080]">
          <BrandMark size="sm" className="opacity-80" />
          <p>quizzZone {new Date().getFullYear()}</p>
        </footer>
      </div>
    </GameBackground>
  )
}
