'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Copy, MessageCircle } from 'lucide-react'

/**
 * The "buy through a person" channel: a link to Zalo and nothing else. No order
 * is created — the admin grants the plan by hand after the chat. The URL comes
 * from the server (PAYMENT_ZALO_URL); with none configured nothing renders.
 *
 * The email copy button is there because the admin has to find the account to
 * grant to, and a buyer retyping their email into a chat is where typos happen.
 */
export function ZaloContact({ zaloUrl, email }: { zaloUrl?: string; email?: string | null }) {
  const t = useTranslations('payment')
  const [copied, setCopied] = useState(false)
  if (!zaloUrl) return null

  const copyEmail = async () => {
    if (!email) return
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the email is on screen, the buyer can type it.
    }
  }

  return (
    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-2">
      <a
        href={zaloUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        {t('zaloButton')}
      </a>
      <p className="text-xs text-[#9a9eab]">{email ? t('zaloHintEmail') : t('zaloHint')}</p>
      {email && (
        <button
          type="button"
          onClick={copyEmail}
          className="inline-flex items-center gap-1.5 text-xs text-[#c5c2ba] hover:text-[#f2f0eb]"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="font-mono">{email}</span>
        </button>
      )}
    </div>
  )
}
