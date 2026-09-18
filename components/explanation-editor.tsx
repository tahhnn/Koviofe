'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImagePlus, Loader2, Maximize2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadImageAction } from '@/app/actions/upload'
import {
  DEFAULT_BODY_COLOR,
  DEFAULT_EXPLANATION_BG,
  DEFAULT_TITLE_COLOR,
  EXPLANATION_LAYOUTS,
  ExplanationDoc,
  ExplanationElement,
  ExplanationLayout,
  ExplanationSlide,
  ExplanationThumbnail,
  emptyExplanation,
  isExplanationEmpty,
  parseExplanation,
  safeColor,
} from '@/components/explanation-slide'

/** Palette drawn from the app's own surfaces so a slide never clashes with it. */
const SWATCHES = ['#12141a', '#1a1d26', '#0f172a', '#2c313d', '#e85d4c', '#2dd4bf', '#6d28d9', '#f2f0eb']

const LAYOUT_ICONS: Record<ExplanationLayout, React.ReactNode> = {
  text: (
    <svg viewBox="0 0 24 16" className="w-full h-full" aria-hidden>
      <rect x="4" y="4" width="16" height="2.5" rx="1" fill="currentColor" />
      <rect x="4" y="8.5" width="12" height="2" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  image_left: (
    <svg viewBox="0 0 24 16" className="w-full h-full" aria-hidden>
      <rect x="2" y="2" width="9" height="12" rx="1.5" fill="currentColor" opacity="0.5" />
      <rect x="13" y="4" width="9" height="2.5" rx="1" fill="currentColor" />
      <rect x="13" y="8.5" width="7" height="2" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  image_right: (
    <svg viewBox="0 0 24 16" className="w-full h-full" aria-hidden>
      <rect x="13" y="2" width="9" height="12" rx="1.5" fill="currentColor" opacity="0.5" />
      <rect x="2" y="4" width="9" height="2.5" rx="1" fill="currentColor" />
      <rect x="2" y="8.5" width="7" height="2" rx="1" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  image_top: (
    <svg viewBox="0 0 24 16" className="w-full h-full" aria-hidden>
      <rect x="2" y="2" width="20" height="7" rx="1.5" fill="currentColor" opacity="0.5" />
      <rect x="2" y="11" width="14" height="2.5" rx="1" fill="currentColor" />
    </svg>
  ),
  image_full: (
    <svg viewBox="0 0 24 16" className="w-full h-full" aria-hidden>
      <rect x="2" y="2" width="20" height="12" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="5" y="9" width="12" height="2.5" rx="1" fill="currentColor" />
    </svg>
  ),
}

function upsert(
  doc: ExplanationDoc,
  id: string,
  patch: Partial<ExplanationElement>,
  seed: ExplanationElement
): ExplanationDoc {
  const exists = doc.elements.some(el => el.id === id)
  const elements = exists
    ? doc.elements.map(el =>
        el.id === id ? { ...el, ...patch, style: { ...el.style, ...patch.style } } : el
      )
    : [...doc.elements, { ...seed, ...patch }]
  return { ...doc, elements }
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value: string | undefined
  fallback: string
  onChange: (hex: string) => void
}) {
  const current = safeColor(value, fallback)
  return (
    <div className="space-y-2">
      <span className="text-xs text-[#9a9eab] block">{label}</span>
      <div className="flex items-center gap-2 flex-wrap">
        {SWATCHES.map(hex => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            aria-label={hex}
            className={`h-7 w-7 rounded-lg border transition-transform cursor-pointer hover:scale-110 ${
              current.toLowerCase() === hex.toLowerCase()
                ? 'border-[#e85d4c] ring-2 ring-[#e85d4c]/40'
                : 'border-[#3d4454]'
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
        <label className="relative h-7 w-7 rounded-lg border border-[#3d4454] overflow-hidden cursor-pointer shrink-0">
          {/* A native picker keeps this dependency-free; the value is validated
              as #rrggbb again on the server before it reaches an inline style. */}
          <input
            type="color"
            value={current}
            onChange={e => onChange(e.target.value)}
            className="absolute -inset-2 w-[calc(100%+1rem)] h-[calc(100%+1rem)] cursor-pointer"
          />
        </label>
      </div>
    </div>
  )
}

export function ExplanationEditor({
  value,
  onSave,
  duration,
  onDurationChange,
}: {
  value: string
  onSave: (json: string) => void | Promise<void>
  duration: number
  onDurationChange: (seconds: number) => void
}) {
  const t = useTranslations('editor')
  const [doc, setDoc] = useState<ExplanationDoc | null>(() => parseExplanation(value))
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // `value` changes for two reasons: the host switched question, or our own
  // save round-tripped through the parent. Only the first should reset the
  // editor — resetting on our own echo would drop a just-added empty slide
  // (an empty doc serialises to '', which parses back to "no slide").
  const lastSavedRef = useRef(value)
  useEffect(() => {
    if (value === lastSavedRef.current) return
    lastSavedRef.current = value
    setDoc(parseExplanation(value))
    setUploadError('')
  }, [value])

  // Text edits save on a trailing debounce so typing a paragraph is not one
  // PUT per keystroke; layout and color changes commit immediately below.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  const commit = (next: ExplanationDoc | null, debounce = false) => {
    setDoc(next)
    const json = next && !isExplanationEmpty(next) ? JSON.stringify(next) : ''
    if (saveTimer.current) clearTimeout(saveTimer.current)
    // A blank new slide and "no slide" serialise identically, so there is
    // nothing to write until the host actually types or picks an image.
    if (json === lastSavedRef.current) return
    lastSavedRef.current = json
    if (debounce) {
      saveTimer.current = setTimeout(() => onSave(json), 600)
    } else {
      onSave(json)
    }
  }

  const layoutLabels: Record<ExplanationLayout, string> = {
    text: t('explanationLayoutText'),
    image_left: t('explanationLayoutImageLeft'),
    image_right: t('explanationLayoutImageRight'),
    image_top: t('explanationLayoutImageTop'),
    image_full: t('explanationLayoutImageFull'),
  }

  const title = doc?.elements.find(el => el.role === 'title')
  const body = doc?.elements.find(el => el.role === 'body')
  const media = doc?.elements.find(el => el.kind === 'image')
  const needsImage = !!doc && doc.layout !== 'text'

  const handleUpload = async (file: File) => {
    if (!doc) return
    setUploading(true)
    setUploadError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await uploadImageAction(formData)
      if (res.success && res.url) {
        commit(
          upsert(doc, 'media', { url: res.url }, {
            id: 'media',
            kind: 'image',
            role: 'media',
            url: res.url,
            fit: 'cover',
          })
        )
      } else {
        setUploadError(res.error || t('explanationUploadFailed'))
      }
    } catch {
      setUploadError(t('explanationUploadFailed'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (!doc) {
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-[#f2f0eb] block">{t('explanationTitle')}</span>
            <span className="text-xs text-[#9a9eab]">{t('explanationHint')}</span>
          </div>
        </div>
        <Button
          onClick={() => commit(emptyExplanation('text'))}
          variant="outline"
          className="w-full border-[#2c313d] bg-transparent hover:bg-[#e85d4c]/10 hover:border-[#e85d4c]/40 text-[#e85d4c] font-semibold py-3 rounded-xl cursor-pointer gap-2"
        >
          {t('explanationAdd')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-[#f2f0eb] block">{t('explanationTitle')}</span>
          <span className="text-xs text-[#9a9eab]">{t('explanationHint')}</span>
        </div>
        <Button
          onClick={() => commit(null)}
          variant="ghost"
          size="icon"
          title={t('explanationRemove')}
          className="h-8 w-8 shrink-0 text-[#9a9eab] hover:text-[#e85d4c] hover:bg-[#e85d4c]/10 rounded-lg cursor-pointer"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Layout */}
      <div className="space-y-2">
        <span className="text-xs text-[#9a9eab] block">{t('explanationLayout')}</span>
        <div className="grid grid-cols-5 gap-2">
          {EXPLANATION_LAYOUTS.map(layout => (
            <button
              key={layout}
              type="button"
              onClick={() => commit({ ...doc, layout })}
              title={layoutLabels[layout]}
              className={`aspect-[3/2] p-1.5 rounded-lg border transition-all cursor-pointer ${
                doc.layout === layout
                  ? 'border-[#e85d4c] bg-[#e85d4c]/10 text-[#e85d4c]'
                  : 'bg-[#12141a] border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] hover:border-[#3d4454]'
              }`}
            >
              {LAYOUT_ICONS[layout]}
            </button>
          ))}
        </div>
      </div>

      {/* Image */}
      {needsImage && (
        <div className="space-y-2">
          <span className="text-xs text-[#9a9eab] block">{t('explanationImage')}</span>
          {media?.url ? (
            <div className="relative rounded-xl overflow-hidden border border-[#2c313d] bg-[#12141a]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media.url} alt="" className="w-full h-28 object-cover" />
              <button
                type="button"
                onClick={() => commit({ ...doc, elements: doc.elements.filter(el => el.kind !== 'image') })}
                className="absolute top-2 right-2 h-7 w-7 rounded-lg bg-black/70 text-white flex items-center justify-center hover:bg-black cursor-pointer"
                aria-label={t('explanationImageRemove')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full h-24 rounded-xl border border-dashed border-[#3d4454] bg-[#12141a] text-[#9a9eab] hover:text-[#f2f0eb] hover:border-[#e85d4c]/50 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:cursor-wait"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              <span className="text-xs font-medium">
                {uploading ? t('explanationUploading') : t('explanationImageAdd')}
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
            }}
          />
          {uploadError && <p className="text-xs text-[#e85d4c]">{uploadError}</p>}
        </div>
      )}

      {/* Text */}
      <div className="space-y-2">
        <span className="text-xs text-[#9a9eab] block">{t('explanationHeadline')}</span>
        <input
          value={title?.text || ''}
          onChange={e =>
            commit(
              upsert(doc, 'title', { text: e.target.value }, {
                id: 'title',
                kind: 'text',
                role: 'title',
                text: e.target.value,
                style: { color: DEFAULT_TITLE_COLOR, align: 'left' },
              }),
              true
            )
          }
          placeholder={t('explanationHeadlinePlaceholder')}
          maxLength={160}
          className="w-full bg-[#12141a] border border-[#2c313d] focus:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl px-4 py-3 text-base sm:text-sm outline-none"
        />
      </div>

      <div className="space-y-2">
        <span className="text-xs text-[#9a9eab] block">{t('explanationBody')}</span>
        <textarea
          value={body?.text || ''}
          onChange={e =>
            commit(
              upsert(doc, 'body', { text: e.target.value }, {
                id: 'body',
                kind: 'text',
                role: 'body',
                text: e.target.value,
                style: { color: DEFAULT_BODY_COLOR, align: 'left' },
              }),
              true
            )
          }
          placeholder={t('explanationBodyPlaceholder')}
          rows={4}
          maxLength={2000}
          className="w-full bg-[#12141a] border border-[#2c313d] focus:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl px-4 py-3 text-base sm:text-sm outline-none resize-y"
        />
      </div>

      {/* Colors */}
      <div className="space-y-4 pt-4 border-t border-[#2c313d]">
        {doc.layout !== 'image_full' && (
          <ColorField
            label={t('explanationBgColor')}
            value={doc.bg?.color}
            fallback={DEFAULT_EXPLANATION_BG}
            onChange={hex => commit({ ...doc, bg: { color: hex } })}
          />
        )}
        <ColorField
          label={t('explanationTitleColor')}
          value={title?.style?.color}
          fallback={DEFAULT_TITLE_COLOR}
          onChange={hex =>
            commit(
              upsert(doc, 'title', { style: { color: hex } }, {
                id: 'title',
                kind: 'text',
                role: 'title',
                text: '',
                style: { color: hex, align: 'left' },
              })
            )
          }
        />
        <ColorField
          label={t('explanationBodyColor')}
          value={body?.style?.color}
          fallback={DEFAULT_BODY_COLOR}
          onChange={hex =>
            commit(
              upsert(doc, 'body', { style: { color: hex } }, {
                id: 'body',
                kind: 'text',
                role: 'body',
                text: '',
                style: { color: hex, align: 'left' },
              })
            )
          }
        />
        {doc.layout === 'image_full' && (
          <div className="space-y-2">
            <span className="text-xs text-[#9a9eab] block">
              {t('explanationOverlay')} — {Math.round((doc.overlay ?? 0.45) * 100)}%
            </span>
            {/* Without a scrim, light photos swallow the text entirely. */}
            <input
              type="range"
              min={0}
              max={80}
              step={5}
              value={Math.round((doc.overlay ?? 0.45) * 100)}
              onChange={e => commit({ ...doc, overlay: Number(e.target.value) / 100 })}
              className="w-full accent-[#e85d4c] cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="space-y-2 pt-4 border-t border-[#2c313d]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[#9a9eab]">{t('explanationPreview')}</span>
          {/* The panel is narrow by design, so the thumbnail can only ever be a
              thumbnail. This is the way to actually read the slide before a
              room does. */}
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[#9a9eab] hover:text-[#f2f0eb] hover:bg-white/5 cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            {t('explanationPreviewExpand')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="block w-full cursor-zoom-in"
          aria-label={t('explanationPreviewExpand')}
        >
          <ExplanationThumbnail doc={doc} />
        </button>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setPreviewOpen(false)}
          />
          <div className="relative w-full max-w-5xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#f2f0eb]">{t('explanationPreview')}</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#9a9eab] hover:text-[#f2f0eb] hover:bg-white/5 cursor-pointer"
                aria-label={t('explanationPreviewClose')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Capped by the height left over at 16:9 so the slide is as large
                as the window allows and never needs scrolling — the same rule
                the host screen uses. */}
            <div className="w-full aspect-video max-h-[calc(100dvh-9rem)] max-w-[calc((100dvh-9rem)*16/9)] mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <ExplanationSlide doc={doc} variant="stage" animate={false} />
            </div>
          </div>
        </div>
      )}

      {/* Quiz-level pacing */}
      <div className="space-y-2 pt-4 border-t border-[#2c313d]">
        <label className="text-xs text-[#9a9eab] block">{t('explanationDuration')}</label>
        <select
          value={duration}
          onChange={e => onDurationChange(Number(e.target.value))}
          className="w-full bg-[#12141a] border border-[#2c313d] focus:border-[#e85d4c] text-[#f2f0eb] rounded-xl px-4 py-3 text-base sm:text-sm font-medium cursor-pointer"
        >
          {[5, 8, 10, 15, 20, 30, 45, 60].map(s => (
            <option key={s} value={s} className="bg-[#12141a] text-[#f2f0eb]">
              {s}s
            </option>
          ))}
        </select>
        <p className="text-[11px] text-[#5c6170] leading-snug">{t('explanationDurationHint')}</p>
      </div>
    </div>
  )
}
