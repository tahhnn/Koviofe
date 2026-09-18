'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { XCircle, MapPin, Lightbulb, Trophy } from 'lucide-react'
import { useWebSocket } from '@/hooks/use-websocket'
import { QRCodeComponent } from '@/components/qr-code'
import {
  getGameSession,
  startGameSession,
  endGameSession,
  updateRoomPrivacy,
} from '@/app/actions/quizzes'
import { getQuestionByIndex, getLeaderboard, getAnswerStats, updateGameSessionState, getQuizQuestionsCount, endQuestion, explainQuestion, showLeaderboard } from '@/app/actions/game'
import {
  ExplanationSlide,
  parseExplanation,
  preloadExplanation,
  type ExplanationDoc,
} from '@/components/explanation-slide'
import { LeaderboardSlide, type StandingRow } from '@/components/leaderboard-slide'
import { authClient } from '@/lib/auth-client'
import { GameBackground } from '@/components/game-background'
import { HostLobby } from '@/components/host-lobby'
import { TourButton } from '@/components/tour-button'
import { hostRoomTour } from '@/lib/tours'
import { localizeApiError, resolveApiError, isAuthError, type ResolvedApiError } from '@/lib/api-errors'
import { useToast } from '@/components/ui/toast'
import Link from 'next/link'

interface Option {
  id: string
  optionText: string
  isCorrect: boolean
  mediaUrl?: string
}

/** How long the answer holds the screen before the slide takes over. A room
 *  needs longer than a solo player: people are looking up at a projector and
 *  glancing at the leaderboard, not reading a phone in their hand. */
const ANSWER_DWELL_MS = 3000

interface Question {
  id: string
  questionText: string
  timeLimit: number
  options: Option[]
  type?: string
  correctAnswer?: string
  /** Explanation slide JSON; empty when the host did not write one. */
  explanation?: string
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
  const t = useTranslations('host')
  const tErrors = useTranslations('apiErrors')
  const tTour = useTranslations('tours')
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const sessionId = params.sessionId as string

  const [gameState, setGameState] = useState<any>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [answerStats, setAnswerStats] = useState<any>([])
  const [loading, setLoading] = useState(true)
  const [gameStarted, setGameStarted] = useState(false)
  const [showAnswers, setShowAnswers] = useState(false)
  // The explanation is a third step between reveal and next, so it stays its
  // own flag rather than folding into showAnswers — the answer panel is still
  // what the host returns to if they dismiss the slide.
  const [showExplanation, setShowExplanation] = useState(false)
  // The scoreboard closes the question: the host raises it after the answer —
  // and after the explanation slide when the question has one — and the room
  // sees it on the projector at the same moment every phone does.
  const [showBoard, setShowBoard] = useState(false)
  // The host view of GET /rooms/:id carries the slide with the question, so no
  // extra round trip is needed to know whether there is one to offer.
  const explanationDoc: ExplanationDoc | null = parseExplanation(currentQuestion?.explanation)
  // A host who moves on during the dwell must not have the slide land on the
  // next question a beat later.
  const explanationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [actionLoading, setActionLoading] = useState(false)
  // The confirm toast holds a closure from the render that opened it, so the
  // state value it captured is stale by the time the host answers it. Only a
  // ref tells endGameNow whether another action is in flight right now.
  const actionLoadingRef = useRef(false)
  const [privacyLoading, setPrivacyLoading] = useState(false)
  const [accessError, setAccessError] = useState<ResolvedApiError | null>(null)
  const [startCountdown, setStartCountdown] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [pinAspect, setPinAspect] = useState<number | null>(null)
  // Scores straight off the player:answered push, keyed by player id. The 2s
  // poll is the source of truth; this only closes the gap until it lands, so a
  // solo host watching the board sees a score move the moment it is earned.
  const [livePatches, setLivePatches] = useState<Record<string, any>>({})
  const questionStartRef = useRef<number>(0)
  // Mirrored on every render so every handler that flips the state keeps the
  // ref honest, without each of them having to remember to.
  actionLoadingRef.current = actionLoading

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
          if (!cancelled) {
            setLeaderboard(lb)
            // The poll response supersedes anything the pushes patched in.
            setLivePatches({})
          }
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

    const unsubAnswers = on('answer_submitted', (payload: any) => {
      answersDirty.current = true
      // The push already carries the new score, so show it now rather than
      // holding the board still for up to two seconds. `finished` is the only
      // realtime signal that a solo player has run out of questions.
      const id = payload?.player_id !== undefined ? String(payload.player_id) : ''
      if (!id) return
      // Score and finished only. answeredCount is not in the push, and a count
      // derived from pushes would start at zero and overwrite the polled value
      // with a smaller one for anyone who answered before this page connected.
      setLivePatches((prev) => {
        const patch: Record<string, any> = { ...(prev[id] || {}) }
        if (payload.score !== undefined) patch.totalPoints = payload.score
        if (payload.finished !== undefined) patch.finished = payload.finished
        return { ...prev, [id]: patch }
      })
    })

    // Solo mode ends itself: the server finalizes the room as soon as the last
    // player answers their last question. Without this the host screen sat on a
    // live-looking board for a game that was already archived.
    const unsubEnded = on('end_game', (payload: any) => {
      const reason = payload?.reason ? `?reason=${encodeURIComponent(payload.reason)}` : ''
      router.push(`/results/${sessionId}${reason}`)
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
      unsubEnded()
      unsubJoined()
      unsubLeft()
    }
  }, [connected, on, sessionId, currentQuestion, router])

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
          void preloadExplanation(parseExplanation(question?.explanation), 4000)

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

  const clearPendingExplanation = () => {
    if (explanationTimerRef.current) {
      clearTimeout(explanationTimerRef.current)
      explanationTimerRef.current = null
    }
  }

  useEffect(() => clearPendingExplanation, [])

  const handleNextQuestion = async () => {
    if (actionLoading) return
    clearPendingExplanation()
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
      setShowExplanation(false)
      setShowBoard(false)
      setAnswerStats([])

      // Warm the next slide's image now, while the question is being read, so
      // the explanation step later has nothing left to fetch.
      void preloadExplanation(parseExplanation(question?.explanation), 4000)

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

      // The slide follows the answer on its own. The host has one control per
      // question again (reveal, then next) instead of three, and the room sees
      // a single continuous beat rather than waiting on a click.
      const doc = parseExplanation(currentQuestion?.explanation)
      if (doc) {
        void preloadExplanation(doc)
        clearPendingExplanation()
        explanationTimerRef.current = setTimeout(async () => {
          explanationTimerRef.current = null
          const res = await explainQuestion(sessionId)
          if (res.error) {
            console.error('Error showing explanation:', res.error)
            return
          }
          setShowExplanation(true)
        }, ANSWER_DWELL_MS)
      }
    } catch (error) {
      console.error('Error revealing answer:', error)
    } finally {
      setActionLoading(false)
    }
  }

  /** The last beat of a question: push the scoreboard to the room and show it. */
  const handleShowLeaderboard = async () => {
    if (actionLoading) return
    // A pending explanation would otherwise land on top of the board a beat
    // after the host skipped past it.
    clearPendingExplanation()
    setActionLoading(true)
    try {
      const res = await showLeaderboard(sessionId)
      if (res.error) {
        console.error('Error showing leaderboard:', res.error)
      }
      // Read the scores after the push, not before: the board on the projector
      // and the one on every phone are then the same board.
      const lb = await getLeaderboard(sessionId)
      setLeaderboard(lb)
      setShowBoard(true)
    } catch (error) {
      console.error('Error showing leaderboard:', error)
    } finally {
      setActionLoading(false)
    }
  }

  const endGameNow = async () => {
    // Re-checked here, not only at the prompt: the confirm toast has no
    // auto-dismiss, so it can sit on screen while the host fires off a reveal
    // or a next, and still be answered afterwards.
    if (actionLoadingRef.current) return
    clearPendingExplanation()
    setActionLoading(true)
    try {
      await endGameSession(sessionId)
      send({ type: 'end_game' })
      router.push(`/results/${sessionId}`)
    } catch (error) {
      // A silent failure here is the worst kind: the host believes the room is
      // closed, walks away, and the game is still live on every phone.
      console.error('Error ending game:', error)
      toast.apiError(error, (href) => router.push(href))
    } finally {
      setActionLoading(false)
    }
  }

  // Ending is irreversible — the room is archived and every player is thrown to
  // the results screen — and the button that does it sits directly under the
  // full-width "next question" CTA. One mis-tap on a projector-driving tablet
  // used to end the match for the whole room with no way back.
  const handleEndGame = () => {
    if (actionLoading) return
    toast.confirm(t('confirmEndTitle'), () => { void endGameNow() }, t('confirmEndBody'))
  }

  if (loading) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#9a9eab] text-sm">{t('loading')}</p>
        </div>
      </GameBackground>
    )
  }

  if (accessError) {
    const shownError = localizeApiError(accessError, tErrors)
    if (accessError.requiresLogin) {
      void authClient.signOut()
      return (
        <GameBackground variant="arena">
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[#9a9eab] text-sm">{t('redirectSignIn')}</p>
          </div>
        </GameBackground>
      )
    }
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-8 space-y-5 text-center">
            <h1 className="text-xl font-semibold text-[#f2f0eb]">{shownError.title}</h1>
            <p className="text-sm text-[#9a9eab] leading-relaxed">{shownError.description}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              {shownError.href && (
                <Link href={shownError.href}>
                  <Button className="w-full sm:w-auto bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-semibold rounded-xl h-11 px-6 border-none">
                    {shownError.hrefLabel || tErrors('continue')}
                  </Button>
                </Link>
              )}
              {shownError.secondaryHref && (
                <Link href={shownError.secondaryHref}>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-[#2c313d] text-[#f2f0eb] hover:bg-white/5 rounded-xl h-11 px-6"
                  >
                    {shownError.secondaryHrefLabel || tErrors('otherOption')}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </GameBackground>
    )
  }

  const countdownOverlay =
    startCountdown === null ? null : (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-[#12141a] via-[#1a1d26] to-[#12141a] select-none">
        <div className="text-center space-y-8">
          <p className="text-xl md:text-2xl xl:text-4xl font-bold tracking-wider text-indigo-400 uppercase animate-pulse">
            {startCountdown === 0 ? t('preparing') : t('countdownTitle')}
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
            {startCountdown === 0 ? t('goodLuck') : t('countdownBody')}
          </p>
        </div>
      </div>
    )

  // The lobby is its own screen, not a card inside the host dashboard: it is
  // what a room full of people stares at on a projector while they join, so it
  // gets the whole viewport and the PIN gets the biggest type on it.
  if (!gameStarted) {
    return (
      <GameBackground variant="arena">
        {countdownOverlay}
        <HostLobby
          sessionCode={gameState?.sessionCode}
          participants={gameState?.participants || []}
          maxPlayers={gameState?.maxPlayers}
          isPrivate={!!gameState?.isPrivate}
          privacyLoading={privacyLoading}
          onTogglePrivacy={handleTogglePrivacy}
          connected={connected}
          joinUrl={joinUrl}
          copied={copied}
          onCopyLink={handleCopyLink}
          onStart={handleStartGame}
          starting={actionLoading}
        />
        <TourButton tour={hostRoomTour(tTour)} label={t('guide')} position="bottom-right" />
      </GameBackground>
    )
  }


  const isLastQuestion = (gameState?.currentQuestionIndex || 0) + 1 >= totalQuestions

  /* This screen is projected. The slide has to own the whole display the
     moment it appears — stacking it above the answer panel made the host
     scroll a projector, which is not a thing you can do mid-game. */
  const explanationStage = showExplanation && !showBoard && explanationDoc ? (
    <div className="fixed inset-0 z-[60] bg-[#0b0d12] flex flex-col animate-explain-enter">
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 sm:px-6 h-12 sm:h-14 border-b border-white/10">
        <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-widest text-[#2dd4bf]">
          <Lightbulb className="w-4 h-4" />
          {t('explanationStageLabel')}
        </span>
        {!isPlayerPaced && (
          <span className="text-xs sm:text-sm text-[#9a9eab] tabular-nums">
            {t('questionLabel')}{' '}
            <strong className="text-[#f2f0eb] font-medium">
              {Math.max(0, gameState?.currentQuestionIndex ?? -1) + 1}
            </strong>{' '}
            / {totalQuestions}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-5 md:p-6">
        {/* Width fills, but is capped by what the remaining height allows at
            16:9, so the slide is always as large as the screen permits and
            never overflows into a scrollbar. */}
        <div className="w-full aspect-video max-w-[calc((100vh-11rem)*16/9)] rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <ExplanationSlide doc={explanationDoc} variant="stage" />
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#12141a] px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
        <Button
          onClick={handleEndGame}
          disabled={actionLoading}
          variant="outline"
          className="shrink-0 border-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 hover:bg-red-500/5 h-12 px-4 text-sm font-bold rounded-xl transition-all cursor-pointer gap-2"
        >
          <XCircle className="w-4 h-4" />
          <span className="hidden sm:inline">{t('endQuickly')}</span>
        </Button>
        <Button
          onClick={handleShowLeaderboard}
          disabled={actionLoading}
          size="lg"
          className="flex-1 bg-[#e85d4c] hover:bg-[#d44e3e] disabled:bg-white/10 disabled:text-gray-500 text-white font-black h-12 sm:h-14 text-base sm:text-lg rounded-xl sm:rounded-2xl shadow-[0_10px_20px_-10px_rgba(232,93,76,0.5)] transition-all duration-300 cursor-pointer"
        >
          {actionLoading ? 'Moving Arena...' : t('showLeaderboard')}
        </Button>
      </div>
    </div>
  ) : null

  /* Same treatment as the explanation slide, and for the same reason: this is
     what the room looks at between two questions, so it owns the projector
     rather than sitting in a panel the host would have to scroll to. */
  const boardRows: StandingRow[] = (leaderboard || []).slice(0, 5).map((p: any, i: number) => ({
    id: String(p.id ?? p.participantId ?? i),
    nickname: p.username || 'Player',
    score: p.totalPoints ?? 0,
    rank: p.rank ?? i + 1,
  }))

  const leaderboardStage = showBoard ? (
    <div className="fixed inset-0 z-[60] bg-[#0b0d12] flex flex-col animate-explain-enter">
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 sm:px-6 h-12 sm:h-14 border-b border-white/10">
        <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold uppercase tracking-widest text-amber-400">
          <Trophy className="w-4 h-4" />
          {t('leaderboardStageLabel')}
        </span>
        {!isPlayerPaced && (
          <span className="text-xs sm:text-sm text-[#9a9eab] tabular-nums">
            {t('questionLabel')}{' '}
            <strong className="text-[#f2f0eb] font-medium">
              {Math.max(0, gameState?.currentQuestionIndex ?? -1) + 1}
            </strong>{' '}
            / {totalQuestions}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-5 md:p-6">
        <div className="w-full aspect-video max-w-[calc((100vh-11rem)*16/9)] rounded-2xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
          <LeaderboardSlide rows={boardRows} total={(leaderboard || []).length} variant="stage" />
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#12141a] px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-3">
        <Button
          onClick={handleEndGame}
          disabled={actionLoading}
          variant="outline"
          className="shrink-0 border-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 hover:bg-red-500/5 h-12 px-4 text-sm font-bold rounded-xl transition-all cursor-pointer gap-2"
        >
          <XCircle className="w-4 h-4" />
          <span className="hidden sm:inline">{t('endQuickly')}</span>
        </Button>
        <Button
          onClick={isLastQuestion ? handleEndGame : handleNextQuestion}
          disabled={actionLoading}
          size="lg"
          className="flex-1 bg-[#e85d4c] hover:bg-[#d44e3e] disabled:bg-white/10 disabled:text-gray-500 text-white font-black h-12 sm:h-14 text-base sm:text-lg rounded-xl sm:rounded-2xl shadow-[0_10px_20px_-10px_rgba(232,93,76,0.5)] transition-all duration-300 cursor-pointer"
        >
          {actionLoading
            ? 'Moving Arena...'
            : (isLastQuestion ? t('endBattle') : t('nextBattleQuestion'))}
        </Button>
      </div>
    </div>
  ) : null

  return (
    <GameBackground variant="arena">
      {countdownOverlay}
      {explanationStage}
      {leaderboardStage}
      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 pb-24 sm:pb-24 md:pb-24 lg:pb-8">

      <div className="max-w-7xl xl:max-w-[1500px] 2xl:max-w-[1750px] mx-auto space-y-8 z-10 relative">
        {/* No header once the game is live. It carried the PIN, the player
            count and the question number: nobody joins mid-game by reading a
            projector, and the question number now sits on the question card
            itself. On a projector the header cost a band of the screen the
            question needed. The lobby still shows all of it. */}

        {/* Game Arena Active Playing Screen */}
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
                // Solo mode has no shared question: every player sits on a
                // different one at a different moment, so a question on the
                // projector shows something almost nobody in the room is looking
                // at. The scoreboard is the only view that is true for everyone,
                // so it gets the whole screen.
                const byId = new Map<string, any>()
                for (const p of gameState?.participants || []) {
                  byId.set(String(p.id), { ...p })
                }
                for (const p of leaderboard || []) {
                  const id = String(p.id ?? p.participantId)
                  byId.set(id, { ...(byId.get(id) || {}), ...p, id })
                }
                // A player:answered push that landed since the last poll.
                for (const [id, patch] of Object.entries(livePatches)) {
                  if (byId.has(id)) byId.set(id, { ...byId.get(id), ...(patch as any) })
                }

                const rows = Array.from(byId.values())
                  .map((p: any) => {
                    // No current question left = this player reached the end.
                    // Only meaningful in solo mode, which is where we are.
                    const finished = p.finished ?? !p.currentQuestionId
                    return {
                      id: String(p.id),
                      username: p.username || 'Player',
                      totalPoints: p.totalPoints ?? 0,
                      correctAnswers: p.correctAnswers ?? 0,
                      // Once the room is finished the API serves the archived
                      // rankings, which carry no per-question counts — the rows
                      // it built them from were deleted. A solo player only ever
                      // finishes by answering every question, so the total is the
                      // right number to show rather than a bar snapped back to 0.
                      answeredCount: finished ? totalQuestions : (p.answeredCount ?? 0),
                      finished,
                    }
                  })
                  .sort((a: any, b: any) => b.totalPoints - a.totalPoints || b.answeredCount - a.answeredCount)

                const finishedCount = rows.filter((r: any) => r.finished).length
                const allDone = rows.length > 0 && finishedCount === rows.length

                return (
                  <div className="md:col-span-12 space-y-6">
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-6 md:p-8 backdrop-blur-md shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
                      <div className="text-center sm:text-left">
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">{t('soloMode')}</span>
                        <h2 className="text-2xl md:text-3xl xl:text-4xl font-black text-white mt-1">{t('liveScoreboard')}</h2>
                        <p className="text-gray-400 text-sm mt-1">
                          {t('soloProgressSummary', { finished: finishedCount, total: rows.length })}
                        </p>
                      </div>
                      <Button
                        onClick={handleEndGame}
                        disabled={actionLoading}
                        size="lg"
                        className="bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-extrabold w-full sm:w-auto whitespace-normal leading-tight text-sm sm:text-base px-5 sm:px-8 h-auto min-h-12 py-3 rounded-2xl shadow-lg transition-all border-none cursor-pointer"
                      >
                        {actionLoading ? t('closingArena') : t('endShowPodium')}
                      </Button>
                    </div>

                    {allDone && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-4 text-emerald-300 font-bold text-center">
                        {t('soloAllFinished')}
                      </div>
                    )}

                    <div className="bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-6 md:p-8 backdrop-blur-md shadow-2xl">
                      <h3 className="text-lg font-black text-white uppercase tracking-wider mb-5 flex items-center gap-2">
                        <span>🏆</span> {t('standings')}
                      </h3>
                      {rows.length === 0 ? (
                        <div className="text-center py-16 text-gray-500 font-bold">{t('noPlayers')}</div>
                      ) : (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
                          {rows.map((player: any, i: number) => {
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
                            const progress = totalQuestions > 0
                              ? Math.min(100, Math.round((player.answeredCount / totalQuestions) * 100))
                              : 0

                            return (
                              <div
                                key={`leaderboard-paced-${player.id || i}-${i}`}
                                className={`flex items-center justify-between gap-3 p-3 sm:p-4 border rounded-2xl shadow-md ${cardBg}`}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="text-center shrink-0 min-w-8 w-auto px-1.5 h-8 rounded-lg bg-black/40 flex items-center justify-center font-black text-xs sm:text-sm">
                                    {isTop3 ? medals[i] : `#${i + 1}`}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <p className="font-bold text-white text-sm sm:text-base truncate">{player.username}</p>
                                      {player.finished ? (
                                        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                          {t('soloFinished')}
                                        </span>
                                      ) : (
                                        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                          {t('soloPlaying')}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
                                      {t('soloRowProgress', {
                                        answered: player.answeredCount,
                                        total: totalQuestions,
                                        correct: player.correctAnswers,
                                      })}
                                    </p>
                                    <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden">
                                      <div
                                        className={`h-full transition-[width] duration-500 ${player.finished ? 'bg-emerald-400' : 'bg-[#e85d4c]'}`}
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 pl-1">
                                  <p className="font-black text-[#e85d4c] text-xl sm:text-2xl leading-none tabular-nums">{player.totalPoints}</p>
                                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-1">{t('pts')}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
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
                              {/* The counter lived in the room header, which is
                                  gone during play; it belongs on the question
                                  anyway, where the host is already looking. */}
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <span className="text-xs font-bold uppercase tracking-widest text-[#e85d4c]">{t('activeQuestion')}</span>
                                <span className="text-xs sm:text-sm text-[#9a9eab] tabular-nums shrink-0">
                                  {t('questionLabel')}{' '}
                                  <strong className="text-[#f2f0eb] font-medium">
                                    {Math.max(0, gameState?.currentQuestionIndex ?? -1) + 1}
                                  </strong>{' '}
                                  / {totalQuestions}
                                </span>
                              </div>
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
                                  <img src={parsedContent.mediaUrl} alt={t('questionMedia')} className="w-full h-full object-contain" />
                                </div>
                              )}

                              {/* Mode-specific answer panel */}
                          {currentQuestion.type === 'short_answer' ? (
                            <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 md:p-8 text-center backdrop-blur-md shadow-lg">
                              {showAnswers ? (
                                <div className="space-y-4">
                                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">{t('correctAnswer')}</span>
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
                                  <h3 className="text-xl font-bold text-white">{t('shortAnswerMode')}</h3>
                                  <p className="text-gray-400 text-sm">{t('shortAnswerHint')}</p>
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
                                      {t('pinNeedsImage')}
                                    </div>
                                  )
                                }
                                return (
                                  <div className="space-y-3">
                                    <p className="text-sm xl:text-lg text-gray-400 flex items-center gap-1.5">
                                      <MapPin className="w-4 h-4 text-[#e85d4c]" />
                                      {pinStats ? t('pinsPlaced', { count: pinStats.total }) : t('waitingPins')}
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
                                                <img src={option.mediaUrl} alt={t('optionMedia')} className="w-full h-full object-contain" />
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
                                          <span className="text-sm">✓</span> {t('correctChoice')}
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
                              {currentQuestion.type === 'poll' ? t('showPollResults') : t('reveal')}
                            </Button>
                          ) : (
                            <>
                            {/* The scoreboard comes between the answer and the
                                next question — after the explanation slide when
                                the question has one, which raises itself. */}
                            <Button
                              onClick={handleShowLeaderboard}
                              disabled={actionLoading}
                              size="lg"
                              className="w-full bg-[#e85d4c] hover:bg-[#d44e3e] disabled:from-purple-600/20 disabled:to-indigo-600/20 text-white font-black h-14 whitespace-normal leading-tight text-base sm:text-lg rounded-2xl shadow-[0_10px_20px_-10px_rgba(168,85,247,0.5)] transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
                            >
                              {actionLoading ? 'Moving Arena...' : t('showLeaderboard')}
                            </Button>
                            </>
                          )}
                          <Button
                            onClick={handleEndGame}
                            disabled={actionLoading}
                            variant="outline"
                            className="w-full border-red-500/20 hover:border-red-500/50 text-red-400 hover:text-red-300 hover:bg-red-500/5 h-12 text-sm font-bold rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <XCircle className="w-4 h-4" />
                            {t('endQuickly')}
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
                        <h3 className="text-lg font-black text-white tracking-wider">{t('lobbyLeaderboard')}</h3>
                        <p className="text-xs text-gray-400">{t('liveScores')}</p>
                      </div>
                    </div>

                    <div className="space-y-3 max-h-none md:max-h-[45vh] lg:max-h-[65vh] overflow-y-auto pr-1 scrollbar-thin">
                      {leaderboard.length === 0 ? (
                        <div className="text-center py-12">
                          <p className="text-gray-500 text-sm font-semibold">{t('noPoints')}</p>
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
                                <p className="text-[9px] uppercase tracking-wider text-gray-500 mt-1">{t('pts')}</p>
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
      </div>
      </div>
      <TourButton tour={hostRoomTour(tTour)} label={t('guide')} position="bottom-right" />
    </GameBackground>
  )
}
