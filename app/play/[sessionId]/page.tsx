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
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; pointsEarned: number } | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [participantId, setParticipantId] = useState('')
  const [playerToken, setPlayerToken] = useState('')

  // Player Paced local tracking
  const [localQuestionIndex, setLocalQuestionIndex] = useState<number>(-1)
  const [totalQuestions, setTotalQuestions] = useState<number>(0)
  const [isPlayerPaced, setIsPlayerPaced] = useState<boolean>(false)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)
  const isPlayerPacedRef = useRef(false)
  const submittingRef = useRef(false)
  const currentQuestionRef = useRef<Question | null>(null)
  const participantIdRef = useRef('')
  const playerTokenRef = useRef('')
  const localIndexRef = useRef(-1)
  const totalQuestionsRef = useRef(0)
  const selectedAnswerRef = useRef<string | null>(null)
  const shortAnswerTextRef = useRef('')
  const pinPositionRef = useRef<{ x: number; y: number } | null>(null)
  const correctAnswerRef = useRef<string | null>(null)

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

  const pinHint = typeof window !== 'undefined'
    ? sessionStorage.getItem(`pin_code_${sessionId}`) || undefined
    : undefined
  const { connected, send, on } = useWebSocket(sessionId, pinHint)

  // Load initial game state
  useEffect(() => {
    const loadGameState = async () => {
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

        if (playerPaced) {
          if (session.status === 'playing' || session.status === 'active') {
            setLocalQuestionIndex(0)
            const question = await getQuestionByIndex(sessionId, 0, pToken || undefined)
            if (question) {
              if (typeof question.total === 'number' && question.total > 0) {
                setTotalQuestions(question.total)
              } else if (session.questionCount > 0) {
                setTotalQuestions(session.questionCount)
              }
              setCurrentQuestion(question)
              setTimeLeft(question?.timeLimit || 30)
              startTimeRef.current = Date.now()
            }
          } else {
            setCurrentQuestion(null)
          }
        } else {
          if (session.currentQuestionIndex !== undefined && session.currentQuestionIndex >= 0) {
            const question = await getQuestionByIndex(sessionId, session.currentQuestionIndex, pToken || undefined)
            setCurrentQuestion(question)
            setTimeLeft(question?.timeLimit || 30)
            startTimeRef.current = Date.now()
          }
        }
      } catch (error) {
        console.error('Error loading game state:', error)
        router.push('/join')
      } finally {
        setLoading(false)
      }
    }

    loadGameState()
  }, [sessionId, router])

  // Poll game state — keeps classic mode in sync even if the WebSocket next_question event is missed
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
          if (currentQuestion) return
          setLocalQuestionIndex(0)
          const question = await getQuestionByIndex(sessionId, 0, pToken || undefined)
          if (cancelled || !question) return
          setCurrentQuestion(question)
          setTimeLeft(question?.timeLimit || 30)
          startTimeRef.current = Date.now()
          setSubmitted(false)
          submittingRef.current = false
          setFeedback(null)
          setCorrectAnswer(null)
          setSelectedAnswer(null)
          setShortAnswerText('')
          setPinPosition(null)
          return
        }

        if (session.currentQuestionIndex === undefined || session.currentQuestionIndex < 0) return

        const question = await getQuestionByIndex(
          sessionId,
          session.currentQuestionIndex,
          pToken || undefined
        )
        if (cancelled || !question) return

        // Only switch question if the server question differs from the local one
        if (!currentQuestion || currentQuestion.id !== question.id) {
          setCurrentQuestion(question)
          setTimeLeft(question?.timeLimit || 30)
          startTimeRef.current = Date.now()
          setSubmitted(false)
          submittingRef.current = false
          setFeedback(null)
          setCorrectAnswer(null)
          setSelectedAnswer(null)
          setShortAnswerText('')
          setPinPosition(null)
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
  }, [loading, currentQuestion, sessionId, router])

  // Handle WebSocket messages
  useEffect(() => {
    if (!connected) return

    const unsubQuestion = on('next_question', async (data) => {
      if (isPlayerPacedRef.current) return
      setSubmitted(false)
      submittingRef.current = false
      setFeedback(null)
      setCorrectAnswer(null)
      setSelectedAnswer(null)
      setShortAnswerText('')
      setPinPosition(null)
      try {
        const question = await getQuestionByIndex(sessionId, data.questionIndex, playerTokenRef.current || undefined)
        setCurrentQuestion(question)
        setTimeLeft(question?.timeLimit || 30)
        startTimeRef.current = Date.now()
      } catch (e: any) {
        if (e.message === 'ROOM_FINISHED') {
          router.push(`/results/${sessionId}`)
        } else {
          console.error('Error loading question:', e)
        }
      }
    })

    const unsubReveal = on('reveal_answer', (data) => {
      if (isPlayerPacedRef.current) return
      setSubmitted(true)
      if (data?.correct_answer) {
        setCorrectAnswer(String(data.correct_answer))
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
          setLocalQuestionIndex(0)
          const question = await getQuestionByIndex(sessionId, 0, pToken || undefined)
          if (question) {
            setCurrentQuestion(question)
            setTimeLeft(question?.timeLimit || 30)
            startTimeRef.current = Date.now()
            setSubmitted(false)
            submittingRef.current = false
            setFeedback(null)
            setCorrectAnswer(null)
            setSelectedAnswer(null)
            setShortAnswerText('')
            setPinPosition(null)
          }
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
  }, [connected, on, sessionId, router])

  const handleSubmitAnswer = useCallback(async (answerVal: string | null) => {
    const pId = participantIdRef.current
    const q = currentQuestionRef.current
    if (!pId || !q || submittingRef.current) return

    submittingRef.current = true
    setSubmitted(true)
    const responseTimeMs = Date.now() - startTimeRef.current
    const timeSpent = Math.floor(responseTimeMs / 1000)
    // Empty string = timed out with no selection (backend accepts & awards 0)
    const optionToSubmit = answerVal ?? ''

    try {
      const res = await submitAnswer(sessionId, pId, q.id, optionToSubmit, timeSpent, responseTimeMs, playerTokenRef.current)
      if (res && res.error) {
        // Stay on the question for late/timeout errors — do NOT kick to results mid-game
        if (res.error.includes('not active') || res.error.includes('exceeded') || res.error.includes('expired')) {
          setFeedback({ isCorrect: false, pointsEarned: 0 })
        }
      } else if (res) {
        setFeedback({
          isCorrect: !!res.is_correct,
          pointsEarned: Number(res.points_earned || 0)
        })
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
          // If total is unknown/0 (mis-counted), still try to load next question
          // instead of ending the game early.
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
            if (typeof nextQ.total === 'number' && nextQ.total > 0) {
              setTotalQuestions(nextQ.total)
            }
            setLocalQuestionIndex(nextIndex)
            setSubmitted(false)
            setFeedback(null)
            setCorrectAnswer(null)
            setSelectedAnswer(null)
            setShortAnswerText('')
            setPinPosition(null)
            submittingRef.current = false
            setCurrentQuestion(nextQ)
            setTimeLeft(nextQ?.timeLimit || 30)
            startTimeRef.current = Date.now()
          } catch (e: any) {
            const msg = String(e?.message || '')
            if (msg === 'ROOM_FINISHED' || msg.toLowerCase().includes('not found')) {
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
      }
    }
  }, [sessionId, router, send])

  // Timer
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
          // Prefer whatever the player already selected; empty = no answer / 0 pts
          const isShort = q.type === 'short_answer'
          const isPin = q.type === 'pin_answer'
          const pending = isShort
            ? (shortAnswerTextRef.current.trim() || null)
            : isPin
              ? (pinPositionRef.current
                  ? `${pinPositionRef.current.x.toFixed(1)},${pinPositionRef.current.y.toFixed(1)}`
                  : null)
              : selectedAnswerRef.current
          handleSubmitAnswer(pending)
        }
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentQuestion, submitted, handleSubmitAnswer])

  // Leave only on real tab close — not on SPA navigation to results
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

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [sessionId])

  if (loading) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#9a9eab] text-sm">Entering room…</p>
        </div>
      </GameBackground>
    )
  }

  if (!currentQuestion) {
    return (
      <GameBackground variant="arena">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm w-full rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-8">
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
  const answerColors = [
    'bg-[#e85d4c] hover:brightness-110',
    'bg-[#5b8def] hover:brightness-110',
    'bg-[#2dd4bf] hover:brightness-110 text-[#0c1412]',
    'bg-[#f0b429] hover:brightness-110 text-[#1a1408]',
  ]

  return (
    <GameBackground variant="arena">
      <div className="flex-1 flex items-center justify-center p-4 md:p-6">
        <div className="max-w-3xl w-full space-y-6">
        {isPlayerPaced && (
          <div className="flex justify-between items-center text-sm text-[#9a9eab]">
            <span>Solo pace</span>
            <span className="text-[#f2f0eb]">
              {localQuestionIndex + 1} / {totalQuestions}
            </span>
          </div>
        )}

        <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#9a9eab]">Time left</span>
            <span className={`text-2xl font-semibold tabular-nums ${timeLeft <= 5 ? 'text-[#e85d4c]' : 'text-[#f2f0eb]'}`}>
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
            <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 md:p-8 space-y-4">
              <h1 className="text-xl md:text-2xl font-semibold text-[#f2f0eb] leading-snug">
                {parsedContent.text}
              </h1>
              {parsedContent.mediaUrl && !isPinAnswer && (
                <div className="w-full aspect-video max-h-56 rounded-xl overflow-hidden border border-[#2c313d] bg-[#12141a] flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={parsedContent.mediaUrl} alt="" className="w-full h-full object-contain" />
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
                  <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-8 text-center text-[#9a9eab]">
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
                    className={`relative w-full aspect-video rounded-2xl overflow-hidden border border-[#2c313d] bg-[#12141a] ${
                      submitted ? 'pointer-events-none opacity-80' : 'cursor-crosshair'
                    }`}
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
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    {pinPosition && (
                      <div
                        className="absolute w-8 h-8 rounded-full bg-[#e85d4c]/35 border-2 border-[#e85d4c] shadow-[0_0_12px_rgba(232,93,76,0.45)] pointer-events-none"
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
            {!submitted ? (
              <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 space-y-3">
                <label className="text-sm text-[#9a9eab]">Your answer</label>
                <Input
                  type="text"
                  value={shortAnswerText}
                  onChange={(e) => setShortAnswerText(e.target.value)}
                  placeholder="Type here…"
                  className="h-12 bg-[#12141a] border-[#2c313d] focus-visible:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] text-center text-lg rounded-xl"
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(currentQuestion.options || []).map((option, index) => {
              const isSelected = selectedAnswer === option.id
              return (
                <button
                  key={option.id}
                  onClick={() => !submitted && setSelectedAnswer(option.id)}
                  disabled={submitted}
                  className={`relative p-5 rounded-xl text-left font-medium transition-all duration-200 active:scale-[0.98] ${answerColors[index % answerColors.length]} ${
                    isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#12141a]' : ''
                  } ${submitted && !isSelected ? 'opacity-30' : ''}`}
                >
                  <div className="text-base break-words">
                    {option.optionText}
                    {option.mediaUrl && (
                      <div className="mt-2 w-24 h-16 rounded-lg overflow-hidden border border-black/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={option.mediaUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className="pt-1">
          {!submitted ? (
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
              disabled={
                isShortAnswer
                  ? !shortAnswerText.trim()
                  : isPinAnswer
                    ? !pinPosition
                    : !selectedAnswer
              }
              size="lg"
              className="w-full h-12 bg-[#f2f0eb] text-[#12141a] hover:bg-white font-semibold rounded-xl disabled:opacity-30"
            >
              Submit
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : feedback ? (
            <div
              className={`rounded-2xl border p-8 text-center space-y-3 ${
                feedback.isCorrect
                  ? 'border-[#2dd4bf]/35 bg-[#2dd4bf]/10'
                  : 'border-[#e85d4c]/35 bg-[#e85d4c]/10'
              }`}
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#12141a]/40">
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
                {correctAnswer && !feedback.isCorrect && !isPinAnswer && (
                  <p className="text-sm text-[#f2f0eb] mt-2">
                    Correct answer: <strong className="text-[#2dd4bf]">{correctAnswer}</strong>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 text-center text-sm text-[#9a9eab]">
              Answer locked in
            </div>
          )}
        </div>
        </div>
      </div>
    </GameBackground>
  )
}
