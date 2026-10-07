'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, Clock, Copy, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  cancelPaymentOrder,
  createPaymentOrder,
  getPaymentOrder,
  type OrderView,
  type PaymentProduct,
} from '@/app/actions/payment'

// How often a pending order is re-read. The webhook usually lands within
// seconds of the transfer; polling faster buys nothing and costs a request each.
const POLL_MS = 3000

function CopyRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: the value is on screen.
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-[#9a9eab] shrink-0">{label}</span>
      <button
        type="button"
        onClick={copy}
        className={`flex items-center gap-1.5 text-right font-mono break-all ${
          strong ? 'text-base font-black text-[#e85d4c]' : 'text-sm text-[#f2f0eb]'
        }`}
      >
        {value}
        {copied ? (
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-[#9a9eab] shrink-0" />
        )}
      </button>
    </div>
  )
}

// Seconds left, or null before the first tick so a fresh order does not read
// as already expired.
function useCountdown(expiresAt?: string) {
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    if (!expiresAt) return
    const end = new Date(expiresAt).getTime()
    const tick = () => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  return left
}

/**
 * QR checkout for one product: opens an order, shows the transfer, and waits
 * for the SePay webhook to mark it paid. Nothing here decides payment — the
 * page only reads the order the server settles.
 */
export function PaymentCheckout({
  product,
  zaloUrl,
  onClose,
}: {
  product: PaymentProduct
  zaloUrl?: string
  onClose: () => void
}) {
  const t = useTranslations('payment')
  const format = useFormatter()
  const router = useRouter()
  const [view, setView] = useState<OrderView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The QR service answers an unsupported bank (SePay's test-mode ACMEBank)
  // or a malformed account with a 200 text body, which renders as a broken
  // image. Keyed by URL so a new order gets a fresh attempt.
  const [qrFailedUrl, setQrFailedUrl] = useState<string | null>(null)
  const started = useRef(false)

  const order = view?.order
  const checkout = view?.checkout
  const left = useCountdown(order?.status === 'pending' ? order.expires_at : undefined)

  const start = useCallback(async () => {
    setBusy(true)
    setError(null)
    const r = await createPaymentOrder(product.id)
    if (r.ok) setView(r.data)
    else setError(r.error)
    setBusy(false)
  }, [product.id])

  useEffect(() => {
    // Strict mode runs effects twice in dev; two orders would cancel each other.
    if (started.current) return
    started.current = true
    void start()
  }, [start])

  const refresh = useCallback(async () => {
    if (!order) return
    const r = await getPaymentOrder(order.order_code)
    if (r.ok) {
      setView(r.data)
      if (r.data.order.status === 'paid') router.refresh()
    }
  }, [order, router])

  // Poll while pending and visible. A background tab stops polling and
  // catches up the moment it is shown again.
  useEffect(() => {
    if (order?.status !== 'pending') return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [order?.status, refresh])

  // The countdown hitting zero asks the server once, which reports expiry.
  const expiredLocally = left === 0
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ask the server once when the local timer runs out, intentional
    if (expiredLocally && order?.status === 'pending') void refresh()
    // refresh/order change every poll; only the transition to zero matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiredLocally])

  const cancel = async () => {
    if (!order) return
    setBusy(true)
    const r = await cancelPaymentOrder(order.order_code)
    setBusy(false)
    if (r.ok) onClose()
    else setError(r.error)
  }

  const vnd = (n: number) => `${format.number(n)}đ`
  const secs = left ?? 0
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

  return (
    <div className="rounded-3xl border border-white/10 bg-black/40 p-5 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#f2f0eb]">{t('checkoutTitle', { name: product.name })}</h2>
          <p className="text-sm text-[#9a9eab]">{vnd(product.amount_vnd)}</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-[#9a9eab] hover:text-[#f2f0eb]">
          {t('close')}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {busy && !order && (
        <div className="flex items-center gap-2 text-sm text-[#9a9eab]">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('creating')}
        </div>
      )}

      {order?.status === 'pending' && checkout && (
        <div className="grid gap-5 sm:grid-cols-[220px_1fr] items-start">
          {checkout.qr_url && qrFailedUrl !== checkout.qr_url ? (
            // External image on purpose: the QR is rendered by SePay's VietQR
            // service from the bank account, amount and order code.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={checkout.qr_url}
              alt={t('qrAlt')}
              width={220}
              height={220}
              onError={() => setQrFailedUrl(checkout.qr_url)}
              className="w-full max-w-[220px] mx-auto rounded-2xl bg-white p-2"
            />
          ) : checkout.qr_url ? (
            <div className="w-full max-w-[220px] mx-auto aspect-square rounded-2xl border border-dashed border-white/15 bg-black/30 p-4 flex items-center justify-center text-center text-xs text-[#9a9eab]">
              {t('qrUnavailable')}
            </div>
          ) : null}
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/30 px-4">
              <CopyRow label={t('bank')} value={checkout.bank_name} />
              <CopyRow label={t('account')} value={checkout.bank_account} />
              {checkout.bank_holder && <CopyRow label={t('holder')} value={checkout.bank_holder} />}
              <CopyRow label={t('amount')} value={String(order.amount_vnd)} />
              <CopyRow label={t('content')} value={checkout.transfer_content} strong />
            </div>
            <p className="text-xs text-amber-300">{t('contentWarning')}</p>
            <div className="flex items-center justify-between gap-3 text-xs text-[#9a9eab]">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t('waiting')}
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5" />
                {mmss}
              </span>
            </div>
            <Button
              type="button"
              disabled={busy}
              onClick={cancel}
              className="w-full h-9 rounded-xl text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-[#c5c2ba]"
            >
              {t('cancelOrder')}
            </Button>
          </div>
        </div>
      )}

      {order?.status === 'paid' && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="font-semibold text-[#f2f0eb]">{t('paidTitle')}</p>
            <p className="text-sm text-[#9a9eab]">{t('paidBody', { name: order.product_name })}</p>
          </div>
        </div>
      )}

      {(order?.status === 'expired' || order?.status === 'cancelled' || order?.status === 'needs_review') && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
          <div className="flex gap-3">
            <XCircle className="w-5 h-5 text-[#9a9eab] shrink-0" />
            <p className="text-sm text-[#c5c2ba]">
              {order.status === 'needs_review'
                ? t('reviewBody')
                : order.status === 'cancelled'
                  ? t('cancelledBody')
                  : t('expiredBody')}
            </p>
          </div>
          {order.status !== 'needs_review' && (
            <Button
              type="button"
              disabled={busy}
              onClick={start}
              className="h-9 rounded-xl text-xs font-bold bg-[#e85d4c] hover:bg-[#e85d4c]/90 text-white"
            >
              {t('newQr')}
            </Button>
          )}
        </div>
      )}

      {zaloUrl && (
        <p className="text-xs text-[#9a9eab]">
          {t('troubleZalo')}{' '}
          <a href={zaloUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-[#f2f0eb]">
            Zalo
          </a>
        </p>
      )}
    </div>
  )
}
