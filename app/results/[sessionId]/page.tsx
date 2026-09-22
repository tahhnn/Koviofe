'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getRoomResults } from '@/app/actions/game'
import { ThemedGameBackground } from '@/components/game-background'
import { BrandMark } from '@/components/brand-mark'
import { XCircle } from 'lucide-react'

/** How long this page follows a room that has not ended yet. */
const FOLLOW_ROOM_FOR_MS = 15 * 60 * 1000

interface Standing {
  id: string
  username: string
  totalPoints: number
  correctAnswers: number
  rank: number
  isYou: boolean
}

export default function ResultsPage() {
  const t = useTranslations('results')
  const tCommon = useTranslations('common')
  const params = useParams()
  const searchParams = useSearchParams()
  const sessionId = params.sessionId as string

  const [leaderboard, setLeaderboard] = useState<Standing[]>([])
  const [userRank, setUserRank] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isPlayer, setIsPlayer] = useState(false)
  const [themeConfig, setThemeConfig] = useState('')
  // Seeded from the URL the redirect carried, then replaced by the API's value
  // — which is what survives a reload, when the websocket push is long gone.
  const [endedReason, setEndedReason] = useState(searchParams.get('reason') || '')
  // Solo mode lets a player finish while the rest of the room is still
  // answering, and this page is where they land. Read once, it froze the
  // standings at the moment they arrived — first to finish read as first
  // place, and stayed that way however many people passed them afterwards.
  const [roomFinished, setRoomFinished] = useState(true)
  // A room nobody ever ends (the last players closed their tabs, the host
  // walked away) would otherwise be followed by this page for as long as the
  // tab is open. Stop, and stop claiming the standings are live.
  const [gaveUpFollowing, setGaveUpFollowing] = useState(false)

  const loadResults = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setLoadError(false)
    }
    try {
      const playerToken = sessionStorage.getItem(`player_token_${sessionId}`)
      setIsPlayer(!!playerToken)

      const { players, endedReason: reason, status, themeConfig: theme } = await getRoomResults(sessionId, playerToken || undefined)
      setThemeConfig(theme)
      setLeaderboard(players)
      setRoomFinished(status === 'finished')
      if (reason) setEndedReason(reason)

      // The backend flags the caller's own row: a finished room replays archived
      // rankings whose ids are positions, not player ids, so matching on the
      // stored participant id would land on an unrelated player. Fall back to
      // the nickname this browser joined with for rooms that predate the flag.
      const mine = players.find((p: Standing) => p.isYou)
      if (mine) {
        setUserRank(mine.rank)
      } else {
        const nickname = sessionStorage.getItem(`nickname_${sessionId}`)
        const byNickname = nickname
          ? players.find((p: Standing) => p.username === nickname)
          : undefined
        setUserRank(byNickname ? byNickname.rank : 0)
      }
    } catch (error) {
      console.error('Error loading results:', error)
      // A failed refresh keeps the standings already on screen: they are a few
      // seconds old, which beats replacing a readable podium with an error.
      if (!silent) setLoadError(true)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    loadResults()
  }, [loadResults])

  // Follow the room until it is actually over, then stop — a finished room's
  // standings are archived and cannot change, so polling one is pure noise.
  useEffect(() => {
    if (roomFinished || gaveUpFollowing) return
    const startedAt = Date.now()
    const id = setInterval(() => {
      if (Date.now() - startedAt > FOLLOW_ROOM_FOR_MS) {
        clearInterval(id)
        setGaveUpFollowing(true)
        return
      }
      void loadResults(true)
    }, 3000)
    return () => clearInterval(id)
  }, [roomFinished, gaveUpFollowing, loadResults])

  if (loading) {
    return (
      <ThemedGameBackground variant="arena" themeConfig={themeConfig} surface={isPlayer ? 'player' : 'host'}>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#9a9eab] text-sm">{t('loading')}</p>
        </div>
      </ThemedGameBackground>
    )
  }

  if (loadError) {
    return (
      <ThemedGameBackground variant="arena" themeConfig={themeConfig} surface={isPlayer ? 'player' : 'host'}>
        <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 sm:p-8 text-center">
            <XCircle className="w-8 h-8 text-[#e85d4c] mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[#f2f0eb]">{t('error')}</h1>
            <p className="text-sm text-[#9a9eab] mt-2 leading-relaxed">{t('errorHint')}</p>
            <Button
              onClick={() => loadResults()}
              size="lg"
              className="mt-6 w-full min-h-12 bg-[#f2f0eb] text-[#12141a] hover:bg-white font-semibold rounded-xl"
            >
              {t('retry')}
            </Button>
          </div>
        </div>
      </ThemedGameBackground>
    )
  }

  const top3 = leaderboard.slice(0, 3)
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3

  return (
    <ThemedGameBackground variant="arena" themeConfig={themeConfig} surface={isPlayer ? 'player' : 'host'}>
      <div className="flex-1 p-4 sm:p-6 md:p-10 flex items-start md:items-center justify-center overflow-y-auto">
        <div className="max-w-3xl xl:max-w-5xl w-full space-y-6 md:space-y-10">
          <div className="text-center space-y-3">
            <BrandMark size="sm" className="justify-center" />
            <h1 className="text-3xl md:text-4xl xl:text-6xl font-semibold tracking-tight text-[#f2f0eb]">
              {/* "You won" only once nobody can still overtake them. */}
              {userRank === 1 && roomFinished ? t('youFirst') : t('finalStandings')}
            </h1>
            <p className="text-[#9a9eab]">
              {userRank > 0 ? t('yourPlace', { rank: userRank }) : t('thanks')}
            </p>
            {!roomFinished && !gaveUpFollowing && (
              <div className="mx-auto max-w-md rounded-xl border border-[#2dd4bf]/35 bg-[#2dd4bf]/10 px-4 py-2.5 text-sm text-[#2dd4bf]">
                <span className="inline-flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[#2dd4bf] opacity-70 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[#2dd4bf]" />
                  </span>
                  <strong className="font-semibold">{t('liveTitle')}</strong>
                </span>
                <p className="mt-1 text-[#2dd4bf]/80 leading-relaxed">{t('liveHint')}</p>
              </div>
            )}
            {endedReason && (
              <div className="mx-auto max-w-md rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200/90">
                {/* One wording for both license reasons. A player has no idea
                    what a licence is, and the host's billing state is not
                    theirs to see. */}
                {isPlayer
                  ? t('endedEarly')
                  : endedReason === 'license_revoked'
                    ? t('endedEarlyHostRevoked')
                    : t('endedEarlyHostExpired')}
              </div>
            )}
          </div>

          {podiumOrder.length > 0 && (
            <div
              className={`grid ${
                podiumOrder.length >= 3
                  ? 'grid-cols-3'
                  : podiumOrder.length === 2
                    ? 'grid-cols-2 max-w-md mx-auto'
                    : 'grid-cols-1 max-w-xs mx-auto'
              } gap-2 sm:gap-3 md:gap-4 items-end`}
            >
              {podiumOrder.map((player, visualIndex) => {
                if (!player) return <div key={visualIndex} />
                const rank =
                  top3.length >= 3
                    ? visualIndex === 0
                      ? 2
                      : visualIndex === 1
                        ? 1
                        : 3
                    : visualIndex + 1
                const height =
                  rank === 1
                    ? 'min-h-[140px] md:min-h-[200px] xl:min-h-[260px]'
                    : rank === 2
                      ? 'min-h-[112px] md:min-h-[160px] xl:min-h-[210px]'
                      : 'min-h-[96px] md:min-h-[140px] xl:min-h-[180px]'
                return (
                  <div
                    key={`podium-${player.id}-${visualIndex}`}
                    className={`rounded-2xl border bg-[#1a1d26] p-2 sm:p-4 text-center flex flex-col justify-end ${height} ${
                      player.isYou ? 'border-[#e85d4c]' : 'border-[#2c313d]'
                    }`}
                  >
                    <p className="text-xs text-[#9a9eab] mb-1">#{rank}</p>
                    <p className="font-semibold text-[#f2f0eb] break-words line-clamp-2 text-xs sm:text-sm md:text-base xl:text-2xl">{player.username}</p>
                    <p className="text-sm xl:text-xl text-[#e85d4c] mt-1">
                      {player.totalPoints} {t('points')}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-5 md:p-6">
            <h2 className="text-lg font-semibold text-[#f2f0eb] mb-4">{t('leaderboard')}</h2>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-[#9a9eab]">{t('empty')}</p>
            ) : (
              <ul className="space-y-2 max-h-[50vh] md:max-h-[60vh] overflow-y-auto">
                {leaderboard.map((player, i) => (
                  <li
                    key={`leaderboard-${player.id}-${i}`}
                    className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${
                      player.isYou ? 'bg-[#e85d4c]/10 ring-1 ring-[#e85d4c]/40' : 'bg-[#12141a]/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm text-[#9a9eab] w-10 shrink-0 text-right tabular-nums">#{player.rank}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-[#f2f0eb] truncate xl:text-lg">
                          {player.username}
                          {player.isYou && (
                            <span className="ml-2 text-xs text-[#e85d4c]">({t('you')})</span>
                          )}
                        </p>
                        <p className="text-xs xl:text-sm text-[#9a9eab]">
                          {t('correctCount', { count: player.correctAnswers })}
                        </p>
                      </div>
                    </div>
                    <p className="font-semibold text-[#e85d4c] tabular-nums shrink-0">
                      {player.totalPoints}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isPlayer ? (
              <>
                <Link href="/join" className="w-full sm:w-auto">
                  <Button className="h-11 px-5 w-full sm:w-auto bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl">
                    {t('joinAnother')}
                  </Button>
                </Link>
                <Link href="/" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="h-11 px-5 w-full sm:w-auto border-[#2c313d] text-[#f2f0eb] hover:bg-white/5 rounded-xl"
                  >
                    {tCommon('home')}
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard" className="w-full sm:w-auto">
                  <Button className="h-11 px-5 w-full sm:w-auto bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl">
                    {t('hostAnother')}
                  </Button>
                </Link>
                <Link href="/" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="h-11 px-5 w-full sm:w-auto border-[#2c313d] text-[#f2f0eb] hover:bg-white/5 rounded-xl"
                  >
                    {tCommon('home')}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </ThemedGameBackground>
  )
}
