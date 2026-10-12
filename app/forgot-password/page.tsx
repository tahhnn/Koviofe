'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GameBackground } from '@/components/game-background'
import { BrandMark } from '@/components/brand-mark'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Turnstile, type TurnstileHandle } from '@/components/turnstile'

const RESEND_SECONDS = 60

const fieldClass =
  'h-11 bg-[#12141a] border-[#2c313d] focus-visible:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl'
const primaryButtonClass =
  'w-full h-11 mt-1 bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl'

function ForgotPasswordContent() {
  const t = useTranslations('forgot')
  const tAuth = useTranslations('auth')
  const tCommon = useTranslations('common')
  const searchParams = useSearchParams()

  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaOn, setCaptchaOn] = useState(false)
  const captchaRef = useRef<TurnstileHandle>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const requestLink = async () => {
    setError(null)
    setLoading(true)
    const result = await authClient.forgotPassword({ email, captchaToken })
    setLoading(false)
    // A token is spent by the request whatever the outcome.
    captchaRef.current?.reset()
    if (result.error) {
      setError(result.error.message ?? tCommon('unexpectedError'))
      return
    }
    setCooldown(RESEND_SECONDS)
    setSent(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await requestLink()
  }

  const needCaptcha = captchaOn && !captchaToken

  return (
    <GameBackground variant="auth">
      <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-10">
        <div className="w-full max-w-md rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 sm:p-8">
          <div className="mb-8 text-center space-y-2">
            <div className="flex justify-end">
              <LanguageSwitcher />
            </div>
            <BrandMark />
            <h1 className="text-2xl font-semibold text-[#f2f0eb] pt-2">
              {sent ? t('checkInboxTitle') : t('title')}
            </h1>
            <p className="text-sm text-[#9a9eab]">
              {sent ? (
                <>
                  {t('linkSentTo')} <span className="text-[#f2f0eb] break-all">{email}</span>. {t('linkExpiry')}
                </>
              ) : (
                t('subtitle')
              )}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!sent && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm text-[#c5c2ba]">
                  {tAuth('emailLabel')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder={tAuth('emailPlaceholder')}
                  className={fieldClass}
                />
              </div>
            )}

            {sent && <p className="text-sm text-[#9a9eab] text-center">{t('checkSpam')}</p>}

            {/* Kept mounted after sending: a resend needs a fresh token. */}
            <Turnstile ref={captchaRef} action="forgot_password" onToken={setCaptchaToken} onEnabled={setCaptchaOn} />

            {error && (
              <div
                className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/10 px-3.5 py-3 text-sm text-[#fca5a5]"
                role="alert"
              >
                {error}
              </div>
            )}

            {!sent ? (
              <Button type="submit" disabled={loading || needCaptcha} className={primaryButtonClass}>
                {loading ? t('sending') : t('sendLink')}
              </Button>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setSent(false)
                    setError(null)
                  }}
                  className="text-[#9a9eab] hover:text-[#f2f0eb] py-2"
                >
                  {t('changeEmail')}
                </button>
                <button
                  type="submit"
                  disabled={loading || cooldown > 0 || needCaptcha}
                  className="text-[#e85d4c] hover:underline disabled:text-[#5c6170] disabled:no-underline py-2"
                >
                  {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resend')}
                </button>
              </div>
            )}
          </form>

          <p className="text-sm text-center mt-8 pt-6 border-t border-[#2c313d]">
            <Link href="/sign-in" className="text-[#e85d4c] font-medium hover:underline inline-block py-2 px-1">
              {t('backToSignIn')}
            </Link>
          </p>
        </div>
      </div>
    </GameBackground>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordContent />
    </Suspense>
  )
}
