'use client'

import { useEffect, useState, Suspense } from 'react'
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

  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email')
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const requestCode = async () => {
    setError(null)
    setLoading(true)
    const result = await authClient.forgotPassword({ email })
    setLoading(false)
    if (result.error) {
      setError(result.error.message ?? tCommon('unexpectedError'))
      return
    }
    setCooldown(RESEND_SECONDS)
    setStep('reset')
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await requestCode()
  }

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError(t('passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('passwordMismatch'))
      return
    }
    setLoading(true)
    const result = await authClient.resetPassword({ email, otp, newPassword: password })
    setLoading(false)
    if (result.error) {
      setError(result.error.message ?? tCommon('unexpectedError'))
      return
    }
    setStep('done')
  }

  const errorBox = error && (
    <div
      className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/10 px-3.5 py-3 text-sm text-[#fca5a5]"
      role="alert"
    >
      {error}
    </div>
  )

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
              {step === 'done' ? t('successTitle') : t('title')}
            </h1>
            <p className="text-sm text-[#9a9eab]">
              {step === 'email' && t('subtitle')}
              {step === 'reset' && (
                <>
                  {t('codeSentTo')} <span className="text-[#f2f0eb] break-all">{email}</span>.
                </>
              )}
              {step === 'done' && t('successBody')}
            </p>
          </div>

          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
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
              {errorBox}
              <Button type="submit" disabled={loading} className={primaryButtonClass}>
                {loading ? t('sending') : t('sendCode')}
              </Button>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleResetSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="otp" className="text-sm text-[#c5c2ba]">
                  {t('codeLabel')}
                </Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  required
                  placeholder={t('codePlaceholder')}
                  className={`${fieldClass} text-center tracking-widest text-lg font-semibold`}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-password" className="text-sm text-[#c5c2ba]">
                  {t('newPasswordLabel')}
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm-password" className="text-sm text-[#c5c2ba]">
                  {t('confirmPasswordLabel')}
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={fieldClass}
                />
              </div>
              {errorBox}
              <Button type="submit" disabled={loading} className={primaryButtonClass}>
                {loading ? t('submitting') : t('submit')}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email')
                    setError(null)
                  }}
                  className="text-[#9a9eab] hover:text-[#f2f0eb] py-2"
                >
                  {t('changeEmail')}
                </button>
                <button
                  type="button"
                  onClick={requestCode}
                  disabled={loading || cooldown > 0}
                  className="text-[#e85d4c] hover:underline disabled:text-[#5c6170] disabled:no-underline py-2"
                >
                  {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resend')}
                </button>
              </div>
            </form>
          )}

          {step === 'done' && (
            <Link
              href="/sign-in"
              className={`${primaryButtonClass} inline-flex items-center justify-center`}
            >
              {t('goSignIn')}
            </Link>
          )}

          {step !== 'done' && (
            <p className="text-sm text-center mt-8 pt-6 border-t border-[#2c313d]">
              <Link href="/sign-in" className="text-[#e85d4c] font-medium hover:underline inline-block py-2 px-1">
                {t('backToSignIn')}
              </Link>
            </p>
          )}
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
