/**
 * Resolving an API error and rendering it are two different jobs, so this
 * module does the first one only: it matches the raw message against a rule
 * and returns catalog *keys*. The strings themselves live in
 * messages/{vi,en}.json under `apiErrors`, because this module is imported by
 * both client components and a toast provider — none of which share a place to
 * call a hook. Callers hand their `t` to localizeApiError() at render time.
 */
export type ResolvedApiError = {
  titleKey: string
  descriptionKey: string
  /** Interpolation for descriptionKey — only the generic fallback uses it. */
  values?: Record<string, string>
  href?: string
  hrefLabelKey?: string
  secondaryHref?: string
  secondaryHrefLabelKey?: string
  /** When true, UI must send the user to login (not just show a toast). */
  requiresLogin?: boolean
  /** When true, the page is stale against the running build and must reload. */
  requiresReload?: boolean
}

/** The shape a screen actually renders, once a translator has been applied. */
export type LocalizedApiError = {
  title: string
  description: string
  href?: string
  hrefLabel?: string
  secondaryHref?: string
  secondaryHrefLabel?: string
  requiresLogin?: boolean
  requiresReload?: boolean
}

/** `useTranslations('apiErrors')` / `getTranslations('apiErrors')`. */
export type ApiErrorTranslator = (key: string, values?: Record<string, string>) => string

type ErrorRule = {
  test: (msg: string) => boolean
  resolve: (raw: string) => ResolvedApiError
}

// Every pattern below must match BOTH languages. The API's Localize()
// middleware (backend internal/middleware/i18n.go) rewrites the `error` field
// of 4xx/5xx responses into Vietnamese whenever the request carries
// X-Locale: vi — which every request from this app does, since vi is the
// default locale. English-only patterns therefore matched nothing for real
// users: a duplicate nickname fell through to the generic "Đã xảy ra lỗi…"
// card with a Dashboard link instead of "chọn tên khác". The Vietnamese halves
// are the exact strings from the backend's catalog.go; changing one there
// without changing it here silently drops the rule back to the fallback.
const AUTH_PATTERNS =
  /UNAUTHORIZED_OR_FORBIDDEN|invalid or expired token|authorization header|authentication required|unauthorized|phiên đăng nhập không hợp lệ|header authorization không hợp lệ|cần đăng nhập|bạn không có quyền thực hiện/i

// A tab left open across a deploy keeps calling Server Action ids the new
// build no longer has. It is not the user's problem and it is not worth a
// stack trace on their screen — it just needs a reload.
const STALE_DEPLOYMENT_PATTERN =
  /server action|failed to find server action|might be from an older or newer deployment/i

export function isStaleDeploymentError(raw: unknown): boolean {
  return STALE_DEPLOYMENT_PATTERN.test(normalizeErrorMessage(raw))
}

const rules: ErrorRule[] = [
  {
    // Next.js replaces any error thrown out of a Server Action with this
    // paragraph in a production build. It used to reach the screen verbatim.
    // The paths where the specific reason actually matters (joining a room,
    // loading the next question) now return their failure as data instead of
    // throwing; this rule is the floor for everything else, so the worst a
    // user sees is a sentence they can act on.
    test: (m) =>
      /an error occurred in the server components render|digest property is included|omitted in production builds/i.test(m),
    resolve: () => ({
      titleKey: 'serverErrorTitle',
      descriptionKey: 'serverErrorBody',
      href: '/dashboard',
      hrefLabelKey: 'toDashboard',
    }),
  },
  {
    test: (m) => STALE_DEPLOYMENT_PATTERN.test(m),
    resolve: () => ({
      titleKey: 'staleBuildTitle',
      descriptionKey: 'staleBuildBody',
      requiresReload: true,
    }),
  },
  {
    test: (m) => /do not own this room|bạn không phải chủ phòng này/i.test(m),
    resolve: () => ({
      titleKey: 'notOwnerTitle',
      descriptionKey: 'notOwnerBody',
      href: '/dashboard',
      hrefLabelKey: 'toDashboard',
      secondaryHref: '/join',
      secondaryHrefLabelKey: 'joinByPin',
    }),
  },
  {
    test: (m) => AUTH_PATTERNS.test(m),
    resolve: () => ({
      titleKey: 'sessionExpiredTitle',
      descriptionKey: 'redirectingToSignIn',
      href: '/sign-in',
      hrefLabelKey: 'signInAgain',
      requiresLogin: true,
    }),
  },
  {
    test: (m) => /room not found or invalid pin|no room found|invalid pin|không tìm thấy phòng hoặc mã pin|mã pin không đúng định dạng/i.test(m),
    resolve: () => ({
      titleKey: 'pinNotFoundTitle',
      descriptionKey: 'pinNotFoundBody',
      href: '/join',
      hrefLabelKey: 'tryJoinAgain',
    }),
  },
  {
    test: (m) => /room not found|không tìm thấy phòng/i.test(m),
    resolve: () => ({
      titleKey: 'roomGoneTitle',
      descriptionKey: 'roomGoneBody',
      href: '/dashboard',
      hrefLabelKey: 'toDashboard',
    }),
  },
  {
    test: (m) => /nickname is already taken|biệt danh này đã có người dùng/i.test(m),
    resolve: () => ({
      // Wording matches the form's own label ("Biệt danh"), so the player is
      // told which field to change rather than which API rejected them.
      titleKey: 'nicknameTakenTitle',
      descriptionKey: 'nicknameTakenBody',
      href: '/join',
      hrefLabelKey: 'tryAgain',
    }),
  },
  {
    test: (m) => /room is full|max .*players|capacity|phòng đã đầy/i.test(m),
    resolve: () => ({
      titleKey: 'roomFullTitle',
      descriptionKey: 'roomFullBody',
      href: '/join',
      hrefLabelKey: 'openRooms',
    }),
  },
  {
    test: (m) => /concurrent room limit|giới hạn phòng đồng thời/i.test(m),
    resolve: () => ({
      titleKey: 'concurrentLimitTitle',
      descriptionKey: 'concurrentLimitBody',
      href: '/dashboard',
      hrefLabelKey: 'toDashboard',
    }),
  },
  {
    test: (m) => /quiz has no questions|quiz chưa có câu hỏi|không có câu hỏi nào/i.test(m),
    resolve: () => ({
      titleKey: 'quizEmptyTitle',
      descriptionKey: 'quizEmptyBody',
    }),
  },
  {
    test: (m) => m === 'ROOM_FINISHED' || /game already ended|already ended|trận đấu đã kết thúc|phòng đã kết thúc/i.test(m),
    resolve: () => ({
      titleKey: 'gameEndedTitle',
      descriptionKey: 'gameEndedBody',
      href: '/dashboard',
      hrefLabelKey: 'toDashboard',
    }),
  },
  {
    test: (m) => /joining is closed|already in progress|phòng chưa bắt đầu|đang diễn ra/i.test(m),
    resolve: () => ({
      titleKey: 'joinClosedTitle',
      descriptionKey: 'joinClosedBody',
      href: '/join',
      hrefLabelKey: 'otherRoom',
    }),
  },
  {
    test: (m) => /token room mismatch|token không khớp với phòng/i.test(m),
    resolve: () => ({
      titleKey: 'tokenMismatchTitle',
      descriptionKey: 'tokenMismatchBody',
      href: '/join',
      hrefLabelKey: 'rejoin',
    }),
  },
  {
    test: (m) => /player token|x-player-token|phiên người chơi không hợp lệ|thiếu header x-player-token/i.test(m),
    resolve: () => ({
      titleKey: 'playerSessionTitle',
      descriptionKey: 'playerSessionBody',
      href: '/join',
      hrefLabelKey: 'rejoin',
    }),
  },
  {
    test: (m) => /forbidden|insufficient|không đủ quyền/i.test(m),
    resolve: () => ({
      titleKey: 'forbiddenTitle',
      descriptionKey: 'forbiddenBody',
      href: '/dashboard',
      hrefLabelKey: 'toDashboard',
    }),
  },
]

function normalizeErrorMessage(raw: unknown): string {
  const message =
    typeof raw === 'string'
      ? raw
      : raw instanceof Error
        ? raw.message
        : raw && typeof raw === 'object' && 'message' in raw
          ? String((raw as { message: unknown }).message)
          : 'Unknown error'
  return message.trim() || 'Unknown error'
}

export function isAuthError(raw: unknown): boolean {
  return AUTH_PATTERNS.test(normalizeErrorMessage(raw))
}

export function resolveApiError(raw: unknown): ResolvedApiError {
  const normalized = normalizeErrorMessage(raw)

  for (const rule of rules) {
    if (rule.test(normalized)) {
      return rule.resolve(normalized)
    }
  }

  // Strip the "Read more: <url>" tails frameworks append — a player reading a
  // projector screen has no use for a docs link, and it pushed the actionable
  // half of the sentence off the line.
  const readable = normalized.replace(/\s*Read more:\s*\S+/gi, '').trim().replace(/\.$/, '')

  return {
    titleKey: 'genericTitle',
    descriptionKey: 'genericBody',
    values: { reason: readable },
    href: '/dashboard',
    hrefLabelKey: 'toDashboard',
  }
}

/** Turns a resolved error into the strings a screen renders. */
export function localizeApiError(
  resolved: ResolvedApiError,
  t: ApiErrorTranslator
): LocalizedApiError {
  return {
    title: t(resolved.titleKey),
    description: t(resolved.descriptionKey, resolved.values),
    href: resolved.href,
    hrefLabel: resolved.hrefLabelKey ? t(resolved.hrefLabelKey) : undefined,
    secondaryHref: resolved.secondaryHref,
    secondaryHrefLabel: resolved.secondaryHrefLabelKey
      ? t(resolved.secondaryHrefLabelKey)
      : undefined,
    requiresLogin: resolved.requiresLogin,
    requiresReload: resolved.requiresReload,
  }
}

/** Format for inline error text (join form, etc.) */
export function formatApiErrorInline(raw: unknown, t: ApiErrorTranslator): string {
  const { title, description } = localizeApiError(resolveApiError(raw), t)
  return `${title}. ${description}`
}
