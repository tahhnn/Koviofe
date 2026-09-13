'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWebSocket } from '@/hooks/use-websocket'
import { getQuestionByIndex, submitAnswer, getQuizQuestionsCount } from '@/app/actions/game'
import { getGameSession } from '@/app/actions/quizzes'
import { GameBackground } from '@/components/game-background'
import { Hourglass, ArrowRight, XCircle, Check, MapPin } from 'lucide-react'

interface Option {
  id: string
  optionText: string
  isCorrect: boolean
  mediaUrl?: string
}

interface Question {
  id: string
  quizId: string
  questionText: string
  timeLimit: number
  displayOrder: number
  options: Option[]
  type?: string
  index?: number
  total?: number
  activeUntil?: string
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

export default function PlayerGameScreen() {
  const params = useParams()
  const router = useRouter()
  const sessionId = params.sessionId as string

  const [gameState, setGameState] = useState<any>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [shortAnswerText, setShortAnswerText] = useState('')
  const [pinPosition, setPinPosition] = useState<{ x: number; y: number } | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; pointsEarned: number; isPoll?: boolean } | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [pollResults, setPollResults] = useState<{ optionId: string; text: string; count: number; percentage: number }[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [participantId, setParticipantId] = useState('')
  const [playerToken, setPlayerToken] = useState('')
  const [roundLeaderboard, setRoundLeaderboard] = useState<{ id: string; nickname: string; score: number }[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pinAspect, setPinAspect] = useState<number | null>(null)

  const [localQuestionIndex, setLocalQuestionIndex] = useState<number>(-1)
  const [totalQuestions, setTotalQuestions] = useState<number>(0)
  const [isPlayerPaced, setIsPlayerPaced] = useState<boolean>(false)
  const [startCountdown, setStartCountdown] = useState<number | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const isPlayerPacedRef = useRef(false)
  const submittingRef = useRef(false)
  const currentQuestionRef = useRef<Question | null>(null)
  const participantIdRef = useRef('')
  const playerTokenRef = useRef('')
  const localIndexRef = useRef(-1)
  const totalQuestionsRef = useRef(0)
  const startSequenceRef = useRef(false)
  const selectedAnswerRef = useRef<string | null>(null)
  const shortAnswerTextRef = useRef('')
  const pinPositionRef = useRef<{ x: number; y: number } | null>(null)
  const correctAnswerRef = useRef<string | null>(null)
  const pendingFeedbackRef = useRef<{ isCorrect: boolean; pointsEarned: number; isPoll?: boolean } | null>(null)

  useEffect(() => { isPlayerPacedRef.current = isPlayerPaced }, [isPlayerPaced])
  useEffect(() => { correctAnswerRef.current = correctAnswer }, [correctAnswer])
  useEffect(() => { currentQuestionRef.current = currentQuestion }, [currentQuestion])
  useEffect(() => { participantIdRef.current = participantId }, [participantId])
  useEffect(() => { playerTokenRef.current = playerToken }, [playerToken])
  useEffect(() => { localIndexRef.current = localQuestionIndex }, [localQuestionIndex])
  useEffect(() => { totalQuestionsRef.current = totalQuestions }, [totalQuestions])
  useEffect(() => { selectedAnswerRef.current = selectedAnswer }, [selectedAnswer])
  useEffect(() => { shortAnswerTextRef.current = shortAnswerText }, [shortAnswerText])
  useEffect(() => { pinPositionRef.current = pinPosition }, [pinPosition])

  const resetAnswerInputs = useCallback((_question?: Question | null) => {
    setSelectedAnswer(null)
    setShortAnswerText('')
    setPinPosition(null)
    setFeedback(null)
    setCorrectAnswer(null)
    setPollResults(null)
    setRoundLeaderboard([])
    setSubmitError(null)
    setPinAspect(null)
    pendingFeedbackRef.current = null
  }, [])

  const pinHint = typeof window !== 'undefined'
    ? sessionStorage.getItem(`pin_code_${sessionId}`) || undefined
    : undefined
  const myNickname = typeof window !== 'undefined'
    ? sessionStorage.getItem(`nickname_${sessionId}`) || ''
    : ''
  const { connected, send, on } = useWebSocket(sessionId, pinHint)

  const runStartCountdown = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      setStartCountdown(3)
      let currentCount = 3
      const interval = setInterval(() => {
        currentCount -= 1
        if (currentCount > 0) {
          setStartCountdown(currentCount)
        } else if (currentCount === 0) {
          setStartCountdown(0)
        } else {
          clearInterval(interval)
          setStartCountdown(null)
          resolve()
        }
      }, 1000)
    })
  }, [])

  const applyQuestion = useCallback((question: Question, index?: number, activeUntil?: string) => {
    if (typeof question.total === 'number' && question.total > 0) {
      setTotalQuestions(question.total)
    }
    if (typeof index === 'number') {
      setLocalQuestionIndex(index)
    } else if (typeof question.index === 'number') {
      setLocalQuestionIndex(question.index)
    }
    setCurrentQuestion(question)
    const durationMs = (question?.timeLimit || 30) * 1000
    const activeUntilMs = activeUntil ? Date.parse(activeUntil) : NaN
    const effectiveUntil = Number.isFinite(activeUntilMs) ? activeUntilMs : Date.now() + durationMs
    setTimeLeft(Math.max(0, Math.ceil((effectiveUntil - Date.now()) / 1000)))
    startTimeRef.current = effectiveUntil - durationMs
    setSubmitted(false)
    submittingRef.current = false
    resetAnswerInputs(question)
  }, [resetAnswerInputs])

  const loadSoloFirstQuestion = useCallback(async (pToken: string) => {
    const question = await getQuestionByIndex(sessionId, 0, pToken || undefined)
    if (!question) return
    applyQuestion(question, 0, question.activeUntil)
  }, [sessionId, applyQuestion])

  const beginGameFromLobby = useCallback(async (opts: { playerPaced: boolean; pToken: string }) => {
    if (startSequenceRef.current) return
    startSequenceRef.current = true
    await runStartCountdown()
    if (opts.playerPaced) {
      await loadSoloFirstQuestion(opts.pToken)
    }
  }, [runStartCountdown, loadSoloFirstQuestion])

  const loadGameState = useCallback(async () => {
      try {
        const pToken = sessionStorage.getItem(`player_token_${sessionId}`)
        if (pToken) setPlayerToken(pToken)

        const session = await getGameSession(sessionId, pToken || undefined)
        if (session.status === 'finished') {
          router.push(`/results/${sessionId}`)
          return
        }
        setGameState(session)

        let config: any = {}
        try { config = JSON.parse(session.themeConfig || '{}') } catch { config = {} }
        const playerPaced = config.game_mode === 'player_paced'
        setIsPlayerPaced(playerPaced)

        const count = await getQuizQuestionsCount(sessionId, pToken || undefined)
        if (count > 0) {
          setTotalQuestions(count)
        } else if (session.questionCount > 0) {
          setTotalQuestions(session.questionCount)
        }

        const pId = sessionStorage.getItem(`participant_${sessionId}`)
        if (!pId) {
          router.push(`/join?pin=${session.sessionCode || ''}`)
          return
        }
        setParticipantId(pId)

        const alreadyLive = session.status === 'playing' || session.status === 'active'

        if (playerPaced) {
          if (alreadyLive) {
            startSequenceRef.current = true
            const cq = session.currentQuestion
            if (!cq?.id) {
              router.push(`/results/${sessionId}`)
              return
            }
            const idx = typeof cq.index === 'number' ? cq.index : 0
            try {
              const question = await getQuestionByIndex(sessionId, idx, pToken || undefined)
              if (question) {
                // Resync countdown to the server deadline — the timer keeps
                // running server-side across a reload.
                applyQuestion(question, idx, question.activeUntil || cq.active_until)
                if (session.questionCount > 0 && !(typeof question.total === 'number' && question.total > 0)) {
                  setTotalQuestions(session.questionCount)
                }
              }
            } catch (e: any) {
              const msg = String(e?.message || '')
              if (msg.includes('NO_MORE_QUESTIONS') || msg === 'ROOM_FINISHED') {
                router.push(`/results/${sessionId}`)
              }
            }
          } else {
            setCurrentQuestion(null)
          }
        } else if (session.currentQuestionIndex !== undefined && session.currentQuestionIndex >= 0) {
          startSequenceRef.current = true
          const question = await getQuestionByIndex(sessionId, session.currentQuestionIndex, pToken || undefined)
          if (question) applyQuestion(question, session.currentQuestionIndex)
        }
      } catch (error: any) {
        console.error('Error loading game state:', error)
        const msg = String(error?.message || '')
        if (msg === 'ROOM_FINISHED') {
          router.push(`/results/${sessionId}`)
        } else {
          setLoadError('Không tải được phòng chơi')
        }
      } finally {
        setLoading(false)
      }
  }, [sessionId, router, applyQuestion])

  useEffect(() => {
    const t = setTimeout(loadGameState, 0)
    return () => clearTimeout(t)
  }, [loadGameState])

  useEffect(() => {
    if (loading) return

    let cancelled = false
    const poll = async () => {
      try {
        const pToken = playerTokenRef.current || sessionStorage.getItem(`player_token_${sessionId}`) || ''
        const session = await getGameSession(sessionId, pToken || undefined)
        if (cancelled) return

        if (session.status === 'finished') {
          router.push(`/results/${sessionId}`)
          return
        }

        let config: any = {}
        try { config = JSON.parse(session.themeConfig || '{}') } catch { config = {} }
        const playerPaced = config.game_mode === 'player_paced'
        setIsPlayerPaced(playerPaced)
        setGameState(session)

        if (session.status !== 'playing' && session.status !== 'active') return

        if (playerPaced) {
          if (currentQuestionRef.current || startSequenceRef.current) return
          await beginGameFromLobby({ playerPaced: true, pToken })
          return
        }

        if (!startSequenceRef.current && (session.currentQuestionIndex === undefined || session.currentQuestionIndex < 0)) {
          // Classic mode waits for the server's question:active event. Do not
          // start a local countdown per player; late clients reconcile below.
          startSequenceRef.current = true
          return
        }

        if (session.currentQuestionIndex === undefined || session.currentQuestionIndex < 0) return

        const question = await getQuestionByIndex(
          sessionId,
          session.currentQuestionIndex,
          pToken || undefined
        )
        if (cancelled || !question) return

        if (currentQuestionRef.current?.id !== question.id) {
          applyQuestion(question, session.currentQuestionIndex, session.questionActiveUntil)
        }
      } catch (e) {
        console.error('Player lobby poll failed', e)
      }
    }

    poll()
    const id = setInterval(poll, 2500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [loading, sessionId, router, beginGameFromLobby, applyQuestion])

  useEffect(() => {
    if (!connected) return

    const unsubQuestion = on('next_question', async (data) => {
      if (isPlayerPacedRef.current) return
      try {
        const question = await getQuestionByIndex(sessionId, data.questionIndex, playerTokenRef.current || undefined)
        if (question) applyQuestion(question, data.questionIndex, data.activeUntil || question.activeUntil)
      } catch (e: any) {
        if (e.message === 'ROOM_FINISHED') {
          router.push(`/results/${sessionId}`)
        } else {
          console.error('Error loading question:', e)
          setLoadError('Không tải được câu hỏi — bấm thử lại')
        }
      }
    })

    const unsubReveal = on('reveal_answer', (data) => {
      if (isPlayerPacedRef.current) return
      setSubmitted(true)
      if (data?.correct_answer) {
        setCorrectAnswer(String(data.correct_answer))
      }
      if (Array.isArray(data?.option_stats)) {
        setPollResults(
          data.option_stats.map((s: any) => ({
            optionId: s.option_id,
            text: s.text,
            count: s.count,
            percentage: s.percentage,
          }))
        )
      }
      if (Array.isArray(data?.leaderboard)) {
        setRoundLeaderboard(
          data.leaderboard.map((p: any) => ({
            id: String(p.id ?? ''),
            nickname: String(p.nickname ?? ''),
            score: Number(p.score || 0),
          }))
        )
      } else {
        setRoundLeaderboard([])
      }
      if (pendingFeedbackRef.current) {
        setFeedback(pendingFeedbackRef.current)
        pendingFeedbackRef.current = null
      }
    })

    const unsubEnd = on('end_game', () => {
      router.push(`/results/${sessionId}`)
    })

    const unsubGameStart = on('game:started', async () => {
      try {
        const pToken = playerTokenRef.current || sessionStorage.getItem(`player_token_${sessionId}`) || ''
        const session = await getGameSession(sessionId, pToken || undefined)
        let config: any = {}
        try { config = JSON.parse(session.themeConfig || '{}') } catch { config = {} }
        const playerPaced = config.game_mode === 'player_paced'
        setIsPlayerPaced(playerPaced)
        setGameState((prev: any) => ({ ...(prev || {}), ...session, status: 'playing' }))

        if (playerPaced) {
          await beginGameFromLobby({ playerPaced: true, pToken })
        } else {
          // Classic mode starts only when the server publishes question:active.
          // This prevents each client from running its own delayed countdown.
          startSequenceRef.current = true
        }
      } catch (e: any) {
        if (e.message === 'ROOM_FINISHED') {
          router.push(`/results/${sessionId}`)
        } else {
          console.error('Error handling game:started', e)
        }
      }
    })

    return () => {
      unsubQuestion()
      unsubReveal()
      unsubEnd()
      unsubGameStart()
    }
  }, [connected, on, sessionId, router, beginGameFromLobby, applyQuestion])

  const handleSubmitAnswer = useCallback(async (answerVal: string | null) => {
    const pId = participantIdRef.current
    const q = currentQuestionRef.current
    if (!pId || !q || submittingRef.current) return

    submittingRef.current = true
    setSubmitted(true)
    setSubmitError(null)
    const responseTimeMs = Date.now() - startTimeRef.current
    const timeSpent = Math.floor(responseTimeMs / 1000)
    const optionToSubmit = answerVal ?? ''
    const isPoll = q.type === 'poll'

    try {
      const res = await submitAnswer(sessionId, pId, q.id, optionToSubmit, timeSpent, responseTimeMs, playerTokenRef.current)
      if (res && res.error) {
        if (res.error.includes('not active') || res.error.includes('exceeded') || res.error.includes('expired')) {
          const fb = { isCorrect: false, pointsEarned: 0, isPoll }
          if (isPlayerPacedRef.current || isPoll) {
            setFeedback(fb)
          } else {
            pendingFeedbackRef.current = fb
          }
        } else {
          setSubmitted(false)
          submittingRef.current = false
          setSubmitError('Gửi câu trả lời thất bại — thử lại')
          return
        }
      } else if (res) {
        const fb = {
          isCorrect: isPoll ? false : !!res.is_correct,
          pointsEarned: Number(res.points_earned || 0),
          isPoll: isPoll || !!res.recorded,
        }
        if (isPlayerPacedRef.current || isPoll) {
          setFeedback(fb)
        } else {
          pendingFeedbackRef.current = fb
        }
      }

      send({
        type: 'answer_submitted',
        participantId: pId,
        questionId: q.id,
        optionId: optionToSubmit || null,
        timeSpent,
      })

      if (isPlayerPacedRef.current) {
        setTimeout(async () => {
          const nextIndex = localIndexRef.current + 1
          const knownTotal = totalQuestionsRef.current
          if (knownTotal > 0 && nextIndex >= knownTotal) {
            router.push(`/results/${sessionId}`)
            return
          }
          try {
            const nextQ = await getQuestionByIndex(sessionId, nextIndex, playerTokenRef.current || undefined)
            if (!nextQ) {
              router.push(`/results/${sessionId}`)
              return
            }
            applyQuestion(nextQ, nextIndex, nextQ.activeUntil)
          } catch (e: any) {
            const msg = String(e?.message || '')
            if (
              msg === 'ROOM_FINISHED' ||
              msg.includes('NO_MORE_QUESTIONS') ||
              msg.toLowerCase().includes('not found') ||
              msg.toLowerCase().includes('not currently active')
            ) {
              router.push(`/results/${sessionId}`)
              return
            }
            console.error('Error loading next solo question:', e)
            submittingRef.current = false
          }
        }, 2500)
      } else {
        submittingRef.current = false
      }
    } catch (error: any) {
      console.error('Error submitting answer:', error)
      submittingRef.current = false
      if (error.message === 'ROOM_FINISHED') {
        router.push(`/results/${sessionId}`)
      } else {
        setSubmitted(false)
        setSubmitError('Gửi câu trả lời thất bại — thử lại')
      }
    }
  }, [sessionId, router, send, applyQuestion])

  useEffect(() => {
    if (!currentQuestion || submitted) return

    timerRef.current = setInterval(() => {
      const q = currentQuestionRef.current
      if (!q) return
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const remaining = Math.max(0, (q.timeLimit || 30) - elapsed)
      setTimeLeft(remaining)

      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current)
        if (!submittingRef.current) {
          const type = q.type
          let pending: string | null = null
          if (type === 'short_answer') {
            pending = shortAnswerTextRef.current.trim() || null
          } else if (type === 'pin_answer') {
            pending = pinPositionRef.current
              ? `${pinPositionRef.current.x.toFixed(1)},${pinPositionRef.current.y.toFixed(1)}`
              : null
          } else {
            pending = selectedAnswerRef.current
          }
          handleSubmitAnswer(pending)
        }
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentQuestion, submitted, handleSubmitAnswer])

  useEffect(() => {
    const handleUnload = () => {
      const pToken = sessionStorage.getItem(`player_token_${sessionId}`)
      if (!pToken) return
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082/api'
      fetch(`${API_URL}/rooms/${sessionId}/leave`, {
        method: 'POST',
        headers: { 'X-Player-Token': pToken },
        keepalive: true,
      })
    }

    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [sessionId])

  if (loading) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#2c313d] border-t-[#e85d4c] animate-spin" />
            <p className="text-sm text-[#9a9eab] mt-4">Loading arena…</p>
          </div>
        </div>
      </GameBackground>
    )
  }

  if (loadError) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="max-w-md w-full rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 sm:p-8 text-center">
            <XCircle className="w-8 h-8 text-[#e85d4c] mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[#f2f0eb]">{loadError}</h1>
            <p className="text-sm text-[#9a9eab] mt-2 leading-relaxed">
              Kiểm tra kết nối mạng rồi thử lại.
            </p>
            <Button
              onClick={() => {
                setLoadError(null)
                loadGameState()
              }}
              size="lg"
              className="mt-6 w-full min-h-12 bg-[#f2f0eb] text-[#12141a] hover:bg-white font-semibold rounded-xl"
            >
              Thử lại
            </Button>
          </div>
        </div>
      </GameBackground>
    )
  }

  if (startCountdown !== null) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-6xl sm:text-7xl md:text-8xl font-black text-[#f2f0eb] tabular-nums">
              {startCountdown === 0 ? 'GO' : startCountdown}
            </p>
          </div>
        </div>
      </GameBackground>
    )
  }

  if (!currentQuestion) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="max-w-md w-full rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 sm:p-8 text-center">
            <Hourglass className="w-8 h-8 text-[#e85d4c] mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[#f2f0eb]">Waiting for the host</h1>
            <p className="text-sm text-[#9a9eab] mt-2 leading-relaxed">
              You are in. Questions will show here when the round starts.
            </p>
          </div>
        </div>
      </GameBackground>
    )
  }

  const isShortAnswer = currentQuestion.type === 'short_answer'
  const isPinAnswer = currentQuestion.type === 'pin_answer'
  const isPoll = currentQuestion.type === 'poll'
  const answerColors = [
    'bg-[#e85d4c] hover:brightness-110',
    'bg-[#5b8def] hover:brightness-110',
    'bg-[#2dd4bf] hover:brightness-110 text-[#0c1412]',
    'bg-[#f0b429] hover:brightness-110 text-[#1a1408]',
  ]

  const canSubmit = (() => {
    if (isShortAnswer) return !!shortAnswerText.trim()
    if (isPinAnswer) return !!pinPosition
    return !!selectedAnswer
  })()

  return (
    <GameBackground variant="arena">
      <div className="flex-1 flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 md:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="max-w-3xl w-full space-y-3 sm:space-y-5 md:space-y-6">
        {!connected && (
          <div className="sticky top-0 z-40 rounded-xl border border-[#f0b429]/35 bg-[#f0b429]/10 px-3 py-2 text-sm text-[#f0b429] text-center">
            Đang kết nối lại…
          </div>
        )}

        {isPlayerPaced && totalQuestions > 0 && (
          <div className="flex justify-between items-center text-sm text-[#9a9eab]">
            <span>Solo pace</span>
            <span className="text-[#f2f0eb]">
              {localQuestionIndex + 1} / {totalQuestions}
            </span>
          </div>
        )}

        <div className="sticky top-0 z-30 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 backdrop-blur-md p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#9a9eab]">Time left</span>
            <span className={`text-xl sm:text-2xl font-semibold tabular-nums ${timeLeft <= 5 ? 'text-[#e85d4c]' : 'text-[#f2f0eb]'}`}>
              {timeLeft}s
            </span>
          </div>
          <div className="w-full bg-[#12141a] rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-100 ${
                timeLeft <= 5 ? 'bg-[#e85d4c]' : 'bg-[#2dd4bf]'
              }`}
              style={{
                width: `${(timeLeft / (currentQuestion.timeLimit || 30)) * 100}%`,
              }}
            />
          </div>
        </div>

        {(() => {
          const parsedContent = parseQuestionContent(currentQuestion.questionText)
          return (
            <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-4 sm:p-6 md:p-8 space-y-4">
              <h1 className="text-lg sm:text-xl md:text-2xl font-semibold text-[#f2f0eb] leading-snug">
                {parsedContent.text}
              </h1>
              {parsedContent.mediaUrl && !isPinAnswer && (
                <div className="w-full max-h-[30vh] sm:max-h-64 rounded-xl overflow-hidden border border-[#2c313d] bg-[#12141a] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={parsedContent.mediaUrl} alt="" className="max-h-[30vh] sm:max-h-64 w-auto max-w-full object-contain" />
                </div>
              )}
            </div>
          )
        })()}

        {isPinAnswer ? (
          <div className="space-y-3">
            {(() => {
              const parsedContent = parseQuestionContent(currentQuestion.questionText)
              if (!parsedContent.mediaUrl) {
                return (
                  <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-5 sm:p-8 text-center text-[#9a9eab]">
                    This pin question has no image. Ask the host to add media.
                  </div>
                )
              }
              return (
                <div className="space-y-2">
                  <p className="text-sm text-[#9a9eab] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#e85d4c]" />
                    Tap the image to place your pin
                  </p>
                  <div
                    className={`relative w-full rounded-2xl overflow-hidden border border-[#2c313d] bg-[#12141a] touch-manipulation select-none ${
                      submitted ? 'pointer-events-none opacity-80' : 'cursor-crosshair'
                    }`}
                    style={{ aspectRatio: pinAspect ?? 16 / 9 }}
                    onClick={(e) => {
                      if (submitted) return
                      const rect = e.currentTarget.getBoundingClientRect()
                      const x = ((e.clientX - rect.left) / rect.width) * 100
                      const y = ((e.clientY - rect.top) / rect.height) * 100
                      setPinPosition({
                        x: Math.max(0, Math.min(100, x)),
                        y: Math.max(0, Math.min(100, y)),
                      })
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={parsedContent.mediaUrl}
                      alt=""
                      onLoad={(e) => {
                        const im = e.currentTarget
                        if (im.naturalWidth && im.naturalHeight) setPinAspect(im.naturalWidth / im.naturalHeight)
                      }}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    {pinPosition && (
                      <div
                        className="absolute w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#e85d4c]/35 border-2 border-[#e85d4c] shadow-[0_0_12px_rgba(232,93,76,0.45)] pointer-events-none"
                        style={{
                          left: `${pinPosition.x}%`,
                          top: `${pinPosition.y}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        ) : isShortAnswer ? (
          <div className="space-y-4">
            {!submitted && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!shortAnswerText.trim()) return
                  handleSubmitAnswer(shortAnswerText)
                }}
                className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-4 sm:p-6 space-y-3"
              >
                <label className="text-sm text-[#9a9eab]">Your answer</label>
                <Input
                  type="text"
                  value={shortAnswerText}
                  onChange={(e) => setShortAnswerText(e.target.value)}
                  placeholder="Type here…"
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  className="h-12 bg-[#12141a] border-[#2c313d] focus-visible:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] text-center text-lg md:text-lg rounded-xl"
                />
              </form>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 [&>*:last-child:nth-child(odd)]:col-span-2">
            {(currentQuestion.options || []).map((option, index) => {
              const isSelected = selectedAnswer === option.id
              return (
                <button
                  key={option.id}
                  onClick={() => !submitted && setSelectedAnswer(option.id)}
                  disabled={submitted}
                  className={`relative p-4 sm:p-5 min-h-14 flex items-center rounded-xl text-left font-medium transition-all duration-200 active:scale-[0.98] touch-manipulation select-none ${answerColors[index % answerColors.length]} ${
                    isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#12141a]' : ''
                  } ${submitted && !isSelected ? 'opacity-30' : ''}`}
                >
                  <div className="w-full min-w-0 space-y-2">
                    {option.optionText ? (
                      <div className="text-base sm:text-lg [overflow-wrap:anywhere] font-semibold">{option.optionText}</div>
                    ) : null}
                    {option.mediaUrl ? (
                      <div className="w-full max-h-24 sm:max-h-32 md:max-h-40 rounded-lg overflow-hidden border border-black/20 bg-black/10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={option.mediaUrl}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="pt-1">
          {!submitted ? (
            <div className="sticky bottom-0 z-30 -mx-3 sm:mx-0 px-3 sm:px-0 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-[#12141a]/90 backdrop-blur-md sm:bg-transparent sm:backdrop-blur-none space-y-2">
              {submitError && (
                <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-300 text-center">{submitError}</div>
              )}
              <Button
                onClick={() => {
                  if (isShortAnswer) {
                    handleSubmitAnswer(shortAnswerText)
                  } else if (isPinAnswer) {
                    if (!pinPosition) return
                    handleSubmitAnswer(`${pinPosition.x.toFixed(1)},${pinPosition.y.toFixed(1)}`)
                  } else {
                    handleSubmitAnswer(selectedAnswer)
                  }
                }}
                disabled={!canSubmit}
                size="lg"
                className="w-full h-12 bg-[#f2f0eb] text-[#12141a] hover:bg-white font-semibold rounded-xl disabled:opacity-100 disabled:bg-[#2c313d] disabled:text-[#5c6170]"
              >
                {isPoll ? 'Vote' : 'Submit'}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          ) : feedback ? (
            feedback.isPoll ? (
              pollResults ? (
                <div className="sticky bottom-0 z-30 rounded-2xl border border-[#2dd4bf]/35 bg-[#2dd4bf]/10 p-4 sm:p-6 space-y-3">
                  <p className="text-sm font-semibold text-[#f2f0eb] text-center">Results</p>
                  {pollResults
                    .slice()
                    .sort((a, b) => b.percentage - a.percentage)
                    .map((r) => (
                      <div key={r.optionId} className="space-y-1">
                        <div className="flex items-center justify-between text-sm text-[#f2f0eb]">
                          <span className="min-w-0 flex-1 [overflow-wrap:anywhere] pr-2">{r.text}</span>
                          <span className="font-semibold tabular-nums shrink-0">{r.percentage}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-[#12141a]/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#2dd4bf] transition-all duration-500"
                            style={{ width: `${r.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="sticky bottom-0 z-30 rounded-2xl border border-[#2dd4bf]/35 bg-[#2dd4bf]/10 p-5 sm:p-8 text-center space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#12141a]/40">
                    <Check className="w-7 h-7 text-[#2dd4bf]" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-[#f2f0eb]">Vote recorded</p>
                    <p className="text-sm text-[#9a9eab] mt-1">Thanks — waiting for the host to show results</p>
                  </div>
                </div>
              )
            ) : (
              <div
                className={`sticky bottom-0 z-30 rounded-2xl border p-5 sm:p-8 text-center space-y-3 ${
                  feedback.isCorrect
                    ? 'border-[#2dd4bf]/35 bg-[#2dd4bf]/10'
                    : 'border-[#e85d4c]/35 bg-[#e85d4c]/10'
                }`}
              >
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#12141a]/40">
                  {feedback.isCorrect ? (
                    <Check className="w-7 h-7 text-[#2dd4bf]" />
                  ) : (
                    <XCircle className="w-7 h-7 text-[#e85d4c]" />
                  )}
                </div>
                <div>
                  <p className="text-lg font-semibold text-[#f2f0eb]">
                    {feedback.isCorrect ? 'Correct' : 'Not this time'}
                  </p>
                  <p className="text-sm text-[#9a9eab] mt-1">
                    +{feedback.pointsEarned} points
                  </p>
                  {correctAnswer && !feedback.isCorrect && !isPinAnswer && !isPoll && (
                    <p className="text-sm text-[#f2f0eb] mt-2">
                      Correct answer: <strong className="text-[#2dd4bf]">{correctAnswer}</strong>
                    </p>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="sticky bottom-0 z-30 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-4 sm:p-6 text-center text-sm text-[#9a9eab]">
              Answer locked in
            </div>
          )}
          {submitted && roundLeaderboard.length > 0 && (
            <div className="mt-3 rounded-2xl border border-[#2c313d] bg-[#1a1d26] p-4 sm:p-5 space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#9a9eab] font-semibold">Top 5</p>
              {roundLeaderboard.map((p, i) => {
                const isMe = !!myNickname && p.nickname === myNickname
                return (
                  <div key={p.id || i} className={`flex items-center gap-3 text-sm ${isMe ? 'rounded-lg bg-[#2dd4bf]/10 -mx-2 px-2 py-1' : ''}`}>
                    <span className="w-6 shrink-0 text-right tabular-nums text-[#9a9eab]">{i + 1}</span>
                    <span className={`min-w-0 flex-1 truncate ${isMe ? 'font-semibold text-[#2dd4bf]' : 'text-[#f2f0eb]'}`}>{p.nickname}</span>
                    <span className="shrink-0 tabular-nums font-bold text-[#2dd4bf]">{p.score}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </div>
      </div>
    </GameBackground>
  )
}
