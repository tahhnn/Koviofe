'use server'

import { apiRequest } from '@/services/api/client'
import { revalidatePath } from 'next/cache'

// Submit answer for guest player
export async function submitAnswer(
  sessionId: string,
  participantId: string,
  questionId: string,
  selectedOptionId: string | null,
  timeSpent: number,
  responseTimeMs: number = 0,
  playerToken: string = ''
) {
  try {
    const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082/api'
    const res = await fetch(`${API_URL}/rooms/submit-answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Player-ID': participantId,
        'X-Player-Token': playerToken,
      },
      body: JSON.stringify({
        question_id: Number(questionId),
        selected_option: selectedOptionId || '',
        response_time_ms: responseTimeMs,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Failed to submit answer')
    }

    revalidatePath(`/host/${sessionId}`)
    revalidatePath(`/play/${sessionId}`)

    return {
      id: participantId + '_' + questionId,
      sessionId,
      participantId,
      questionId,
      selectedOptionId,
      timeSpent,
      isCorrect: data.is_correct,
      points: data.points_earned,
      is_correct: data.is_correct,
      points_earned: data.points_earned,
      recorded: !!data.recorded,
      question_type: data.question_type,
      // Solo mode only, and only for questions the host gave a slide: the
      // server sends the answer back with the submission so the player can be
      // shown what was right before the explanation appears.
      correct_answer: data.correct_answer ? String(data.correct_answer) : '',
      explanation: data.explanation ? String(data.explanation) : '',
    }
  } catch (e: any) {
    console.error('Error submitting answer: ', e)
    return {
      error: e.message || 'Error submitting answer',
    }
  }
}

// Get question by index (host sees full quiz; player uses dedicated safe endpoint)
export async function getQuestionByIndex(sessionId: string, questionIndex: number, playerToken?: string) {
  if (playerToken) {
    const data = await apiRequest(
      `/rooms/${sessionId}/questions/${questionIndex}`,
      'GET',
      undefined,
      { 'X-Player-Token': playerToken }
    )
    const opts = Array.isArray(data.options) ? data.options : []
    return {
      id: String(data.id),
      quizId: String(data.quiz_id),
      questionText: data.content,
      timeLimit: data.duration,
      displayOrder: data.order,
      // Never trust isCorrect from the player endpoint — strip answer keys.
      options: parsedOptsToDrizzle(opts, '', true),
      type: data.type,
      index: typeof data.index === 'number' ? data.index : questionIndex,
      total: typeof data.total === 'number' ? data.total : undefined,
      // Server-side deadline — lets a reloading client resync its countdown
      activeUntil: typeof data.active_until === 'string' ? data.active_until : undefined,
    }
  }

  const data = await apiRequest(`/rooms/${sessionId}`)
  const room = data?.room
  if (room?.status === 'finished') {
    throw new Error('ROOM_FINISHED')
  }
  const quiz = room?.Quiz || room?.quiz
  const rawQuestions = quiz?.Questions || quiz?.questions || []
  const questions = [...rawQuestions].sort((a: any, b: any) => (a.order - b.order) || (a.id - b.id))
  const question = questions[questionIndex]
  if (!question) return null

  let parsedOptions = []
  try {
    parsedOptions = question.options ? JSON.parse(question.options) : []
  } catch {}

  return {
    id: String(question.id),
    quizId: String(question.quiz_id),
    questionText: question.content,
    timeLimit: question.duration,
    displayOrder: question.order,
    // Host-only branch: this response comes from the host view of GET /rooms/:id.
    // The player branch above never sees it — the slide gives the answer away.
    explanation: question.explanation || '',
    options: parsedOptsToDrizzle(parsedOptions, question.correct_answer),
    type: question.type,
    correctAnswer: question.correct_answer,
  }
}

/**
 * Player-side question fetch that reports failures as data, not exceptions.
 *
 * Next.js redacts any error thrown out of a Server Action in a production
 * build: the client receives "An error occurred in the Server Components
 * render…" and nothing else. Every branch that used to read the thrown
 * message — `msg.includes('NO_MORE_QUESTIONS')`, `msg === 'ROOM_FINISHED'` —
 * therefore never matched in production, so a solo player who finished their
 * last question fell through to a generic "could not load question" instead of
 * the results screen.
 *
 * Returned values are serialized normally, so the classification has to happen
 * here on the server, where the real message still exists.
 */
export type PlayerQuestionFailure =
  | 'NO_MORE_QUESTIONS'
  | 'ROOM_FINISHED'
  | 'NOT_ACTIVE'
  | 'NOT_FOUND'
  | 'ERROR'

function classifyQuestionError(raw: string): PlayerQuestionFailure {
  const m = raw.toLowerCase()
  if (raw.includes('NO_MORE_QUESTIONS')) return 'NO_MORE_QUESTIONS'
  if (raw.includes('ROOM_FINISHED')) return 'ROOM_FINISHED'
  // Both languages: Localize() rewrites these before they reach us.
  if (/not currently active|room is not active|hiện không mở|phòng chưa bắt đầu/.test(m)) return 'NOT_ACTIVE'
  if (/not found|không tìm thấy/.test(m)) return 'NOT_FOUND'
  return 'ERROR'
}

export async function fetchPlayerQuestion(
  sessionId: string,
  questionIndex: number,
  playerToken?: string
) {
  try {
    const question = await getQuestionByIndex(sessionId, questionIndex, playerToken)
    if (!question) {
      return { ok: false as const, code: 'NOT_FOUND' as PlayerQuestionFailure, message: 'Question not found' }
    }
    return { ok: true as const, question }
  } catch (e: any) {
    const raw = String(e?.message || 'Unknown error')
    return { ok: false as const, code: classifyQuestionError(raw), message: raw }
  }
}

// Get all questions of a session's quiz (host view). Answer keys are stripped so the
// projected host screen never leaks correct answers in solo (player-paced) mode.
export async function getAllQuestionsForDisplay(sessionId: string) {
  const data = await apiRequest(`/rooms/${sessionId}`)
  const room = data?.room
  const quiz = room?.Quiz || room?.quiz
  const rawQuestions = quiz?.Questions || quiz?.questions || []
  const questions = [...rawQuestions].sort((a: any, b: any) => (a.order - b.order) || (a.id - b.id))

  return questions.map((question: any) => {
    let parsedOptions = []
    try {
      parsedOptions = question.options ? JSON.parse(question.options) : []
    } catch {}
    return {
      id: String(question.id),
      quizId: String(question.quiz_id),
      questionText: question.content,
      timeLimit: question.duration,
      displayOrder: question.order,
      options: parsedOptsToDrizzle(parsedOptions, '', true),
      type: question.type,
    }
  })
}

function parsedOptsToDrizzle(parsedOpts: any[], correctAnswer: string, stripCorrectness = false) {
  return parsedOpts.map((o: any) => ({
    id: o.id,
    optionText: o.text ?? o.optionText ?? '',
    isCorrect: stripCorrectness ? false : (o.isCorrect ?? (o.id === correctAnswer)),
    mediaUrl: o.mediaUrl || '',
  }))
}

// Get leaderboard
export async function getLeaderboard(sessionId: string, playerToken?: string) {
  const extra = playerToken ? { 'X-Player-Token': playerToken } : undefined
  const data = await apiRequest(`/rooms/${sessionId}`, 'GET', undefined, extra)
  const players = data.players || []

  return players
    .map((p: any) => ({
      id: String(p.id),
      sessionId: String(p.room_id),
      username: p.nickname,
      totalPoints: p.score,
      correctAnswers: p.correct_answers || 0,
      answeredCount: p.answered_count || 0,
      currentQuestionId: p.current_question_id ? String(p.current_question_id) : null,
    }))
    .sort((a: any, b: any) => b.totalPoints - a.totalPoints)
    .map((item: any, index: number) => ({
      ...item,
      rank: index + 1,
    }))
}

// Final standings for the results screen. Deliberately not getLeaderboard:
// that reads GET /rooms/:id, whose player response omits the roster, so a
// player's results screen came back empty. /rooms/:id/results serves scores to
// the host and to any player of the room, and flags the caller's own row —
// a finished room's ids are archive positions, not player ids, so the client
// cannot identify itself by id.
export async function getRoomResults(sessionId: string, playerToken?: string) {
  const extra = playerToken ? { 'X-Player-Token': playerToken } : undefined
  const data = await apiRequest(`/rooms/${sessionId}/results`, 'GET', undefined, extra)
  const players = data.players || []

  return {
    status: String(data.status || ''),
    // Why the game ended: '' (normal), license_expired, license_revoked. The
    // websocket payload is gone by the time this page renders, so the API field
    // is the source of truth on a reload.
    endedReason: String(data.ended_reason || ''),
    players: players.map((p: any) => ({
      id: String(p.id),
      username: p.nickname,
      totalPoints: p.score,
      correctAnswers: p.correct_answers || 0,
      rank: p.rank,
      isYou: !!p.you,
    })),
  }
}

// Update game session state via REST endpoints
export async function updateGameSessionState(
  sessionId: string,
  status: string,
  currentQuestionIndex: number
) {
  if (status === 'playing' || status === 'active') {
    await apiRequest(`/rooms/${sessionId}/start`, 'POST')
  } else if (status === 'finished') {
    await apiRequest(`/rooms/${sessionId}/end`, 'POST')
  } else if (status === 'next') {
    await apiRequest(`/rooms/${sessionId}/next`, 'POST')
  }

  revalidatePath(`/host/${sessionId}`)
  revalidatePath(`/play/${sessionId}`)
  return { success: true }
}

// Get answer stats for host
export async function getAnswerStats(sessionId: string, questionId: string) {
  try {
    const data = await apiRequest(`/logs/${sessionId}`)
    const answers = data.answers || []
    
    // Get options for this question
    const room = data?.room
    const quiz = room?.Quiz || room?.quiz
    const rawQuestions = quiz?.Questions || quiz?.questions || []
    const questions = [...rawQuestions].sort((a: any, b: any) => (a.order - b.order) || (a.id - b.id))
    const question = questions.find((q: any) => String(q.id) === questionId)
    if (!question) return []

    let parsedOpts = []
    try {
      parsedOpts = question.options ? JSON.parse(question.options) : []
    } catch {}

    const relevantAnswers = answers.filter((a: any) => String(a.question_id) === questionId)

    if (question.type === 'pin_answer') {
      const pins = relevantAnswers
        .map((a: any) => {
          const parts = String(a.selected_option || '').split(',')
          const x = parseFloat(parts[0])
          const y = parseFloat(parts[1])
          if (Number.isNaN(x) || Number.isNaN(y)) return null
          return { x, y, isCorrect: !!a.is_correct }
        })
        .filter(Boolean)
      return {
        mode: 'pin' as const,
        correctAnswer: question.correct_answer || '50,50',
        pins,
        total: relevantAnswers.length,
        correctCount: relevantAnswers.filter((a: any) => a.is_correct).length,
      }
    }

    if (question.type === 'short_answer') {
      const texts = relevantAnswers.map((a: any) => String(a.selected_option || '').trim()).filter(Boolean)
      const counts: Record<string, number> = {}
      for (const t of texts) {
        const key = t.toLowerCase()
        counts[key] = (counts[key] || 0) + 1
      }
      return {
        mode: 'short_answer' as const,
        correctAnswer: question.correct_answer,
        entries: Object.entries(counts)
          .map(([text, count]) => ({ text, count }))
          .sort((a, b) => b.count - a.count),
        total: relevantAnswers.length,
        correctCount: relevantAnswers.filter((a: any) => a.is_correct).length,
      }
    }

    return parsedOpts.map((option: any) => {
      const count = relevantAnswers.filter((a: any) => a.selected_option === option.id).length
      const percentage = relevantAnswers.length > 0 ? Math.round((count / relevantAnswers.length) * 100) : 0
      return {
        optionId: option.id,
        optionText: option.text,
        count,
        percentage,
        isCorrect: question.type === 'poll' ? false : (option.isCorrect ?? (option.id === question.correct_answer)),
      }
    })
  } catch (e) {
    console.error('Error fetching answer stats: ', e)
    return []
  }
}

// Get session stats
export async function getSessionStats(sessionId: string) {
  try {
    const data = await apiRequest(`/logs/${sessionId}`)
    const players = data.players || []
    const answers = data.answers || []

    return {
      totalPlayers: players.length,
      totalAnswersSubmitted: answers.length,
      averageAccuracy:
        answers.length > 0
          ? Math.round((answers.filter((a: any) => a.is_correct).length / answers.length) * 100)
          : 0,
    }
  } catch (e) {
    console.error('Error fetching session stats: ', e)
    return {
      totalPlayers: 0,
      totalAnswersSubmitted: 0,
      averageAccuracy: 0,
    }
  }
}

// Get the count of quiz questions in a session
export async function getQuizQuestionsCount(sessionId: string, playerToken?: string) {
  try {
    const extra = playerToken ? { 'X-Player-Token': playerToken } : undefined
    const data = await apiRequest(`/rooms/${sessionId}`, 'GET', undefined, extra)

    // Player-shaped response
    if (data?.question_count != null && Number(data.question_count) > 0) {
      return Number(data.question_count)
    }

    // Host-shaped response (or fallback)
    const room = data?.room || data
    if (room?.question_count != null && Number(room.question_count) > 0) {
      return Number(room.question_count)
    }
    const quiz = room?.Quiz || room?.quiz
    const questions = quiz?.Questions || quiz?.questions || []
    return Array.isArray(questions) ? questions.length : 0
  } catch (e) {
    console.error('Error fetching quiz questions count: ', e)
    return 0
  }
}

// End current question and reveal correct answer
export async function endQuestion(sessionId: string) {
  try {
    await apiRequest(`/rooms/${sessionId}/end-question`, 'POST')
    revalidatePath(`/host/${sessionId}`)
    revalidatePath(`/play/${sessionId}`)
    return { success: true }
  } catch (e) {
    console.error('Error ending question: ', e)
    return { error: 'Failed to end question' }
  }
}

/**
 * The leaderboard slide's data: the top rows, the caller's own rank, and the
 * size of the room. Every player reads this once per question, so it is its own
 * endpoint rather than getRoomResults — that one returns the whole roster.
 */
export async function getRoomStandings(sessionId: string, playerToken?: string) {
  const extra = playerToken ? { 'X-Player-Token': playerToken } : undefined
  const data = await apiRequest(`/rooms/${sessionId}/standings`, 'GET', undefined, extra)
  const row = (p: any) => ({
    id: String(p.id),
    nickname: String(p.nickname || ''),
    score: Number(p.score || 0),
    rank: Number(p.rank || 0),
  })
  return {
    top: (data.top || []).map(row),
    me: data.me ? row(data.me) : null,
    total: Number(data.total || 0),
  }
}

/** Host-paced only: push the leaderboard slide to every screen in the room. */
export async function showLeaderboard(sessionId: string) {
  try {
    await apiRequest(`/rooms/${sessionId}/leaderboard`, 'POST')
    return { success: true }
  } catch (e) {
    console.error('Error showing leaderboard: ', e)
    return { error: 'Failed to show leaderboard' }
  }
}

/** Host-paced only: push the current question's explanation slide to the room. */
export async function explainQuestion(sessionId: string) {
  try {
    const data = await apiRequest(`/rooms/${sessionId}/explain`, 'POST')
    return { success: true, explanation: data?.explanation || '' }
  } catch (e) {
    console.error('Error showing explanation: ', e)
    return { error: 'Failed to show explanation' }
  }
}

// Check room status by PIN code
export async function checkRoomByPin(pin: string) {
  try {
    const data = await apiRequest(`/rooms/pin/${pin}`)
    return data
  } catch (e) {
    console.error('Error checking room by PIN: ', e)
    return null
  }
}

export async function listPublicRooms() {
  try {
    const data = await apiRequest('/rooms/public')
    return (data.rooms || []) as Array<{
      id: number
      pin_code: string
      status: string
      quiz_title: string
      player_count: number
      max_players: number
    }>
  } catch (e) {
    console.error('Error listing public rooms: ', e)
    return []
  }
}
