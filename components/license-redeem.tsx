'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { redeemLicenseCode } from '@/app/actions/license'
import { KeyRound, Check, AlertCircle } from 'lucide-react'

/**
 * Formats keystrokes into KOVIO-XXXX-XXXX-XXXX while the buyer types.
 *
 * The backend normalizes anything recognisable, so this is purely so the field
 * looks like the code printed on the receipt — it never rejects a keystroke,
 * because fighting the user mid-word is how you make a code feel broken.
 */
function formatCodeInput(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^KOVIO/, '')
    .slice(0, 12)
  if (!clean) return ''
  const groups = clean.match(/.{1,4}/g) ?? []
  return ['KOVIO', ...groups].join('-')
}

export function LicenseRedeem(
{ onRedeemed }: { onRedeemed?: () => void }) {
  const t = useTranslations('license')
  const format = useFormatter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setBusy(true)
    const res = await redeemLicenseCode(code)
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    const until = res.endsAt
      ? t('until', { date: format.dateTime(new Date(res.endsAt), { dateStyle: 'medium' }) })
      : t('forever')
    setSuccess(t('redeemed', { plan: res.planName, until }))
    setCode('')
    onRedeemed?.()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(formatCodeInput(e.target.value))}
          placeholder="KOVIO-XXXX-XXXX-XXXX"
          spellCheck={false}
          autoComplete="off"
          aria-label={t('codeLabel')}
          className="font-mono tracking-wider uppercase"
        />
        <Button type="submit" disabled={busy || !code} className="shrink-0">
          <KeyRound className="w-4 h-4 mr-2" />
          {busy ? t('redeeming') : t('redeem')}
        </Button>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-[#e85d4c]">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="flex items-start gap-2 text-sm text-emerald-400">
          <Check className="w-4 h-4 mt-0.5 shrink-0" />
          {success}
        </p>
      )}
    </form>
  )
}
