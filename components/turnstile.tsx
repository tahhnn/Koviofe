'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { getCaptchaSiteKey } from '@/lib/auth-client'

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = SCRIPT_SRC
      s.async = true
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')))
      s.onerror = () => {
        scriptPromise = null
        reject(new Error('turnstile script failed to load'))
      }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

export type TurnstileHandle = {
  /** Tokens are single-use: call after every submit, successful or not. */
  reset: () => void
}

type Props = {
  /** Must match the action the backend checks ("register", "forgot_password"). */
  action: string
  onToken: (token: string | null) => void
  /** Called once the site key is known: false means the captcha is off. */
  onEnabled?: (enabled: boolean) => void
}

/**
 * Cloudflare Turnstile widget. Renders nothing while the backend has no site
 * key configured, so forms keep working before the captcha is switched on.
 */
export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile(
  { action, onToken, onEnabled },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [enabled, setEnabled] = useState(false)
  // Latest callbacks without re-rendering the widget when the parent re-renders.
  const onTokenRef = useRef(onToken)
  const onEnabledRef = useRef(onEnabled)
  useEffect(() => {
    onTokenRef.current = onToken
    onEnabledRef.current = onEnabled
  })

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.reset(widgetId.current)
        onTokenRef.current(null)
      }
    },
  }))

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const siteKey = await getCaptchaSiteKey()
      if (cancelled) return
      setEnabled(!!siteKey)
      onEnabledRef.current?.(!!siteKey)
      if (!siteKey) return
      try {
        const api = await loadTurnstile()
        if (cancelled || !containerRef.current) return
        widgetId.current = api.render(containerRef.current, {
          sitekey: siteKey,
          action,
          theme: 'dark',
          callback: (t: string) => onTokenRef.current(t),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      } catch (err) {
        console.error(err)
      }
    })()
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current)
      }
      widgetId.current = null
    }
  }, [action])

  if (!enabled) return <div ref={containerRef} hidden />
  return <div ref={containerRef} className="flex justify-center min-h-[65px]" />
})
