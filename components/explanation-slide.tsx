'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * An explanation slide is a small JSON document stored on the question. It is
 * deliberately element-based rather than a fixed set of named fields: v1 only
 * ever places elements by `layout`, but adding a free-form canvas later means
 * adding a layout and a per-element rect, not migrating everyone's data.
 */
export type ExplanationLayout =
  | 'text'
  | 'image_left'
  | 'image_right'
  | 'image_top'
  | 'image_full'

export type ExplanationElement = {
  id: string
  kind: 'text' | 'image'
  role?: 'title' | 'body' | 'media'
  text?: string
  url?: string
  fit?: 'cover' | 'contain'
  style?: {
    color?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    align?: 'left' | 'center' | 'right'
  }
}

export type ExplanationDoc = {
  v: number
  layout: ExplanationLayout
  bg?: { color?: string }
  overlay?: number
  elements: ExplanationElement[]
}

export const EXPLANATION_LAYOUTS: ExplanationLayout[] = [
  'text',
  'image_left',
  'image_right',
  'image_top',
  'image_full',
]

export const DEFAULT_EXPLANATION_BG = '#12141a'
export const DEFAULT_TITLE_COLOR = '#f2f0eb'
export const DEFAULT_BODY_COLOR = '#c8ccd6'

/** Guards against anything but #rrggbb reaching an inline style attribute. */
const HEX = /^#[0-9a-fA-F]{6}$/
export function safeColor(value: string | undefined, fallback: string): string {
  return value && HEX.test(value) ? value : fallback
}

export function emptyExplanation(layout: ExplanationLayout = 'text'): ExplanationDoc {
  return {
    v: 1,
    layout,
    bg: { color: DEFAULT_EXPLANATION_BG },
    overlay: 0.45,
    elements: [
      { id: 'title', kind: 'text', role: 'title', text: '', style: { color: DEFAULT_TITLE_COLOR, align: 'left' } },
      { id: 'body', kind: 'text', role: 'body', text: '', style: { color: DEFAULT_BODY_COLOR, align: 'left' } },
    ],
  }
}

export function parseExplanation(raw: unknown): ExplanationDoc | null {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const doc = JSON.parse(raw)
    if (!doc || typeof doc !== 'object') return null
    if (!EXPLANATION_LAYOUTS.includes(doc.layout)) return null
    if (!Array.isArray(doc.elements)) return null
    return doc as ExplanationDoc
  } catch {
    return null
  }
}

/** True when the slide would render as a blank rectangle. */
export function isExplanationEmpty(doc: ExplanationDoc | null): boolean {
  if (!doc) return true
  return !doc.elements.some(el =>
    el.kind === 'image' ? !!el.url : !!(el.text && el.text.trim())
  )
}

export function explanationImageUrl(doc: ExplanationDoc | null): string {
  if (!doc) return ''
  return doc.elements.find(el => el.kind === 'image' && el.url)?.url || ''
}

/**
 * Decodes the slide's image before the caller transitions to it. Without this
 * the slide animates in and the picture pops a beat later, which is the part
 * people actually read as "janky" — the easing curve is not what gives it away.
 * Resolves early rather than holding the game up if the network is slow.
 */
export function preloadExplanation(doc: ExplanationDoc | null, timeoutMs = 400): Promise<void> {
  const url = explanationImageUrl(doc)
  if (!url) return Promise.resolve()
  return new Promise<void>(resolve => {
    let settled = false
    const done = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    const timer = setTimeout(done, timeoutMs)
    const img = new Image()
    img.onload = () => {
      clearTimeout(timer)
      done()
    }
    img.onerror = () => {
      clearTimeout(timer)
      done()
    }
    img.src = url
  })
}

const TITLE_SIZE: Record<string, string> = {
  sm: 'text-lg sm:text-xl',
  md: 'text-xl sm:text-2xl',
  lg: 'text-2xl sm:text-3xl lg:text-4xl',
  xl: 'text-3xl sm:text-4xl lg:text-5xl',
}

const BODY_SIZE: Record<string, string> = {
  sm: 'text-sm sm:text-base',
  md: 'text-base sm:text-lg',
  lg: 'text-lg sm:text-xl lg:text-2xl',
  xl: 'text-xl sm:text-2xl lg:text-3xl',
}

/**
 * The same scale as the responsive maps at their largest, but pinned there.
 *
 * Tailwind breakpoints answer "how wide is the window", which is the wrong
 * question for a slide rendered into a 240px editor panel on a 1920px screen:
 * it picked projector type inside a thumbnail and the text was cut off. A
 * thumbnail renders at full stage size and is scaled down as a whole instead.
 */
const TITLE_SIZE_FIXED: Record<string, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-5xl',
}

const BODY_SIZE_FIXED: Record<string, string> = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-3xl',
}

const ALIGN: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

function TextBlock({
  el,
  animate,
  delayMs,
  fixed = false,
}: {
  el: ExplanationElement
  animate: boolean
  delayMs: number
  fixed?: boolean
}) {
  const text = el.text || ''
  if (!text.trim()) return null
  const isTitle = el.role === 'title'
  const sizes = isTitle
    ? (fixed ? TITLE_SIZE_FIXED : TITLE_SIZE)
    : (fixed ? BODY_SIZE_FIXED : BODY_SIZE)
  const size = sizes[el.style?.size || (isTitle ? 'xl' : 'lg')] || sizes.lg
  const align = ALIGN[el.style?.align || 'left'] || ALIGN.left

  return (
    <p
      className={`${size} ${align} ${isTitle ? 'font-black leading-tight' : 'font-medium leading-relaxed'} whitespace-pre-wrap break-words ${
        animate ? 'animate-explain-item' : ''
      }`}
      style={{
        color: safeColor(el.style?.color, isTitle ? DEFAULT_TITLE_COLOR : DEFAULT_BODY_COLOR),
        animationDelay: animate ? `${delayMs}ms` : undefined,
      }}
    >
      {text}
    </p>
  )
}

function ImageBlock({
  el,
  animate,
  delayMs,
  className = '',
}: {
  el: ExplanationElement
  animate: boolean
  delayMs: number
  className?: string
}) {
  if (!el.url) return null
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-black/20 ${className} ${animate ? 'animate-explain-item' : ''}`}
      style={{ animationDelay: animate ? `${delayMs}ms` : undefined }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={el.url}
        alt=""
        className={`w-full h-full ${el.fit === 'contain' ? 'object-contain' : 'object-cover'}`}
      />
    </div>
  )
}

export type ExplanationSlideProps = {
  doc: ExplanationDoc
  /** 'stage' fills a host screen 16:9; 'sheet' fills a player's portrait panel. */
  variant?: 'stage' | 'sheet'
  /** Off in the editor, where the slide re-renders on every keystroke. */
  animate?: boolean
  /** Size from the slide's own box, not the window — see TITLE_SIZE_FIXED. */
  fixed?: boolean
  className?: string
}

export function ExplanationSlide({
  doc,
  variant = 'stage',
  animate = true,
  fixed = false,
  className = '',
}: ExplanationSlideProps) {
  const title = doc.elements.find(el => el.kind === 'text' && el.role === 'title')
  const body = doc.elements.find(el => el.kind === 'text' && el.role === 'body')
  const media = doc.elements.find(el => el.kind === 'image')
  const bg = safeColor(doc.bg?.color, DEFAULT_EXPLANATION_BG)
  const overlay = Math.min(Math.max(Number(doc.overlay ?? 0.45) || 0, 0), 0.8)
  const isSheet = variant === 'sheet'
  const pad = fixed ? 'p-14' : isSheet ? 'p-4 sm:p-6' : 'p-6 sm:p-10 lg:p-14'

  // The text column scrolls inside its own box instead of making the slide
  // taller. A slide is therefore always exactly as tall as it is given — a
  // projector and a player's sheet get the same composition, not a version of
  // it that has grown a scrollbar and pushed the layout out of proportion.
  const textStack = (box = '') => (
    <div className={`min-w-0 overflow-y-auto ${box}`}>
      <div className={`min-h-full flex flex-col justify-center ${fixed ? 'gap-4' : 'gap-3 sm:gap-4'}`}>
        {title && <TextBlock el={title} animate={animate} delayMs={0} fixed={fixed} />}
        {body && <TextBlock el={body} animate={animate} delayMs={70} fixed={fixed} />}
      </div>
    </div>
  )

  let inner: React.ReactNode

  switch (doc.layout) {
    case 'image_full':
      inner = (
        <>
          {media?.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${overlay})` }} />
          <div className={`relative h-full flex flex-col justify-end ${pad}`}>
            {textStack('max-h-full')}
          </div>
        </>
      )
      break

    case 'image_top':
      inner = (
        <div className={`h-full flex flex-col ${fixed ? 'gap-6' : 'gap-4 sm:gap-6'} ${pad}`}>
          {media && (
            <ImageBlock
              el={media}
              animate={animate}
              delayMs={30}
              // A sheet is portrait, so a media block that takes the leftover
              // height would eat the slide; it takes a share of it instead.
              className={isSheet ? 'h-[42%] shrink-0' : 'flex-1 min-h-0'}
            />
          )}
          {textStack(isSheet ? 'flex-1 min-h-0' : 'shrink-0 max-h-[45%]')}
        </div>
      )
      break

    case 'image_left':
    case 'image_right': {
      // Side-by-side collapses to a single column on a phone; the image keeps
      // the reading order it has on the desktop layout. A fixed (scaled)
      // slide is always composed at stage size, so it must not ask the window:
      // on a phone the column layout left a 160px image in a ~200px slide and
      // squeezed the text column to zero height.
      const left = doc.layout === 'image_left'
      const dir = fixed
        ? (left ? 'flex-row' : 'flex-row-reverse')
        : (left ? 'flex-col sm:flex-row' : 'flex-col sm:flex-row-reverse')
      const gap = fixed ? 'gap-8' : 'gap-4 sm:gap-6 lg:gap-8'
      const imgSize = fixed
        ? 'w-1/2 h-auto'
        : `w-full sm:w-1/2 sm:h-auto ${isSheet ? 'h-[38%] min-h-32' : 'h-40'}`
      inner = (
        <div className={`h-full flex ${dir} ${gap} ${pad}`}>
          {media && (
            <ImageBlock
              el={media}
              animate={animate}
              delayMs={30}
              className={`shrink-0 ${imgSize}`}
            />
          )}
          {textStack('flex-1 min-h-0 min-w-0')}
        </div>
      )
      break
    }

    case 'text':
    default:
      inner = <div className={`h-full flex flex-col ${pad}`}>{textStack('flex-1 min-h-0')}</div>
  }

  return (
    <div
      className={`relative overflow-hidden w-full h-full ${className}`}
      style={{ backgroundColor: bg }}
    >
      {inner}
    </div>
  )
}

/** The size a slide is composed at. Everything else is this, scaled. */
const STAGE_WIDTH = 960
const STAGE_HEIGHT = 540

/**
 * A true miniature of the slide: composed at full stage size, then scaled down
 * to whatever width it is given.
 *
 * The editor used to render the slide directly into its panel, which is about
 * 240px wide — so a 48px headline sat in a 23px-tall content area and the
 * preview showed nothing readable. Scaling the whole composition keeps every
 * proportion the room will actually see, at any panel width.
 */
export function ExplanationThumbnail({
  doc,
  className = '',
}: {
  doc: ExplanationDoc
  className?: string
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const apply = (width: number) => {
      if (width > 0) setScale(width / STAGE_WIDTH)
    }
    apply(el.clientWidth)
    // The panel is resizable (and goes from a sidebar to a bottom sheet), so
    // the scale cannot be measured once and kept.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => apply(entries[0]?.contentRect.width || 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={boxRef}
      className={`relative w-full aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#12141a] ${className}`}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `scale(${scale})`,
          // Hidden until measured, or the slide flashes at full size first.
          visibility: scale ? 'visible' : 'hidden',
        }}
      >
        <ExplanationSlide doc={doc} variant="stage" animate={false} fixed />
      </div>
    </div>
  )
}
