'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  adminExportAuditCsv,
  adminListAudit,
  adminListAuditActions,
  type AuditFilters,
  type AuditItem,
} from '@/app/actions/admin-audit'
import { actionLabel, downloadCsv, formatDateTime, metaSummary } from '@/lib/audit-labels'
import { Download, RefreshCw, Search } from 'lucide-react'

const PAGE = 50

/** `<input type="date">` value → ISO instant at local midnight. `endOfDay`
 *  moves to the next midnight, since the API's `to` is exclusive. */
function dayToIso(day: string, endOfDay = false): string | undefined {
  if (!day) return undefined
  const d = new Date(`${day}T00:00:00`)
  if (Number.isNaN(d.getTime())) return undefined
  if (endOfDay) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

// useSearchParams needs a Suspense boundary or the build bails out of
// prerendering this route.
export default function AdminAuditPage() {
  return (
    <Suspense>
      <AuditScreen />
    </Suspense>
  )
}

function AuditScreen() {
  const t = useTranslations('adminAudit')
  const locale = useLocale()
  const toast = useToast()
  const router = useRouter()
  const params = useSearchParams()

  // user_id arrives from the user detail page's "see all" link.
  const [userId, setUserId] = useState(params.get('user_id') || '')
  const [action, setAction] = useState('')
  const [status, setStatus] = useState<'' | 'success' | 'failed'>('')
  const [ip, setIp] = useState('')
  const [q, setQ] = useState('')
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')

  const [actions, setActions] = useState<string[]>([])
  const [items, setItems] = useState<AuditItem[]>([])
  const [cursor, setCursor] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const filters = useCallback((): AuditFilters => ({
    userId: Number(userId) || undefined,
    action,
    status,
    ip,
    q,
    from: dayToIso(fromDay),
    to: dayToIso(toDay, true),
  }), [userId, action, status, ip, q, fromDay, toDay])

  const load = useCallback(async (append = false, from = '') => {
    setLoading(true)
    try {
      const page = await adminListAudit(filters(), from, PAGE)
      setItems((prev) => (append ? [...prev, ...page.items] : page.items))
      setCursor(page.nextCursor)
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, router])

  // Text filters wait for typing to pause; selects apply at once through the
  // same effect, which is harmless at this delay.
  useEffect(() => {
    const id = setTimeout(() => load(false, ''), 300)
    return () => clearTimeout(id)
  }, [load])

  useEffect(() => {
    adminListAuditActions().then(setActions).catch(() => setActions([]))
  }, [])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const csv = await adminExportAuditCsv(filters())
      downloadCsv(csv, `audit-${new Date().toISOString().slice(0, 10)}.csv`)
      toast.success(t('csvDownloaded'))
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setExporting(false)
    }
  }

  const field = 'h-11 bg-[#1a1d26] border-[#2c313d] text-[#f2f0eb] rounded-xl'
  const select = 'h-11 rounded-xl bg-[#1a1d26] border border-[#2c313d] text-[#c5c2ba] px-3 text-sm'

  return (
    <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-10 max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-[#f2f0eb] tracking-tight">{t('title')}</h1>
        <p className="text-sm text-[#9a9eab] mt-2 max-w-2xl leading-relaxed">{t('intro')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5c6170]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} className={`pl-10 ${field}`} />
        </div>
        <select value={action} onChange={(e) => setAction(e.target.value)} className={select} aria-label={t('action')}>
          <option value="">{t('allActions')}</option>
          {actions.map((a) => (
            <option key={a} value={a}>{actionLabel(t, a)}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={select} aria-label={t('status')}>
          <option value="">{t('allStatuses')}</option>
          <option value="success">{t('success')}</option>
          <option value="failed">{t('failed')}</option>
        </select>
        <Input value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))} placeholder={t('userIdPlaceholder')} inputMode="numeric" className={field} />
        <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder={t('ipPlaceholder')} className={field} />
        <label className="flex items-center gap-2 text-xs text-[#9a9eab]">
          <span className="shrink-0">{t('from')}</span>
          <Input type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} className={field} />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#9a9eab]">
          <span className="shrink-0">{t('to')}</span>
          <Input type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} className={field} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button onClick={() => load(false, '')} variant="outline" className="border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] h-11 rounded-xl">
          <RefreshCw className="w-4 h-4 mr-1.5" />
          {t('refresh')}
        </Button>
        <Button onClick={exportCsv} disabled={exporting} variant="outline" className="border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] h-11 rounded-xl">
          <Download className="w-4 h-4 mr-1.5" />
          {exporting ? t('exporting') : t('exportCsv')}
        </Button>
      </div>

      <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-[#2c313d] text-left text-[11px] uppercase tracking-wider text-[#9a9eab]">
                <th className="px-4 py-3 font-semibold">{t('time')}</th>
                <th className="px-4 py-3 font-semibold">{t('account')}</th>
                <th className="px-4 py-3 font-semibold">{t('action')}</th>
                <th className="px-4 py-3 font-semibold">{t('status')}</th>
                <th className="px-4 py-3 font-semibold">{t('detail')}</th>
                <th className="px-4 py-3 font-semibold">{t('ip')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#9a9eab]">
                    {loading ? t('loading') : t('empty')}
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-b border-[#2c313d]/80 hover:bg-white/[0.02] align-top">
                    <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap tabular-nums">{formatDateTime(it.created_at, locale)}</td>
                    <td className="px-4 py-3">
                      {it.user_id ? (
                        <Link href={`/admin/users/${it.user_id}`} className="text-[#f2f0eb] hover:text-[#e85d4c]">
                          {it.user_email || `#${it.user_id}`}
                        </Link>
                      ) : (
                        <span className="text-[#5c6170]">{t('noAccount')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#c5c2ba]">{actionLabel(t, it.action)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-bold uppercase tracking-wide ${
                          it.status === 'failed'
                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/25'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                        }`}
                      >
                        {it.status === 'failed' ? t('failed') : t('success')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#9a9eab] max-w-[22rem]">
                      <div className="text-[#c5c2ba] break-all">{it.resource}</div>
                      {it.metadata && <div className="mt-0.5 break-all">{metaSummary(it.metadata)}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#9a9eab]">
                      <div className="tabular-nums">{it.ip_address || '—'}</div>
                      {it.user_agent && <div className="mt-0.5 text-[#5c6170] max-w-[14rem] truncate" title={it.user_agent}>{it.user_agent}</div>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cursor && (
        <div className="flex justify-center">
          <Button onClick={() => load(true, cursor)} disabled={loading} variant="outline" className="border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] h-11 rounded-xl">
            {loading ? t('loading') : t('loadMore')}
          </Button>
        </div>
      )}
    </main>
  )
}
