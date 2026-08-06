'use client'

import { useEffect, useRef, useCallback } from 'react'

export interface TourStep {
  element: string
  title?: string
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export interface TourOptions {
  steps: TourStep[]
  overlayColor?: string
  highlightPadding?: number
  tooltipOffset?: number
  showSkipButton?: boolean
  showProgress?: boolean
  scrollBehavior?: 'smooth' | 'auto'
  animation?: boolean
  finishLabel?: string
  nextLabel?: string
  prevLabel?: string
  skipLabel?: string
  onComplete?: () => void
  onSkip?: () => void
  onEnd?: () => void
  onNext?: (stepIndex: number) => void
  onPrev?: (stepIndex: number) => void
}

export interface StepTourInstance {
  start: () => void
  next: () => void
  prev: () => void
  skip: () => void
  end: () => void
  addSteps: (steps: TourStep[]) => void
  reset: () => void
}

declare global {
  interface Window {
    StepTour: new (options: TourOptions) => StepTourInstance
  }
}

function loadStepTourScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Cannot load StepTour on server'))
      return
    }

    // Drop stale StepTour builds that lack Finish / skip-missing fixes
    if (window.StepTour && !(window.StepTour as any).__quizzzoneV2) {
      const stale = document.querySelector('script[data-step-tour]')
      if (stale) stale.remove()
      delete (window as any).StepTour
    }

    if (window.StepTour) {
      resolve()
      return
    }

    const existing = document.querySelector('script[data-step-tour]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load StepTour')))
      if (window.StepTour) resolve()
      return
    }

    const script = document.createElement('script')
    script.src = '/step-tour.js?v=2'
    script.async = true
    script.defer = true
    script.dataset.stepTour = 'true'
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error('Failed to load StepTour')))
    document.body.appendChild(script)
  })
}

export function useStepTour() {
  const tourRef = useRef<StepTourInstance | null>(null)

  const startTour = useCallback(async (options: TourOptions) => {
    if (typeof window === 'undefined') return

    await loadStepTourScript()

    // Cleanup any existing tour before starting a new one
    if (tourRef.current) {
      tourRef.current.end()
      tourRef.current = null
    }

    const tour = new window.StepTour({
      ...options,
      onComplete: () => {
        options.onComplete?.()
        tourRef.current = null
      },
      onSkip: () => {
        options.onSkip?.()
        tourRef.current = null
      },
      onEnd: () => {
        options.onEnd?.()
        tourRef.current = null
      },
    })

    tourRef.current = tour
    tour.start()
  }, [])

  const endTour = useCallback(() => {
    tourRef.current?.end()
    tourRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      endTour()
    }
  }, [endTour])

  return { startTour, endTour }
}

export function useOnceTour(storageKey: string, options: TourOptions) {
  const { startTour } = useStepTour()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(storageKey) === 'done') return

    const timer = setTimeout(() => {
      startTour({
        ...options,
        onComplete: () => {
          localStorage.setItem(storageKey, 'done')
          options.onComplete?.()
        },
        onSkip: () => {
          localStorage.setItem(storageKey, 'skipped')
          options.onSkip?.()
        },
      })
    }, 800)

    return () => clearTimeout(timer)
  }, [startTour, storageKey, options])
}
