/**
 * The player's question fetch, sent from the browser straight to the Go API.
 *
 * Second call to leave the server actions, and for the same reason as
 * lib/submit-answer.ts: it arrives as a burst. When the host advances, every
 * socket in the room fires at once and every client asks for the new question
 * in the same moment — and unlike the 20s lobby poll, this one is on the
 * critical path, because nobody can answer a question they have not received.
 *
 * Safety is unchanged. The credential is the player token, already readable by
 * scripts on the page, and the answer key never depended on this layer: the
 * API strips isCorrect itself in sanitizePlayerOptions before replying, and
 * verifies the token's room against the URL. The strip below stays as the
 * second line of defence it always was.
 */

import type { PlayerQuestionFailure } from '@/lib/question-failure'
import { classifyQuestionError } from '@/lib/question-failure'

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '')

export interface PlayerOption {
  id: string
  optionText: string
  isCorrect: boolean
  mediaUrl: string
}

export interface PlayerQuestion {
  id: string
  quizId: string
  questionText: string
  timeLimit: number
  displayOrder: number
  options: PlayerOption[]
  type: string
  index: number
  total?: number
  activeUntil?: string
}

export type FetchPlayerQuestionResult =
  | { ok: true; question: PlayerQuestion }
  | { ok: false; code: PlayerQuestionFailure; message: string }

/** The locale the page is rendered in, which app/layout.tsx puts on <html>. */
function pageLocale(): string | null {
  if (typeof document === 'undefined') return null
  const lang = document.documentElement.lang
  return lang === 'vi' || lang === 'en' ? lang : null
}

export async function fetchPlayerQuestion(
  sessionId: string,
  questionIndex: number,
  playerToken?: string
): Promise<FetchPlayerQuestionResult> {
  try {
    const headers: Record<string, string> = {}
    if (playerToken) headers['X-Player-Token'] = playerToken
    const locale = pageLocale()
    if (locale) headers['X-Locale'] = locale

    const res = await fetch(`${API_BASE}/rooms/${sessionId}/questions/${questionIndex}`, {
      headers,
      // The host session cookie has no business on a player's request.
      credentials: 'omit',
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const message = String(data?.error || `Request failed with status ${res.status}`)
      return { ok: false, code: classifyQuestionError(message), message }
    }

    const opts = Array.isArray(data.options) ? data.options : []
    return {
      ok: true,
      question: {
        id: String(data.id),
        quizId: String(data.quiz_id),
        questionText: data.content,
        timeLimit: data.duration,
        displayOrder: data.order,
        // Never trust isCorrect from the player endpoint — strip answer keys.
        options: opts.map((o: any) => ({
          id: o.id,
          optionText: o.text ?? o.optionText ?? '',
          isCorrect: false,
          mediaUrl: o.mediaUrl || '',
        })),
        type: data.type,
        index: typeof data.index === 'number' ? data.index : questionIndex,
        total: typeof data.total === 'number' ? data.total : undefined,
        // Server-side deadline — lets a reloading client resync its countdown.
        activeUntil: typeof data.active_until === 'string' ? data.active_until : undefined,
      },
    }
  } catch (e: any) {
    const raw = String(e?.message || 'Unknown error')
    return { ok: false, code: classifyQuestionError(raw), message: raw }
  }
}
