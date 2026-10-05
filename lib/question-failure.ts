/**
 * How a failed question fetch is classified, shared by whoever asks for one.
 *
 * It lives apart from the caller because the classification must never be done
 * by matching the API's prose. `Localize()` rewrites error messages into
 * Vietnamese whenever the request carries a Vietnamese locale, and a browser
 * always sends Accept-Language where a server-side fetch sent none — so a
 * check for an English substring works in development and quietly stops
 * matching in production. Both spellings are listed here for that reason.
 */

export type PlayerQuestionFailure =
  | 'NO_MORE_QUESTIONS'
  | 'ROOM_FINISHED'
  | 'NOT_ACTIVE'
  | 'NOT_FOUND'
  | 'ERROR'

export function classifyQuestionError(raw: string): PlayerQuestionFailure {
  const m = raw.toLowerCase()
  // Protocol sentinels are deliberately absent from the backend catalog, so
  // they arrive verbatim in either language.
  if (raw.includes('NO_MORE_QUESTIONS')) return 'NO_MORE_QUESTIONS'
  if (raw.includes('ROOM_FINISHED')) return 'ROOM_FINISHED'
  if (/not currently active|room is not active|hiện không mở|phòng chưa bắt đầu/.test(m)) return 'NOT_ACTIVE'
  if (/not found|không tìm thấy/.test(m)) return 'NOT_FOUND'
  return 'ERROR'
}
