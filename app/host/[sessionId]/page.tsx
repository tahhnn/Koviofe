'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { XCircle, MapPin } from 'lucide-react'
import { useWebSocket } from '@/hooks/use-websocket'
import { QRCodeComponent } from '@/components/qr-code'
import {
  getGameSession,
  startGameSession,
  endGameSession,
  updateRoomPrivacy,
} from '@/app/actions/quizzes'
import { getQuestionByIndex, getAllQuestionsForDisplay, getLeaderboard, getAnswerStats, updateGameSessionState, getQuizQuestionsCount, endQuestion } from '@/app/actions/game'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { GameBackground } from '@/components/game-background'
import { TourButton } from '@/components/tour-button'
import { hostRoomTour } from '@/lib/tours'
import { resolveApiError, isAuthError, type ResolvedApiError } from '@/lib/api-errors'
import Link from 'next/link'

interface Option {
  id: string
  optionText: string
  isCorrect: boolean
  mediaUrl?: string
}

interface Question {
  id: string
  questionText: string
  timeLimit: number
  options: Option[]
  type?: string
  correctAnswer?: string
}

const parseQuestionContent = (contentStr: string) => {
  try {
    const parsed = JSON.parse(contentStr)
    if (parsed && typeof parsed === 'object' && ('text' in parsed || 'mediaUrl' in parsed)) {
      return {
        text: parsed.text || '',
        mediaUrl: parsed.mediaUrl || '',
      }
    }
  } catch {}
  return {
    text: contentStr || '',
    mediaUrl: '',
  }
}

export default function HostGameScreen() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string

  const [gameState, setGameState] = useState<any>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [answerStats, setAnswerStats] = useState<any>([])
  const [loading, setLoading] = useState(true)
  const [gameStarted, setGameStarted] = useState(false)
  const [showAnswers, setShowAnswers] = useState(false)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [actionLoading, setActionLoading] = useState(false)
  const [privacyLoading, setPrivacyLoading] = useState(false)
  const [accessError, setAccessError] = useState<ResolvedApiError | null>(null)
  const [startCountdown, setStartCountdown] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [pinAspect, setPinAspect] = useState<number | null>(null)
  const [soloQuestions, setSoloQuestions] = useState<Question[]>([])
  const [soloIndex, setSoloIndex] = useState(0)
  const questionStartRef = useRef<number>(0)

  const isPlayerPaced = (() => {
    try {
      return JSON.parse(gameState?.themeConfig || '{}').game_mode === 'player_paced'
    } catch {
      return false
    }
  })()

  const { connected, send, on } = useWebSocket(sessionId, gameState?.sessionCode)

  const [joinUrl, setJoinUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && gameState?.sessionCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derive join URL from window.location (external system), intentional
      setJoinUrl(`${window.location.origin}/join?pin=${gameState.sessionCode}`)
    }
  }, [gameState?.sessionCode])

  useEffect(() => {
    questionStartRef.current = Date.now()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset measured aspect before paint, intentional
    setPinAspect(null)
  }, [currentQuestion?.id])

  useEffect(() => {
    if (!currentQuestion || !gameStarted || showAnswers) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear countdown before paint when timer is inactive, intentional
      setTimeLeft(null)
      return
    }
    const compute = () => {
      const activeUntil = gameState?.questionActiveUntil
      const endsAt = activeUntil
        ? Date.parse(activeUntil)
        : questionStartRef.current + (currentQuestion.timeLimit || 30) * 1000
      setTimeLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    }
    compute()
    const id = setInterval(compute, 1000)
    return () => clearInterval(id)
  }, [currentQuestion, gameStarted, showAnswers, gameState?.questionActiveUntil])

  // Solo mode: load full question list so the projected host screen can display questions
  useEffect(() => {
    if (!gameStarted || !isPlayerPaced) return
    let active = true
    getAllQuestionsForDisplay(sessionId)
      .then((qs) => {
        if (active) setSoloQuestions(qs as Question[])
      })
      .catch((e) => console.error('Error loading solo questions:', e))
    return () => {
      active = false
    }
  }, [gameStarted, isPlayerPaced, sessionId])

  const handleCopyLink = () => {
    if (joinUrl) {
      navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Load game state
  useEffect(() => {
    let active = true
    const loadGameState = async () => {
      try {
        // 1. Security check: ensure user is authenticated first
        const authSession = await authClient.getSession()
        if (!authSession?.user) {
          if (active) {
            await authClient.signOut()
          }
          return
        }

        // 2. Fetch game session details
        const session = await getGameSession(sessionId)
        if (!session) {
          if (active) {
            setAccessError(resolveApiError('Room not found'))
            setLoading(false)
          }
          return
        }

        // 3. Verify user is indeed the host of this session
        if (String(session.hostUserId) !== String(authSession.user.id)) {
          if (active) {
            setAccessError(resolveApiError('You do not own this room'))
            setLoading(false)
          }
          return
        }

        if (!active) return

        if (session.status === 'finished') {
          if (active) router.push(`/results/${sessionId}`)
          return
        }

        setGameState(session)
        setGameStarted(session.status === 'playing')

        // Get total questions count (we need the quiz data)
        if (session.currentQuestionIndex !== undefined) {
          const count = await getQuizQuestionsCount(sessionId)
          setTotalQuestions(count)

          if (session.status === 'playing') {
            const current = await getQuestionByIndex(sessionId, session.currentQuestionIndex)
            setCurrentQuestion(current)

            const lb = await getLeaderboard(sessionId)
            setLeaderboard(lb)

            if (current) {
              const stats = await getAnswerStats(sessionId, current.id)
              setAnswerStats(stats)
            }
          }
        }
        setLoading(false)
      } catch (error: any) {
        console.error('Error loading game state:', error)
        if (!active) return
        if (isAuthError(error)) {
          await authClient.signOut()
          return
        }
        setAccessError(resolveApiError(error?.message || error))
        setLoading(false)
      }
    }

    loadGameState()
    return () => {
      active = false
    }
  }, [sessionId, router])

  // Lobby / live poll — keeps player list + solo scoreboard fresh if WS misses events
  useEffect(() => {
    if (loading) return
    let cancelled = false
    const refresh = async () => {
      try {
        const session = await getGameSession(sessionId)
        if (cancelled) return
        setGameState(session)
        if (gameStarted) {
          const lb = await getLeaderboard(sessionId)
          if (!cancelled) setLeaderboard(lb)
        }
      } catch {
        /* ignore */
      }
    }
    refresh()
    const id = setInterval(refresh, gameStarted ? 2000 : 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [sessionId, gameStarted, loading])

  // A thousand answers in twenty seconds used to fire two thousand requests here
  // — one leaderboard fetch and one stats fetch per answer — and getLeaderboard
  // is the heavy GET /api/rooms/:id. The host only needs the numbers to look
  // current, so mark the state dirty on each event and refresh on a timer.
  const answersDirty = useRef(false)
  const refreshingRef = useRef(false)
  const currentQuestionRef = useRef(currentQuestion)
  currentQuestionRef.current = currentQuestion

  useEffect(() => {
    if (!connected) return
    const id = setInterval(async () => {
      if (!answersDirty.current || refreshingRef.current) return
      // Clear before awaiting: an answer arriving mid-refresh must re-arm the
      // flag, or the last answers of a question never reach the screen.
      answersDirty.current = false
      refreshingRef.current = true
      try {
        const lb = await getLeaderboard(sessionId)
        setLeaderboard(lb)
        const q = currentQuestionRef.current
        if (q) {
          const stats = await getAnswerStats(sessionId, q.id)
          setAnswerStats(stats)
        }
      } catch {
        /* a dropped refresh is corrected by the next tick */
      } finally {
        refreshingRef.current = false
      }
    }, 1000)
    return () => clearInterval(id)
  }, [connected, sessionId])

  // Handle WebSocket events
  useEffect(() => {
    if (!connected) return

    const unsubAnswers = on('answer_submitted', () => {
      answersDirty.current = true
    })

    const unsubJoined = on('player:joined', async (payload) => {
      if (payload?.nickname) {
        setGameState((prev: any) => {
          if (!prev) return prev
          const exists = (prev.participants || []).some(
            (p: any) => String(p.id) === String(payload.player_id)
          )
          if (exists) return prev
          return {
            ...prev,
            participants: [
              ...(prev.participants || []),
              {
                id: String(payload.player_id),
                sessionId: String(prev.id),
                username: payload.nickname,
                isAnonymous: true,
              },
            ],
          }
        })
      }
      try {
        const session = await getGameSession(sessionId)
        setGameState(session)
      } catch (e) {
        console.error('Refresh after join failed', e)
      }
    })

    const unsubLeft = on('player:left', async () => {
      const session = await getGameSession(sessionId)
      setGameState(session)
    })

    return () => {
      unsubAnswers()
      unsubJoined()
      unsubLeft()
    }
  }, [connected, on, sessionId, currentQuestion])

  const handleTogglePrivacy = async () => {
    if (privacyLoading || gameStarted || !gameState) return
    setPrivacyLoading(true)
    const nextPrivate = !gameState.isPrivate
    try {
      await updateRoomPrivacy(sessionId, nextPrivate)
      setGameState((prev: any) => (prev ? { ...prev, isPrivate: nextPrivate } : prev))
    } catch (error) {
      console.error('Error updating room privacy:', error)
    } finally {
      setPrivacyLoading(false)
    }
  }

  const handleStartGame = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      let config: any = {}
      try {
        config = JSON.parse(gameState?.themeConfig || '{}')
      } catch {
        config = {}
      }
      const isSolo = config.game_mode === 'player_paced'

      // 1. Start the game (solo: assigns each player's first question + publishes game:started)
      await startGameSession(sessionId)

      // Shared 3-2-1-GO start animation (classic + solo)
      setStartCountdown(3)
      let currentCount = 3
      const interval = setInterval(async () => {
        currentCount -= 1
        if (currentCount > 0) {
          setStartCountdown(currentCount)
        } else if (currentCount === 0) {
          setStartCountdown(0) // Show "GO!"
        } else {
          clearInterval(interval)
          setStartCountdown(null)

          if (!isSolo) {
            // Classic: advance to first question in DB and notify players
            await updateGameSessionState(sessionId, 'next', 0)
          }

          setGameStarted(true)
          setGameState((prev: any) =>
            prev
              ? {
                  ...prev,
                  currentQuestionIndex: 0,
                  status: 'playing',
                }
              : prev
          )
          const question = await getQuestionByIndex(sessionId, 0)
          setCurrentQuestion(question)

          const lb = await getLeaderboard(sessionId)
          setLeaderboard(lb)
          const session = await getGameSession(sessionId)
          setGameState(session)
        }
      }, 1000)
    } catch (error) {
      console.error('Error starting game:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleNextQuestion = async () => {
    if (actionLoading) return
    setActionLoading(true)
    const nextIndex = ((gameState?.currentQuestionIndex !== undefined ? gameState.currentQuestionIndex : -1)) + 1
    try {
      // Use 'next' status so that the backend increments the question index
      await updateGameSessionState(sessionId, 'next', nextIndex)
      
      // Update local state immediately to change the button from "Next Question" to "End Game" without delay
      setGameState((prev: any) => prev ? { ...prev, currentQuestionIndex: nextIndex } : prev)

      const question = await getQuestionByIndex(sessionId, nextIndex)
      setCurrentQuestion(question)
      setShowAnswers(false)
      setAnswerStats([])

      const lb = await getLeaderboard(sessionId)
      setLeaderboard(lb)

      send({ type: 'next_question', questionIndex: nextIndex })
    } catch (error) {
      console.error('Error moving to next question:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRevealAnswer = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      await endQuestion(sessionId)
      setShowAnswers(true)

      const lb = await getLeaderboard(sessionId)
      setLeaderboard(lb)

      if (currentQuestion) {
        const stats = await getAnswerStats(sessionId, currentQuestion.id)
        setAnswerStats(stats)
      }

      send({ type: 'reveal_answer' })
    } catch (error) {
      console.error('Error revealing answer:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const handleEndGame = async () => {
    if (actionLoading) return
    setActionLoading(true)
    try {
      await endGameSession(sessionId)
      send({ type: 'end_game' })
      router.push(`/results/${sessionId}`)
    } catch (error) {
      console.error('Error ending game:', error)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#9a9eab] text-sm">Loading room…</p>
        </div>
      </GameBackground>
    )
  }

  if (accessError) {
    if (accessError.requiresLogin) {
      void authClient.signOut()
      return (
        <GameBackground variant="arena">
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#9a9eab] text-sm">Đang chuyển đến trang đăng nhập…</p>
          </div>
        </GameBackground>
      )
    }
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-8 space-y-5 text-center">
            <h1 className="text-xl font-semibold text-[#f2f0eb]">{accessError.title}</h1>
            <p className="text-sm text-[#9a9eab] leading-relaxed">{accessError.description}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              {accessError.href && (
                <Link href={accessError.href}>
                  <Button className="w-full sm:w-auto bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-semibold rounded-xl h-11 px-6 border-none">
                    {accessError.hrefLabel || 'Tiếp tục'}
                  </Button>
                </Link>
              )}
              {accessError.secondaryHref && (
                <Link href={accessError.secondaryHref}>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-[#2c313d] text-[#f2f0eb] hover:bg-white/5 rounded-xl h-11 px-6"
                  >
                    {accessError.secondaryHrefLabel || 'Tùy chọn khác'}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </GameBackground>
    )
  }

  return (
    <GameBackground variant="arena">
      {startCountdown !== null && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-[#12141a] via-[#1a1d26] to-[#12141a] select-none">
          <div className="text-center space-y-8">
            <p className="text-xl md:text-2xl xl:text-4xl font-bold tracking-wider text-indigo-400 uppercase animate-pulse">
              {startCountdown === 0 ? 'Chuẩn bị...' : 'Trận đấu bắt đầu sau'}
            </p>
            <div className="relative h-40 sm:h-56 md:h-64 flex items-center justify-center">
              <span
                key={startCountdown}
                className="text-8xl sm:text-9xl md:text-[10rem] font-extrabold text-[#e85d4c] drop-shadow-[0_0_50px_rgba(232,93,76,0.3)] animate-bounce inline-block select-none"
              >
                {startCountdown === 0 ? 'GO!' : startCountdown}
              </span>
            </div>
            <p className="text-sm xl:text-lg text-gray-500 max-w-xs xl:max-w-lg mx-auto leading-relaxed">
              {startCountdown === 0 ? 'Chúc các bạn may mắn!' : 'Hãy sẵn sàng trả lời nhanh để đạt điểm tối đa!'}
            </p>
          </div>
        </div>
      )}
      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 pb-24 sm:pb-24 md:pb-24 lg:pb-8">

      <div className="max-w-7xl xl:max-w-[1500px] 2xl:max-w-[1750px] mx-auto space-y-8 z-10 relative">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 p-5 md:p-6" data-tour="host-room-header">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl md:text-2xl xl:text-3xl font-semibold text-[#f2f0eb] tracking-tight">Host room</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-[#9a9eab]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-[#2dd4bf]' : 'bg-[#e85d4c]'}`}
                />
                {connected ? 'Live' : 'Connecting…'}
              </span>
              <span>
                Players{' '}
                <strong className="text-[#f2f0eb] font-medium">
                  {gameState?.participants?.length ?? 0}
                  {gameState?.maxPlayers ? ` / ${gameState.maxPlayers}` : ''}
                </strong>
              </span>
              {gameStarted && (
                <span>
                  Question{' '}
                  <strong className="text-[#f2f0eb] font-medium">
                    {(gameState?.currentQuestionIndex || 0) + 1}
                  </strong>{' '}
                  / {totalQuestions}
                </span>
              )}
            </div>
          </div>
          <div className="text-left sm:text-right" data-tour="pin-display">
            <p className="text-xs text-[#9a9eab]">PIN</p>
            <p className="text-2xl lg:text-3xl xl:text-5xl break-all font-semibold tracking-[0.2em] font-mono text-[#e85d4c]">
              {gameState?.sessionCode}
            </p>
          </div>
        </header>

        {!gameStarted ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8">
            <div className="md:col-span-7 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 p-6 md:p-8 flex flex-col min-h-[320px] sm:min-h-[420px] lg:min-h-[480px]">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-[#f2f0eb]">Lobby</h2>
                  <p className="text-sm text-[#9a9eab] mt-1">
                    {gameState?.maxPlayers
                      ? `Up to ${gameState.maxPlayers} players on your plan`
                      : 'Waiting for players'}
                  </p>
                </div>
                <span className="text-sm text-[#9a9eab] shrink-0">
                  {gameState?.participants?.length ?? 0}
                  {gameState?.maxPlayers ? ` / ${gameState.maxPlayers}` : ''}
                </span>
              </div>

              {/* Privacy toggle */}
              <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-[#2c313d] bg-[#12141a]/80 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#f2f0eb]">
                    {gameState?.isPrivate ? 'Private room' : 'Open room'}
                  </p>
                  <p className="text-xs text-[#9a9eab] mt-0.5 leading-relaxed">
                    {gameState?.isPrivate
                      ? 'Only people with the PIN or invite link can join.'
                      : 'Listed on the open lobby. Anyone can discover this PIN.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!gameState?.isPrivate}
                  aria-label="Private room"
                  disabled={privacyLoading}
                  onClick={handleTogglePrivacy}
                  className={`relative before:absolute before:-inset-2.5 before:content-[''] h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e85d4c]/50 ${
                    gameState?.isPrivate ? 'bg-[#e85d4c]' : 'bg-[#2c313d]'
                  } ${privacyLoading ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                      gameState?.isPrivate ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto mb-6 rounded-xl border border-[#2c313d] bg-[#12141a]/60 p-4 min-h-[180px] max-h-[40vh] lg:max-h-[46vh]">
                {(gameState?.participants?.length ?? 0) === 0 ? (
                  <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center px-4">
                    <p className="text-sm text-[#9a9eab] max-w-xs leading-relaxed">
                      Share the QR or PIN. Players appear here as they join.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {gameState?.participants.map((p: any, i: number) => (
                      <div
                        key={`participant-${p.id || i}-${i}`}
                        className="px-3 py-1.5 rounded-lg border border-[#2c313d] bg-[#1a1d26] text-sm font-medium text-[#f2f0eb] max-w-[45%] sm:max-w-48 truncate"
                      >
                        {p.username}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={handleStartGame}
                disabled={(gameState?.participants?.length ?? 0) === 0 || actionLoading}
                size="lg"
                data-tour="start-game-btn"
                className="w-full h-12 bg-[#e85d4c] text-[#fff8f5] hover:bg-[#d44e3e] font-semibold rounded-xl disabled:opacity-40"
              >
                {actionLoading ? 'Starting…' : 'Start game'}
              </Button>
            </div>

            <div className="md:col-span-5 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 p-6 md:p-8 flex flex-col items-center justify-center text-center" data-tour="qr-invite">
              <h3 className="text-lg font-semibold text-[#f2f0eb]">Invite</h3>
              <p className="text-sm text-[#9a9eab] mt-1 mb-6 max-w-xs">
                Scan to join, or copy the link for your group chat.
              </p>

              <div className="mb-6 rounded-xl border border-[#2c313d]">
                {joinUrl ? (
                  <QRCodeComponent value={joinUrl} size={320} className="w-full max-w-[200px] lg:max-w-[260px] xl:max-w-[320px]" />
                ) : (
                  <div className="aspect-square w-full max-w-45 flex items-center justify-center text-[#9a9eab] text-sm">
                    Preparing QR…
                  </div>
                )}
              </div>

              <div className="w-full max-w-xs mb-6">
                <p className="text-xs text-[#9a9eab] mb-2">PIN</p>
                <div className="rounded-xl border border-[#2c313d] bg-[#12141a] py-3">
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-[0.15em] break-all font-mono text-[#e85d4c] select-all">
                    {gameState?.sessionCode}
                  </p>
                </div>
              </div>

              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="w-full max-w-sm border-[#2c313d] text-[#f2f0eb] hover:bg-white/5 h-11 rounded-xl"
              >
                {copied ? 'Link copied' : 'Copy invite link'}
              </Button>
            </div>
          </div>
        ) : (
          // Game Arena Active Playing Screen
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {(() => {
              const config = (() => {
                try {
                  return JSON.parse(gameState?.themeConfig || '{}')
                } catch {
                  return {}
                }
              })()
              const isPlayerPaced = config.game_mode === 'player_paced'

              if (isPlayerPaced) {
                const scoreById = new Map(
                  (leaderboard || []).map((p: any) => [String(p.id || p.participantId), p])
                )
                const standings = (gameState?.participants || [])
                  .map((p: any) => {
                    const scored = scoreById.get(String(p.id))
                    return {
                      id: String(p.id),
                      username: scored?.username || p.username || 'Player',
                      totalPoints: scored?.totalPoints ?? 0,
                      correctAnswers: scored?.correctAnswers ?? 0,
                    }
                  })
                  .sort((a: any, b: any) => b.totalPoints - a.totalPoints)

                // Fallback if participants empty but leaderboard has rows
                const rows =
                  standings.length > 0
                    ? standings
                    : (leaderboard || []).map((p: any) => ({
                        id: String(p.id || p.participantId),
                        username: p.username,
                        totalPoints: p.totalPoints ?? 0,
                        correctAnswers: p.correctAnswers ?? 0,
                      }))

                const soloQuestion = soloQuestions[soloIndex] || null
                const soloContent = soloQuestion ? parseQuestionContent(soloQuestion.questionText) : null

                return (
                  <div className="md:col-span-12 space-y-6">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-6 md:p-8 backdrop-blur-md shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
                      <div className="text-center sm:text-left">
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Solo Arena Mode Active</span>
                        <h2 className="text-2xl md:text-3xl xl:text-4xl font-black text-white mt-1">Live Arena Scoreboard</h2>
                        <p className="text-gray-400 text-sm mt-1">
                          {rows.length} player{rows.length === 1 ? '' : 's'} in the arena — scores refresh live.
                        </p>
                      </div>
                      <Button
                        onClick={handleEndGame}
                        disabled={actionLoading}
                        size="lg"
                        className="bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-extrabold w-full sm:w-auto whitespace-normal leading-tight text-sm sm:text-base px-5 sm:px-8 h-auto min-h-12 py-3 rounded-2xl shadow-lg transition-all border-none cursor-pointer"
                      >
                        {actionLoading ? 'Closing Arena...' : 'End Game Arena & Show Podium 🏆'}
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                      {/* Question display — answers are hidden, players race at their own pace */}
                      <div className="lg:col-span-8 bg-gradient-to-r from-purple-900/40 via-pink-900/10 to-indigo-900/40 border border-white/10 rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl backdrop-blur-sm relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-purple-500 to-blue-500"></div>
                        <div className="flex items-center justify-between gap-4 mb-4">
                          <span className="text-xs font-bold uppercase tracking-widest text-[#e85d4c]">
                            Câu hỏi {soloQuestions.length > 0 ? soloIndex + 1 : 0} / {soloQuestions.length}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => setSoloIndex((i) => Math.max(0, i - 1))}
                              disabled={soloIndex === 0 || soloQuestions.length === 0}
                              variant="outline"
                              size="sm"
                              aria-label="Câu trước"
                              className="border-white/10 text-white hover:bg-white/10 rounded-xl h-9 w-9 p-0 disabled:opacity-30"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => setSoloIndex((i) => Math.min(soloQuestions.length - 1, i + 1))}
                              disabled={soloIndex >= soloQuestions.length - 1 || soloQuestions.length === 0}
                              variant="outline"
                              size="sm"
                              aria-label="Câu sau"
                              className="border-white/10 text-white hover:bg-white/10 rounded-xl h-9 w-9 p-0 disabled:opacity-30"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {soloQuestions.length === 0 ? (
                          <div className="py-16 text-center text-gray-500 font-bold">Đang tải câu hỏi…</div>
                        ) : soloQuestion && soloContent ? (
                          <>
                            <h2 className="text-xl sm:text-2xl md:text-4xl xl:text-5xl break-words font-extrabold text-white leading-snug">
                              {soloContent.text}
                            </h2>
                            {soloContent.mediaUrl && (
                              <div className="mt-4 w-full aspect-video max-h-64 md:max-h-80 xl:max-h-[420px] rounded-2xl overflow-hidden border border-white/5 bg-black/40 flex items-center justify-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={soloContent.mediaUrl} alt="Question media" className="w-full h-full object-contain" />
                              </div>
                            )}

                            {soloQuestion.type === 'short_answer' ? (
                              <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 text-center backdrop-blur-md">
                                <h3 className="text-lg font-bold text-white">Câu hỏi tự luận</h3>
                                <p className="text-gray-400 text-sm mt-1">Người chơi tự nhập câu trả lời trên thiết bị của mình.</p>
                              </div>
                            ) : soloQuestion.type === 'pin_answer' ? (
                              <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 text-center backdrop-blur-md">
                                <h3 className="text-lg font-bold text-white flex items-center justify-center gap-2">
                                  <MapPin className="w-4 h-4 text-[#e85d4c]" /> Câu hỏi ghim vị trí
                                </h3>
                                <p className="text-gray-400 text-sm mt-1">Người chơi ghim vị trí trên ảnh ở thiết bị của mình.</p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                                {(soloQuestion.options || []).map((option, index) => {
                                  const badges = [
                                    'from-rose-500 to-pink-600 text-white shadow-rose-500/20',
                                    'from-blue-500 to-indigo-600 text-white shadow-blue-500/20',
                                    'from-emerald-500 to-teal-600 text-white shadow-emerald-500/20',
                                    'from-amber-400 to-orange-500 text-white shadow-amber-500/20',
                                  ]
                                  const icons = ['▲', '◆', '●', '■']
                                  return (
                                    <div
                                      key={`solo-option-${option.id || index}-${index}`}
                                      className="relative p-4 sm:p-5 xl:p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md overflow-hidden"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-gradient-to-r font-black text-sm shadow-md ${badges[index % badges.length]}`}>
                                          {icons[index % icons.length]}
                                        </div>
                                        <div className="flex flex-col gap-2 min-w-0">
                                          {option.optionText ? (
                                            <div className="text-white font-bold text-base md:text-lg xl:text-2xl leading-snug">{option.optionText}</div>
                                          ) : null}
                                          {option.mediaUrl ? (
                                            <div className="w-28 h-20 sm:w-36 sm:h-24 xl:w-52 xl:h-36 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img src={option.mediaUrl} alt="Option media" className="w-full h-full object-contain" />
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>

                      {/* Standings sidebar */}
                      <div className="lg:col-span-4 bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-6 backdrop-blur-md shadow-2xl h-fit">
                        <h3 className="text-lg font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                          <span>🏆</span> Arena Standings
                        </h3>
                        <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3">
                          {rows.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 font-bold">
                              No players in this room yet.
                            </div>
                          ) : (
                            rows.map((player: any, i: number) => {
                              const isTop3 = i < 3
                              const medals = ['🥇', '🥈', '🥉']
                              const colors = [
                                'from-amber-500/10 to-transparent border-amber-500/25 text-amber-300',
                                'from-slate-400/10 to-transparent border-slate-400/25 text-slate-300',
                                'from-amber-700/10 to-transparent border-amber-700/25 text-amber-600',
                              ]
                              const cardBg = isTop3
                                ? `bg-gradient-to-r ${colors[i]}`
                                : 'bg-black/30 border-white/5 text-gray-300'

                              return (
                                <div
                                  key={`leaderboard-paced-${player.id || i}-${i}`}
                                  className={`flex items-center justify-between p-3 sm:p-4 border rounded-2xl shadow-md ${cardBg}`}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="text-center shrink-0 min-w-8 w-auto px-1.5 h-8 rounded-lg bg-black/40 flex items-center justify-center font-black text-xs sm:text-sm">
                                      {isTop3 ? medals[i] : `#${i + 1}`}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-bold text-white text-sm truncate">{player.username}</p>
                                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
                                        {player.correctAnswers} correct
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0 pl-3">
                                    <p className="font-black text-[#e85d4c] text-lg leading-none">{player.totalPoints}</p>
                                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">pts</p>
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }

              // Classic Mode: Left Question panel, Right Leaderboard sidebar
              return (
                <>
                  {/* Main Question & Answer Panel */}
                  <div className="md:col-span-12 lg:col-span-8 space-y-6">
                    {currentQuestion && (
                      <>
                        {/* Current Question Glass Card */}
                        {(() => {
                          const parsedContent = parseQuestionContent(currentQuestion.questionText)
                          return (
                            <div className="bg-gradient-to-r from-purple-900/40 via-pink-900/10 to-indigo-900/40 border border-white/10 rounded-3xl p-4 sm:p-6 md:p-8 shadow-2xl backdrop-blur-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-purple-500 to-blue-500"></div>
                              <span className="text-xs font-bold uppercase tracking-widest text-[#e85d4c] mb-2 block">Active Quiz Question</span>
                              {timeLeft !== null && !showAnswers && (
                                <div className="flex items-center gap-3 mb-4">
                                  <span className={`inline-flex items-center justify-center min-w-14 px-3 py-1.5 rounded-xl border text-xl md:text-2xl xl:text-4xl font-black tabular-nums ${timeLeft <= 5 ? 'border-[#e85d4c]/50 bg-[#e85d4c]/10 text-[#e85d4c]' : 'border-white/10 bg-black/40 text-white'}`}>
                                    {timeLeft}s
                                  </span>
                                  <div className="flex-1 h-2 rounded-full bg-black/40 overflow-hidden">
                                    <div
                                      className="h-full bg-[#e85d4c] transition-[width] duration-1000 ease-linear"
                                      style={{ width: `${Math.min(100, (timeLeft / (currentQuestion.timeLimit || 30)) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                              <h2 className="text-xl sm:text-2xl md:text-4xl xl:text-5xl break-words font-extrabold text-white leading-snug">
                                {parsedContent.text}
                              </h2>
                              {parsedContent.mediaUrl && currentQuestion.type !== 'pin_answer' && (
                                <div className="mt-4 w-full aspect-video max-h-64 md:max-h-80 xl:max-h-[420px] rounded-2xl overflow-hidden border border-white/5 bg-black/40 flex items-center justify-center">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={parsedContent.mediaUrl} alt="Question media" className="w-full h-full object-contain" />
                                </div>
                              )}

                              {/* Mode-specific answer panel */}
                          {currentQuestion.type === 'short_answer' ? (
                            <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 md:p-8 text-center backdrop-blur-md shadow-lg">
                              {showAnswers ? (
                                <div className="space-y-4">
                                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Correct Answer</span>
                                  <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-emerald-400 tracking-wide break-words">
                                    {currentQuestion.correctAnswer || 'No Answer Set'}
                                  </h3>
                                  {answerStats?.mode === 'short_answer' && answerStats.entries?.length > 0 && (
                                    <div className="mt-4 space-y-2 text-left max-w-md xl:max-w-2xl mx-auto">
                                      {answerStats.entries.slice(0, 5).map((entry: any) => (
                                        <div key={entry.text} className="flex justify-between text-sm xl:text-lg text-gray-300 bg-black/20 rounded-lg px-3 py-2">
                                          <span className="truncate">{entry.text}</span>
                                          <span className="text-white font-bold">{entry.count}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-3 py-6">
                                  <h3 className="text-xl font-bold text-white">Short Answer Mode</h3>
                                  <p className="text-gray-400 text-sm">Players are typing their answers. Results will be shown on Reveal.</p>
                                </div>
                              )}
                            </div>
                          ) : currentQuestion.type === 'pin_answer' ? (
                            <div className="mt-8 space-y-4">
                              {(() => {
                                const media = parseQuestionContent(currentQuestion.questionText).mediaUrl
                                const pinStats = answerStats?.mode === 'pin' ? answerStats : null
                                const target = String(currentQuestion.correctAnswer || pinStats?.correctAnswer || '50,50').split(',')
                                const tx = parseFloat(target[0]) || 50
                                const ty = parseFloat(target[1]) || 50
                                if (!media) {
                                  return (
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 md:p-8 text-center text-gray-400">
                                      Add an image to this pin question in the quiz editor.
                                    </div>
                                  )
                                }
                                return (
                                  <div className="space-y-3">
                                    <p className="text-sm xl:text-lg text-gray-400 flex items-center gap-1.5">
                                      <MapPin className="w-4 h-4 text-[#e85d4c]" />
                                      {pinStats ? `${pinStats.total} pin${pinStats.total === 1 ? '' : 's'} placed` : 'Waiting for pins…'}
                                      {showAnswers && pinStats ? ` · ${pinStats.correctCount} in range` : ''}
                                    </p>
                                    <div
                                      className="relative w-full max-w-3xl mx-auto rounded-2xl overflow-hidden border border-white/10 bg-black/40"
                                      style={{ aspectRatio: pinAspect ?? 16 / 9 }}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={media}
                                        alt=""
                                        className="w-full h-full object-contain"
                                        onLoad={(e) => {
                                          const im = e.currentTarget
                                          if (im.naturalWidth && im.naturalHeight) setPinAspect(im.naturalWidth / im.naturalHeight)
                                        }}
                                      />
                                      {(pinStats?.pins || []).map((pin: any, i: number) => (
                                        <div
                                          key={`pin-${i}`}
                                          className={`absolute w-4 h-4 xl:w-6 xl:h-6 rounded-full border-2 pointer-events-none ${
                                            showAnswers
                                              ? pin.isCorrect
                                                ? 'bg-emerald-400/50 border-emerald-300'
                                                : 'bg-rose-400/40 border-rose-300'
                                              : 'bg-[#e85d4c]/40 border-[#e85d4c]'
                                          }`}
                                          style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: 'translate(-50%, -50%)' }}
                                        />
                                      ))}
                                      {showAnswers && (
                                        <div
                                          className="absolute w-10 h-10 rounded-full border-2 border-dashed border-emerald-400/80 pointer-events-none"
                                          style={{ left: `${tx}%`, top: `${ty}%`, transform: 'translate(-50%, -50%)' }}
                                          title="Target"
                                        />
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                              {(currentQuestion.options || []).map((option, index) => {
                                const badges = [
                                  'from-rose-500 to-pink-600 text-white shadow-rose-500/20',
                                  'from-blue-500 to-indigo-600 text-white shadow-blue-500/20',
                                  'from-emerald-500 to-teal-600 text-white shadow-emerald-500/20',
                                  'from-amber-400 to-orange-500 text-white shadow-amber-500/20',
                                ]
                                const icons = ['▲', '◆', '●', '■']
                                const badgeColor = badges[index % badges.length]
                                const icon = icons[index % icons.length]
                                const statsList = Array.isArray(answerStats) ? answerStats : []
                                const stat = statsList.find((s: any) => s.optionId === option.id)
                                const isPoll = currentQuestion.type === 'poll'
                                const isCorrect = !isPoll && option.isCorrect
                                const shouldHighlight = showAnswers && isCorrect && !isPoll
                                const isDimmed = showAnswers && !isCorrect && !isPoll

                                return (
                                  <div
                                    key={`option-${option.id || index}-${index}`}
                                    className={`relative p-4 sm:p-5 xl:p-6 rounded-2xl border transition-all duration-500 overflow-hidden bg-white/5 backdrop-blur-md ${
                                      shouldHighlight
                                        ? 'border-emerald-400/80 ring-2 ring-emerald-400/25 scale-[1.01] shadow-[0_0_20px_rgba(52,211,153,0.15)] bg-emerald-500/5'
                                        : 'border-white/5'
                                    } ${
                                      isDimmed ? 'opacity-20 scale-[0.99]' : ''
                                    }`}
                                  >
                                    <div className="relative z-10 space-y-4">
                                      <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                          <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-r font-black text-sm shadow-md ${badgeColor}`}>
                                            {icon}
                                          </div>
                                          <div className="flex flex-col gap-2 min-w-0">
                                            {option.optionText ? (
                                              <div className="text-white font-bold text-base md:text-lg xl:text-2xl leading-snug">{option.optionText}</div>
                                            ) : null}
                                            {option.mediaUrl ? (
                                              <div className="w-28 h-20 sm:w-36 sm:h-24 xl:w-52 xl:h-36 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={option.mediaUrl} alt="Option media" className="w-full h-full object-contain" />
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>

                                        {stat && (
                                          <div className="text-right shrink-0 ml-3">
                                            <span className="text-base xl:text-2xl font-black text-white">{stat.count}</span>
                                            <span className="text-xs xl:text-base text-gray-400 ml-1">({stat.percentage}%)</span>
                                          </div>
                                        )}
                                      </div>

                                      {stat && (
                                        <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                                          <div
                                            className="bg-white/60 h-full rounded-full transition-all duration-1000"
                                            style={{ width: `${stat.percentage}%` }}
                                          />
                                        </div>
                                      )}

                                      {showAnswers && isCorrect && (
                                        <div className="text-xs font-black tracking-wider text-emerald-400 uppercase flex items-center gap-1.5">
                                          <span className="text-sm">✓</span> Correct Choice
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                        {/* Actions Section */}
                        <div className="pt-2 space-y-3">
                          {!showAnswers ? (
                            <Button
                              onClick={handleRevealAnswer}
                              disabled={actionLoading}
                              size="lg"
                              className="w-full bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-gray-500 h-14 text-lg font-black rounded-2xl shadow-[0_4px_20px_rgba(255,255,255,0.08)] hover:shadow-[0_4px_25px_rgba(255,255,255,0.15)] transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer border-none"
                            >
                              {currentQuestion.type === 'poll' ? 'Show Poll Results' : 'Reveal Correct Answer'}
                            </Button>
                          ) : (
                            <Button
                              onClick={
                                (gameState?.currentQuestionIndex || 0) + 1 < totalQuestions
                                  ? handleNextQuestion
                                  : handleEndGame
                              }
                              disabled={actionLoading}
                              size="lg"
                              className="w-full bg-[#e85d4c] hover:bg-[#d44e3e] disabled:from-purple-600/20 disabled:to-indigo-600/20 text-white font-black h-14 whitespace-normal leading-tight text-base sm:text-lg rounded-2xl shadow-[0_10px_20px_-10px_rgba(168,85,247,0.5)] transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
                            >
                              {actionLoading 
                                ? 'Moving Arena...' 
                                : ((gameState?.currentQuestionIndex || 0) + 1 < totalQuestions ? 'Next Battle Question ➔' : 'End Battle & Show Podium 🏆')}
                            </Button>
                          )}
                          <Button
                            onClick={handleEndGame}
                            disabled={actionLoading}
                            variant="outline"
                            className="w-full border-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 hover:bg-red-500/5 h-12 text-sm font-bold rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <XCircle className="w-4 h-4" />
                            End Game Quickly
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Esports-style Live Leaderboard Sidebar */}
                  <div className="md:col-span-12 lg:col-span-4 bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-5 lg:p-6 backdrop-blur-md shadow-2xl h-fit flex flex-col">
                    <div className="mb-6 flex items-center gap-3">
                      <div className="text-xl">🏆</div>
                      <div>
                        <h3 className="text-lg font-black text-white tracking-wider">Lobby Leaderboard</h3>
                        <p className="text-xs text-gray-400">Live score updates</p>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-none md:max-h-[45vh] lg:max-h-[65vh] overflow-y-auto pr-1 scrollbar-thin">
                      {leaderboard.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-gray-500 text-sm font-semibold">No points scored yet.</p>
                        </div>
                      ) : (
                        leaderboard.slice(0, 20).map((player, i) => {
                          const isTop3 = i < 3
                          const medals = ['🥇', '🥈', '🥉']
                          const colors = [
                            'from-amber-500/10 to-transparent border-amber-500/25 text-amber-300',
                            'from-slate-400/10 to-transparent border-slate-400/25 text-slate-300',
                            'from-amber-700/10 to-transparent border-amber-700/25 text-amber-600',
                          ]
                          const cardBg = isTop3 
                            ? `bg-gradient-to-r ${colors[i]}` 
                            : 'bg-black/30 border-white/5 text-gray-300'

                          return (
                            <div
                              key={`leaderboard-sidebar-${player.participantId || player.id || i}-${i}`}
                              className={`flex items-center justify-between p-4 border rounded-2xl shadow-md ${cardBg}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Position Rank */}
                                <div className="text-center w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center font-black text-sm">
                                  {isTop3 ? medals[i] : `#${i + 1}`}
                                </div>
                                
                                {/* Name & correct ratio */}
                                <div className="min-w-0">
                                  <p className="font-bold text-white text-sm truncate">{player.username}</p>
                                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">{player.correctAnswers} correct</p>
                                </div>
                              </div>

                              {/* Points score */}
                              <div className="text-right shrink-0 pl-2">
                                <p className="font-black text-[#e85d4c] text-lg leading-none">{player.totalPoints}</p>
                                <p className="text-[9px] uppercase tracking-wider text-gray-500 mt-1">pts</p>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        )}
      </div>
      </div>
      <TourButton tour={hostRoomTour} label="Hướng dẫn" position="bottom-right" />
    </GameBackground>
  )
}
