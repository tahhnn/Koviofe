'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import {
  adminListAudit,
  adminUserActivity,
  type AuditItem,
  type UserActivity,
} from '@/app/actions/admin-audit'
import { actionLabel, formatDateTime, metaSummary } from '@/lib/audit-labels'
import { ArrowLeft, ArrowRight } from 'lucide-react'

type Tab = 'overview' | 'timeline' | 'rooms' | 'security'

export default function AdminUserDetailPage() {
  const t = useTranslations('adminAudit')
  const locale = useLocale()
  const toast = useToast()
  const router = useRouter()
  const params = useParams()
  const userId = Number(params.id)

  const [tab, setTab] = useState<Tab>('overview')
  const [data, setData] = useState<UserActivity | null>(null)
  const [timeline, setTimeline] = useState<AuditItem[]>([])
  const [failures, setFailures] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [activity, recent, failed] = await Promise.all([
        adminUserActivity(userId),
        adminListAudit({ userId }, '', 50),
        adminListAudit({ userId, status: 'failed' }, '', 20),
      ])
      setData(activity)
      setTimeline(recent.items)
      setFailures(failed.items)
    } catch (e: unknown) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, router])

  useEffect(() => {
    const id = setTimeout(load, 0)
    return () => clearTimeout(id)
  }, [load])

  if (loading && !data) {
    return <main className="container mx-auto px-4 sm:px-6 py-10 max-w-6xl text-sm text-[#9a9eab]">{t('loading')}</main>
  }
  if (!data) {
    return (
      <main className="container mx-auto px-4 sm:px-6 py-10 max-w-6xl text-sm text-[#9a9eab]">
        {t('userNotFound')}{' '}
        <Link href="/admin/users" className="text-[#e85d4c] hover:underline">{t('backToUsers')}</Link>
      </main>
    )
  }

  const { user, stats } = data
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('tabOverview') },
    { key: 'timeline', label: t('tabTimeline') },
    { key: 'rooms', label: t('tabRooms') },
    { key: 'security', label: t('tabSecurity') },
  ]
  const card = 'rounded-2xl border border-[#2c313d] bg-[#1a1d26]/80'
  const th = 'px-4 py-3 font-semibold'

  return (
    <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-10 max-w-6xl space-y-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-xs text-[#9a9eab] hover:text-[#f2f0eb]">
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('backToUsers')}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#f2f0eb] tracking-tight break-all">{user.nickname || user.email}</h1>
          <p className="text-sm text-[#9a9eab] mt-1 break-all">
            #{user.id} · {user.email} · {user.role === 'admin' ? 'Admin' : 'User'} · {user.plan_id}
            {' · '}
            <span className={user.is_active ? 'text-emerald-400' : 'text-rose-400'}>
              {user.is_active ? t('active') : t('inactive')}
            </span>
          </p>
        </div>
        <Link href={`/admin/audit?user_id=${user.id}`}>
          <Button variant="outline" className="border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] h-11 rounded-xl">
            {t('seeAllActivity')}
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0" role="tablist">
        {tabs.map((x) => (
          <Button
            key={x.key}
            role="tab"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            variant={tab === x.key ? 'default' : 'ghost'}
            className={
              tab === x.key
                ? 'bg-[#e85d4c] hover:bg-[#d44e3e] text-white h-10 rounded-xl text-sm border-none shrink-0'
                : 'text-[#9a9eab] hover:text-[#f2f0eb] h-10 rounded-xl text-sm shrink-0'
            }
          >
            {x.label}
          </Button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              [t('statQuizzes'), stats.quizzes],
              [t('statRooms'), stats.rooms],
              [t('statRooms30d'), stats.rooms_30d],
              [t('statPlayers'), stats.players],
              [t('statFailedLogins'), stats.failed_logins_30d],
            ].map(([label, value]) => (
              <div key={String(label)} className={`${card} p-4`}>
                <div className="text-[11px] uppercase tracking-wider text-[#9a9eab]">{label}</div>
                <div className="text-2xl font-black text-[#f2f0eb] tabular-nums mt-1">{Number(value).toLocaleString(locale)}</div>
              </div>
            ))}
          </div>
          <dl className={`${card} p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm`}>
            <div><dt className="text-[#9a9eab] text-xs">{t('registeredAt')}</dt><dd className="text-[#f2f0eb]">{formatDateTime(user.created_at, locale)}</dd></div>
            <div><dt className="text-[#9a9eab] text-xs">{t('lastLogin')}</dt><dd className="text-[#f2f0eb]">{user.last_login_at ? `${formatDateTime(user.last_login_at, locale)} · ${user.last_login_ip}` : t('neverRecorded')}</dd></div>
          </dl>
        </div>
      )}

      {tab === 'timeline' && (
        <AuditTable items={timeline} empty={t('empty')} t={t} locale={locale} />
      )}

      {tab === 'rooms' && (
        <div className={`${card} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[#2c313d] text-left text-[11px] uppercase tracking-wider text-[#9a9eab]">
                  <th className={th}>{t('room')}</th>
                  <th className={th}>{t('quiz')}</th>
                  <th className={th}>{t('createdAt')}</th>
                  <th className={th}>{t('endedAt')}</th>
                  <th className={`${th} text-right`}>{t('players')}</th>
                  <th className={th}>{t('roomStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rooms.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-[#9a9eab]">{t('noRooms')}</td></tr>
                ) : (
                  data.rooms.map((r) => (
                    <tr key={r.id} className="border-b border-[#2c313d]/80">
                      <td className="px-4 py-3 text-[#c5c2ba] tabular-nums whitespace-nowrap">#{r.id} · {r.pin_code}</td>
                      <td className="px-4 py-3 text-[#f2f0eb]">{r.quiz_title || `#${r.quiz_id}`}</td>
                      <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">{formatDateTime(r.created_at, locale)}</td>
                      <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap">{formatDateTime(r.ended_at, locale)}</td>
                      <td className="px-4 py-3 text-right text-[#f2f0eb] tabular-nums">{r.player_count ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-[#9a9eab]">{r.status}{r.ended_reason ? ` · ${r.ended_reason}` : ''}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="space-y-4">
          <div className={`${card} overflow-hidden`}>
            <div className="px-4 py-3 text-xs uppercase tracking-wider text-[#9a9eab] border-b border-[#2c313d]">{t('loginIps')}</div>
            <table className="w-full text-sm">
              <tbody>
                {data.login_ips.length === 0 ? (
                  <tr><td className="px-4 py-6 text-center text-[#9a9eab]">{t('neverRecorded')}</td></tr>
                ) : (
                  data.login_ips.map((x) => (
                    <tr key={x.ip} className="border-b border-[#2c313d]/80">
                      <td className="px-4 py-3 text-[#f2f0eb] tabular-nums">{x.ip}</td>
                      <td className="px-4 py-3 text-[#9a9eab]">{t('loginCount', { n: x.count })}</td>
                      <td className="px-4 py-3 text-[#9a9eab] text-right whitespace-nowrap">{formatDateTime(x.last_at, locale)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-[#9a9eab] mb-2">{t('recentFailures')}</div>
            <AuditTable items={failures} empty={t('noFailures')} t={t} locale={locale} />
          </div>
        </div>
      )}
    </main>
  )
}

function AuditTable({
  items,
  empty,
  t,
  locale,
}: {
  items: AuditItem[]
  empty: string
  t: ReturnType<typeof useTranslations>
  locale: string
}) {
  return (
    <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/80 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <tbody>
            {items.length === 0 ? (
              <tr><td className="px-4 py-10 text-center text-[#9a9eab]">{empty}</td></tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="border-b border-[#2c313d]/80 align-top">
                  <td className="px-4 py-3 text-[#9a9eab] whitespace-nowrap tabular-nums">{formatDateTime(it.created_at, locale)}</td>
                  <td className="px-4 py-3 text-[#c5c2ba]">
                    {actionLabel(t, it.action)}
                    {it.status === 'failed' && <span className="ml-2 text-[11px] font-bold uppercase text-rose-400">{t('failed')}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#9a9eab] break-all">{it.resource}{it.metadata ? ` · ${metaSummary(it.metadata)}` : ''}</td>
                  <td className="px-4 py-3 text-xs text-[#9a9eab] tabular-nums">{it.ip_address || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
