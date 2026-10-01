/**
 * Reader for the quiz theme stored in `theme_config`.
 *
 * The column is free-form JSON written by this app and sanitized by the
 * backend (see backend/internal/pkg/theme). Everything here is read-only and
 * defensive: rows predate the schema, so a missing key, a malformed blob and
 * an outright wrong type all have to land on the same safe default rather than
 * throwing inside a render.
 *
 * Keep the key names in step with the Go `Config` struct. They are the wire
 * format between the two.
 */

export interface QuizTheme {
  gameMode: 'host_paced' | 'player_paced'
  explanationDuration: number
  bgHostUrl: string
  bgPlayerUrl: string
  logoUrl: string
  bgOverlay: number
  bgOverlayColor: string
  primaryColor: string
  removeWatermark: boolean
}

/**
 * The subset of the theme the branding UI writes.
 *
 * Keyed by the wire names rather than the camelCase of QuizTheme: this is what
 * gets merged into theme_config and sent, so using the stored names removes a
 * translation step where a typo would silently write a key nothing reads.
 *
 * An empty string clears a key. undefined means "leave it alone".
 */
export type BrandingPatch = Partial<{
  bg_host_url: string
  bg_player_url: string
  logo_url: string
  bg_overlay: number
  bg_overlay_color: string
  primary_color: string
}>

/** Mirrors theme.DefaultOverlay in the Go package. */
export const DEFAULT_OVERLAY = 0.55

/** Mirrors theme.MinOverlay. Duplicated deliberately: the backend clamps what
 *  is stored, this keeps a legacy row from rendering unreadably. */
export const MIN_OVERLAY = 0.35

/** Mirrors theme.DefaultOverlayColor: the page background. */
export const DEFAULT_OVERLAY_COLOR = '#12141a'

const EMPTY: QuizTheme = {
  gameMode: 'host_paced',
  explanationDuration: 10,
  bgHostUrl: '',
  bgPlayerUrl: '',
  logoUrl: '',
  bgOverlay: DEFAULT_OVERLAY,
  bgOverlayColor: DEFAULT_OVERLAY_COLOR,
  primaryColor: '',
  removeWatermark: false,
}

/**
 * An image reference is only honoured when it points at this deployment's own
 * upload store.
 *
 * The backend already refuses anything else, so this is the second line: a row
 * written before that check existed would otherwise render a third party's URL
 * on every player's phone.
 */
function localUpload(value: unknown): string {
  if (typeof value !== 'string') return ''
  if (!value.startsWith('/uploads/')) return ''
  if (value.includes('..')) return ''
  return value.length > '/uploads/'.length ? value : ''
}

function positiveNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function parseQuizTheme(raw: string | null | undefined): QuizTheme {
  if (!raw) return EMPTY

  let cfg: Record<string, unknown>
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY
    cfg = parsed as Record<string, unknown>
  } catch {
    return EMPTY
  }

  const bgHostUrl = localUpload(cfg.bg_host_url)
  const bgPlayerUrl = localUpload(cfg.bg_player_url)

  // The scrim only matters where there is an image under it. Without one the
  // value is meaningless and clamping it would be noise.
  let bgOverlay = DEFAULT_OVERLAY
  if (bgHostUrl || bgPlayerUrl) {
    const n = Number(cfg.bg_overlay)
    bgOverlay = Number.isFinite(n) && n > 0 ? Math.min(1, Math.max(MIN_OVERLAY, n)) : DEFAULT_OVERLAY
  }

  return {
    gameMode: cfg.game_mode === 'player_paced' ? 'player_paced' : 'host_paced',
    explanationDuration: positiveNumber(cfg.explanation_duration, EMPTY.explanationDuration),
    bgHostUrl,
    bgPlayerUrl,
    logoUrl: localUpload(cfg.logo_url),
    bgOverlay,
    bgOverlayColor: /^#[0-9a-fA-F]{6}$/.test(String(cfg.bg_overlay_color ?? ''))
      ? String(cfg.bg_overlay_color)
      : DEFAULT_OVERLAY_COLOR,
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(String(cfg.primary_color ?? '')) ? String(cfg.primary_color) : '',
    removeWatermark: cfg.remove_watermark === true,
  }
}

/**
 * The background for the player's phone.
 *
 * Falls back to the host image so a quiz with only one key visual still shows
 * it everywhere — a portrait crop of a 16:9 artwork is a worse result than no
 * artwork, but an empty phone screen next to a branded projector looks like
 * the feature is broken.
 */
export function playerBackground(theme: QuizTheme): string {
  return theme.bgPlayerUrl || theme.bgHostUrl
}
