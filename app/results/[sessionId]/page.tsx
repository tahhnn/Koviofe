'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { getGameSession } from '@/app/actions/quizzes'
import { getLeaderboard } from '@/app/actions/game'
import { GameBackground } from '@/components/game-background'
import { BrandMark } from '@/components/brand-mark'

export default function ResultsPage() {
  const params = useParams()
  const sessionId = params.sessionId as string

  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [userRank, setUserRank] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isPlayer, setIsPlayer] = useState(false)

  useEffect(() => {
    const loadResults = async () => {
      try {
        const playerToken = sessionStorage.getItem(`player_token_${sessionId}`)
        setIsPlayer(!!playerToken)
        await getGameSession(sessionId, playerToken || undefined)
        const lb = await getLeaderboard(sessionId, playerToken || undefined)
        setLeaderboard(lb)

        const participantId =
          typeof window !== 'undefined'
            ? sessionStorage.getItem(`participant_${sessionId}`)
            : null
        if (participantId && Array.isArray(lb)) {
          const idx = lb.findIndex(
            (p: any) =>
              String(p.participantId) === String(participantId) ||
              String(p.id) === String(participantId)
          )
          if (idx >= 0) setUserRank(idx + 1)
        }
      } catch (error) {
        console.error('Error loading results:', error)
      } finally {
        setLoading(false)
      }
    }

    loadResults()
  }, [sessionId])

  if (loading) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#9a9eab] text-sm">Loading results…</p>
        </div>
      </GameBackground>
    )
  }

  const top3 = leaderboard.slice(0, 3)
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3

  return (
    <GameBackground variant="arena">
      <div className="flex-1 p-4 sm:p-6 md:p-10 flex items-start md:items-center justify-center overflow-y-auto">
        <div className="max-w-3xl xl:max-w-5xl w-full space-y-6 md:space-y-10">
          <div className="text-center space-y-3">
            <BrandMark size="sm" className="justify-center" />
            <h1 className="text-3xl md:text-4xl xl:text-6xl font-semibold tracking-tight text-[#f2f0eb]">
              {userRank === 1 ? 'You finished first' : 'Final standings'}
            </h1>
            <p className="text-[#9a9eab]">
              {userRank > 0 ? `Your place: #${userRank}` : 'Thanks for playing'}
            </p>
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
                    key={`podium-${player.id || player.participantId || player.username}-${visualIndex}`}
                    className={`rounded-2xl border border-[#2c313d] bg-[#1a1d26] p-2 sm:p-4 text-center flex flex-col justify-end ${height}`}
                  >
                    <p className="text-xs text-[#9a9eab] mb-1">#{rank}</p>
                    <p className="font-semibold text-[#f2f0eb] break-words line-clamp-2 text-xs sm:text-sm md:text-base xl:text-2xl">{player.username}</p>
                    <p className="text-sm xl:text-xl text-[#e85d4c] mt-1">{player.totalPoints} pts</p>
                  </div>
                )
              })}
            </div>
          )}

          <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-5 md:p-6">
            <h2 className="text-lg font-semibold text-[#f2f0eb] mb-4">Leaderboard</h2>
            <ul className="space-y-2 max-h-[50vh] md:max-h-[60vh] overflow-y-auto">
              {leaderboard.map((player, i) => (
                <li
                  key={`leaderboard-${player.id || player.participantId || player.username}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[#12141a]/80 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-[#9a9eab] w-10 shrink-0 text-right tabular-nums">#{i + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-[#f2f0eb] truncate xl:text-lg">{player.username}</p>
                      <p className="text-xs xl:text-sm text-[#9a9eab]">
                        {player.correctAnswers ?? 0} correct
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold text-[#e85d4c] tabular-nums shrink-0">
                    {player.totalPoints}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isPlayer ? (
              <>
                <Link href="/join" className="w-full sm:w-auto">
                  <Button className="h-11 px-5 w-full sm:w-auto bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl">
                    Join another
                  </Button>
                </Link>
                <Link href="/" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="h-11 px-5 w-full sm:w-auto border-[#2c313d] text-[#f2f0eb] hover:bg-white/5 rounded-xl"
                  >
                    Home
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard" className="w-full sm:w-auto">
                  <Button className="h-11 px-5 w-full sm:w-auto bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl">
                    Host another
                  </Button>
                </Link>
                <Link href="/" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="h-11 px-5 w-full sm:w-auto border-[#2c313d] text-[#f2f0eb] hover:bg-white/5 rounded-xl"
                  >
                    Home
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </GameBackground>
  )
}
