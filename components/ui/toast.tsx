'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { localizeApiError, resolveApiError } from '@/lib/api-errors'

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'confirm'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  description?: string
  type: ToastType
  duration?: number // default 4000ms
  onConfirm?: () => void
  onCancel?: () => void
  action?: ToastAction
  secondaryAction?: ToastAction
}

interface ToastContextType {
  toast: (options: Omit<Toast, 'id'>) => string
  dismiss: (id: string) => void
  success: (message: string, description?: string) => void
  error: (message: string, description?: string, action?: ToastAction) => void
  info: (message: string, description?: string) => void
  confirm: (message: string, onConfirm: () => void, description?: string) => void
  apiError: (
    raw: unknown,
    navigate?: (href: string) => void
  ) => string
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  // apiError() renders catalog keys resolved by lib/api-errors, which has no
  // place of its own to call a hook — the provider holds the translator.
  const tErrors = useTranslations('apiErrors')

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const toast = (options: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9)
    const newToast: Toast = { ...options, id }

    setToasts((prev) => {
      let filtered = prev
      if (options.type === 'confirm') {
        filtered = prev.filter((t) => t.type !== 'confirm')
      }

      const updated = [...filtered, newToast]

      if (updated.length > 3) {
        return updated.slice(updated.length - 3)
      }
      return updated
    })

    return id
  }

  const success = (message: string, description?: string) => {
    toast({ message, description, type: 'success' })
  }

  const error = (message: string, description?: string, action?: ToastAction) => {
    toast({
      message,
      description,
      type: 'error',
      action,
      duration: action ? 10000 : 4000,
    })
  }

  const info = (message: string, description?: string) => {
    toast({ message, description, type: 'info' })
  }

  const confirm = (message: string, onConfirm: () => void, description?: string) => {
    toast({
      message,
      description,
      type: 'confirm',
      duration: 20000,
      onConfirm,
    })
  }

  const apiError = (raw: unknown, navigate?: (href: string) => void) => {
    const resolved = localizeApiError(resolveApiError(raw), tErrors)

    // Auth failures must go to login — never leave the user staring at a dead-end toast.
    if (resolved.requiresLogin) {
      void import('@/lib/auth-client').then(({ authClient }) => {
        authClient.signOut()
      })
      return toast({
        message: resolved.title,
        description: resolved.description,
        type: 'error',
        duration: 2500,
      })
    }

    return toast({
      message: resolved.title,
      description: resolved.description,
      type: 'error',
      duration: 12000,
      action:
        resolved.href && navigate
          ? {
              label: resolved.hrefLabel || tErrors('continue'),
              onClick: () => navigate(resolved.href!),
            }
          : undefined,
      secondaryAction:
        resolved.secondaryHref && navigate
          ? {
              label: resolved.secondaryHrefLabel || tErrors('otherOption'),
              onClick: () => navigate(resolved.secondaryHref!),
            }
          : undefined,
    })
  }

  return (
    <ToastContext.Provider value={{ toast, dismiss, success, error, info, confirm, apiError }}>
      {children}
      <div className="fixed bottom-5 inset-x-4 sm:inset-x-auto sm:right-5 z-[9999] flex flex-col gap-3 w-auto sm:w-full sm:max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  // ToastProvider sits inside NextIntlClientProvider, so the two buttons this
  // component owns can be translated even though components/ui/ is otherwise
  // kept free of copy.
  const t = useTranslations('common')
  const hasActions =
    toast.type === 'confirm' || !!(toast.action || toast.secondaryAction)

  useEffect(() => {
    if (hasActions) return
    const duration = toast.duration || 4000
    const timer = setTimeout(() => {
      onClose()
    }, duration)
    return () => clearTimeout(timer)
  }, [toast, onClose, hasActions])

  let bgClass = 'bg-slate-900/90 border-slate-700/50 text-slate-100'
  let progressColor = 'bg-indigo-500'
  let icon = '⚔️'

  if (toast.type === 'success') {
    bgClass = 'bg-emerald-950/85 border-emerald-500/30 text-emerald-100 shadow-[0_4px_20px_rgba(16,185,129,0.1)]'
    progressColor = 'bg-emerald-500'
    icon = '✅'
  } else if (toast.type === 'error') {
    bgClass = 'bg-rose-950/85 border-rose-500/30 text-rose-100 shadow-[0_4px_20px_rgba(244,63,94,0.1)]'
    progressColor = 'bg-rose-500'
    icon = '❌'
  } else if (toast.type === 'warning') {
    bgClass = 'bg-amber-950/85 border-amber-500/30 text-amber-100'
    progressColor = 'bg-amber-500'
    icon = '⚠️'
  } else if (toast.type === 'confirm') {
    bgClass = 'bg-slate-950/95 border-indigo-500/40 text-slate-100 shadow-[0_10px_30px_rgba(99,102,241,0.25)]'
    progressColor = 'bg-indigo-500'
    icon = '⚡'
  }

  return (
    <div className={`pointer-events-auto flex flex-col border backdrop-blur-xl rounded-2xl p-4 shadow-2xl transition-all duration-300 transform translate-y-0 animate-toast-in ${bgClass}`}>
      <div className="flex gap-3">
        <span className="text-xl flex-shrink-0">{icon}</span>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-black tracking-wide">{toast.message}</p>
          {toast.description && (
            <p className="text-xs text-gray-400 leading-relaxed font-semibold">{toast.description}</p>
          )}

          {toast.type === 'confirm' && (
            <div className="flex gap-2 pt-3">
              <button
                onClick={() => {
                  if (toast.onConfirm) toast.onConfirm()
                  onClose()
                }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-[11px] font-black px-4 py-2.5 sm:px-3.5 sm:py-1.5 rounded-xl transition-colors cursor-pointer shadow-md"
              >
                {t('confirm')}
              </button>
              <button
                onClick={onClose}
                className="bg-white/10 hover:bg-white/15 text-gray-300 text-xs sm:text-[11px] font-black px-4 py-2.5 sm:px-3.5 sm:py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                {t('cancel')}
              </button>
            </div>
          )}

          {toast.type !== 'confirm' && (toast.action || toast.secondaryAction) && (
            <div className="flex flex-wrap gap-2 pt-3">
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.onClick()
                    onClose()
                  }}
                  className="bg-[#e85d4c] hover:bg-[#d44e3e] text-white text-xs sm:text-[11px] font-black px-4 py-2.5 sm:px-3.5 sm:py-1.5 rounded-xl transition-colors cursor-pointer shadow-md"
                >
                  {toast.action.label}
                </button>
              )}
              {toast.secondaryAction && (
                <button
                  onClick={() => {
                    toast.secondaryAction?.onClick()
                    onClose()
                  }}
                  className="bg-white/10 hover:bg-white/15 text-gray-200 text-xs sm:text-[11px] font-black px-4 py-2.5 sm:px-3.5 sm:py-1.5 rounded-xl transition-colors cursor-pointer"
                >
                  {toast.secondaryAction.label}
                </button>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors text-sm self-start cursor-pointer flex items-center justify-center min-h-9 min-w-9 -mr-2 -mt-2"
        >
          ✕
        </button>
      </div>

      {!hasActions && (
        <div className="w-full bg-white/5 h-0.5 mt-3 rounded-full overflow-hidden">
          <div
            className={`h-full ${progressColor} animate-[shrink_4s_linear] origin-left`}
            style={{ animationDuration: `${toast.duration || 4000}ms` }}
          />
        </div>
      )}
    </div>
  )
}
