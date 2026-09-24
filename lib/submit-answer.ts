/**
 * Player answer submission, sent from the browser straight to the Go API.
 *
 * This one call does not go through a server action, and it is the only player
 * call that does not. The reason is the burst: every player in a room answers
 * within the same second or two, and a server action costs a full Next request
 * lifecycle on a single Node process. Measured 2026-09-23 on this box, the
 * server-action path tops out near 140 req/s no matter how small the payload,
 * so 2000 players answering one question queued for 16 seconds with ~5% of
 * them timing out, while the Go backend sat at 47% CPU. Going direct puts the
 * burst where the capacity is.
 *
 * Safety is unchanged by the move. The credential is the player token, which
 * has always lived in sessionStorage and so has always been readable by
 * scripts on the page — unlike the host's `token` cookie, which is httpOnly
 * and is exactly why host calls stay behind server actions. Authorisation is
 * the backend's anyway: it verifies the token's signature, rejects a token
 * whose room does not match the URL, and rate-limits per token hash. Going
 * direct also puts these requests back inside the gateway's `limit_req` zone
 * and lets the backend see the real client IP, neither of which applied to
 * traffic arriving from the frontend container.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '')

/** How the caller should react, independent of the language the API answered
 *  in. `Localize()` rewrites error text into Vietnamese whenever the request
 *  carries a Vietnamese locale — and a browser always sends Accept-Language,
 *  where the old server-side fetch sent none and so always got English. Match
 *  on this, never on the message. */
export type SubmitFailure =
  /** The host closed the room while this answer was in flight. */
  | 'ROOM_FINISHED'
  /** The window shut before the answer landed: no score, but not an error the
   *  player did anything about. */
  | 'LATE'
  /** Anything else — the player should be allowed to try again. */
  | 'FAILED'

export interface SubmitAnswerResult {
  id?: string
  sessionId?: string
  participantId?: string
  questionId?: string
  selectedOptionId?: string | null
  timeSpent?: number
  isCorrect?: boolean
  points?: number
  is_correct?: boolean
  points_earned?: number
  recorded?: boolean
  question_type?: string
  correct_answer?: string
  explanation?: string
  error?: string
  code?: SubmitFailure
}

/** ROOM_FINISHED is a protocol sentinel and is deliberately absent from the
 *  backend catalog, so it arrives verbatim in both languages. The other two
 *  are translated, hence both spellings. */
function classify(raw: string): SubmitFailure {
  if (raw.includes('ROOM_FINISHED')) return 'ROOM_FINISHED'
  const m = raw.toLowerCase()
  if (
    /time limit exceeded|not currently active|room is not active|expired/.test(m) ||
    /hết thời gian|hiện không mở|phòng chưa bắt đầu|hết hạn/.test(m)
  ) {
    return 'LATE'
  }
  return 'FAILED'
}

/** The locale the page is rendered in, which `app/layout.tsx` puts on <html>.
 *  Sent explicitly so the API answers in the language the reader chose rather
 *  than whatever their browser happens to prefer. */
function pageLocale(): string | null {
  if (typeof document === 'undefined') return null
  const lang = document.documentElement.lang
  return lang === 'vi' || lang === 'en' ? lang : null
}

export async function submitAnswer(
  sessionId: string,
  participantId: string,
  questionId: string,
  selectedOptionId: string | null,
  timeSpent: number,
  responseTimeMs: number = 0,
  playerToken: string = ''
): Promise<SubmitAnswerResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Player-ID': participantId,
      'X-Player-Token': playerToken,
    }
    const locale = pageLocale()
    if (locale) headers['X-Locale'] = locale

    const res = await fetch(`${API_BASE}/rooms/submit-answer`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question_id: Number(questionId),
        selected_option: selectedOptionId || '',
        response_time_ms: responseTimeMs,
      }),
      // No cookies on this request: it authenticates with the player token and
      // nothing else, and the host session cookie has no business being sent.
      credentials: 'omit',
      cache: 'no-store',
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = data?.error || 'Failed to submit answer'
      return { error: message, code: classify(String(message)) }
    }

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
    // A network failure here is indistinguishable from a rejected answer for
    // the player, but it is retryable, so it classifies as FAILED.
    console.error('Error submitting answer: ', e)
    return { error: e?.message || 'Error submitting answer', code: 'FAILED' }
  }
}
