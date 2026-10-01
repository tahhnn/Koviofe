'use client'

import { useEffect, useRef } from 'react'

/**
 * Keyboard control for the projected host screen. The host is usually standing
 * at a laptop or holding a presenter clicker, not aiming a mouse at a button on
 * a dimmed screen — one key per beat is how the room keeps moving.
 *
 * Keys are matched on `e.key`, lower-cased when it is a single character, so
 * the map reads `{ r: reveal, ' ': next, ArrowRight: next }`.
 */
export function useHostHotkeys(map: Record<string, () => void>, enabled = true) {
  // The handlers close over fresh state every render; the listener does not
  // need to be re-attached for that.
  const mapRef = useRef(map)
  mapRef.current = map

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      // An open confirm owns the keyboard (Enter/Esc answer it); a stray Space
      // must not advance the game underneath it.
      if (document.querySelector('[data-toast-confirm]')) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const fn = mapRef.current[key]
      if (!fn) return
      // Also stops a focused button from being clicked a second time by the
      // same Space/Enter.
      e.preventDefault()
      fn()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}
