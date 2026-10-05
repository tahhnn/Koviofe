/**
 * Display helpers for the admin audit screens.
 *
 * Action names are protocol values written by the backend
 * (internal/pkg/audit callers). Known ones are translated under
 * `adminAudit.actions.*`; an action added on the server before the catalog
 * catches up is shown verbatim rather than breaking the table.
 */
export function actionLabel(
  t: { (key: string): string; has: (key: string) => boolean },
  action: string,
): string {
  const key = `actions.${action}`
  return t.has(key) ? t(key) : action
}

export function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return '—'
  }
}

/** One short line for the metadata column: `key=value · key=value`. */
export function metaSummary(meta: Record<string, unknown> | undefined): string {
  if (!meta) return ''
  return Object.entries(meta)
    .filter(([k]) => k !== 'filters')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ')
}

/** Saves CSV text with a BOM so Excel reads Vietnamese as UTF-8. The BOM the
 *  API sends does not survive: fetch's text() strips it while decoding. */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
