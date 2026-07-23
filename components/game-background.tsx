'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface GameBackgroundProps {
  children: React.ReactNode
  variant?: 'arena' | 'dashboard' | 'auth' | 'marketing'
  showGrid?: boolean
  className?: string
}

export function GameBackground({
  children,
  variant = 'arena',
  showGrid = false,
  className,
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
        'relative min-h-[100dvh] w-full bg-[#12141a] text-[#f2f0eb] overflow-hidden flex flex-col',
        className
      )}
    >
      <div className="absolute inset-0 pointer-events-none z-0" aria-hidden>
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
