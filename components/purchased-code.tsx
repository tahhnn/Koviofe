'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { redeemLicenseCode } from '@/app/actions/license'

/**
 * The activation code a payment bought. Paying grants nothing by itself: the
 * buyer activates the code on this account here, or copies it to another one
 * (buying for a company, a gift). The same code is in their receipt email and
 * in the admin's order list.
 */
export function PurchasedCode({
  code,
  used,
  usedByMe,
  onRedeemed,
}: {
  code: string
  used: boolean
  usedByMe: boolean
  onRedeemed?: () => void
}) {
  const t = useTranslations('payment')
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the code is on screen.
    }
  }

  const activate = async () => {
    setBusy(true)
    setError(null)
    const r = await redeemLicenseCode(code)
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setDone(t('codeActivated', { plan: r.planName }))
    router.refresh()
    onRedeemed?.()
  }

  const isUsed = used || !!done

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={copy}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left"
      >
        <span className="font-mono text-lg font-black tracking-wider text-[#f2f0eb] break-all">{code}</span>
        {copied ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <Copy className="w-4 h-4 text-[#9a9eab] shrink-0" />}
      </button>
      {isUsed ? (
        <p className="text-xs text-[#9a9eab]">
          {done ?? (usedByMe ? t('codeUsedHere') : t('codeUsedElsewhere'))}
        </p>
      ) : (
        <>
          <Button
            type="button"
            disabled={busy}
            onClick={activate}
            className="w-full h-10 rounded-xl text-sm font-bold bg-[#e85d4c] hover:bg-[#e85d4c]/90 text-white"
          >
            <KeyRound className="w-4 h-4" />
            <span className="ml-1.5">{t('activateHere')}</span>
          </Button>
          <p className="text-xs text-[#9a9eab]">{t('codeTransferHint')}</p>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  )
}
