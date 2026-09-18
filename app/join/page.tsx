'use client'

import { useState, useEffect, Suspense } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { joinGameSession } from '@/app/actions/quizzes'
import { checkRoomByPin, listPublicRooms } from '@/app/actions/game'
import { GameBackground } from '@/components/game-background'
import { BrandMark } from '@/components/brand-mark'
import { LanguageSwitcher } from '@/components/language-switcher'
import { TourButton } from '@/components/tour-button'
import { playerJoinTour } from '@/lib/tours'
import { formatApiErrorInline, isStaleDeploymentError } from '@/lib/api-errors'
import { ArrowRight, Users } from 'lucide-react'

const STALE_RELOAD_KEY = 'join_stale_deploy_reloaded'

function JoinForm() {
  const t = useTranslations('join')
  const tCommon = useTranslations('common')
  const tErrors = useTranslations('apiErrors')
  const tTour = useTranslations('tours')
  const router = useRouter()
  const searchParams = useSearchParams()
  const pin = searchParams.get('pin') || searchParams.get('code') || ''

  const [sessionCode, setSessionCode] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [roomStatus, setRoomStatus] = useState<string | null>(null)
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null)
  const [playerCount, setPlayerCount] = useState<number | null>(null)
  const [openRooms, setOpenRooms] = useState<
    Array<{
      id: number
      pin_code: string
      quiz_title: string
      player_count: number
      max_players: number
    }>
  >([])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed PIN from URL param before paint, intentional
    if (pin) setSessionCode(pin.replace(/\D/g, '').slice(0, 6))
  }, [pin])

  useEffect(() => {
    listPublicRooms().then(setOpenRooms).catch(() => setOpenRooms([]))
  }, [])

  useEffect(() => {
    if (sessionCode.length >= 6) {
      const verifyRoom = async () => {
        setError('')
        const room = await checkRoomByPin(sessionCode)
        if (!room) {
          setError(formatApiErrorInline('No room found for this PIN', tErrors))
          setRoomStatus(null)
          setMaxPlayers(null)
          setPlayerCount(null)
        } else if (room.status !== 'waiting') {
          setError(
            formatApiErrorInline(
              room.status === 'finished'
                ? 'This game already ended'
                : t('gameInProgress'),
              tErrors
            )
          )
          setRoomStatus(room.status)
          setMaxPlayers(room.max_players ?? null)
          setPlayerCount(room.player_count ?? null)
        } else {
          setError('')
          setRoomStatus('waiting')
          setMaxPlayers(room.max_players ?? null)
          setPlayerCount(room.player_count ?? null)
          if (room.max_players) {
            sessionStorage.setItem('join_max_players', String(room.max_players))
          }
        }
      }
      verifyRoom()
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear room info before paint when PIN is incomplete, intentional
      setRoomStatus(null)
      setMaxPlayers(null)
      setPlayerCount(null)
    }
  }, [sessionCode])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!sessionCode.trim() || !username.trim()) {
      setError(t('pinAndNicknameRequired'))
      setLoading(false)
      return
    }

    if (roomStatus && roomStatus !== 'waiting') {
      setError(t('roomNotAccepting'))
      setLoading(false)
      return
    }

    try {
      const result = await joinGameSession(sessionCode.trim(), username)
      if (!result.ok) {
        // The action reports failures as data now: a thrown one would reach us
        // redacted as "An error occurred in the Server Components render".
        setError(formatApiErrorInline(result.error, tErrors))
        return
      }
      sessionStorage.setItem(`participant_${result.sessionId}`, result.participantId)
      if (result.playerToken) {
        sessionStorage.setItem(`player_token_${result.sessionId}`, result.playerToken)
      }
      if (result.centrifugoToken) {
        sessionStorage.setItem(`centrifugo_token_${result.sessionId}`, result.centrifugoToken)
        sessionStorage.setItem(`centrifugo_client_${result.sessionId}`, result.centrifugoClientId || '')
      }
      sessionStorage.setItem(`nickname_${result.sessionId}`, username)
      sessionStorage.setItem(`pin_code_${result.sessionId}`, sessionCode.trim())
      router.push(`/play/${result.sessionId}`)
    } catch (err: any) {
      // A tab opened before the last deploy calls Server Action ids the running
      // build no longer has, and Next surfaces that as framework prose about
      // deployments. Reload once — the flag stops a genuinely broken build from
      // bouncing a player through reloads forever, and they then see the text.
      if (isStaleDeploymentError(err) && !sessionStorage.getItem(STALE_RELOAD_KEY)) {
        sessionStorage.setItem(STALE_RELOAD_KEY, '1')
        window.location.reload()
        return
      }
      setError(formatApiErrorInline(err?.message || err, tErrors))
    } finally {
      setLoading(false)
    }
  }

  const isJoinDisabled = loading || (roomStatus !== null && roomStatus !== 'waiting')

  return (
    <div className="space-y-8 pb-24 sm:pb-8">
      <form
        onSubmit={handleJoin}
        className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-5 sm:p-7 space-y-5"
        data-tour="join-form"
      >
        <div className="space-y-2">
          <label htmlFor="pin" className="text-sm font-medium text-[#c5c2ba]">{t('pinLabel')}</label>
          <Input
            id="pin"
            type="text"
            inputMode="numeric"
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            maxLength={6}
            className="h-14 bg-[#12141a] border-[#2c313d] focus-visible:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] text-center text-xl sm:text-2xl font-semibold tracking-[0.25em] sm:tracking-[0.35em] rounded-xl"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="nickname" className="text-sm font-medium text-[#c5c2ba]">{t('nicknameLabel')}</label>
          <Input
            id="nickname"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('nicknamePlaceholder')}
            maxLength={15}
            className="h-12 bg-[#12141a] border-[#2c313d] focus-visible:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl"
            required
          />
        </div>

        {roomStatus === 'waiting' && maxPlayers != null && (
          <p className="text-sm text-[#2dd4bf]">
            {playerCount ?? 0} / {maxPlayers} players
            {(playerCount ?? 0) >= maxPlayers ? ' - room full' : ''}
          </p>
        )}

        {error && (
          <div
            className="rounded-xl border border-[#ef4444]/25 bg-[#ef4444]/10 px-3.5 py-3 text-sm text-[#fca5a5]"
            role="alert"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          disabled={isJoinDisabled}
          className="w-full h-12 bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl disabled:opacity-40"
        >
          {loading ? (
            'Joining…'
          ) : (
            <span className="inline-flex items-center gap-2">
              {t('joinRoom')}
              <ArrowRight className="w-4 h-4" />
            </span>
          )}
        </Button>

        <p className="text-center text-sm text-[#9a9eab] pt-1">
          Hosting instead?{' '}
          <Link href="/sign-in" className="text-[#e85d4c] font-medium hover:underline inline-flex min-h-11 items-center px-3">
            {t('signIn')}
          </Link>
        </p>
      </form>

      {openRooms.length > 0 && (
        <div className="space-y-3" data-tour="open-rooms">
          <h2 className="text-sm font-medium text-[#9a9eab]">{t('openRooms')}</h2>
          <ul className="space-y-2 max-h-[50vh] overflow-y-auto overscroll-contain">
            {openRooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => setSessionCode(room.pin_code)}
                  className="w-full text-left rounded-xl border border-[#2c313d] bg-[#1a1d26]/70 hover:border-[#e85d4c]/40 px-4 py-3 transition-colors active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[#f2f0eb] truncate">{room.quiz_title}</p>
                      <p className="text-xs text-[#9a9eab] mt-0.5 font-mono tracking-wider truncate">
                        PIN {room.pin_code}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs text-[#9a9eab] shrink-0">
                      <Users className="w-3.5 h-3.5" />
                      {room.player_count}
                      {room.max_players ? `/${room.max_players}` : ''}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <TourButton tour={playerJoinTour(tTour)} label={t('guide')} position="bottom-right" />
    </div>
  )
}

export default function JoinPage() {
  const t = useTranslations('join')
  const tCommon = useTranslations('common')

  return (
    <GameBackground variant="arena">
      <div className="flex-1 flex items-start sm:items-center justify-center p-5 py-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center space-y-2">
            <BrandMark size="lg" />
            <p className="text-sm text-[#9a9eab]">{t('joinHint')}</p>
            <div className="flex justify-center pt-1">
              <LanguageSwitcher />
            </div>
          </div>

          <Suspense
            fallback={
              <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26] p-10 text-center text-[#9a9eab] text-sm">
                {tCommon('loading')}
              </div>
            }
          >
            <JoinForm />
          </Suspense>
        </div>
      </div>
    </GameBackground>
  )
}
