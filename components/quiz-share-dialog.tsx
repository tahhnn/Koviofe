'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Lock, Mail, Trash2, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import {
  addQuizCollaborator,
  getQuizCollaborators,
  removeQuizCollaborator,
  type QuizCollaborator,
} from '@/app/actions/quizzes'

type QuizShareDialogProps = {
  quizId: string
  onClose: () => void
}

/**
 * The owner's share dialog: invite editors by email, see who has access, and
 * revoke it.
 *
 * Mount it only while open: each mount loads fresh state.
 *
 * Everything shown comes from the API on open, never from local guesses — the
 * plan gate, the cap and the list are the owner's live state. The API enforces
 * all of it independently; this only explains it.
 */
export function QuizShareDialog({ quizId, onClose }: QuizShareDialogProps) {
  const t = useTranslations('editor')
  const tCommon = useTranslations('common')
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [collaborators, setCollaborators] = useState<QuizCollaborator[]>([])
  const [canShare, setCanShare] = useState(false)
  const [limit, setLimit] = useState(0)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [removingId, setRemovingId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getQuizCollaborators(quizId).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setCollaborators(res.collaborators)
        setCanShare(res.canShare)
        setLimit(res.limit)
      } else {
        setLoadError(res.error)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [quizId])

  const unlimited = limit < 0
  const full = !unlimited && collaborators.length >= limit

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inviting) return
    setInviting(true)
    setInviteError('')
    const res = await addQuizCollaborator(quizId, email)
    setInviting(false)
    if (!res.ok) {
      setInviteError(res.error)
      return
    }
    const already = collaborators.some((c) => c.id === res.collaborator.id)
    if (!already) setCollaborators((prev) => [...prev, res.collaborator])
    setEmail('')
    toast.success(
      already ? t('shareAlreadyInvited') : t('shareInvited'),
      res.collaborator.status === 'pending' ? t('sharePendingHint') : res.collaborator.email
    )
  }

  const handleRemove = (c: QuizCollaborator) => {
    toast.confirm(
      t('shareRemoveConfirm', { email: c.email }),
      async () => {
        setRemovingId(c.id)
        const res = await removeQuizCollaborator(quizId, c.id)
        setRemovingId(null)
        if (!res.ok) {
          toast.error(t('shareFailed'), res.error)
          return
        }
        setCollaborators((prev) => prev.filter((x) => x.id !== c.id))
        toast.success(t('shareRemoved'), c.email)
      },
      t('shareRemoveConfirmBody')
    )
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-share-title"
    >
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#2c313d] bg-[#1a1d26] p-4 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2c313d] pb-3">
          <h2 id="quiz-share-title" className="text-lg font-bold text-[#f2f0eb] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#9a9eab]" />
            {t('shareTitle')}
          </h2>
          <button
            onClick={onClose}
            aria-label={tCommon('close')}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[#9a9eab] hover:text-[#f2f0eb] transition-colors bg-transparent border-none cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-[#9a9eab] leading-relaxed">{t('shareHint')}</p>

        {loading ? (
          <p className="text-sm text-[#9a9eab] py-4">{tCommon('loading')}</p>
        ) : loadError ? (
          <p className="text-sm text-rose-300 py-4">{loadError}</p>
        ) : (
          <>
            {!canShare ? (
              <div className="rounded-xl border border-[#f0b429]/30 bg-[#f0b429]/10 p-3 space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-[#f0b429]">
                  <Lock className="h-4 w-4" />
                  {t('shareProOnly')}
                </p>
                <p className="text-xs text-[#c5c2ba] leading-relaxed">{t('shareProOnlyHint')}</p>
                <Link href="/pricing" className="inline-block text-xs text-[#e85d4c] underline underline-offset-2">
                  {t('shareUpgrade')}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-2">
                <label htmlFor="quiz-share-email" className="text-sm font-medium text-[#c5c2ba]">
                  {t('shareEmailLabel')}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="quiz-share-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (inviteError) setInviteError('')
                    }}
                    placeholder={t('shareEmailPlaceholder')}
                    disabled={inviting || full}
                    className="flex-1 bg-[#12141a] border-[#2c313d] text-[#f2f0eb] h-10 rounded-xl"
                  />
                  <Button
                    type="submit"
                    disabled={inviting || full || !email.trim()}
                    className="h-10 px-4 rounded-xl bg-[#e85d4c] hover:bg-[#d44e3e] text-white border-none font-semibold shrink-0"
                  >
                    {inviting ? t('shareInviting') : t('shareInvite')}
                  </Button>
                </div>
                {inviteError && <p className="text-xs text-rose-300">{inviteError}</p>}
                <p className="text-xs text-[#9a9eab]">
                  {unlimited
                    ? t('shareCountUnlimited', { count: collaborators.length })
                    : t('shareCount', { count: collaborators.length, limit })}
                </p>
              </form>
            )}

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#f2f0eb]">{t('shareListTitle')}</h3>
              {collaborators.length === 0 ? (
                <p className="text-xs text-[#9a9eab]">{t('shareListEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {collaborators.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-xl border border-[#2c313d] bg-[#12141a] px-3 py-2"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-[#9a9eab]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[#f2f0eb]">{c.email}</p>
                        <p className={`text-[11px] ${c.status === 'active' ? 'text-emerald-400' : 'text-[#9a9eab]'}`}>
                          {c.status === 'active' ? t('shareStatusActive') : t('shareStatusPending')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemove(c)}
                        disabled={removingId === c.id}
                        aria-label={t('shareRemove', { email: c.email })}
                        title={t('shareRemove', { email: c.email })}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#9a9eab] hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 transition-colors bg-transparent border-none cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Revoking still works on a lapsed plan: the owner must always be
                  able to take access away, even when they cannot grant it. */}
              {!canShare && collaborators.length > 0 && (
                <p className="text-xs text-[#9a9eab] leading-relaxed">{t('shareSuspendedHint')}</p>
              )}
            </div>

            <p className="text-xs text-amber-300/80 leading-relaxed">{t('shareAnswersWarning')}</p>
          </>
        )}
      </div>
    </div>
  )
}
