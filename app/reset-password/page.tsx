'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GameBackground } from '@/components/game-background'
import { BrandMark } from '@/components/brand-mark'
import { LanguageSwitcher } from '@/components/language-switcher'

const fieldClass =
  'h-11 bg-[#12141a] border-[#2c313d] focus-visible:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl'
const primaryButtonClass =
  'w-full h-11 mt-1 bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl'

type Status = 'checking' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const t = useTranslations('reset')
  const tCommon = useTranslations('common')

  const [token, setToken] = useState('')
  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // The token arrives in the fragment (#token=…), which the browser never
    // sends to the server. Read it once, then drop it from the address bar so
    // it does not linger in history, screenshots or a copied URL.
    const tok = new URLSearchParams(window.location.hash.slice(1)).get('token') || ''
    window.history.replaceState(null, '', window.location.pathname)
    if (!tok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL on mount
      setStatus('invalid')
      return
    }
    setToken(tok)
    authClient.checkResetToken({ token: tok }).then((r) => setStatus(r.error ? 'invalid' : 'ready'))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
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
    const result = await authClient.resetPassword({ token, newPassword: password })
    setLoading(false)
    if (result.error) {
      setError(result.error.message ?? tCommon('unexpectedError'))
      return
    }
    setStatus('done')
  }

  const title =
    status === 'done' ? t('successTitle') : status === 'invalid' ? t('invalidTitle') : t('title')
  const subtitle =
    status === 'done'
      ? t('successBody')
      : status === 'invalid'
        ? t('invalidBody')
        : status === 'checking'
          ? t('checking')
          : t('subtitle')

  return (
    <GameBackground variant="auth">
      <div className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-10">
        <div className="w-full max-w-md rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 sm:p-8">
          <div className="mb-8 text-center space-y-2">
            <div className="flex justify-end">
              <LanguageSwitcher />
            </div>
            <BrandMark />
            <h1 className="text-2xl font-semibold text-[#f2f0eb] pt-2">{title}</h1>
            <p className="text-sm text-[#9a9eab]">{subtitle}</p>
          </div>

          {status === 'ready' && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              {error && (
                <div
                  className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/10 px-3.5 py-3 text-sm text-[#fca5a5]"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <Button type="submit" disabled={loading} className={primaryButtonClass}>
                {loading ? t('submitting') : t('submit')}
              </Button>
            </form>
          )}

          {status === 'done' && (
            <Link href="/sign-in" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
              {t('goSignIn')}
            </Link>
          )}

          {status === 'invalid' && (
            <Link href="/forgot-password" className={`${primaryButtonClass} inline-flex items-center justify-center`}>
              {t('requestNew')}
            </Link>
          )}

          {status !== 'done' && (
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
