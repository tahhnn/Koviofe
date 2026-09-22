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
  /**
   * The event's own logo, if the host set one. Shown above the join card,
   * where the whole room is already looking during the lobby — that is the
   * only moment on the projector where branding costs nothing the game needs.
   */
  logoUrl?: string
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
  logoUrl,
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
    <div className="relative flex-1 flex flex-col min-h-0">
      {/* One thin bar instead of a separate control row.
          Measured before this change at 1920x951: the logo band, the join card
          and the control row together took 352px — 37% of the screen — and the
          roster box below them was 579px tall to hold 98px of names. The count
          and the utilities do not need a band of their own; they need to be
          reachable, and on a projector nobody reads their labels anyway. */}
      <div className="shrink-0 flex items-center gap-3 px-3 sm:px-5 py-2 sm:py-2.5 min-h-14 sm:min-h-16">
        <div className="flex items-center gap-2 rounded-full bg-[#12141a]/70 backdrop-blur-sm px-3 py-1.5 border border-white/10">
          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-[#2dd4bf] shrink-0" />
          <span className="font-black tabular-nums leading-none text-lg sm:text-xl">{count}</span>
          {/* The cap only earns screen space once the room is close to it. */}
          {maxPlayers && count >= maxPlayers * 0.8 ? (
            <span className="text-[11px] text-[#e85d4c] leading-none">/ {maxPlayers}</span>
          ) : null}
          <span
            className={`ml-1 w-2 h-2 rounded-full ${connected ? 'bg-[#2dd4bf]' : 'bg-[#e85d4c]'}`}
            title={connected ? t('live') : t('connecting')}
          />
        </div>

        {/* The event's logo takes the middle, where a wordmark belongs and
            where it is not competing with the PIN for attention. */}
        <div className="flex-1 min-w-0 flex justify-center">
          {logoUrl && (
            /* The drop shadow is doing real work, not decoration: a logo is
               supplied as a transparent PNG and lands on whatever artwork the
               host chose, so without a shadow its edges dissolve into a busy
               key visual. A shadow separates it without putting it in a box,
               which a wordmark should never be. */
            <img
              src={logoUrl}
              alt=""
              className="w-auto max-w-[44vw] object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)]"
              style={{ height: 'clamp(40px, min(5.5vw, 9vh), 96px)' }}
            />
          )}
        </div>

        {/* Icons only. Each keeps its accessible name, so the label is still
            there for a screen reader and on hover — just not on the wall. */}
        <div className="flex items-center gap-1.5 shrink-0">
          <IconButton
            onClick={onTogglePrivacy}
            disabled={privacyLoading}
            active={isPrivate}
            label={isPrivate ? t('privateRoom') : t('openRoom')}
            title={isPrivate ? t('privateRoomHint') : t('openRoomHint')}
          >
            {isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
          </IconButton>

          <IconButton onClick={onCopyLink} label={copied ? t('linkCopied') : t('copyInvite')}>
            {copied ? <Check className="w-4 h-4 text-[#2dd4bf]" /> : <Link2 className="w-4 h-4" />}
          </IconButton>

          <IconButton
            onClick={toggleFullscreen}
            label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </IconButton>
        </div>
      </div>

      {/* Join instructions — a light panel so the PIN and URL carry the most
          contrast on the screen. Everything a player needs is on this one bar.
          Every size below is min(vw, vh): the bar must stay a banner across the
          top, so on a wide projector its height is capped by the viewport
          height, not by how much horizontal room the text could take. */}
      <div className="shrink-0 px-3 sm:px-5" data-tour="host-room-header">
        <div className="rounded-2xl sm:rounded-3xl bg-[#f2f0eb] text-[#12141a] shadow-[0_18px_60px_-20px_rgba(0,0,0,0.8)] flex items-stretch overflow-hidden">
          <div
            className="shrink-0 p-2 sm:p-2.5 flex items-center justify-center border-r border-[#12141a]/10"
            data-tour="qr-invite"
            style={{ width: 'clamp(76px, min(8vw, 13vh), 128px)' }}
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
              style={{ paddingBlock: 'clamp(0.375rem, 1vh, 0.875rem)' }}
            >
              <p
                className="font-semibold uppercase tracking-[0.18em] text-[#12141a]/50 leading-none"
                style={{ fontSize: 'clamp(0.6rem, min(0.9vw, 1.4vh), 0.95rem)' }}
              >
                {t('joinAt')}
              </p>
              <p
                className="font-bold tracking-tight break-all leading-[1.08] mt-1"
                style={{ fontSize: 'clamp(1.05rem, min(2.6vw, 3.8vh), 2.4rem)' }}
              >
                {joinHost || '…'}
              </p>
              <p
                className="text-[#12141a]/55 leading-snug mt-0.5 hidden sm:block"
                style={{ fontSize: 'clamp(0.65rem, min(0.95vw, 1.5vh), 1rem)' }}
              >
                {t('scanToJoin')}
              </p>
            </div>

            <div
              className="shrink-0 flex flex-col justify-center px-4 sm:px-7 border-t sm:border-t-0 sm:border-l border-[#12141a]/10 bg-[#e85d4c]/[0.06]"
              data-tour="pin-display"
              style={{ paddingBlock: 'clamp(0.375rem, 1vh, 0.875rem)' }}
            >
              <p
                className="font-semibold uppercase tracking-[0.18em] text-[#12141a]/50 leading-none"
                style={{ fontSize: 'clamp(0.6rem, min(0.9vw, 1.4vh), 0.95rem)' }}
              >
                {t('gamePin')}
              </p>
              <p
                className="font-mono font-black text-[#e85d4c] tabular-nums leading-none tracking-[0.04em] select-all mt-1"
                style={{ fontSize: 'clamp(1.75rem, min(4.5vw, 7vh), 4.5rem)' }}
              >
                {sessionCode ? groupPin(String(sessionCode)) : '······'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* The floor: every name in the room.
          No panel around it any more. The box was a 579px tinted rectangle
          holding 98px of names, and its tint sat on top of the host's key
          visual — the one thing this screen is supposed to show off. The tiles
          carry their own contrast, so they can float straight on the artwork. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col [justify-content:safe_center] px-3 pt-4 pb-20 sm:px-5 sm:pt-6 sm:pb-24">
        {count === 0 ? (
          <div className="min-h-[160px] flex flex-col items-center justify-center text-center gap-3">
            <div className="flex items-end gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2.5 h-2.5 xl:w-3.5 xl:h-3.5 rounded-full bg-[#e85d4c]/70 animate-lobby-pulse"
                  style={{ animationDelay: `${i * 180}ms` }}
                />
              ))}
            </div>
            <p className="font-semibold text-[#f2f0eb] text-xl sm:text-2xl xl:text-4xl drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {t('waitingFirstPlayer')}
            </p>
            <p className="text-sm sm:text-base xl:text-xl text-[#c5c2ba] max-w-md xl:max-w-2xl leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {t('lobbyHint')}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5 sm:gap-3 xl:gap-4 justify-center content-start">
            {ordered.map((p, i) => {
              const id = String(p.id)
              const isNew = recentIds.includes(id)
              return (
                <div
                  key={`lobby-player-${id}-${i}`}
                  className={`animate-pop-in rounded-2xl font-bold text-[#f2f0eb] max-w-[46vw] sm:max-w-sm truncate border shadow-lg ${tileClass} ${
                    isNew
                      ? 'border-[#2dd4bf] bg-[#2dd4bf]/20 shadow-[0_0_30px_-6px_rgba(45,212,191,0.5)]'
                      : 'border-white/10 bg-[#12141a]/75 backdrop-blur-sm'
                  }`}
                >
                  {p.username}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Floating rather than in a row of its own: the start button is one
          control, and giving it a full-width band cost the roster 103px. */}
      <div className="absolute right-3 sm:right-6 bottom-4 sm:bottom-6 z-20">
        <Button
          onClick={onStart}
          disabled={count === 0 || starting}
          data-tour="start-game-btn"
          title={count === 0 ? t('needPlayers') : undefined}
          className="px-7 sm:px-10 xl:px-14 rounded-2xl bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-black tracking-wide disabled:opacity-40 shadow-[0_12px_40px_-8px_rgba(232,93,76,0.8)]"
          style={{
            height: 'clamp(48px, min(4.5vw, 7.5vh), 76px)',
            fontSize: 'clamp(1rem, min(1.5vw, 2.6vh), 1.75rem)',
          }}
        >
          {starting ? t('starting') : t('startGame')}
        </Button>
      </div>
    </div>
  )
}

/**
 * A utility control in the lobby's top bar.
 *
 * The label is on aria-label and title rather than beside the icon: this bar is
 * read from the back of a room, where "Sao chép link mời" is both unreadable
 * and irrelevant to everyone except the one person holding the laptop.
 */
function IconButton({
  onClick,
  children,
  label,
  title,
  disabled,
  active,
}: {
  onClick: () => void
  children: React.ReactNode
  label: string
  title?: string
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={title ?? label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-sm transition-colors ${
        active
          ? 'border-[#e85d4c]/50 bg-[#e85d4c]/15 text-[#e85d4c]'
          : 'border-white/10 bg-[#12141a]/70 text-[#9a9eab] hover:text-[#f2f0eb]'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {children}
    </button>
  )
}
