'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { parseQuizTheme, playerBackground } from '@/lib/theme'

interface GameBackgroundProps {
  children: React.ReactNode
  variant?: 'arena' | 'dashboard' | 'auth' | 'marketing'
  showGrid?: boolean
  className?: string
  /**
   * A host's key visual, as a path under /uploads/. Absent on every screen
   * that is not a game: the gradient below is the product's own look, and a
   * quiz's artwork has no business on the dashboard or the sign-in page.
   */
  backgroundUrl?: string
  /**
   * Opacity of the scrim drawn over that image, 0-1. The backend clamps it to
   * a floor before it is stored (see internal/pkg/theme), so a value arriving
   * here has already been checked; the default covers a config written before
   * the key existed.
   */
  overlay?: number
  /**
   * The scrim's colour. A host tinting their key visual in the event's own
   * palette is the point of the setting; the page background is only the
   * default because it is what every theme looked like before it existed.
   */
  overlayColor?: string
}

export function GameBackground({
  children,
  variant = 'arena',
  showGrid = false,
  className,
  backgroundUrl,
  overlay = 0.55,
  overlayColor = '#12141a',
}: GameBackgroundProps) {
  const glow =
    variant === 'auth'
      ? 'from-[#e85d4c]/18 via-transparent to-[#2dd4bf]/10'
      : variant === 'marketing'
        ? 'from-[#e85d4c]/14 via-transparent to-[#f0b429]/08'
        : 'from-[#e85d4c]/10 via-transparent to-[#2dd4bf]/08'

  return (
    <div
      className={cn(
        'relative min-h-[100dvh] w-full bg-[#12141a] text-[#f2f0eb] overflow-x-clip overscroll-none flex flex-col',
        className
      )}
    >
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden>
        {/* The key visual sits at the very back, under the glows and the
            grain, so a host's artwork inherits the same atmosphere the plain
            background has rather than sitting flat on top of it.

            The scrim is a solid sheet of the page background rather than a
            gradient: body text is #f2f0eb and a projector at the back of a
            room is the worst case, so the image is darkened evenly instead of
            leaving bright patches wherever the artwork happens to be light. */}
        {backgroundUrl && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url("${encodeURI(backgroundUrl)}")` }}
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: overlayColor,
                opacity: Math.min(1, Math.max(0, overlay)),
              }}
            />
          </>
        )}
        <div
          className={cn(
            'absolute -top-[20%] -left-[10%] h-[55vmax] w-[55vmax] rounded-full bg-gradient-to-br blur-[100px] animate-soft-drift',
            glow
          )}
        />
        <div className="absolute -bottom-[25%] -right-[15%] h-[50vmax] w-[50vmax] rounded-full bg-[#2dd4bf]/[0.07] blur-[110px] animate-soft-drift-alt" />
        {showGrid && (
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(242,240,235,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(242,240,235,0.03) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, #000 40%, transparent 100%)',
            }}
          />
        )}
        {/* Warm grain without purple haze */}
        <div
          className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          }}
        />
      </div>

      <div className="relative z-10 flex-1 flex flex-col">{children}</div>
    </div>
  )
}

/**
 * GameBackground with the quiz's key visual already applied.
 *
 * Game screens all read the same `theme_config` and all want the same two
 * props out of it, and a screen is added to those files fairly often — the
 * loading state, the error state, the lobby and the arena are separate
 * returns. Parsing at each call site meant a new branch rendered on the plain
 * gradient while the ones beside it were branded, and nothing failed loudly
 * when that happened.
 *
 * `surface` picks which image: the projector gets the 16:9 artwork, a phone
 * gets the upright one and falls back to the projector's.
 */
export function ThemedGameBackground({
  themeConfig,
  surface,
  ...props
}: Omit<GameBackgroundProps, 'backgroundUrl' | 'overlay'> & {
  themeConfig?: string | null
  surface: 'host' | 'player'
}) {
  const theme = parseQuizTheme(themeConfig)
  const backgroundUrl = surface === 'host' ? theme.bgHostUrl : playerBackground(theme)

  return (
    <GameBackground
      {...props}
      backgroundUrl={backgroundUrl}
      overlay={theme.bgOverlay}
      overlayColor={theme.bgOverlayColor}
    />
  )
}
