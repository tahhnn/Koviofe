'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import {
  Apple,
  Download,
  ExternalLink,
  Gift,
  Hourglass,
  Info,
  MonitorDown,
  Package,
  QrCode,
  Smartphone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QRCodeComponent } from '@/components/qr-code'
import {
  getLuckyDrawRelease,
  type LuckyDrawBuild,
  type LuckyDrawPlatform,
  type LuckyDrawRelease,
} from '@/app/actions/luckydraw'

const PLATFORM_ICON = {
  windows: MonitorDown,
  macos: Apple,
  android: Smartphone,
  ios: Smartphone,
  other: Package,
} as const

const PLATFORM_ORDER: LuckyDrawPlatform[] = ['windows', 'macos', 'android', 'ios', 'other']

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * The operating system the visitor is on, so their build can be listed first.
 *
 * Best effort by design: it only reorders a list that shows every build
 * anyway, so a wrong guess costs a scroll and nothing else. The CPU is not
 * detected — Safari reports Intel on Apple Silicon too, and a wrong arch
 * would be a download that refuses to open.
 */
function detectPlatform(): LuckyDrawPlatform | null {
  if (typeof navigator === 'undefined') return null
  const hinted = (navigator as any).userAgentData?.platform as string | undefined
  const hay = `${hinted ?? ''} ${navigator.userAgent}`.toLowerCase()

  if (hay.includes('android')) return 'android'
  if (/iphone|ipod/.test(hay)) return 'ios'
  // An iPad in desktop mode calls itself Macintosh; the touch points give it away.
  if (/ipad/.test(hay) || (hay.includes('mac') && navigator.maxTouchPoints > 1)) return 'ios'
  if (hay.includes('win')) return 'windows'
  if (hay.includes('mac')) return 'macos'
  return null
}

/**
 * The dashboard's LuckyDraw tab: what the companion app is and how to get it.
 * The build list comes from the server — this component has no idea what
 * files, platforms or versions exist until it asks.
 */
export function LuckyDrawPanel() {
  const t = useTranslations('luckyDraw')
  const format = useFormatter()
  const [release, setRelease] = useState<LuckyDrawRelease | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewerPlatform, setViewerPlatform] = useState<LuckyDrawPlatform | null>(null)
  // A QR code has to carry an absolute URL for a phone to resolve it, and the
  // origin is only known in the browser.
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    setViewerPlatform(detectPlatform())

    let cancelled = false
    getLuckyDrawRelease()
      .then((data) => {
        if (!cancelled) setRelease(data)
      })
      .catch((error) => {
        console.error('Error loading LuckyDraw release:', error)
        if (!cancelled) setRelease({ available: false, builds: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Groups in server order, except the visitor's own OS is moved to the top.
  const groups = useMemo(() => {
    const byPlatform = new Map<LuckyDrawPlatform, LuckyDrawBuild[]>()
    for (const build of release?.builds ?? []) {
      const list = byPlatform.get(build.platform) ?? []
      list.push(build)
      byPlatform.set(build.platform, list)
    }
    return [...byPlatform.entries()].sort(([a], [b]) => {
      if (a === viewerPlatform) return -1
      if (b === viewerPlatform) return 1
      return PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b)
    })
  }, [release, viewerPlatform])

  if (loading) {
    return (
      <div className="bg-white/5 border border-white/5 rounded-3xl p-10 text-center backdrop-blur-sm">
        <Hourglass className="w-10 h-10 text-indigo-400 animate-spin mx-auto" />
      </div>
    )
  }

  if (!release?.available) {
    return (
      <div className="bg-white/5 border border-white/5 rounded-3xl p-6 sm:p-10 lg:p-16 text-center backdrop-blur-sm shadow-xl flex flex-col items-center justify-center space-y-6">
        <Gift className="w-16 h-16 text-amber-500/40 mx-auto" />
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">{t('emptyTitle')}</h3>
          <p className="text-gray-400 text-sm max-w-md leading-relaxed mx-auto">{t('emptyHint')}</p>
        </div>
      </div>
    )
  }

  // A QR code is only worth the space when the file it points at installs on a
  // phone; nobody scans a code to get a .dmg.
  const mobileBuild = release.builds.find((b) => b.platform === 'android' || b.platform === 'ios')
  const qrValue = mobileBuild && origin ? `${origin}${mobileBuild.url}` : ''

  const buildLabel = (build: LuckyDrawBuild): string => {
    if (build.label) return build.label
    const parts = [t(`kind.${build.kind}`)]
    if (build.arch) {
      // "Intel" and "Apple Silicon" are what a Mac owner recognises; x64 and
      // arm64 mean nothing to them and everything to a Windows owner.
      parts.push(build.platform === 'macos' ? t(`mac.${build.arch}`) : t(`arch.${build.arch}`))
    }
    return parts.join(' · ')
  }

  return (
    <div className={`grid grid-cols-1 gap-6 ${qrValue ? 'lg:grid-cols-3' : ''}`}>
      <div className={`space-y-6 ${qrValue ? 'lg:col-span-2' : ''}`}>
        <div className="bg-gradient-to-b from-amber-500/15 to-orange-500/5 border border-white/5 rounded-3xl p-6 shadow-lg space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 shrink-0 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-inner">
                <Gift className="w-7 h-7 text-amber-400" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white">{release.appName || t('appName')}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{release.notes || t('appTagline')}</p>
              </div>
            </div>
            {release.version && (
              <span className="shrink-0 text-[10px] uppercase font-extrabold tracking-widest px-2 py-1 rounded-lg border text-amber-300 bg-amber-500/10 border-amber-500/20">
                v{release.version}
              </span>
            )}
          </div>

          {release.homepage && (
            <a
              href={release.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('moreInfo')}
            </a>
          )}
        </div>

        {groups.map(([platform, builds]) => {
          const Icon = PLATFORM_ICON[platform]
          const isViewer = platform === viewerPlatform
          return (
            <div key={platform} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Icon className="w-4 h-4 text-gray-400" />
                <h4 className="text-[11px] uppercase font-extrabold tracking-widest text-gray-400">
                  {t(`platform.${platform}`)}
                </h4>
                {isViewer && (
                  <span className="text-[10px] uppercase font-extrabold tracking-widest px-2 py-0.5 rounded-lg border text-emerald-300 bg-emerald-500/10 border-emerald-500/20">
                    {t('yourDevice')}
                  </span>
                )}
              </div>

              {builds.map((build) => (
                <div
                  key={build.fileName}
                  className="bg-white/5 border border-white/5 hover:border-white/15 rounded-2xl p-4 sm:p-5 backdrop-blur-sm shadow-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between transition-all duration-300"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-11 h-11 shrink-0 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-bold text-white truncate">{buildLabel(build)}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {build.fileName} · {formatSize(build.sizeBytes)} ·{' '}
                        {t('updatedOn', {
                          date: format.dateTime(new Date(build.updatedAt), { dateStyle: 'short' }),
                        })}
                      </p>
                      {build.notes && (
                        <p className="text-[11px] text-gray-400 leading-relaxed">{build.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* A plain anchor, not a fetch: the browser's own downloader
                      handles resume and progress for a file this size. */}
                  <a href={build.url} download className="shrink-0">
                    <Button
                      size="sm"
                      className={`w-full sm:w-auto font-bold text-xs rounded-xl shadow-md border-none h-11 sm:h-9 flex items-center gap-1.5 text-white ${
                        isViewer ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-white/10 hover:bg-white/20'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t('download')}
                    </Button>
                  </a>
                </div>
              ))}

              {/* Each OS blocks an unsigned app its own way, so the hint sits
                  with the builds it applies to rather than in one footnote. */}
              {(platform === 'windows' || platform === 'macos' || platform === 'android') && (
                <div className="bg-black/20 border border-white/5 rounded-2xl p-4 flex gap-3">
                  <Info className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-400 leading-relaxed">{t(`installHint.${platform}`)}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {qrValue && (
        <div className="bg-white/5 border border-white/5 rounded-3xl p-6 backdrop-blur-sm shadow-lg flex flex-col items-center text-center gap-4 h-fit">
          <div className="flex items-center gap-2 text-gray-400">
            <QrCode className="w-4 h-4" />
            <span className="text-[10px] uppercase font-extrabold tracking-widest">{t('scanTitle')}</span>
          </div>
          <QRCodeComponent value={qrValue} size={200} className="w-full" />
          <p className="text-xs text-gray-400 leading-relaxed">
            {t('scanHint', { platform: t(`platform.${mobileBuild!.platform}`) })}
          </p>
        </div>
      )}
    </div>
  )
}
