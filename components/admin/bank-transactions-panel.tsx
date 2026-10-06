'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  adminAttachBankTransaction,
  adminDismissBankTransaction,
  adminListBankTransactions,
  type BankTransaction,
} from '@/app/actions/payment'

const FILTERS = ['open', '', 'matched', 'attached', 'amount_mismatch', 'needs_review', 'ignored', 'dismissed'] as const

type Draft = { code: string; note: string }

/**
 * The SePay ledger. Its default view is the queue a human must clear: transfers
 * with no readable order code, and second payments for an order already paid.
 * Wrong-amount and late transfers are not here — they sit on their order as
 * "needs review" in the orders table, which is where they are settled.
 */
export function BankTransactionsPanel({
  onChanged,
  onError,
  onMessage,
}: {
  onChanged?: () => void
  onError: (m: string) => void
  onMessage: (m: string) => void
}) {
  const t = useTranslations('adminPayments')
  const format = useFormatter()
  const [rows, setRows] = useState<BankTransaction[]>([])
  const [filter, setFilter] = useState<string>('open')
  const [q, setQ] = useState('')
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    const r = await adminListBankTransactions(filter, q)
    if (r.ok) setRows(r.data)
    else onError(r.error)
  }, [filter, q, onError])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load from the API when the filter changes, intentional
    void load()
    // q is applied on demand (refresh button), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const attach = async (row: BankTransaction) => {
    const d = drafts[row.id]
    if (!d?.code.trim() || !d.note.trim()) {
      onError(t('attachFieldsRequired'))
      return
    }
    setBusy(row.id)
    const r = await adminAttachBankTransaction(row.id, d.code, d.note)
    setBusy(null)
    if (!r.ok) {
      onError(r.error)
      return
    }
    onMessage(r.data.paid ? t('attachedPaid', { code: d.code.toUpperCase() }) : t('attachedReview', { code: d.code.toUpperCase() }))
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[row.id]
      return next
    })
    await load()
    onChanged?.()
  }

  const dismiss = async (row: BankTransaction) => {
    const note = window.prompt(t('dismissPrompt'))
    if (note === null) return
    setBusy(row.id)
    const r = await adminDismissBankTransaction(row.id, note)
    setBusy(null)
    if (!r.ok) {
      onError(r.error)
      return
    }
    onMessage(t('dismissed'))
    await load()
  }

  const open = (s: string) => s === 'unmatched' || s === 'duplicate_payment'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h2 className="font-semibold text-[#f2f0eb]">{t('ledgerTitle')}</h2>
          <p className="text-xs text-[#9a9eab]">{t('ledgerHint')}</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={t('filterStatus')}
          className="bg-black/40 border border-white/10 text-[#f2f0eb] h-9 rounded-lg text-xs px-2"
        >
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {f ? t(`txn_${f}`) : t('allStatuses')}
            </option>
          ))}
        </select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('ledgerSearch')}
          className="h-9 w-48 bg-black/40 border-white/10 text-xs"
        />
        <Button
          type="button"
          onClick={() => void load()}
          className="h-9 rounded-lg text-xs bg-white/10 hover:bg-white/15 text-[#f2f0eb]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#9a9eab]">
              <th className="px-2 py-2">{t('colTime')}</th>
              <th className="px-2 py-2">{t('colPrice')}</th>
              <th className="px-2 py-2">{t('colContent')}</th>
              <th className="px-2 py-2">{t('colStatus')}</th>
              <th className="px-2 py-2">{t('colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const d = drafts[row.id]
              return (
                <tr key={row.id} className="border-b border-white/5 align-top">
                  <td className="px-2 py-2 text-xs text-[#9a9eab] whitespace-nowrap">
                    {format.dateTime(new Date(row.transaction_date), { dateStyle: 'short', timeStyle: 'short' })}
                    <div className="font-mono">{row.reference_code || `#${row.provider_txn_id}`}</div>
                  </td>
                  <td className="px-2 py-2 text-xs text-[#f2f0eb] whitespace-nowrap">{format.number(row.amount_vnd)}đ</td>
                  <td className="px-2 py-2 text-xs text-[#c5c2ba] break-all max-w-[280px]">{row.content}</td>
                  <td className="px-2 py-2 text-xs">
                    <span className={open(row.match_status) ? 'text-rose-300 font-bold' : 'text-[#9a9eab]'}>
                      {t(`txn_${row.match_status}`)}
                    </span>
                    {row.order_code && <div className="font-mono text-[#c5c2ba]">{row.order_code}</div>}
                    {row.note && <div className="text-[#9a9eab]">{row.note}</div>}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {row.match_status === 'unmatched' && !d && (
                      <Button
                        type="button"
                        onClick={() => setDrafts((prev) => ({ ...prev, [row.id]: { code: '', note: '' } }))}
                        className="h-8 rounded-lg text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white mr-2"
                      >
                        {t('attach')}
                      </Button>
                    )}
                    {row.match_status === 'unmatched' && d && (
                      <div className="flex flex-col gap-2 min-w-[200px] mb-2">
                        <Input
                          placeholder={t('attachCode')}
                          aria-label={t('attachCode')}
                          value={d.code}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: { ...d, code: e.target.value } }))}
                          className="h-8 bg-black/40 border-white/10 text-xs font-mono uppercase"
                        />
                        <Input
                          placeholder={t('attachNote')}
                          aria-label={t('attachNote')}
                          maxLength={255}
                          value={d.note}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: { ...d, note: e.target.value } }))}
                          className="h-8 bg-black/40 border-white/10 text-xs"
                        />
                        <Button
                          type="button"
                          disabled={busy === row.id}
                          onClick={() => attach(row)}
                          className="h-8 rounded-lg text-xs bg-emerald-600/80 hover:bg-emerald-600 text-white"
                        >
                          {t('attachConfirm')}
                        </Button>
                      </div>
                    )}
                    {open(row.match_status) && (
                      <Button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => dismiss(row)}
                        className="h-8 rounded-lg text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-[#c5c2ba]"
                      >
                        {t('dismiss')}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-xs text-[#9a9eab]">
                  {filter === 'open' ? t('ledgerEmptyOpen') : t('ledgerEmpty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
