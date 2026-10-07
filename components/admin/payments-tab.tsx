'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Download, RefreshCw, Save } from 'lucide-react'
import { downloadCsv } from '@/lib/audit-labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BankTransactionsPanel } from '@/components/admin/bank-transactions-panel'
import {
  adminCancelPaymentOrder,
  adminConfirmPaymentOrder,
  adminExportPaymentOrdersCsv,
  adminGetCheckout,
  adminListPaymentOrders,
  adminListPaymentProducts,
  adminSetCheckout,
  adminUpdatePaymentProduct,
  type AdminOrderRow,
  type CheckoutState,
  type PaymentProduct,
} from '@/app/actions/payment'

const STATUSES = ['', 'needs_review', 'pending', 'paid', 'expired', 'cancelled'] as const

type ConfirmDraft = { amount: string; ref: string; note: string }

/**
 * Admin side of QR checkout: the on/off switch, the price list, and the orders
 * a human has to settle. Selling through Zalo has no screen here — that is the
 * grant form on the Subscriptions tab.
 */
export function PaymentsTab({ onChanged }: { onChanged?: () => void }) {
  const t = useTranslations('adminPayments')
  const tp = useTranslations('payment')
  const format = useFormatter()
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [checkout, setCheckout] = useState<CheckoutState | null>(null)
  const [products, setProducts] = useState<PaymentProduct[]>([])
  const [drafts, setDrafts] = useState<Record<string, PaymentProduct>>({})
  const [orders, setOrders] = useState<AdminOrderRow[]>([])
  const [status, setStatus] = useState<string>('')
  const [q, setQ] = useState('')
  const [confirming, setConfirming] = useState<Record<string, ConfirmDraft>>({})

  const flash = useCallback((m: string) => {
    setMsg(m)
    setErr(null)
    setTimeout(() => setMsg(null), 3000)
  }, [])
  const showError = useCallback((m: string) => setErr(m), [])

  const loadOrders = useCallback(async () => {
    const r = await adminListPaymentOrders({ status, q })
    if (r.ok) setOrders(r.data)
    else setErr(r.error)
  }, [status, q])

  const loadAll = useCallback(async () => {
    const [c, p] = await Promise.all([adminGetCheckout(), adminListPaymentProducts()])
    setCheckout(c)
    if (p.ok) {
      setProducts(p.data)
      setDrafts(Object.fromEntries(p.data.map((x) => [x.id, x])))
    } else setErr(p.error)
    await loadOrders()
  }, [loadOrders])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load from the API on mount, intentional
    void loadAll()
    // Only on mount; filters reload orders alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleCheckout = async () => {
    if (!checkout) return
    const next = !checkout.enabled
    if (!window.confirm(next ? t('confirmOpen') : t('confirmClose'))) return
    setBusy('checkout')
    const r = await adminSetCheckout(next)
    setBusy(null)
    if (r.ok) {
      setCheckout(r.data)
      flash(next ? t('opened') : t('closed'))
    } else setErr(r.error)
  }

  const saveProduct = async (id: string) => {
    const d = drafts[id]
    if (!d) return
    setBusy(`product-${id}`)
    const r = await adminUpdatePaymentProduct(id, {
      name: d.name,
      duration_days: Number(d.duration_days),
      amount_vnd: Number(d.amount_vnd),
      is_active: d.is_active,
      sort_order: Number(d.sort_order),
    })
    setBusy(null)
    if (r.ok) {
      setProducts((prev) => prev.map((p) => (p.id === id ? r.data : p)))
      flash(t('productSaved', { id }))
    } else setErr(r.error)
  }

  const exportCsv = async () => {
    setBusy('export')
    const r = await adminExportPaymentOrdersCsv({ status, q })
    setBusy(null)
    if (r.ok) downloadCsv(r.data, `payment-orders-${new Date().toISOString().slice(0, 10)}.csv`)
    else setErr(r.error)
  }

  const confirmOrder = async (o: AdminOrderRow) => {
    const d = confirming[o.order_code]
    if (!d) return
    const amount = parseInt(d.amount.replace(/\D/g, ''), 10) || 0
    if (amount <= 0 || !d.ref.trim() || !d.note.trim()) {
      setErr(t('confirmFieldsRequired'))
      return
    }
    if (amount !== o.amount_vnd && !window.confirm(t('confirmAmountDiffers', { paid: amount, price: o.amount_vnd }))) {
      return
    }
    setBusy(`confirm-${o.order_code}`)
    const r = await adminConfirmPaymentOrder(o.order_code, { amountVnd: amount, externalRef: d.ref, note: d.note })
    setBusy(null)
    if (r.ok) {
      setConfirming((prev) => {
        const next = { ...prev }
        delete next[o.order_code]
        return next
      })
      flash(t('confirmed', { code: o.order_code }))
      await loadOrders()
      onChanged?.()
    } else setErr(r.error)
  }

  const cancelOrder = async (o: AdminOrderRow) => {
    const note = window.prompt(t('cancelPrompt', { code: o.order_code }))
    if (note === null) return
    setBusy(`cancel-${o.order_code}`)
    const r = await adminCancelPaymentOrder(o.order_code, note)
    setBusy(null)
    if (r.ok) {
      flash(t('cancelled', { code: o.order_code }))
      await loadOrders()
    } else setErr(r.error)
  }

  const vnd = (n: number) => `${format.number(n)}đ`
  const when = (iso?: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <section className="space-y-6">
      {err && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {err}
        </p>
      )}
      {msg && (
        <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200">{msg}</p>
      )}

      {/* Switch */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-[#f2f0eb]">{t('checkoutTitle')}</h2>
          <p className="text-xs text-[#9a9eab]">
            {checkout?.effective ? t('checkoutOn') : t('checkoutOff')}
          </p>
          {checkout && !checkout.configured && (
            <p className="text-xs text-amber-400">{t('notConfigured')}</p>
          )}
        </div>
        <Button
          type="button"
          disabled={!checkout || busy === 'checkout' || (!checkout.enabled && !checkout.configured)}
          onClick={toggleCheckout}
          className={`h-9 rounded-lg text-xs font-bold ${
            checkout?.enabled
              ? 'border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-rose-200'
              : 'bg-[#e85d4c] hover:bg-[#e85d4c]/90 text-white'
          }`}
        >
          {checkout?.enabled ? t('close') : t('open')}
        </Button>
      </div>

      {/* Products */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-3">
        <h2 className="font-semibold text-[#f2f0eb]">{t('productsTitle')}</h2>
        <p className="text-xs text-[#9a9eab]">{t('productsHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#9a9eab]">
                <th className="px-2 py-2">{t('colProduct')}</th>
                <th className="px-2 py-2">{t('colDays')}</th>
                <th className="px-2 py-2">{t('colPrice')}</th>
                <th className="px-2 py-2">{t('colOrder')}</th>
                <th className="px-2 py-2">{t('colActive')}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const d = drafts[p.id] || p
                const set = (patch: Partial<PaymentProduct>) =>
                  setDrafts((prev) => ({ ...prev, [p.id]: { ...d, ...patch } }))
                return (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="px-2 py-2">
                      <Input
                        value={d.name}
                        aria-label={t('colProduct')}
                        onChange={(e) => set({ name: e.target.value })}
                        className="h-9 bg-black/40 border-white/10 text-xs"
                      />
                      <div className="text-[10px] text-[#9a9eab] mt-0.5 font-mono">{p.id}</div>
                    </td>
                    <td className="px-2 py-2 w-24">
                      <Input
                        inputMode="numeric"
                        aria-label={t('colDays')}
                        value={String(d.duration_days)}
                        onChange={(e) => set({ duration_days: Number(e.target.value.replace(/\D/g, '')) })}
                        className="h-9 bg-black/40 border-white/10 text-xs"
                      />
                    </td>
                    <td className="px-2 py-2 w-36">
                      <Input
                        inputMode="numeric"
                        aria-label={t('colPrice')}
                        value={String(d.amount_vnd)}
                        onChange={(e) => set({ amount_vnd: Number(e.target.value.replace(/\D/g, '')) })}
                        className="h-9 bg-black/40 border-white/10 text-xs"
                      />
                    </td>
                    <td className="px-2 py-2 w-20">
                      <Input
                        inputMode="numeric"
                        aria-label={t('colOrder')}
                        value={String(d.sort_order)}
                        onChange={(e) => set({ sort_order: Number(e.target.value.replace(/\D/g, '')) })}
                        className="h-9 bg-black/40 border-white/10 text-xs"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label={t('colActive')}
                        checked={d.is_active}
                        onChange={(e) => set({ is_active: e.target.checked })}
                        className="h-4 w-4 accent-[#e85d4c]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        disabled={busy === `product-${p.id}`}
                        onClick={() => saveProduct(p.id)}
                        className="h-9 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-[#f2f0eb]"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <BankTransactionsPanel
        onChanged={() => {
          void loadOrders()
          onChanged?.()
        }}
        onError={showError}
        onMessage={flash}
      />

      {/* Orders */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <h2 className="font-semibold text-[#f2f0eb] mr-auto">{t('ordersTitle')}</h2>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label={t('filterStatus')}
            className="bg-black/40 border border-white/10 text-[#f2f0eb] h-9 rounded-lg text-xs px-2"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s ? tp(`status_${s}`) : t('allStatuses')}
              </option>
            ))}
          </select>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="h-9 w-48 bg-black/40 border-white/10 text-xs"
          />
          <Button
            type="button"
            onClick={() => void loadOrders()}
            className="h-9 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-[#f2f0eb]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            disabled={busy === 'export'}
            onClick={exportCsv}
            title={t('exportCsv')}
            className="h-9 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-[#f2f0eb]"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="ml-1.5">{t('exportCsv')}</span>
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#9a9eab]">
                <th className="px-2 py-2">{t('colCode')}</th>
                <th className="px-2 py-2">{t('colBuyer')}</th>
                <th className="px-2 py-2">{t('colPrice')}</th>
                <th className="px-2 py-2">{t('colStatus')}</th>
                <th className="px-2 py-2">{t('colCreated')}</th>
                <th className="px-2 py-2">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const d = confirming[o.order_code]
                const settleable = o.status !== 'paid'
                return (
                  <tr key={o.id} className="border-b border-white/5 align-top">
                    <td className="px-2 py-2 font-mono text-xs text-[#f2f0eb]">{o.order_code}</td>
                    <td className="px-2 py-2 text-xs">
                      <div className="text-[#f2f0eb]">{o.email || `#${o.user_id}`}</div>
                      <div className="text-[#9a9eab]">{o.product_name}</div>
                    </td>
                    <td className="px-2 py-2 text-xs text-[#c5c2ba]">
                      {vnd(o.amount_vnd)}
                      {o.status === 'paid' && o.paid_amount_vnd !== o.amount_vnd && (
                        <div className="text-amber-400">{t('paidAmount', { amount: vnd(o.paid_amount_vnd) })}</div>
                      )}
                      {o.external_ref && <div className="text-[#9a9eab] break-all">{o.external_ref}</div>}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <span
                        className={
                          o.status === 'needs_review'
                            ? 'text-rose-300 font-bold'
                            : o.status === 'paid'
                              ? 'text-emerald-400'
                              : 'text-[#9a9eab]'
                        }
                      >
                        {tp(`status_${o.status}`)}
                      </span>
                      {o.review_reason && <div className="text-rose-300/80">{t(`reason_${o.review_reason}`)}</div>}
                      {o.note && <div className="text-[#9a9eab]">{o.note}</div>}
                    </td>
                    <td className="px-2 py-2 text-xs text-[#9a9eab] whitespace-nowrap">
                      {when(o.created_at)}
                      {o.paid_at && <div className="text-emerald-400/80">{when(o.paid_at)}</div>}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {settleable && !d && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={() =>
                              setConfirming((prev) => ({
                                ...prev,
                                [o.order_code]: { amount: String(o.amount_vnd), ref: '', note: '' },
                              }))
                            }
                            className="h-8 rounded-lg text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white"
                          >
                            {t('confirm')}
                          </Button>
                          {o.status !== 'cancelled' && (
                            <Button
                              type="button"
                              disabled={busy === `cancel-${o.order_code}`}
                              onClick={() => cancelOrder(o)}
                              className="h-8 rounded-lg text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-[#c5c2ba]"
                            >
                              {t('cancel')}
                            </Button>
                          )}
                        </div>
                      )}
                      {settleable && d && (
                        <div className="flex flex-col gap-2 min-w-[220px]">
                          <Input
                            inputMode="numeric"
                            placeholder={t('confirmAmount')}
                            aria-label={t('confirmAmount')}
                            value={d.amount}
                            onChange={(e) =>
                              setConfirming((prev) => ({ ...prev, [o.order_code]: { ...d, amount: e.target.value } }))
                            }
                            className="h-8 bg-black/40 border-white/10 text-xs"
                          />
                          <Input
                            placeholder={t('confirmRef')}
                            aria-label={t('confirmRef')}
                            maxLength={120}
                            value={d.ref}
                            onChange={(e) =>
                              setConfirming((prev) => ({ ...prev, [o.order_code]: { ...d, ref: e.target.value } }))
                            }
                            className="h-8 bg-black/40 border-white/10 text-xs"
                          />
                          <Input
                            placeholder={t('confirmNote')}
                            aria-label={t('confirmNote')}
                            maxLength={255}
                            value={d.note}
                            onChange={(e) =>
                              setConfirming((prev) => ({ ...prev, [o.order_code]: { ...d, note: e.target.value } }))
                            }
                            className="h-8 bg-black/40 border-white/10 text-xs"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              disabled={busy === `confirm-${o.order_code}`}
                              onClick={() => confirmOrder(o)}
                              className="flex-1 h-8 rounded-lg text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white"
                            >
                              {t('confirmGrant')}
                            </Button>
                            <Button
                              type="button"
                              onClick={() =>
                                setConfirming((prev) => {
                                  const next = { ...prev }
                                  delete next[o.order_code]
                                  return next
                                })
                              }
                              className="h-8 rounded-lg text-xs border border-white/10 bg-white/5 text-[#c5c2ba]"
                            >
                              {t('back')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-xs text-[#9a9eab]">
                    {t('noOrders')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
