'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { QRCodeComponent } from '@/components/qr-code'
import { Users, Maximize2, Minimize2, Link2, Check, Lock, Globe } from 'lucide-react'

interface Participant {
  id: string
  username: string
}

interface HostLobbyProps {
  sessionCode?: string
  participants: Participant[]
  maxPlayers?: number
  isPrivate: boolean
  privacyLoading: boolean
  onTogglePrivacy: () => void
  connected: boolean
  joinUrl: string
  copied: boolean
  onCopyLink: () => void
  onStart: () => void
  starting: boolean
}

// A 6-digit PIN read off a projector at the back of a hall is a string of
// digits with no shape. Grouping in threes gives the eye something to hold
// between glancing at the screen and typing on a phone.
const groupPin = (pin: string) => (pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin)

// The tiles are the point of this screen — everyone in the room is looking for
// their own name. Keep them as large as the roster allows rather than picking
// one size that is either tiny for eight players or overflowing for two hundred.
const tileTypeScale = (count: number) => {
  if (count <= 8) return 'text-2xl sm:text-3xl xl:text-5xl px-6 py-4 xl:px-9 xl:py-6'
  if (count <= 20) return 'text-xl sm:text-2xl xl:text-4xl px-5 py-3 xl:px-7 xl:py-5'
  if (count <= 50) return 'text-lg sm:text-xl xl:text-3xl px-4 py-2.5 xl:px-6 xl:py-4'
  if (count <= 120) return 'text-base sm:text-lg xl:text-2xl px-3.5 py-2 xl:px-5 xl:py-3'
  return 'text-sm sm:text-base xl:text-xl px-3 py-1.5 xl:px-4 xl:py-2.5'
}

export function HostLobby({
  sessionCode,
  participants,
  maxPlayers,
  isPrivate,
  privacyLoading,
  onTogglePrivacy,
  connected,
  joinUrl,
  copied,
  onCopyLink,
  onStart,
  starting,
}: HostLobbyProps) {
  const t = useTranslations('host')

  const [recentIds, setRecentIds] = useState<string[]>([])
  const seenRef = useRef<Set<string> | null>(null)

  // Highlight only players who arrive while this screen is up. Seeding the seen
  // set from the first roster keeps a host who reloads mid-lobby from watching
  // every existing name pop in as if it had just joined.
  useEffect(() => {
    const ids = participants.map((p) => String(p.id))
    if (seenRef.current === null) {
      seenRef.current = new Set(ids)
      return
    }
    const fresh = ids.filter((id) => !seenRef.current!.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) seenRef.current!.add(id)
    setRecentIds((prev) => [...prev, ...fresh])
    const timer = setTimeout(
      () => setRecentIds((prev) => prev.filter((id) => !fresh.includes(id))),
      2600
    )
    return () => clearTimeout(timer)
  }, [participants])

  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }

  const count = participants.length
  const tileClass = tileTypeScale(count)
  // Newest first: at an event the name that just appeared is the one people are
  // looking for, and the top-left corner is where the eye lands.
  const ordered = [...participants].reverse()

  let joinHost = ''
  try {
    joinHost = joinUrl ? `${new URL(joinUrl).host}/join` : ''
  } catch {
    joinHost = ''
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Join instructions — a light panel so the PIN and URL carry the most
          contrast on the screen. Everything a player needs is on this one bar.
          Every size below is min(vw, vh): the bar must stay a banner across the
          top, so on a wide projector its height is capped by the viewport
          height, not by how much horizontal room the text could take. */}
      <div className="shrink-0 px-3 pt-3 sm:px-5 sm:pt-5" data-tour="host-room-header">
        <div className="rounded-2xl sm:rounded-3xl bg-[#f2f0eb] text-[#12141a] shadow-[0_18px_60px_-20px_rgba(0,0,0,0.8)] flex items-stretch overflow-hidden">
          <div
            className="shrink-0 p-2 sm:p-3 flex items-center justify-center border-r border-[#12141a]/10"
            data-tour="qr-invite"
            style={{ width: 'clamp(84px, min(10vw, 15vh), 148px)' }}
          >
            {/* Keep QRCodeComponent's white card and padding: that quiet zone is
                what lets a phone camera lock onto the code from a distance. */}
            {joinUrl ? (
              <QRCodeComponent value={joinUrl} size={260} className="rounded-lg w-full !p-1 sm:!p-1.5" />
            ) : (
              <div className="aspect-square w-full flex items-center justify-center text-[10px] leading-tight text-[#12141a]/50 text-center">
                {t('preparingQr')}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col sm:flex-row items-stretch">
            <div
              className="flex-1 min-w-0 flex flex-col justify-center px-4 sm:px-7"
              style={{ paddingBlock: 'clamp(0.5rem, 1.5vh, 1.25rem)' }}
            >
              <p
                className="font-semibold uppercase tracking-[0.18em] text-[#12141a]/50 leading-none"
                style={{ fontSize: 'clamp(0.6rem, min(1vw, 1.6vh), 1.05rem)' }}
              >
                {t('joinAt')}
              </p>
              <p
                className="font-bold tracking-tight break-all leading-[1.08] mt-1"
                style={{ fontSize: 'clamp(1.15rem, min(3.1vw, 4.4vh), 2.9rem)' }}
              >
                {joinHost || '…'}
              </p>
              <p
                className="text-[#12141a]/55 leading-snug mt-1 hidden sm:block"
                style={{ fontSize: 'clamp(0.7rem, min(1.05vw, 1.7vh), 1.1rem)' }}
              >
                {t('scanToJoin')}
              </p>
            </div>

            <div
              className="shrink-0 flex flex-col justify-center px-4 sm:px-7 border-t sm:border-t-0 sm:border-l border-[#12141a]/10 bg-[#e85d4c]/[0.06]"
              data-tour="pin-display"
              style={{ paddingBlock: 'clamp(0.5rem, 1.5vh, 1.25rem)' }}
            >
              <p
                className="font-semibold uppercase tracking-[0.18em] text-[#12141a]/50 leading-none"
                style={{ fontSize: 'clamp(0.6rem, min(1vw, 1.6vh), 1.05rem)' }}
              >
                {t('gamePin')}
              </p>
              <p
                className="font-mono font-black text-[#e85d4c] tabular-nums leading-none tracking-[0.04em] select-all mt-1"
                style={{ fontSize: 'clamp(2rem, min(5.5vw, 8.5vh), 5.5rem)' }}
              >
                {sessionCode ? groupPin(String(sessionCode)) : '······'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Roster count and host controls */}
      <div className="shrink-0 px-3 sm:px-5 py-3 sm:py-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 pl-4 pr-5 sm:pl-5 sm:pr-7 py-2 sm:py-2.5">
          <Users className="w-5 h-5 sm:w-6 sm:h-6 xl:w-8 xl:h-8 text-[#2dd4bf] shrink-0" />
          <span
            className="font-black tabular-nums leading-none"
            style={{ fontSize: 'clamp(1.6rem, min(2.6vw, 4.2vh), 3rem)' }}
          >
            {count}
          </span>
          <span className="text-sm sm:text-base xl:text-xl text-[#9a9eab] leading-tight">
            {t('playersWord')}
            {/* The cap only earns screen space once the room is close to it. */}
            {maxPlayers && count >= maxPlayers * 0.8 ? (
              <span className="block text-[11px] xl:text-sm text-[#e85d4c]">/ {maxPlayers}</span>
            ) : null}
          </span>
        </div>

        <span className="inline-flex items-center gap-2 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 px-4 py-2.5 text-sm xl:text-base text-[#9a9eab]">
          <span
            className={`w-2 h-2 xl:w-2.5 xl:h-2.5 rounded-full ${connected ? 'bg-[#2dd4bf]' : 'bg-[#e85d4c]'}`}
          />
          {connected ? t('live') : t('connecting')}
        </span>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onTogglePrivacy}
          disabled={privacyLoading}
          aria-pressed={isPrivate}
          title={isPrivate ? t('privateRoomHint') : t('openRoomHint')}
          className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm xl:text-base font-medium transition-colors ${
            isPrivate
              ? 'border-[#e85d4c]/50 bg-[#e85d4c]/10 text-[#e85d4c]'
              : 'border-[#2c313d] bg-[#1a1d26]/90 text-[#9a9eab] hover:text-[#f2f0eb]'
          } ${privacyLoading ? 'opacity-50' : ''}`}
        >
          {isPrivate ? <Lock className="w-4 h-4 xl:w-5 xl:h-5" /> : <Globe className="w-4 h-4 xl:w-5 xl:h-5" />}
          <span className="hidden sm:inline">{isPrivate ? t('privateRoom') : t('openRoom')}</span>
        </button>

        <button
          type="button"
          onClick={onCopyLink}
          className="inline-flex items-center gap-2 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 px-4 py-2.5 text-sm xl:text-base font-medium text-[#9a9eab] hover:text-[#f2f0eb] transition-colors"
        >
          {copied ? <Check className="w-4 h-4 xl:w-5 xl:h-5 text-[#2dd4bf]" /> : <Link2 className="w-4 h-4 xl:w-5 xl:h-5" />}
          <span className="hidden sm:inline">{copied ? t('linkCopied') : t('copyInvite')}</span>
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          className="inline-flex items-center gap-2 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 px-4 py-2.5 text-sm xl:text-base font-medium text-[#9a9eab] hover:text-[#f2f0eb] transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4 xl:w-5 xl:h-5" /> : <Maximize2 className="w-4 h-4 xl:w-5 xl:h-5" />}
        </button>

        <Button
          onClick={onStart}
          disabled={count === 0 || starting}
          data-tour="start-game-btn"
          title={count === 0 ? t('needPlayers') : undefined}
          className="px-7 sm:px-10 xl:px-14 rounded-2xl bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-black tracking-wide disabled:opacity-40 shadow-[0_12px_40px_-12px_rgba(232,93,76,0.7)]"
          style={{
            height: 'clamp(48px, min(4.5vw, 7.5vh), 76px)',
            fontSize: 'clamp(1rem, min(1.5vw, 2.6vh), 1.75rem)',
          }}
        >
          {starting ? t('starting') : t('startGame')}
        </Button>
      </div>

      {/* The floor: every name in the room */}
      <div className="flex-1 min-h-0 flex px-3 pb-3 sm:px-5 sm:pb-5">
        {/* flex-1 rather than h-full: a percentage height resolves against the
            parent's content height here, which collapses the field to the size
            of the text inside it and leaves the bottom half of a projector
            screen empty. */}
        <div className="flex-1 min-h-0 flex flex-col rounded-2xl sm:rounded-3xl border border-[#2c313d] bg-[#1a1d26]/50 p-4 sm:p-6 xl:p-8 overflow-y-auto">
          {count === 0 ? (
            <div className="flex-1 min-h-[180px] flex flex-col items-center justify-center text-center gap-3">
              <div className="flex items-end gap-1.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2.5 h-2.5 xl:w-3.5 xl:h-3.5 rounded-full bg-[#e85d4c]/70 animate-lobby-pulse"
                    style={{ animationDelay: `${i * 180}ms` }}
                  />
                ))}
              </div>
              <p className="font-semibold text-[#f2f0eb] text-xl sm:text-2xl xl:text-4xl">
                {t('waitingFirstPlayer')}
              </p>
              <p className="text-sm sm:text-base xl:text-xl text-[#9a9eab] max-w-md xl:max-w-2xl leading-relaxed">
                {t('lobbyHint')}
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap shrink-0 gap-2.5 sm:gap-3 xl:gap-4 justify-center content-start">
              {ordered.map((p, i) => {
                const id = String(p.id)
                const isNew = recentIds.includes(id)
                return (
                  <div
                    key={`lobby-player-${id}-${i}`}
                    className={`animate-pop-in rounded-2xl font-bold text-[#f2f0eb] max-w-[46vw] sm:max-w-sm truncate border ${tileClass} ${
                      isNew
                        ? 'border-[#2dd4bf] bg-[#2dd4bf]/12 shadow-[0_0_30px_-6px_rgba(45,212,191,0.5)]'
                        : 'border-[#2c313d] bg-[#12141a]/80'
                    }`}
                  >
                    {p.username}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
