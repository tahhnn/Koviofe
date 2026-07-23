'use client'

import { useState, useCallback } from 'react'
import { HelpCircle } from 'lucide-react'
import { useStepTour, TourOptions } from '@/hooks/use-step-tour'

interface TourButtonProps {
  tour: TourOptions
  label?: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
}

export function TourButton({ tour, label, position = 'bottom-right' }: TourButtonProps) {
  const { startTour } = useStepTour()
  const [running, setRunning] = useState(false)

  const handleStart = useCallback(async () => {
    if (running) return
    setRunning(true)
    try {
      await startTour({
        ...tour,
        finishLabel: tour.finishLabel || 'Finish',
        nextLabel: tour.nextLabel || 'Next',
        prevLabel: tour.prevLabel || 'Back',
        skipLabel: tour.skipLabel || 'Skip',
        onComplete: () => {
          setRunning(false)
          tour.onComplete?.()
        },
        onSkip: () => {
          setRunning(false)
          tour.onSkip?.()
        },
        onEnd: () => {
          setRunning(false)
          tour.onEnd?.()
        },
      })
    } catch (e) {
      console.error('Failed to start tour:', e)
      setRunning(false)
    }
  }, [running, startTour, tour])

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={running}
      title={label || 'Start guided tour'}
      className={`
        fixed z-50 flex items-center gap-2 rounded-full
        bg-[#e85d4c] hover:bg-[#d44e3e] text-white
        shadow-lg hover:shadow-xl transition-all duration-200
        px-4 py-3 text-sm font-semibold
        disabled:opacity-60 disabled:cursor-not-allowed
        ${positionClasses[position]}
      `}
    >
      <HelpCircle className="w-5 h-5" />
      <span className="hidden sm:inline">{label || 'Tour'}</span>
    </button>
  )
}
