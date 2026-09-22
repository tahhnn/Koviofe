'use client'

import React, { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImagePlus, Trash2, Loader2, Lock } from 'lucide-react'
import { uploadImageAction } from '@/app/actions/upload'
import { downscaleImage } from '@/lib/downscale-image'
import { DEFAULT_OVERLAY_COLOR, MIN_OVERLAY, type BrandingPatch, type QuizTheme } from '@/lib/theme'

type Slot = 'bg_host_url' | 'bg_player_url' | 'logo_url'

interface QuizBrandingPanelProps {
  theme: QuizTheme
  /** Called with the keys that changed; the caller persists and re-renders. */
  onChange: (patch: BrandingPatch) => void
  /** False on a plan without custom branding: the slots render, but locked. */
  allowed: boolean
}

/**
 * The two key visuals a quiz can carry, and the scrim over them.
 *
 * Two slots rather than one because the projector is 16:9 and a player's phone
 * is upright — one image cropped to both loses the subject in whichever it was
 * not drawn for. Each preview is shown at its real aspect ratio so a host sees
 * the crop before a room full of people does.
 */
export function QuizBrandingPanel({ theme, onChange, allowed }: QuizBrandingPanelProps) {
  const t = useTranslations('editor')
  const [busy, setBusy] = useState<Slot | null>(null)
  const [error, setError] = useState('')

  // The projector background is the honest preview surface: it is the biggest
  // screen the scrim will ever cover, and the one where a wrong choice is seen
  // by the whole room at once.
  const previewUrl = theme.bgHostUrl || theme.bgPlayerUrl

  // Perceived brightness, weighted for how the eye actually responds. Body text
  // on these screens is #f2f0eb, so a scrim this pale leaves nothing behind it.
  const lightScrim = (() => {
    const hex = theme.bgOverlayColor
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return false
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
  })()

  const upload = async (
    slot: { key: Slot; patch: (url: string) => BrandingPatch },
    file: File
  ) => {
    setError('')
    setBusy(slot.key)
    try {
      // Shrunk here rather than on the server: these bytes are fetched again
      // by every phone in the room when the round starts, so the saving
      // multiplies by the audience.
      const shrunk = await downscaleImage(file)
      const formData = new FormData()
      formData.append('file', shrunk)
      const res = await uploadImageAction(formData)
      if (res.success && res.url) {
        onChange(slot.patch(res.url))
      } else {
        setError(res.error || t('kvUploadFailed'))
      }
    } catch {
      setError(t('kvUploadFailed'))
    } finally {
      setBusy(null)
    }
  }

  const slots: {
    key: Slot
    label: string
    hint: string
    ratio: string
    url: string
    patch: (url: string) => BrandingPatch
  }[] = [
    {
      key: 'bg_host_url',
      label: t('kvHostLabel'),
      hint: t('kvHostHint'),
      ratio: 'aspect-video',
      url: theme.bgHostUrl,
      patch: (url) => ({ bg_host_url: url }),
    },
    {
      key: 'bg_player_url',
      label: t('kvPlayerLabel'),
      hint: t('kvPlayerHint'),
      ratio: 'aspect-[9/16]',
      url: theme.bgPlayerUrl,
      patch: (url) => ({ bg_player_url: url }),
    },
  ]

  // The logo is its own row: it is not a background, it sits at a free aspect
  // ratio, and pairing it beside a 9:16 slot in the same grid would stretch it.
  const logoSlot = {
    key: 'logo_url' as Slot,
    label: t('kvLogoLabel'),
    hint: t('kvLogoHint'),
    ratio: 'aspect-[3/1]',
    url: theme.logoUrl,
    patch: (url: string): BrandingPatch => ({ logo_url: url }),
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[#c5c2ba]">{t('kvSectionTitle')}</label>
        {!allowed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#f0b429]/15 px-2 py-0.5 text-[11px] font-medium text-[#f0b429]">
            <Lock className="h-3 w-3" />
            {t('kvProOnly')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {slots.map((slot) => (
          <BrandingSlot
            key={slot.key}
            label={slot.label}
            hint={slot.hint}
            ratio={slot.ratio}
            url={slot.url}
            allowed={allowed}
            busy={busy === slot.key}
            onPick={(file) => upload(slot, file)}
            onClear={() => onChange(slot.patch(''))}
          />
        ))}
      </div>

      <BrandingSlot
        label={logoSlot.label}
        hint={logoSlot.hint}
        ratio={logoSlot.ratio}
        url={logoSlot.url}
        allowed={allowed}
        busy={busy === logoSlot.key}
        onPick={(file) => upload(logoSlot, file)}
        onClear={() => onChange(logoSlot.patch(''))}
      />

      {error && <p className="text-xs text-[#e85d4c]">{error}</p>}

      {/* The scrim only has anything to sit over once an image exists, so the
          control appears with the first upload rather than sitting inert. */}
      {(theme.bgHostUrl || theme.bgPlayerUrl) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#9a9eab]">{t('kvOverlayLabel')}</label>
            <span className="text-xs tabular-nums text-[#5c6170]">
              {Math.round(theme.bgOverlay * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* The colour sits beside the slider because they describe one
                thing together: a 50% scrim in the event's own red is a
                different decision from 50% of the page background. */}
            <input
              type="color"
              value={theme.bgOverlayColor}
              disabled={!allowed}
              aria-label={t('kvOverlayColorLabel')}
              title={t('kvOverlayColorLabel')}
              onChange={(e) => onChange({ bg_overlay_color: e.target.value })}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border border-[#2c313d] bg-transparent p-0.5 disabled:opacity-40"
            />
            <input
              type="range"
              min={MIN_OVERLAY}
              max={1}
              step={0.05}
              value={theme.bgOverlay}
              disabled={!allowed}
              onChange={(e) => onChange({ bg_overlay: Number(e.target.value) })}
              className="w-full accent-[#e85d4c] disabled:opacity-40"
            />
            {theme.bgOverlayColor.toLowerCase() !== DEFAULT_OVERLAY_COLOR && (
              <button
                type="button"
                disabled={!allowed}
                onClick={() => onChange({ bg_overlay_color: DEFAULT_OVERLAY_COLOR })}
                className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-[#2c313d] bg-transparent px-2 py-1 text-[11px] text-[#9a9eab] transition-colors hover:text-[#f2f0eb] disabled:opacity-40"
              >
                {t('kvOverlayColorReset')}
              </button>
            )}
          </div>

          {/* Shows the actual result rather than describing it. The opacity
              floor stops a scrim from vanishing, but it cannot stop a host
              picking a pale colour, and a swatch beside a slider tells nobody
              whether their title will still be legible on a projector. */}
          <div className="relative h-16 overflow-hidden rounded-xl border border-[#2c313d]">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#e85d4c]/40 via-[#f0b429]/30 to-[#2dd4bf]/30" />
            )}
            <div
              className="absolute inset-0"
              style={{ backgroundColor: theme.bgOverlayColor, opacity: theme.bgOverlay }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-[#f2f0eb]">{t('kvOverlayPreviewText')}</span>
            </div>
          </div>

          {/* Says why the slider will not go lower, so a host who drags it to
              the end and finds it stops does not read that as a bug. */}
          <p className="text-[11px] leading-snug text-[#5c6170]">
            {t('kvOverlayHint', { min: Math.round(MIN_OVERLAY * 100) })}
          </p>

          {/* A warning, not a block: a pale scrim is a legitimate choice for a
              dark key visual, and only the host knows what the artwork under it
              looks like. The preview above is the real answer; this is the
              nudge to go and look at it. */}
          {lightScrim && (
            <p className="text-[11px] leading-snug text-[#f0b429]">{t('kvOverlayLightWarning')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function BrandingSlot({
  label,
  hint,
  ratio,
  url,
  allowed,
  busy,
  onPick,
  onClear,
}: {
  label: string
  hint: string
  ratio: string
  url: string
  allowed: boolean
  busy: boolean
  onPick: (file: File) => void
  onClear: () => void
}) {
  const t = useTranslations('editor')
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-[#c5c2ba]">{label}</p>

      <div
        className={`relative ${ratio} w-full overflow-hidden rounded-xl border border-[#2c313d] bg-[#12141a]`}
      >
        {url ? (
          <>
            <img src={url} alt="" className="h-full w-full object-cover" />
            {allowed && (
              <button
                type="button"
                onClick={onClear}
                aria-label={t('kvRemove')}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg border-none bg-black/60 text-[#f2f0eb] hover:bg-black/80 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={!allowed || busy}
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 border-none bg-transparent text-[#5c6170] transition-colors hover:text-[#9a9eab] disabled:cursor-not-allowed disabled:hover:text-[#5c6170] cursor-pointer"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-5 w-5" />
                <span className="px-2 text-center text-[11px] leading-tight">{hint}</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          // Cleared so picking the same file twice still fires a change.
          e.target.value = ''
        }}
      />
    </div>
  )
}
