'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWebSocket } from '@/hooks/use-websocket'
import { fetchPlayerQuestion, submitAnswer, getQuizQuestionsCount, getRoomStandings } from '@/app/actions/game'
import { getGameSession } from '@/app/actions/quizzes'
import { ThemedGameBackground } from '@/components/game-background'
import { Hourglass, ArrowRight, XCircle, Check, MapPin } from 'lucide-react'
import {
  ExplanationSlide,
  parseExplanation,
  preloadExplanation,
  type ExplanationDoc,
} from '@/components/explanation-slide'
import { LeaderboardSlide, type StandingRow } from '@/components/leaderboard-slide'

/** How long the highlighted answer sits before the slide covers it. Short
 *  enough not to stall the game, long enough to actually read the option. */
const ANSWER_DWELL_MS = 1400
/** Must match .animate-explain-sheet-out in globals.css. */
const SHEET_EXIT_MS = 240
/** How long the "you're done" slide sits before the podium. */
const FINISH_DWELL_S = 4
/** How long the scoreboard holds a solo player's screen before it moves on.
 *  Shorter than the explanation: there is nothing to read, only a rank to
 *  find — and the continue button is there for whoever has already found it. */
const LEADERBOARD_DWELL_S = 6

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
  const t = useTranslations('play')
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
  // Explanation slide. `exiting` drives the leave animation, and the countdown
  // is solo-only — in classic mode the host decides when the slide goes away.
  const [explanationDoc, setExplanationDoc] = useState<ExplanationDoc | null>(null)
  const [explanationExiting, setExplanationExiting] = useState(false)
  // The deadline is set where the slide is shown rather than derived in an
  // effect, so the countdown starts on the same frame the sheet appears.
  const [explanationDeadline, setExplanationDeadline] = useState<number | null>(null)
  const [explanationDuration, setExplanationDuration] = useState(10)
  // The scoreboard that closes a question. It is a sheet like the explanation
  // and never shares the screen with it: solo raises it when the slide is
  // dismissed, classic when the host pushes question:leaderboard.
  const [standings, setStandings] = useState<{ top: StandingRow[]; me: StandingRow | null; total: number } | null>(null)
  const [boardExiting, setBoardExiting] = useState(false)
  const [boardDeadline, setBoardDeadline] = useState<number | null>(null)
  // The last sheet of all: the game is over for this player. It exists so the
  // end of a run is a beat rather than a page that swaps out from under them —
  // answering the final question used to land on the podium mid-animation,
  // before the explanation or the scoreboard had been seen at all.
  const [finishSlide, setFinishSlide] = useState(false)
  const [finishExiting, setFinishExiting] = useState(false)
  const [finishDeadline, setFinishDeadline] = useState<number | null>(null)
  const boardOpen = standings !== null

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
  const countdownShownRef = useRef(false)
  const startFailuresRef = useRef(0)
  const selectedAnswerRef = useRef<string | null>(null)
  const shortAnswerTextRef = useRef('')
  const pinPositionRef = useRef<{ x: number; y: number } | null>(null)
  const correctAnswerRef = useRef<string | null>(null)
  const pendingFeedbackRef = useRef<{ isCorrect: boolean; pointsEarned: number; isPoll?: boolean } | null>(null)
  // Read inside the websocket handler, which is registered once: the host's
  // leaderboard push has to know whether a slide is still on screen to take
  // down first, and the closure captured at registration never would.
  const explanationDocRef = useRef<ExplanationDoc | null>(null)
  // True while any sheet owns the screen. A room that ends underneath one must
  // not throw the player to the podium mid-slide.
  const sheetActiveRef = useRef(false)
  // True from the moment an answer schedules its sheets until the last one is
  // gone — including the dwell before the first sheet appears, when nothing is
  // on screen yet. Without that window the gate below reads "no sheet", opens
  // the completion slide immediately, and the scheduled scoreboard then lands
  // on top of it: the two slides come out in the wrong order.
  const sequenceActiveRef = useRef(false)
  // Sheet timers, so a player who leaves the question does not get a slide
  // raised behind them a beat later.
  const sequenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A departure that arrived during a sheet, waiting for the sequence to end.
  const pendingResultsRef = useRef(false)
  const finishBusyRef = useRef(false)
  // The completion slide outlives the board it follows, and the board's data is
  // cleared when it closes — so the score is kept here rather than read back
  // out of a state that is deliberately empty by then.
  const myScoreRef = useRef<number | null>(null)

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
  useEffect(() => { explanationDocRef.current = explanationDoc }, [explanationDoc])
  // A safety net only. Every open and close below also sets these refs inline,
  // because an effect runs after the render — and the code that closes a sheet
  // asks "is a sheet up?" in the same tick, before the effect has caught up.
  // Reading a stale "yes" there deferred the departure to a sheet that had
  // already gone, and the player sat on an answered question for good.
  useEffect(() => {
    boardOpenRef.current = standings !== null
    sheetActiveRef.current = !!explanationDoc || standings !== null || finishSlide
  }, [explanationDoc, standings, finishSlide])

  const clearSequenceTimer = useCallback(() => {
    if (sequenceTimerRef.current) {
      clearTimeout(sequenceTimerRef.current)
      sequenceTimerRef.current = null
    }
  }, [])
  useEffect(() => clearSequenceTimer, [clearSequenceTimer])

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
    setExplanationDoc(null)
    setExplanationExiting(false)
    setExplanationDeadline(null)
    setStandings(null)
    setBoardExiting(false)
    setBoardDeadline(null)
    pendingFeedbackRef.current = null
  }, [])

  // Quiz-level pacing for the solo slide, carried on the room's theme_config.
  const applyExplanationDuration = useCallback((config: any) => {
    const n = Number(config?.explanation_duration)
    if (Number.isFinite(n) && n > 0) setExplanationDuration(n)
  }, [])

  const soloAdvanceRef = useRef<null | (() => Promise<void>)>(null)
  const explanationBusyRef = useRef(false)
  const explanationContinueRef = useRef<() => void>(() => {})
  const explanationDurationRef = useRef(10)
  const boardBusyRef = useRef(false)
  const boardContinueRef = useRef<() => void>(() => {})
  const showFinishSlideRef = useRef<() => void>(() => {})
  const boardOpenRef = useRef(false)

  /**
   * Raise the scoreboard. `autoAdvance` is solo mode: there the board owes the
   * player the next question when it goes away, so it counts itself down and
   * carries the pending advance. In classic mode the host owns the pacing and
   * the board sits there until the next question arrives.
   *
   * `jitterMs` spreads the request. The host's push lands on every phone in
   * the room in the same instant, and a full room asking for its standings at
   * once is a spike on top of the 2.5s poll each of them is already running —
   * for a slide nobody is comparing side by side.
   */
  const openLeaderboard = useCallback(async (autoAdvance: boolean, jitterMs = 0) => {
    // The run is already over and being closed out; a board now would land on
    // top of the completion slide.
    if (finishBusyRef.current) return
    // Jitter and a retry together can outlive the question they belong to: a
    // host who moves on while this is in flight must not have the board of the
    // last question drop over the new one.
    const forQuestionId = currentQuestionRef.current?.id
    const stale = () => !autoAdvance && currentQuestionRef.current?.id !== forQuestionId
    if (jitterMs > 0) {
      await new Promise(resolve => setTimeout(resolve, Math.random() * jitterMs))
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (stale()) return
      try {
        const data = await getRoomStandings(sessionId, playerTokenRef.current || undefined)
        if (stale()) return
        setBoardExiting(false)
        sheetActiveRef.current = true
        boardOpenRef.current = true
        if (data.me) myScoreRef.current = data.me.score
        setStandings(data)
        if (autoAdvance) setBoardDeadline(Date.now() + LEADERBOARD_DWELL_S * 1000)
        return
      } catch (e) {
        console.error('Failed to load standings', e)
        // The board is the last beat of a question, not the game. A solo
        // player must not be stranded on a question they have already
        // answered, waiting for a slide that is never coming.
        if (autoAdvance) {
          const advance = soloAdvanceRef.current
          soloAdvanceRef.current = null
          if (advance) void advance()
          return
        }
        // Classic mode is waiting on the host either way, so one retry costs
        // the player nothing — and a request lost to a rate limiter in a full
        // room is exactly the case worth retrying.
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 800))
        }
      }
    }
  }, [sessionId])

  const openLeaderboardRef = useRef(openLeaderboard)
  useEffect(() => { openLeaderboardRef.current = openLeaderboard }, [openLeaderboard])

  /** Dismiss the board and move on — the button and the countdown share it. */
  const handleLeaderboardContinue = useCallback(() => {
    if (boardBusyRef.current) return
    boardBusyRef.current = true
    setBoardDeadline(null)
    setBoardExiting(true)
    setTimeout(() => {
      const advance = soloAdvanceRef.current
      soloAdvanceRef.current = null
      boardBusyRef.current = false
      setStandings(null)
      setBoardExiting(false)
      boardOpenRef.current = false
      sheetActiveRef.current = false
      // The room ended while the board was up — this was the last question, so
      // the sequence ends with the completion slide instead of a next question.
      if (pendingResultsRef.current) {
        pendingResultsRef.current = false
        sequenceActiveRef.current = false
        showFinishSlideRef.current()
        return
      }
      sequenceActiveRef.current = false
      if (advance) void advance()
    }, SHEET_EXIT_MS)
  }, [])

  useEffect(() => {
    boardContinueRef.current = handleLeaderboardContinue
  }, [handleLeaderboardContinue])

  /** Raise the completion slide. The podium follows when it goes away. */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- no deps: it only flips local state
  const showFinishSlide = useCallback(() => {
    if (finishBusyRef.current) return
    finishBusyRef.current = true
    sheetActiveRef.current = true
    setFinishExiting(false)
    setFinishSlide(true)
    setFinishDeadline(Date.now() + FINISH_DWELL_S * 1000)
  }, [])

  useEffect(() => { showFinishSlideRef.current = showFinishSlide }, [showFinishSlide])

  const finishContinueRef = useRef<() => void>(() => {})
  const handleFinishContinue = useCallback(() => {
    setFinishDeadline(null)
    setFinishExiting(true)
    setTimeout(() => router.push(`/results/${sessionId}`), SHEET_EXIT_MS)
  }, [router, sessionId])

  useEffect(() => {
    finishContinueRef.current = handleFinishContinue
  }, [handleFinishContinue])

  useEffect(() => {
    if (finishDeadline === null) return
    const id = setInterval(() => {
      if (Date.now() >= finishDeadline) {
        clearInterval(id)
        finishContinueRef.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [finishDeadline])

  /**
   * The single way out to the podium for a game that ended normally.
   *
   * A solo player answering their last question, and the host closing the room
   * on the last one, both land here while a sheet is very likely still on
   * screen — the explanation, or the scoreboard that follows it. Cutting to the
   * podium there is what made the end of a game feel like a dropped frame, so
   * the departure waits for the sequence and the completion slide closes it.
   *
   * A room that ended early carries a reason and does not come through here:
   * there is nothing to congratulate, and the podium explains itself.
   */
  const leaveToResults = useCallback(() => {
    if (finishBusyRef.current) return
    if (sheetActiveRef.current || sequenceActiveRef.current) {
      pendingResultsRef.current = true
      // A classic sheet has no continue button — the host drives it — so
      // nothing would ever pick this up and the player would sit on the
      // scoreboard of a room that is already over. The game ending is the
      // permission to close it.
      if (!isPlayerPacedRef.current) {
        if (boardOpenRef.current) boardContinueRef.current()
        else if (explanationDocRef.current) explanationContinueRef.current()
      }
      return
    }
    showFinishSlide()
  }, [showFinishSlide])

  const leaveToResultsRef = useRef(leaveToResults)
  useEffect(() => { leaveToResultsRef.current = leaveToResults }, [leaveToResults])

  /** Dismiss the slide and move on — the button and the countdown share it. */
  const handleExplanationContinue = useCallback(() => {
    if (explanationBusyRef.current) return
    explanationBusyRef.current = true
    setExplanationDeadline(null)
    setExplanationExiting(true)
    setTimeout(() => {
      explanationBusyRef.current = false
      setExplanationDoc(null)
      setExplanationExiting(false)
      explanationDocRef.current = null
      sheetActiveRef.current = false
      if (pendingResultsRef.current) {
        pendingResultsRef.current = false
        sequenceActiveRef.current = false
        showFinishSlideRef.current()
        return
      }
      // In classic mode the explanation is the whole sequence; solo carries on
      // into the scoreboard below.
      if (!isPlayerPacedRef.current) sequenceActiveRef.current = false
      // The scoreboard is the next beat, not the next question: it inherits
      // the pending advance and holds it until the player has seen where the
      // answer they just gave put them.
      if (isPlayerPacedRef.current) void openLeaderboardRef.current(true)
    }, SHEET_EXIT_MS)
  }, [])

  useEffect(() => {
    explanationContinueRef.current = handleExplanationContinue
  }, [handleExplanationContinue])
  useEffect(() => { explanationDurationRef.current = explanationDuration }, [explanationDuration])

  // Solo only. In classic mode the slide stays up until the host moves on, so
  // there is nothing to count down to.
  // The bar in the button is pure CSS, so this only has to fire once, at the
  // end. It still polls rather than using a single timeout: a backgrounded tab
  // throttles timers, and a poll that wakes up late advances immediately
  // instead of leaving the slide up for however long the tab was asleep.
  useEffect(() => {
    if (explanationDeadline === null) return
    const id = setInterval(() => {
      if (Date.now() >= explanationDeadline) {
        clearInterval(id)
        explanationContinueRef.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [explanationDeadline])

  // Solo only, and for the same reason the explanation countdown polls rather
  // than firing one timeout: a backgrounded tab throttles timers, and a poll
  // that wakes up late moves on immediately instead of leaving the board up.
  useEffect(() => {
    if (boardDeadline === null) return
    const id = setInterval(() => {
      if (Date.now() >= boardDeadline) {
        clearInterval(id)
        boardContinueRef.current()
      }
    }, 250)
    return () => clearInterval(id)
  }, [boardDeadline])

  // Solo only, and this is the whole point of the board there: every other
  // player is still answering while it is on screen, so a snapshot taken when
  // it opened is wrong by the time it closes — the player who finished first
  // sat there reading that they were winning. Classic mode needs none of this:
  // the board opens after the reveal, when every score for that question is
  // already final, and a full room re-asking every 2s would be a flood.
  useEffect(() => {
    if (!boardOpen || boardExiting || !isPlayerPaced) return
    const id = setInterval(async () => {
      try {
        const data = await getRoomStandings(sessionId, playerTokenRef.current || undefined)
        // Only into a board that is still open: a response landing after the
        // player moved on must not put it back.
        setStandings(prev => (prev ? data : prev))
      } catch (e) {
        console.error('Failed to refresh standings', e)
      }
    }, 2000)
    return () => clearInterval(id)
  }, [boardOpen, boardExiting, isPlayerPaced, sessionId])

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
    sequenceActiveRef.current = false
    sheetActiveRef.current = false
    boardOpenRef.current = false
    explanationDocRef.current = null
    resetAnswerInputs(question)
  }, [resetAnswerInputs])

  const loadSoloFirstQuestion = useCallback(async (pToken: string) => {
    const res = await fetchPlayerQuestion(sessionId, 0, pToken || undefined)
    // Throw rather than return quietly: a silent return left startSequenceRef
    // latched on with no question loaded, and the lobby poll below then skipped
    // every subsequent tick — the player sat on "waiting for host" until they
    // reloaded the page. The code travels in the error message so the caller
    // can still tell "finished" from "retry me".
    if (!res.ok) throw new Error(res.code)
    applyQuestion(res.question, 0, res.question.activeUntil)
  }, [sessionId, applyQuestion])

  const beginGameFromLobby = useCallback(async (opts: { playerPaced: boolean; pToken: string }) => {
    if (startSequenceRef.current) return
    startSequenceRef.current = true
    try {
      // The 3-2-1 is a one-off. A retry must not replay it, or a player whose
      // first fetch failed would watch the countdown loop every 2.5s.
      if (!countdownShownRef.current) {
        countdownShownRef.current = true
        await runStartCountdown()
      }
      if (opts.playerPaced) {
        await loadSoloFirstQuestion(opts.pToken)
      }
      startFailuresRef.current = 0
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.includes('NO_MORE_QUESTIONS') || msg === 'ROOM_FINISHED') {
        // Actually finished — not a failure to recover from.
        startSequenceRef.current = true
        throw e
      }
      // Hand the lobby poll another go. One dropped request on venue wifi used
      // to be permanent: the guard stayed latched and nothing ever retried.
      startSequenceRef.current = false
      startFailuresRef.current += 1
      if (startFailuresRef.current >= 3) {
        setLoadError(t('enterRoundFailed'))
      }
      throw e
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
        applyExplanationDuration(config)

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
            const res = await fetchPlayerQuestion(sessionId, idx, pToken || undefined)
            if (res.ok) {
              // Resync countdown to the server deadline — the timer keeps
              // running server-side across a reload.
              const question = res.question
              applyQuestion(question, idx, question.activeUntil || cq.active_until)
              if (session.questionCount > 0 && !(typeof question.total === 'number' && question.total > 0)) {
                setTotalQuestions(session.questionCount)
              }
            } else if (res.code === 'NO_MORE_QUESTIONS' || res.code === 'ROOM_FINISHED') {
              router.push(`/results/${sessionId}`)
            }
          } else {
            setCurrentQuestion(null)
          }
        } else if (session.currentQuestionIndex !== undefined && session.currentQuestionIndex >= 0) {
          startSequenceRef.current = true
          const res = await fetchPlayerQuestion(sessionId, session.currentQuestionIndex, pToken || undefined)
          if (res.ok) applyQuestion(res.question, session.currentQuestionIndex)
          else if (res.code === 'ROOM_FINISHED') {
            router.push(`/results/${sessionId}`)
            return
          }
        }
      } catch (error: any) {
        console.error('Error loading game state:', error)
        const msg = String(error?.message || '')
        if (msg === 'ROOM_FINISHED') {
          router.push(`/results/${sessionId}`)
        } else {
          setLoadError(t('loadRoomFailed'))
        }
      } finally {
        setLoading(false)
      }
  }, [sessionId, router, applyQuestion, applyExplanationDuration])

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
          // Through the gate, not straight to the podium: this is also how the
          // end of a game reaches a player whose websocket dropped, and they
          // deserve the same closing beat as everyone else.
          leaveToResultsRef.current()
          return
        }

        let config: any = {}
        try { config = JSON.parse(session.themeConfig || '{}') } catch { config = {} }
        const playerPaced = config.game_mode === 'player_paced'
        setIsPlayerPaced(playerPaced)
        applyExplanationDuration(config)
        setGameState(session)

        if (session.status !== 'playing' && session.status !== 'active') return

        if (playerPaced) {
          if (currentQuestionRef.current || startSequenceRef.current) return
          // Reached either on the first tick after the host starts, or as a
          // retry after a failed attempt cleared the guard.
          await beginGameFromLobby({ playerPaced: true, pToken })
          return
        }

        if (!startSequenceRef.current && (session.currentQuestionIndex === undefined || session.currentQuestionIndex < 0)) {
          // The game is live but no question is active yet: the host is running
          // its 3-2-1-GO. Run the same countdown here so a player who missed the
          // game:started push still sees it instead of the lobby. The question
          // itself still arrives from the server's question:active event.
          await beginGameFromLobby({ playerPaced: false, pToken })
          return
        }

        if (session.currentQuestionIndex === undefined || session.currentQuestionIndex < 0) return

        const res = await fetchPlayerQuestion(
          sessionId,
          session.currentQuestionIndex,
          pToken || undefined
        )
        if (cancelled) return
        if (!res.ok) {
          if (res.code === 'ROOM_FINISHED') router.push(`/results/${sessionId}`)
          return
        }

        if (currentQuestionRef.current?.id !== res.question.id) {
          applyQuestion(res.question, session.currentQuestionIndex, session.questionActiveUntil)
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
  }, [loading, sessionId, router, beginGameFromLobby, applyQuestion, applyExplanationDuration])

  useEffect(() => {
    if (!connected) return

    const unsubQuestion = on('next_question', async (data) => {
      if (isPlayerPacedRef.current) return
      const res = await fetchPlayerQuestion(sessionId, data.questionIndex, playerTokenRef.current || undefined)
      if (res.ok) {
        applyQuestion(res.question, data.questionIndex, data.activeUntil || res.question.activeUntil)
      } else if (res.code === 'ROOM_FINISHED' || res.code === 'NO_MORE_QUESTIONS') {
        router.push(`/results/${sessionId}`)
      } else {
        console.error('Error loading question:', res.code, res.message)
        setLoadError(t('loadQuestionFailed'))
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

    // Classic mode: the host pushes the slide when they are ready. Solo mode
    // gets its slide straight off the submit response instead, so this is a
    // no-op there.
    const unsubExplain = on('question:explain', async (data) => {
      if (isPlayerPacedRef.current) return
      const doc = parseExplanation(data?.explanation)
      if (!doc) return
      setSubmitted(true)
      sequenceActiveRef.current = true
      await preloadExplanation(doc)
      setExplanationExiting(false)
      sheetActiveRef.current = true
      explanationDocRef.current = doc
      setExplanationDoc(doc)
    })

    // Classic mode: the host closes the question with the scoreboard, after the
    // explanation slide when the question has one. Solo mode raises its own.
    const unsubBoard = on('question:leaderboard', () => {
      if (isPlayerPacedRef.current) return
      setSubmitted(true)
      sequenceActiveRef.current = true
      if (explanationDocRef.current) {
        // Let the slide leave before the board arrives; two sheets animating
        // over each other reads as a glitch rather than a transition.
        setExplanationExiting(true)
        setTimeout(() => {
          setExplanationDoc(null)
          setExplanationExiting(false)
          void openLeaderboardRef.current(false, 1200)
        }, SHEET_EXIT_MS)
      } else {
        void openLeaderboardRef.current(false, 1200)
      }
    })

    const unsubEnd = on('end_game', (payload: any) => {
      // A room that ended early goes straight to the podium, which explains
      // why. There is nothing to congratulate, and holding a player on a
      // "you finished" slide when the host pulled the plug would be a lie.
      // Carry the reason through the URL so the results page can paint it
      // immediately; it re-reads the authoritative value from the API.
      if (payload?.reason) {
        router.push(`/results/${sessionId}?reason=${encodeURIComponent(payload.reason)}`)
        return
      }
      leaveToResultsRef.current()
    })

    const unsubGameStart = on('game:started', async () => {
      try {
        const pToken = playerTokenRef.current || sessionStorage.getItem(`player_token_${sessionId}`) || ''
        const session = await getGameSession(sessionId, pToken || undefined)
        let config: any = {}
        try { config = JSON.parse(session.themeConfig || '{}') } catch { config = {} }
        const playerPaced = config.game_mode === 'player_paced'
        setIsPlayerPaced(playerPaced)
        applyExplanationDuration(config)
        setGameState((prev: any) => ({ ...(prev || {}), ...session, status: 'playing' }))

        // Both modes run the same 3-2-1-GO the host is showing. Classic mode
        // does not load a question here — the host publishes question:active
        // when its own countdown ends, which lands while this one is running.
        await beginGameFromLobby({ playerPaced, pToken })
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
      unsubExplain()
      unsubBoard()
      unsubEnd()
      unsubGameStart()
    }
  }, [connected, on, sessionId, router, beginGameFromLobby, applyQuestion, applyExplanationDuration])

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
        // submitAnswer returns its failure, it never throws, so the catch below
        // never sees this sentinel. The host closed the room while this answer
        // was in flight: there is nothing to score and nowhere to go but the
        // podium.
        if (res.error.includes('ROOM_FINISHED')) {
          router.push(`/results/${sessionId}`)
          return
        }
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
          setSubmitError(t('submitFailed'))
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
        const advance = async () => {
          const nextIndex = localIndexRef.current + 1
          const knownTotal = totalQuestionsRef.current
          if (knownTotal > 0 && nextIndex >= knownTotal) {
            leaveToResultsRef.current()
            return
          }
          // The end of a solo game arrives here: the server reports
          // NO_MORE_QUESTIONS once the player has answered their last one. This
          // used to read the message off a thrown error, which production
          // redacts, so no branch matched and the player sat on their answered
          // last question instead of seeing the podium.
          const nextRes = await fetchPlayerQuestion(sessionId, nextIndex, playerTokenRef.current || undefined)
          if (nextRes.ok) {
            applyQuestion(nextRes.question, nextIndex, nextRes.question.activeUntil)
          } else if (nextRes.code === 'ERROR') {
            console.error('Error loading next solo question:', nextRes.message)
            submittingRef.current = false
          } else {
            // NO_MORE_QUESTIONS / ROOM_FINISHED / NOT_FOUND / NOT_ACTIVE all
            // mean the same thing for this player: they are done.
            leaveToResultsRef.current()
          }
        }

        // A slide on this question is the host asking for a teaching beat, and
        // it is also what earns the player the answer itself: highlight what
        // was right, let it sit long enough to read, then raise the slide.
        const doc = parseExplanation((res as any)?.explanation)
        soloAdvanceRef.current = advance
        // From here until the last sheet closes, this answer owns the screen —
        // including the dwell before the first sheet is up.
        sequenceActiveRef.current = true
        clearSequenceTimer()
        if (doc) {
          const answer = (res as any)?.correct_answer
          if (answer) setCorrectAnswer(String(answer))
          void preloadExplanation(doc)
          sequenceTimerRef.current = setTimeout(() => {
            sequenceTimerRef.current = null
            setExplanationExiting(false)
            setExplanationDeadline(Date.now() + explanationDurationRef.current * 1000)
            sheetActiveRef.current = true
            explanationDocRef.current = doc
            setExplanationDoc(doc)
          }, ANSWER_DWELL_MS)
        } else {
          // No slide on this question, so the answer holds the screen for its
          // own beat and the scoreboard closes the question instead.
          sequenceTimerRef.current = setTimeout(() => {
            sequenceTimerRef.current = null
            void openLeaderboardRef.current(true)
          }, 2500)
        }
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
        setSubmitError(t('submitFailed'))
      }
    }
  }, [sessionId, router, send, applyQuestion, clearSequenceTimer])

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
      <ThemedGameBackground variant="arena" themeConfig={gameState?.themeConfig} surface="player">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#2c313d] border-t-[#e85d4c] animate-spin" />
            <p className="text-sm text-[#9a9eab] mt-4">{t('loading')}</p>
          </div>
        </div>
      </ThemedGameBackground>
    )
  }

  if (loadError) {
    return (
      <ThemedGameBackground variant="arena" themeConfig={gameState?.themeConfig} surface="player">
        <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="max-w-md w-full rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 sm:p-8 text-center">
            <XCircle className="w-8 h-8 text-[#e85d4c] mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[#f2f0eb]">{loadError}</h1>
            <p className="text-sm text-[#9a9eab] mt-2 leading-relaxed">
              {t('networkHint')}
            </p>
            <Button
              onClick={() => {
                setLoadError(null)
                // Clear the latches too, or a solo player who failed into this
                // screen would reload the session and still be skipped by the
                // lobby poll's start-sequence guard.
                startSequenceRef.current = false
                startFailuresRef.current = 0
                loadGameState()
              }}
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

  if (startCountdown !== null) {
    return (
      <ThemedGameBackground variant="arena" themeConfig={gameState?.themeConfig} surface="player">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-6xl sm:text-7xl md:text-8xl font-black text-[#f2f0eb] tabular-nums">
              {startCountdown === 0 ? 'GO' : startCountdown}
            </p>
          </div>
        </div>
      </ThemedGameBackground>
    )
  }

  if (!currentQuestion) {
    return (
      <ThemedGameBackground variant="arena" themeConfig={gameState?.themeConfig} surface="player">
        <div className="flex-1 flex items-start sm:items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="max-w-md w-full rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-6 sm:p-8 text-center">
            <Hourglass className="w-8 h-8 text-[#e85d4c] mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-[#f2f0eb]">{t('waitingHost')}</h1>
            <p className="text-sm text-[#9a9eab] mt-2 leading-relaxed">
              {t('waitingBody')}
            </p>
          </div>
        </div>
      </ThemedGameBackground>
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
    <ThemedGameBackground variant="arena" themeConfig={gameState?.themeConfig} surface="player">
      {/* The slide is a sheet over the answer the player just saw, not a new
          screen: the question stays behind it, dimmed and set back, so the
          explanation reads as more detail rather than a page change. */}
      {explanationDoc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
            style={{ opacity: explanationExiting ? 0 : 1 }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            // dvh, not vh: a phone's 100vh is the viewport with the browser
            // chrome hidden, so a vh-sized sheet pushes its own action bar
            // under the address bar. The sheet takes nearly the whole screen —
            // the slide is the thing the player is meant to be reading.
            className={`relative w-full sm:max-w-3xl h-[92dvh] sm:h-auto max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl ${
              explanationExiting ? 'animate-explain-sheet-out' : 'animate-explain-sheet-in'
            }`}
          >
            {/* Wide enough for the host's composition, the slide gets the host's
                16:9 frame; a phone gets the leftover height instead, since
                letterboxing a slide on a tall screen is what made it small. */}
            <div className="relative z-0 flex-1 min-h-0 sm:flex-none sm:aspect-video">
              <ExplanationSlide doc={explanationDoc} variant="sheet" />
            </div>
            <div className="relative z-10 shrink-0 border-t border-white/10 bg-[#1a1d26] p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {isPlayerPaced ? (
                <Button
                  onClick={handleExplanationContinue}
                  className="relative w-full h-12 rounded-xl bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-bold text-base cursor-pointer gap-2 overflow-hidden"
                >
                  {/* Drains left to right over the slide's own duration. It is
                      decorative — the button does the same thing whether the
                      player waits for it or not. */}
                  {explanationDeadline !== null && !explanationExiting && (
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-white/20 animate-explain-progress pointer-events-none"
                      style={{ animationDuration: `${explanationDuration}s` }}
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-2">
                    {t('explanationContinue')}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Button>
              ) : (
                <p className="text-center text-sm text-[#9a9eab]">{t('explanationWaitHost')}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Same sheet as the explanation, deliberately: to a player the two are
          one sequence — here is why, here is where that put you — and giving
          the scoreboard its own screen would break the beat in half. */}
      {standings && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
            style={{ opacity: boardExiting ? 0 : 1 }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            className={`relative w-full sm:max-w-3xl h-[92dvh] sm:h-auto max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden border border-white/10 shadow-2xl ${
              boardExiting ? 'animate-explain-sheet-out' : 'animate-explain-sheet-in'
            }`}
          >
            <div className="relative z-0 flex-1 min-h-0 sm:flex-none sm:h-[28rem]">
              <LeaderboardSlide
                rows={standings.top}
                me={standings.me}
                total={standings.total}
                pointsEarned={feedback && !feedback.isPoll ? feedback.pointsEarned : null}
                variant="sheet"
              />
            </div>
            <div className="relative z-10 shrink-0 border-t border-white/10 bg-[#1a1d26] p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {isPlayerPaced ? (
                <Button
                  onClick={handleLeaderboardContinue}
                  className="relative w-full h-12 rounded-xl bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-bold text-base cursor-pointer gap-2 overflow-hidden"
                >
                  {boardDeadline !== null && !boardExiting && (
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-white/20 animate-explain-progress pointer-events-none"
                      style={{ animationDuration: `${LEADERBOARD_DWELL_S}s` }}
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-2">
                    {t('explanationContinue')}
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </Button>
              ) : (
                <p className="text-center text-sm text-[#9a9eab]">{t('leaderboardWaitHost')}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* The last sheet: the run is over. It carries no scores — the podium
          behind it is about to, and the point here is the full stop. */}
      {finishSlide && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300"
            style={{ opacity: finishExiting ? 0 : 1 }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            className={`relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden border border-white/10 bg-[#1a1d26] shadow-2xl ${
              finishExiting ? 'animate-explain-sheet-out' : 'animate-explain-sheet-in'
            }`}
          >
            <div className="p-6 sm:p-10 text-center space-y-4">
              <div className="mx-auto inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#2dd4bf]/15">
                <Check className="w-9 h-9 text-[#2dd4bf]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl font-black text-[#f2f0eb]">{t('finishTitle')}</h2>
                <p className="text-sm sm:text-base text-[#9a9eab] leading-relaxed">{t('finishBody')}</p>
              </div>
              {myScoreRef.current !== null && (
                <p className="text-lg font-bold text-[#e85d4c] tabular-nums">
                  {t('finishScore', { score: myScoreRef.current })}
                </p>
              )}
            </div>
            <div className="border-t border-white/10 p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <Button
                onClick={handleFinishContinue}
                className="relative w-full h-12 rounded-xl bg-[#e85d4c] hover:bg-[#d44e3e] text-white font-bold text-base cursor-pointer gap-2 overflow-hidden"
              >
                {finishDeadline !== null && !finishExiting && (
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-white/20 animate-explain-progress pointer-events-none"
                    style={{ animationDuration: `${FINISH_DWELL_S}s` }}
                  />
                )}
                <span className="relative z-10 inline-flex items-center gap-2">
                  {t('finishContinue')}
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Button>
            </div>
          </div>
        </div>
      )}
      <div
        className={`flex-1 flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4 md:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ${
          (explanationDoc && !explanationExiting) || (standings && !boardExiting) || (finishSlide && !finishExiting)
            ? 'explain-backdrop-recede'
            : ''
        }`}
      >
        <div className="max-w-3xl w-full space-y-3 sm:space-y-5 md:space-y-6">
        {/* No "reconnecting" banner. A dropped socket is not something a player
            can act on, and it is not fatal either: realtime here is receive-only
            and the 2.5s REST poll drives the game regardless. The banner only
            ever alarmed people — for most of its life it was firing every 25s
            because the client's own keepalive was killing the connection. */}

        {isPlayerPaced && totalQuestions > 0 && (
          <div className="flex justify-between items-center text-sm text-[#9a9eab]">
            <span>{t('soloPace')}</span>
            <span className="text-[#f2f0eb]">
              {localQuestionIndex + 1} / {totalQuestions}
            </span>
          </div>
        )}

        <div className="sticky top-0 z-30 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/90 backdrop-blur-md p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[#9a9eab]">{t('timeLeft')}</span>
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
                    {t('pinNoImage')}
                  </div>
                )
              }
              return (
                <div className="space-y-2">
                  <p className="text-sm text-[#9a9eab] flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#e85d4c]" />
                    {t('pinHint')}
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
                <label className="text-sm text-[#9a9eab]">{t('yourAnswer')}</label>
                <Input
                  type="text"
                  value={shortAnswerText}
                  onChange={(e) => setShortAnswerText(e.target.value)}
                  placeholder={t('typeHere')}
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
              // Marking the right option is how the answer is actually shown —
              // right or wrong, and in both modes. It only lights up once the
              // server has sent correctAnswer, which it does on the host's
              // reveal (classic) or with the submission (solo, slide questions).
              const isCorrectOption =
                !!correctAnswer && String(option.id).toLowerCase() === correctAnswer.toLowerCase()
              return (
                <button
                  key={option.id}
                  onClick={() => !submitted && setSelectedAnswer(option.id)}
                  disabled={submitted}
                  className={`relative p-4 sm:p-5 min-h-14 flex items-center rounded-xl text-left font-medium transition-all duration-200 active:scale-[0.98] touch-manipulation select-none ${answerColors[index % answerColors.length]} ${
                    isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#12141a]' : ''
                  } ${
                    isCorrectOption
                      ? 'opacity-100 ring-2 ring-[#2dd4bf] ring-offset-2 ring-offset-[#12141a]'
                      : submitted && !isSelected
                        ? 'opacity-30'
                        : ''
                  } ${submitted && isSelected && correctAnswer && !isCorrectOption ? 'opacity-60' : ''}`}
                >
                  {isCorrectOption && (
                    <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-[#2dd4bf] text-[#0c1412] flex items-center justify-center shadow-lg">
                      <Check className="w-4 h-4" />
                    </span>
                  )}
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
                  <p className="text-sm font-semibold text-[#f2f0eb] text-center">{t('results')}</p>
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
                    <p className="text-lg font-semibold text-[#f2f0eb]">{t('voteRecorded')}</p>
                    <p className="text-sm text-[#9a9eab] mt-1">{t('votedWaiting')}</p>
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
                    {feedback.isCorrect ? t('correct') : t('notThisTime')}
                  </p>
                  <p className="text-sm text-[#9a9eab] mt-1">
                    +{feedback.pointsEarned} points
                  </p>
                  {correctAnswer && !feedback.isCorrect && !isPinAnswer && !isPoll && (
                    <p className="text-sm text-[#f2f0eb] mt-2">
                      {t('correctAnswer')} <strong className="text-[#2dd4bf]">{correctAnswer}</strong>
                    </p>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="sticky bottom-0 z-30 rounded-2xl border border-[#2c313d] bg-[#1a1d26]/95 p-4 sm:p-6 text-center text-sm text-[#9a9eab]">
              {t('answerLocked')}
            </div>
          )}
          {submitted && roundLeaderboard.length > 0 && (
            <div className="mt-3 rounded-2xl border border-[#2c313d] bg-[#1a1d26] p-4 sm:p-5 space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#9a9eab] font-semibold">{t('top5')}</p>
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
    </ThemedGameBackground>
  )
}
