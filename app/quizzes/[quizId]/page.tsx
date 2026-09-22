'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'
import { GiphyPicker } from '@/components/giphy-picker'
import {
  getQuizById,
  getMyQuizzes,
  updateQuiz,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  addAnswerOption,
  updateAnswerOption,
  deleteAnswerOption,
  createGameSession,
  updateQuestionExplanation,
  updateQuizExplanationDuration,
  importQuestionsFromQuiz,
  updateQuizBranding,
  updateQuizSharing,
  duplicateQuiz,
} from '@/app/actions/quizzes'
import { ExplanationEditor } from '@/components/explanation-editor'
import { GameBackground } from '@/components/game-background'
import { useToast } from '@/components/ui/toast'
import { ArrowLeft, Plus, Trash2, ImagePlus, Check, X, FileQuestion, CopyPlus, Settings, SlidersHorizontal, Eye, Globe } from 'lucide-react'
import { QuizBrandingPanel } from '@/components/quiz-branding-panel'
import { parseQuizTheme, type BrandingPatch } from '@/lib/theme'
import { getMyLicense } from '@/app/actions/license'
import { BrandMark } from '@/components/brand-mark'
import { TourButton } from '@/components/tour-button'
import { quizEditorTour } from '@/lib/tours'

export default function QuizEditorPage() {
  const t = useTranslations('editor')
  const tCommon = useTranslations('common')
  const tTour = useTranslations('tours')
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const quizId = params.quizId as string

  const [quiz, setQuiz] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)

  // Import questions from another quiz
  const [importOpen, setImportOpen] = useState(false)
  const [otherQuizzes, setOtherQuizzes] = useState<{ id: string; title: string; questionCount: number }[]>([])
  const [importSourceId, setImportSourceId] = useState('')
  const [importSourceQs, setImportSourceQs] = useState<any[]>([])
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set())
  const [importLoading, setImportLoading] = useState(false)

  // Giphy Picker States
  const [giphyOpen, setGiphyOpen] = useState(false)
  const [giphyTarget, setGiphyTarget] = useState<{
    type: 'question' | 'option'
    questionId: string
    optionId?: string
  } | null>(null)
  const giphyTargetRef = useRef(giphyTarget)
  useEffect(() => {
    giphyTargetRef.current = giphyTarget
  }, [giphyTarget])

  // Quiz settings states
  const [quizSettingsOpen, setQuizSettingsOpen] = useState(false)
  // Null until the license is known: the branding slots render locked in the
  // meantime rather than flashing unlocked and then taking the controls away.
  const [brandingAllowed, setBrandingAllowed] = useState<boolean | null>(null)
  // Mobile slide-settings bottom sheet
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [pinAspect, setPinAspect] = useState<number | null>(null)
  const [sharingSaving, setSharingSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  // What this viewer may do, as the server reported it. The page mirrors the
  // answer; it never decides. Undefined means an API that predates sharing, and
  // getQuizById already resolves that to "allowed".
  //
  // canEdit and isOwner are independent again: a shared quiz its owner opened
  // for editing gives canEdit without isOwner, and that reader may change the
  // questions but never the sharing flags or the quiz itself.
  const canEdit = quiz?.canEdit !== false
  const isOwner = quiz?.isOwner !== false
  const canCopy = quiz?.canCopy !== false

  /**
   * Guard at the top of every mutating handler.
   *
   * The body is wrapped in a disabled fieldset when the quiz is read-only, so
   * this should be unreachable — which is exactly why it is here. A control
   * that escapes the fieldset (a div with onClick, a keyboard shortcut, a
   * future addition) would otherwise fire a write the API will reject with a
   * bare error instead of telling the reader why nothing happened.
   */
  const ensureEditable = () => {
    if (canEdit) return true
    toast.error(t('readOnlyTitle'), t('readOnlyDuplicateHint'))
    return false
  }

  useEffect(() => {
    const loadQuiz = async () => {
      try {
        const quizData = await getQuizById(quizId)
        setQuiz(quizData)
        setEditTitle(quizData.title)
        setEditDescription(quizData.description || '')
        if (quizData.questions && quizData.questions.length > 0) {
          setActiveQuestionId(quizData.questions[0].id)
        }
      } catch (error: any) {
        console.error('Error loading quiz:', error)
        toast.apiError(error?.message || error, (href) => router.push(href))
      } finally {
        setLoading(false)
      }
    }

    loadQuiz()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast context identity is unstable; effect must not re-run on toast changes
  }, [quizId, router])

  // Automatically select first question if none is active
  useEffect(() => {
    if (quiz && quiz.questions && quiz.questions.length > 0 && !activeQuestionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- select first question before paint, intentional
      setActiveQuestionId(quiz.questions[0].id)
    }
  }, [quiz, activeQuestionId])

  // The branding slots need to know the plan before they render. Fetched once
  // here rather than inside the panel so opening and closing the settings
  // modal does not re-ask on every open.
  useEffect(() => {
    let cancelled = false
    getMyLicense()
      .then((snapshot) => {
        if (cancelled) return
        // Enforcement off means every gate is open; treat it as allowed rather
        // than reading the plan, which is what the backend does too.
        const allowed =
          snapshot === null ||
          snapshot.enforcement === false ||
          !!snapshot.entitlements?.allow_custom_branding
        setBrandingAllowed(allowed)
      })
      .catch(() => {
        // A license lookup that fails must not lock a paying host out of their
        // own branding; the backend is the one that actually decides.
        if (!cancelled) setBrandingAllowed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the active slide visible in the sidebar when navigating many questions
  const slidesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!slidesRef.current || !activeQuestionId) return
    const activeEl = slidesRef.current.querySelector(`[data-slide-id="${activeQuestionId}"]`)
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeQuestionId])

  // Helper to parse content field which can be JSON string {"text": "...", "mediaUrl": "..."}
  const parseQuestionContent = (contentStr: string) => {
    try {
      const parsed = JSON.parse(contentStr)
      if (parsed && typeof parsed === 'object' && ('text' in parsed || 'mediaUrl' in parsed)) {
        return {
          text: parsed.text || '',
          mediaUrl: parsed.mediaUrl || '',
        }
      }
    } catch {}
    return {
      text: contentStr || '',
      mediaUrl: '',
    }
  }

  // Reset the measured image aspect ratio when the active question or its media changes,
  // so the pin-authoring preview re-measures the new image on load.
  const activeMediaUrlForAspect = (() => {
    const q = quiz?.questions?.find((qq: any) => qq.id === activeQuestionId)
    return q ? parseQuestionContent(q.questionText).mediaUrl : ''
  })()
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset measured aspect before paint, intentional
    setPinAspect(null)
  }, [activeQuestionId, activeMediaUrlForAspect])

  const handleAddQuestion = async () => {
    if (!ensureEditable()) return
    setSaving(true)
    try {
      const newQuestion = await addQuestion(quizId, 'New Question Text', 30)
      // Refetch full quiz to ensure local state matches server and avoids stale UI
      const updatedQuiz = await getQuizById(quizId)
      setQuiz(updatedQuiz)
      setActiveQuestionId(String(newQuestion.id))
    } catch (error) {
      console.error('Error adding question:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteQuestion = (qId: string) => {
    if (!ensureEditable()) return
    toast.confirm(
      t('deleteQuestion'),
      async () => {
        setSaving(true)
        try {
          await deleteQuestion(qId)
          const updatedQuestions = quiz.questions.filter((q: any) => q.id !== qId)
          setQuiz((prev: any) => ({
            ...prev,
            questions: updatedQuestions,
          }))
          if (activeQuestionId === qId) {
            setActiveQuestionId(updatedQuestions.length > 0 ? updatedQuestions[0].id : null)
          }
          setMobileSettingsOpen(false)
          toast.success(t('questionDeleted'))
        } catch (error) {
          console.error('Error deleting question:', error)
          toast.error(t('deleteQuestionError'), t('deleteFailed'))
        } finally {
          setSaving(false)
        }
      },
      t('confirmDeleteQuestionWarning')
    )
  }

  const handleSaveQuizSettings = async () => {
    if (!ensureEditable()) return
    if (!editTitle.trim()) {
      toast.error(t('error'), t('titleRequired'))
      return
    }
    setSaving(true)
    try {
      await updateQuiz(quizId, editTitle, editDescription)
      setQuiz((prev: any) => ({
        ...prev,
        title: editTitle,
        description: editDescription,
      }))
      setQuizSettingsOpen(false)
      toast.success(t('quizUpdated'))
    } catch (error) {
      console.error('Error updating quiz settings:', error)
      toast.error(t('error'), t('saveQuizFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleAddOption = async (questionId: string) => {
    if (!ensureEditable()) return
    setSaving(true)
    try {
      const newOption = await addAnswerOption(quizId, questionId, 'New Answer Choice', false)
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((q: any) =>
          q.id === questionId
            ? {
                ...q,
                options: [...(q.options || []), { ...newOption, mediaUrl: '' }],
              }
            : q
        ),
      }))
    } catch (error) {
      console.error('Error adding option:', error)
    } finally {
      setSaving(false)
    }
  }

  // Track in-flight save requests so launching a game can wait for them,
  // otherwise a blur-save racing createGameSession snapshots stale content.
  const pendingSavesRef = useRef<Set<Promise<unknown>>>(new Set())
  const trackSave = <T,>(p: Promise<T>): Promise<T> => {
    pendingSavesRef.current.add(p)
    p.catch(() => {}).finally(() => pendingSavesRef.current.delete(p))
    return p
  }

  const handleQuestionTextBlur = async (questionId: string, newText: string, timeLimit: number, type: string, correctAns: string) => {
    if (!ensureEditable()) return
    try {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      const mediaUrl = q ? parseQuestionContent(q.questionText).mediaUrl : ''
      const formattedContent = JSON.stringify({ text: newText, mediaUrl })

      await trackSave(updateQuestion(questionId, formattedContent, timeLimit, type, correctAns))
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((item: any) =>
          item.id === questionId
            ? { ...item, questionText: formattedContent, timeLimit, correct_answer: correctAns, type }
            : item
        ),
      }))
    } catch (error) {
      console.error('Error updating question text:', error)
    }
  }

  const handleQuestionTextUpdate = async (questionId: string, newContent: string, timeLimit: number, type: string, correctAns: string) => {
    if (!ensureEditable()) return
    try {
      await trackSave(updateQuestion(questionId, newContent, timeLimit, type, correctAns))
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((item: any) =>
          item.id === questionId
            ? { ...item, questionText: newContent, timeLimit, correct_answer: correctAns, type }
            : item
        ),
      }))
    } catch (error) {
      console.error('Error updating question content:', error)
    }
  }

  const handleQuestionTimeChange = async (questionId: string, contentStr: string, newTimeLimit: number, type: string, correctAns: string) => {
    if (!ensureEditable()) return
    try {
      await trackSave(updateQuestion(questionId, contentStr, newTimeLimit, type, correctAns))
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((q: any) =>
          q.id === questionId
            ? { ...q, timeLimit: newTimeLimit, correct_answer: correctAns, type }
            : q
        ),
      }))
    } catch (error) {
      console.error('Error updating question time limit:', error)
    }
  }

  const handleQuestionTypeChange = async (questionId: string, contentStr: string, timeLimit: number, newType: string) => {
    if (!ensureEditable()) return
    try {
      let correctAns = ''
      if (newType === 'true_false') correctAns = 'A'
      if (newType === 'short_answer') correctAns = 'Answer Text'
      if (newType === 'pin_answer') correctAns = '50,50'
      if (newType === 'poll') correctAns = 'POLL'

      await trackSave(updateQuestion(questionId, contentStr, timeLimit, newType, correctAns))

      // Reload details from API to keep fully in sync
      const updatedQuiz = await getQuizById(quizId)
      setQuiz(updatedQuiz)
    } catch (error) {
      console.error('Error updating question type:', error)
    }
  }

  const handleQuestionCorrectAnswerBlur = async (questionId: string, contentStr: string, timeLimit: number, type: string, correctAns: string) => {
    if (!ensureEditable()) return
    try {
      await trackSave(updateQuestion(questionId, contentStr, timeLimit, type, correctAns))
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((q: any) =>
          q.id === questionId ? { ...q, correct_answer: correctAns } : q
        ),
      }))
    } catch (error) {
      console.error('Error updating correct answer:', error)
    }
  }

  const handleOptionTextBlur = async (questionId: string, optionId: string, newText: string, isCorrect: boolean) => {
    if (!ensureEditable()) return
    try {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      const opt = q?.options.find((o: any) => o.id === optionId)
      const mediaUrl = opt ? opt.mediaUrl : ''

      await trackSave(updateAnswerOption(quizId, questionId, optionId, newText, isCorrect, mediaUrl))
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((item: any) => {
          if (item.id === questionId) {
            return {
              ...item,
              options: item.options.map((o: any) =>
                o.id === optionId ? { ...o, optionText: newText } : o
              ),
            }
          }
          return item
        }),
      }))
    } catch (error) {
      console.error('Error updating option text:', error)
    }
  }

  const handleUpdateOption = async (questionId: string, optionId: string, optionText: string, isCorrect: boolean, mediaUrl: string = '') => {
    if (!ensureEditable()) return
    try {
      await trackSave(updateAnswerOption(quizId, questionId, optionId, optionText, isCorrect, mediaUrl))
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((q: any) => {
          if (q.id === questionId) {
            return {
              ...q,
              options: q.options.map((o: any) => {
                if (String(o.id) === String(optionId)) {
                  return { ...o, optionText, isCorrect, mediaUrl }
                }
                if (isCorrect) {
                  return { ...o, isCorrect: false }
                }
                return o
              }),
              correct_answer: isCorrect ? optionId : q.correct_answer,
            }
          }
          return q
        }),
      }))
    } catch (error) {
      console.error('Error updating option:', error)
      // Reload from server so optimistic GIF preview can be reconciled
      try {
        const fresh = await getQuizById(quizId)
        setQuiz(fresh)
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  const handleDeleteOption = async (optionId: string, questionId: string) => {
    if (!ensureEditable()) return
    try {
      await deleteAnswerOption(quizId, questionId, optionId)
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((q: any) =>
          q.id === questionId
            ? {
                ...q,
                options: q.options.filter((o: any) => o.id !== optionId),
              }
            : q
        ),
      }))
    } catch (error) {
      console.error('Error deleting option:', error)
    }
  }

  const quizTheme = parseQuizTheme(quiz?.themeConfig)

  // Optimistic like the explanation duration above it: an upload has already
  // happened by the time this runs, and a slow PUT must not make the preview
  // snap back to the empty slot the host just filled.
  const handleBrandingChange = async (patch: BrandingPatch) => {
    if (!ensureEditable()) return
    setQuiz((prev: any) => {
      let config: Record<string, any> = {}
      try {
        config = JSON.parse(prev?.themeConfig || '{}') || {}
      } catch {}
      for (const [key, value] of Object.entries(patch)) {
        if (value === '') delete config[key]
        else config[key] = value
      }
      return { ...prev, themeConfig: JSON.stringify(config) }
    })
    try {
      await trackSave(updateQuizBranding(quizId, patch))
    } catch (error) {
      console.error('Error saving branding:', error)
      toast.apiError(error, (href) => router.push(href))
    }
  }

  const explanationDuration = (() => {
    try {
      const n = Number(JSON.parse(quiz?.themeConfig || '{}')?.explanation_duration)
      return Number.isFinite(n) && n > 0 ? n : 10
    } catch {
      return 10
    }
  })()

  const handleExplanationSave = async (questionId: string, json: string) => {
    if (!ensureEditable()) return
    // Optimistic: the editor already renders from its own copy, and a slow PUT
    // must not make the preview snap back to the previous slide.
    setQuiz((prev: any) => ({
      ...prev,
      questions: prev.questions.map((q: any) =>
        q.id === questionId ? { ...q, explanation: json } : q
      ),
    }))
    try {
      await trackSave(updateQuestionExplanation(quizId, questionId, json))
    } catch (error) {
      console.error('Error saving explanation:', error)
      toast.error(t('explanationSaveFailed'), t('saveFailed'))
    }
  }

  const handleExplanationDurationChange = async (seconds: number) => {
    if (!ensureEditable()) return
    setQuiz((prev: any) => {
      let config: Record<string, any> = {}
      try {
        config = JSON.parse(prev?.themeConfig || '{}') || {}
      } catch {}
      return { ...prev, themeConfig: JSON.stringify({ ...config, explanation_duration: seconds }) }
    })
    try {
      await trackSave(updateQuizExplanationDuration(quizId, seconds))
    } catch (error) {
      console.error('Error saving explanation duration:', error)
    }
  }

  /**
   * Publish / unpublish, and open or close editing of the original.
   *
   * Owner only, and the API enforces that independently: this endpoint is the
   * one place the flags can move, precisely so that edit rights on a shared
   * quiz can never reach them.
   */
  const handleSharingChange = async (nextPublic: boolean, nextAllowEdit: boolean) => {
    setSharingSaving(true)
    try {
      const saved = await updateQuizSharing(quizId, nextPublic, nextAllowEdit)
      // Take the server's answer rather than the requested one: unpublishing
      // clears edit rights there, and the toggle must show what actually holds.
      setQuiz((prev: any) =>
        prev ? { ...prev, isPublic: saved.isPublic, allowEdit: saved.allowEdit } : prev
      )
      toast.success(t('shareSaved'))
    } catch (error: any) {
      console.error('Error updating sharing:', error)
      toast.apiError(error?.message || error, (href) => router.push(href))
    } finally {
      setSharingSaving(false)
    }
  }

  /**
   * Take an independent copy into the reader's own quizzes and open it.
   *
   * This is the whole answer to "I want to change a shared quiz": the original
   * keeps exactly one writer, and the reader gets something they fully own.
   */
  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      const copy = await duplicateQuiz(quizId)
      toast.success(t('duplicated'), copy.title)
      router.push(`/quizzes/${copy.id}`)
    } catch (error: any) {
      console.error('Error duplicating quiz:', error)
      toast.apiError(error?.message || error, (href) => router.push(href))
    } finally {
      setDuplicating(false)
    }
  }

  const handleStartGame = async (mode: 'classic' | 'solo') => {
    setSaving(true)
    try {
      // Flush any focused field's blur-save, then wait for all in-flight saves
      // so the session snapshot includes the latest edits.
      ;(document.activeElement as HTMLElement | null)?.blur?.()
      await new Promise((r) => setTimeout(r, 0))
      while (pendingSavesRef.current.size > 0) {
        await Promise.allSettled([...pendingSavesRef.current])
      }
      // License/Pro gating deferred — Solo is open for all hosts for now.
      // See backend/internal/pkg/license/LICENSE_DEFERRED.md
      //
      // The mode goes to the room, not the quiz. It used to be written onto
      // the quiz here, one line before the room was created, which made
      // starting a game a write to the quiz: picking Solo changed what the
      // author's quiz was saved as for everyone, and on a quiz shared by
      // somebody else it failed with 403 and no game could start at all. The
      // API merges it into the room's own copy of theme_config, which is what
      // every gameplay step reads anyway.
      const session = await createGameSession(quizId, true, mode)
      router.push(`/host/${session.id}`)
    } catch (error: any) {
      console.error('Error starting game:', error)
      const msg = error?.message || 'Failed to start game'
      toast.apiError(msg, (href) => router.push(href))
    } finally {
      setSaving(false)
    }
  }

  const openImportPanel = async () => {
    setImportOpen(true)
    setImportLoading(true)
    try {
      const list = await getMyQuizzes()
      setOtherQuizzes(
        list.filter((q) => q.id !== quizId && (q.questionCount || 0) > 0)
      )
    } catch (e) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setImportLoading(false)
    }
  }

  const loadImportSource = async (sourceId: string) => {
    setImportSourceId(sourceId)
    setImportSourceQs([])
    setImportSelected(new Set())
    if (!sourceId) return
    setImportLoading(true)
    try {
      const src = await getQuizById(sourceId)
      const qs = src.questions || []
      setImportSourceQs(qs)
      setImportSelected(new Set(qs.map((q: any) => String(q.id))))
    } catch (e) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setImportLoading(false)
    }
  }

  const toggleImportQ = (id: string) => {
    setImportSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const confirmImport = async () => {
    if (!ensureEditable()) return
    if (!importSourceId || importSelected.size === 0) {
      toast.error(t('pickAtLeastOne'))
      return
    }
    setImportLoading(true)
    try {
      const res = await importQuestionsFromQuiz(
        quizId,
        importSourceId,
        Array.from(importSelected)
      )
      if (!res.success) {
        toast.error(res.error || t('importFailed'))
        return
      }
      const updated = await getQuizById(quizId)
      setQuiz(updated)
      setImportOpen(false)
      toast.success(t('imported', { n: res.imported }), t('importedTotal', { total: res.totalAfter }))
    } catch (e) {
      toast.apiError(e, (href) => router.push(href))
    } finally {
      setImportLoading(false)
    }
  }

  // Giphy triggers
  const triggerGiphy = (type: 'question' | 'option', questionId: string, optionId?: string) => {
    setGiphyTarget({ type, questionId, optionId })
    setGiphyOpen(true)
  }

  const handleGifSelect = async (url: string) => {
    if (!ensureEditable()) return
    const target = giphyTargetRef.current
    if (!target) return
    const { type, questionId, optionId } = target

    if (type === 'question') {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      if (q) {
        const parsed = parseQuestionContent(q.questionText)
        const newContent = JSON.stringify({ text: parsed.text, mediaUrl: url })
        // Optimistic preview
        setQuiz((prev: any) => ({
          ...prev,
          questions: prev.questions.map((item: any) =>
            item.id === questionId ? { ...item, questionText: newContent } : item
          ),
        }))
        await handleQuestionTextUpdate(questionId, newContent, q.timeLimit, q.type || 'multiple_choice', q.correct_answer)
      }
    } else if (type === 'option' && optionId) {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      if (q) {
        const opt = q.options.find((o: any) => String(o.id) === String(optionId))
        if (opt) {
          // Optimistic preview so GIF shows even if server action is slow
          setQuiz((prev: any) => ({
            ...prev,
            questions: prev.questions.map((item: any) => {
              if (item.id !== questionId) return item
              return {
                ...item,
                options: item.options.map((o: any) =>
                  String(o.id) === String(optionId) ? { ...o, mediaUrl: url } : o
                ),
              }
            }),
          }))
          await handleUpdateOption(questionId, optionId, opt.optionText || '', !!opt.isCorrect, url)
        }
      }
    }
  }

  const handleRemoveGif = async (type: 'question' | 'option', questionId: string, optionId?: string) => {
    if (!ensureEditable()) return
    if (type === 'question') {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      if (q) {
        const parsed = parseQuestionContent(q.questionText)
        const newContent = JSON.stringify({ text: parsed.text, mediaUrl: '' })
        setQuiz((prev: any) => ({
          ...prev,
          questions: prev.questions.map((item: any) =>
            item.id === questionId ? { ...item, questionText: newContent } : item
          ),
        }))
        await handleQuestionTextUpdate(questionId, newContent, q.timeLimit, q.type || 'multiple_choice', q.correct_answer)
      }
    } else if (type === 'option' && optionId) {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      if (q) {
        const opt = q.options.find((o: any) => String(o.id) === String(optionId))
        if (opt) {
          setQuiz((prev: any) => ({
            ...prev,
            questions: prev.questions.map((item: any) => {
              if (item.id !== questionId) return item
              return {
                ...item,
                options: item.options.map((o: any) =>
                  String(o.id) === String(optionId) ? { ...o, mediaUrl: '' } : o
                ),
              }
            }),
          }))
          await handleUpdateOption(questionId, optionId, opt.optionText || '', !!opt.isCorrect, '')
        }
      }
    }
  }

  // Pin Answer image click handler
  const handlePinImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeQuestion) return
    const rect = e.currentTarget.getBoundingClientRect()
    // Calculate percentage coords
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100)

    handleQuestionCorrectAnswerBlur(
      activeQuestion.id,
      activeQuestion.questionText,
      activeQuestion.timeLimit,
      activeType,
      `${x},${y}`
    )
  }

  if (loading) {
    return (
      <GameBackground variant="dashboard" showGrid={false}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center z-10 space-y-4">
            <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#2c313d] border-t-[#e85d4c] animate-spin" />
            <p className="text-sm text-[#9a9eab] font-medium">{t('loading')}</p>
          </div>
        </div>
      </GameBackground>
    )
  }

  if (!quiz) {
    return (
      <GameBackground variant="dashboard">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2c313d] bg-[#1a1d26]">
              <FileQuestion className="h-7 w-7 text-[#9a9eab]" />
            </div>
            <div className="space-y-1">
              <p className="text-[#f2f0eb] font-semibold text-lg">{t('notFound')}</p>
              <p className="text-sm text-[#9a9eab]">{t('notFoundBody')}</p>
            </div>
            <Link href="/dashboard">
              <Button className="bg-[#e85d4c] hover:bg-[#d44e3e] text-[#fff8f5] font-semibold rounded-xl">
                {t('backToDashboard')}
              </Button>
            </Link>
          </div>
        </div>
      </GameBackground>
    )
  }

  // Active question details
  const activeQuestion = quiz.questions?.find((q: any) => q.id === activeQuestionId)
  const activeParsedContent = activeQuestion ? parseQuestionContent(activeQuestion.questionText) : { text: '', mediaUrl: '' }
  const activeType = activeQuestion?.type || 'multiple_choice'

  const typeLabels: Record<string, string> = {
    multiple_choice: 'Quiz',
    true_false: 'T/F',
    short_answer: 'Short',
    pin_answer: 'Pin',
    poll: 'Poll',
  }

  const inputClass =
    'bg-[#12141a] border-[#2c313d] focus:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl'

  const slideSettingsContent = activeQuestion ? (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <span className="text-sm text-[#9a9eab] block">{t('testKnowledge')}</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'multiple_choice', name: 'Quiz' },
              { id: 'true_false', name: 'True/False' },
              { id: 'short_answer', name: 'Type answer' },
              { id: 'pin_answer', name: 'Pin answer' },
            ].map(typeItem => (
              <button
                key={typeItem.id}
                onClick={() => handleQuestionTypeChange(activeQuestion.id, activeQuestion.questionText, activeQuestion.timeLimit, typeItem.id)}
                className={`flex items-center justify-center p-3 min-h-11 rounded-xl border text-center transition-all cursor-pointer text-xs font-medium ${
                  activeType === typeItem.id
                    ? 'border-[#e85d4c] bg-[#e85d4c]/10 text-[#e85d4c]'
                    : 'bg-[#12141a] border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] hover:border-[#3d4454]'
                }`}
              >
                {typeItem.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-sm text-[#9a9eab] block">{t('collectOpinions')}</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'poll', name: 'Poll' },
            ].map(typeItem => (
              <button
                key={typeItem.id}
                onClick={() => handleQuestionTypeChange(activeQuestion.id, activeQuestion.questionText, activeQuestion.timeLimit, typeItem.id)}
                className={`flex items-center justify-center p-3 min-h-11 rounded-xl border text-center transition-all cursor-pointer text-xs font-medium ${
                  activeType === typeItem.id
                    ? 'border-[#e85d4c] bg-[#e85d4c]/10 text-[#e85d4c]'
                    : 'bg-[#12141a] border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb] hover:border-[#3d4454]'
                }`}
              >
                {typeItem.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t border-[#2c313d]">
        <label className="text-sm text-[#9a9eab]">{t('timeLimit')}</label>
        <select
          value={activeQuestion.timeLimit}
          onChange={(e) =>
            handleQuestionTimeChange(
              activeQuestion.id,
              activeQuestion.questionText,
              Number(e.target.value),
              activeType,
              activeQuestion.correct_answer
            )
          }
          className={`w-full ${inputClass} px-4 py-3 text-base sm:text-sm font-medium cursor-pointer`}
        >
          {[10, 20, 30, 45, 60, 90, 120].map((t) => (
            <option key={t} value={t} className="bg-[#12141a] text-[#f2f0eb]">
              {t} seconds
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-[#9a9eab]">{t('scoreReward')}</label>
        <div className="bg-[#12141a] border border-[#2c313d] rounded-xl px-4 py-3 text-sm font-medium text-[#2dd4bf] flex items-center justify-between">
          <span className="text-[#c5c2ba]">{t('standardPoints')}</span>
          <span>{activeQuestion.points || 1000} pts</span>
        </div>
      </div>

      <div className="pt-6 border-t border-[#2c313d]">
        <ExplanationEditor
          key={activeQuestion.id}
          value={activeQuestion.explanation || ''}
          onSave={(json) => handleExplanationSave(activeQuestion.id, json)}
          duration={explanationDuration}
          onDurationChange={handleExplanationDurationChange}
        />
      </div>

      <div className="pt-6 border-t border-[#2c313d]">
        <Button
          onClick={() => handleDeleteQuestion(activeQuestion.id)}
          variant="outline"
          className="w-full border-[#2c313d] bg-transparent hover:bg-[#e85d4c]/10 hover:border-[#e85d4c]/40 text-[#e85d4c] font-semibold py-3 rounded-xl cursor-pointer gap-2"
        >
          <Trash2 className="h-4 w-4" />
          {t('deleteSlide')}
        </Button>
      </div>
    </div>
  ) : (
    <p className="text-sm text-[#9a9eab]">{t('selectSlideHint')}</p>
  )

  return (
    <GameBackground variant="dashboard">
      <div className="flex-1 flex flex-col relative">

      <header className="border-b border-[#2c313d] bg-[#1a1d26]/90 backdrop-blur-xl sticky top-0 z-50" data-tour="quiz-editor-header">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex flex-wrap gap-y-3 items-center justify-between gap-4 max-w-7xl">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 sm:flex-initial">
            <Link href="/dashboard" className="shrink-0">
              <Button
                variant="ghost"
                className="text-[#c5c2ba] hover:text-[#f2f0eb] hover:bg-[#12141a] rounded-xl gap-2 h-10 px-2.5 sm:px-3"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{t('back')}</span>
              </Button>
            </Link>
            <div className="h-6 w-px bg-[#2c313d] hidden sm:block" />
            <div className="flex items-center gap-3 min-w-0">
              <span className="hidden sm:block">
                <BrandMark size="sm" href="/dashboard" />
              </span>
              <h1 className="text-sm sm:text-base font-semibold text-[#f2f0eb] truncate">
                {quiz.title}
              </h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditTitle(quiz.title)
                setEditDescription(quiz.description || '')
                setQuizSettingsOpen(true)
              }}
              title={t('quizConfig')}
              className="h-8 w-8 text-[#9a9eab] hover:text-[#f2f0eb] hover:bg-[#12141a] rounded-lg shrink-0 cursor-pointer"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0 w-full sm:w-auto" data-tour="launch-mode">
            <div className="w-full sm:w-auto grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button
                onClick={openImportPanel}
                disabled={saving || !canEdit}
                variant="outline"
                title={t('importFromYours')}
                className="border-[#2c313d] bg-transparent text-[#f2f0eb] hover:bg-[#12141a] font-semibold px-4 rounded-xl h-10 text-sm gap-1.5"
              >
                <CopyPlus className="w-4 h-4" />
                {t('addFromQuiz')}
              </Button>
              <Button
                onClick={() => handleStartGame('classic')}
                disabled={saving || quiz.questions?.length === 0}
                title={t('classicHint')}
                className="bg-[#e85d4c] hover:bg-[#d44e3e] disabled:opacity-40 text-[#fff8f5] font-semibold px-5 rounded-xl h-10 text-sm border-none"
              >
                {saving ? 'Launching...' : 'Classic'}
              </Button>
              <Button
                onClick={() => handleStartGame('solo')}
                disabled={saving || quiz.questions?.length === 0}
                variant="outline"
                title={t('soloHint')}
                className="border-[#2c313d] bg-transparent text-[#f2f0eb] hover:bg-[#12141a] hover:text-[#f2f0eb] disabled:opacity-40 font-semibold px-5 rounded-xl h-10 text-sm"
              >
                {saving ? 'Launching...' : 'Solo'}
              </Button>
            </div>
            <p className="text-xs text-[#9a9eab] hidden sm:block">
              {t('paceHint')}
            </p>
          </div>
        </div>
      </header>

      {canEdit && !isOwner && (
        <div className="border-b border-sky-500/20 bg-sky-500/10 px-4 sm:px-6 py-3">
          <div className="container mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between text-sm text-sky-200">
            <span className="flex items-start sm:items-center gap-2.5">
              <Globe className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
              <span>{t('sharedEditableBanner')}</span>
            </span>
            {/* Offered here too: editing the shared original is allowed, but
                somebody who only wants their own version should not have to go
                back to the dashboard to get one. */}
            {canCopy && (
              <Button
                size="sm"
                onClick={handleDuplicate}
                disabled={duplicating}
                className="shrink-0 bg-sky-500/20 hover:bg-sky-500/30 text-sky-100 border border-sky-500/30 font-bold text-xs rounded-xl h-10 sm:h-9 flex items-center gap-1.5"
              >
                <CopyPlus className="w-3.5 h-3.5" />
                {duplicating ? t('duplicating') : t('duplicateToMine')}
              </Button>
            )}
          </div>
        </div>
      )}
      {!canEdit && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 sm:px-6 py-3">
          <div className="container mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between text-sm text-amber-200">
            <span className="flex items-start sm:items-center gap-2.5">
              <Eye className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
              <span>{t('readOnlyBanner')} {t('readOnlyDuplicateHint')}</span>
            </span>
            {canCopy && (
              <Button
                size="sm"
                onClick={handleDuplicate}
                disabled={duplicating}
                className="shrink-0 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 border border-amber-500/30 font-bold text-xs rounded-xl h-10 sm:h-9 flex items-center gap-1.5"
              >
                <CopyPlus className="w-3.5 h-3.5" />
                {duplicating ? t('duplicating') : t('duplicateToMine')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* A disabled fieldset turns off every form control inside it in one
          place, which is the point: the editor has dozens, and any one of them
          missed would be an input that looks live on a quiz the reader may not
          change. `contents` keeps the flex layout it wraps. */}
      <fieldset disabled={!canEdit} className="contents">
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:h-[calc(100dvh-73px)] overflow-visible lg:overflow-hidden font-sans">
        <aside className="w-full lg:w-64 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-[#2c313d] bg-[#1a1d26] flex flex-col h-auto lg:h-full select-none shrink-0" data-tour="question-slides">
          <div className="px-4 py-2 lg:p-4 border-b border-[#2c313d] flex items-center justify-between shrink-0">
            <h3 className="text-sm text-[#9a9eab] font-medium">{t('questions')}</h3>
            <span className="text-xs font-medium bg-[#12141a] text-[#c5c2ba] px-2 py-0.5 rounded-lg border border-[#2c313d]">
              {quiz.questions?.length || 0}
            </span>
          </div>

          <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto p-3 lg:p-4 lg:flex-1" ref={slidesRef}>
            {quiz.questions?.map((q: any, idx: number) => {
              const isActive = q.id === activeQuestionId
              const parsed = parseQuestionContent(q.questionText)
              const typeLabel = typeLabels[q.type || 'multiple_choice'] || 'Quiz'

              return (
                <div
                  key={`slide-${q.id || idx}-${idx}`}
                  data-slide-id={q.id}
                  onClick={() => setActiveQuestionId(q.id)}
                  className={`group relative flex items-center gap-2 lg:gap-3 p-2.5 rounded-xl border transition-all duration-200 cursor-pointer w-44 shrink-0 lg:w-auto lg:shrink ${
                    isActive
                      ? 'bg-[#e85d4c]/10 border-[#e85d4c]'
                      : 'bg-[#12141a] border-[#2c313d] hover:border-[#3d4454]'
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold shrink-0 ${
                      isActive
                        ? 'bg-[#e85d4c] text-white'
                        : 'bg-[#1a1d26] text-[#9a9eab] border border-[#2c313d]'
                    }`}
                  >
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#c5c2ba] font-medium truncate">
                      {parsed.text || 'No question text'}
                    </p>
                    <p className="text-[10px] text-[#9a9eab] mt-0.5">{typeLabel}</p>
                  </div>

                  {parsed.mediaUrl && (
                    <div className="hidden lg:block w-10 h-7 rounded-lg border border-[#2c313d] bg-[#12141a] overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={parsed.mediaUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteQuestion(q.id)
                    }}
                    className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 text-[#9a9eab] hover:text-[#e85d4c] transition-opacity bg-transparent border-none cursor-pointer p-2 shrink-0"
                    aria-label={t('deleteSlide')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}

            <button
              onClick={handleAddQuestion}
              disabled={saving}
              className="lg:hidden flex items-center justify-center gap-1.5 w-24 shrink-0 rounded-xl border border-dashed border-[#2c313d] bg-[#12141a] text-[#9a9eab] hover:text-[#f2f0eb] text-xs font-semibold cursor-pointer disabled:opacity-40 min-h-14"
              aria-label={t('addSlide')}
            >
              <Plus className="h-4 w-4" />
              {t('add')}
            </button>
          </div>

          <div className="hidden lg:block p-4 border-t border-[#2c313d] shrink-0">
            <Button
              onClick={handleAddQuestion}
              disabled={saving}
              variant="outline"
              className="w-full border-[#2c313d] bg-[#12141a] hover:bg-[#12141a]/80 text-[#f2f0eb] font-semibold py-3 rounded-xl cursor-pointer gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('addSlide')}
            </Button>
          </div>
        </aside>

        <section className="flex-1 bg-[#12141a] p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8 overflow-y-auto flex flex-col space-y-6 h-auto lg:h-full" data-tour="question-editor">
          {!activeQuestion ? (
            <div className="h-full flex flex-col items-center justify-center space-y-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2c313d] bg-[#1a1d26]">
                <FileQuestion className="h-8 w-8 text-[#9a9eab]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-[#f2f0eb]">{t('noSlide')}</h2>
                <p className="text-sm text-[#9a9eab] max-w-sm leading-relaxed">
                  {t('noSlideBody')}
                </p>
              </div>
              <Button
                onClick={handleAddQuestion}
                disabled={saving}
                className="bg-[#e85d4c] hover:bg-[#d44e3e] text-[#fff8f5] font-semibold rounded-xl px-6 gap-2"
              >
                <Plus className="h-4 w-4" />
                {saving ? t('adding') : t('addFirstSlide')}
              </Button>
            </div>
          ) : (
            <div className="space-y-8 max-w-4xl mx-auto w-full">
              <div className="space-y-2">
                <label className="text-sm text-[#9a9eab]">Question</label>
                <textarea
                  key={`text-${activeQuestion.id}`}
                  defaultValue={activeParsedContent.text}
                  placeholder={t('questionPlaceholder')}
                  rows={2}
                  className={`w-full ${inputClass} px-3 sm:px-6 py-3 sm:py-5 text-base sm:text-xl md:text-2xl font-semibold resize-none transition-all text-center`}
                  onBlur={(e) =>
                    handleQuestionTextBlur(
                      activeQuestion.id,
                      e.target.value,
                      activeQuestion.timeLimit,
                      activeType,
                      activeQuestion.correct_answer
                    )
                  }
                />
              </div>

              <div
                onClick={activeType === 'pin_answer' && activeParsedContent.mediaUrl ? handlePinImageClick : undefined}
                className={`w-full mx-auto rounded-2xl border border-dashed border-[#2c313d] bg-[#1a1d26] flex flex-col items-center justify-center relative overflow-hidden group ${
                  activeType === 'pin_answer' ? 'max-w-2xl' : 'aspect-video md:h-80 md:w-auto'
                } ${activeType === 'pin_answer' && activeParsedContent.mediaUrl ? 'cursor-crosshair' : ''}`}
                style={activeType === 'pin_answer' ? { aspectRatio: pinAspect ?? 16 / 9 } : undefined}
              >
                {activeParsedContent.mediaUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeParsedContent.mediaUrl}
                      alt={t('questionGraphic')}
                      className="w-full h-full object-contain pointer-events-none"
                      onLoad={(e) => {
                        const im = e.currentTarget
                        if (im.naturalWidth && im.naturalHeight) setPinAspect(im.naturalWidth / im.naturalHeight)
                      }}
                    />

                    {activeType === 'pin_answer' && (() => {
                      const coords = activeQuestion.correct_answer ? activeQuestion.correct_answer.split(',') : ['50', '50']
                      const x = coords[0] || '50'
                      const y = coords[1] || '50'
                      return (
                        <div
                          className="absolute w-8 h-8 rounded-full bg-[#e85d4c]/30 border-2 border-[#e85d4c] shadow-[0_0_12px_rgba(232,93,76,0.4)]"
                          style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                        />
                      )
                    })()}

                    <div className="absolute top-4 right-4 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          triggerGiphy('question', activeQuestion.id)
                        }}
                        className="bg-[#1a1d26]/90 hover:bg-[#1a1d26] border border-[#2c313d] cursor-pointer h-9 px-3 rounded-xl text-xs font-medium text-[#f2f0eb] gap-1.5"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        {t('change')}
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveGif('question', activeQuestion.id)
                        }}
                        className="bg-[#1a1d26]/90 hover:bg-[#e85d4c]/20 border border-[#2c313d] hover:border-[#e85d4c]/40 cursor-pointer h-9 px-3 rounded-xl text-xs font-medium text-[#e85d4c] gap-1.5"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t('remove')}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-4 p-8">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2c313d] bg-[#12141a]">
                      <ImagePlus className="h-7 w-7 text-[#9a9eab]" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#f2f0eb]">{t('addMedia')}</p>
                      <p className="text-xs text-[#9a9eab]">{t('insertGif')}</p>
                    </div>
                    <Button
                      onClick={() => triggerGiphy('question', activeQuestion.id)}
                      className="bg-[#e85d4c] hover:bg-[#d44e3e] text-[#fff8f5] font-semibold rounded-xl px-5 h-10 border-none cursor-pointer gap-2"
                    >
                      <ImagePlus className="h-4 w-4" />
                      {t('findGif')}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-6" data-tour="answer-options">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm text-[#9a9eab] font-medium">{t('answers')}</h4>
                  {(activeType === 'multiple_choice' || activeType === 'poll') && (
                    <Button
                      onClick={() => handleAddOption(activeQuestion.id)}
                      disabled={saving || (activeQuestion.options?.length || 0) >= 4}
                      size="sm"
                      variant="outline"
                      className="border-[#2c313d] text-[#c5c2ba] hover:bg-[#12141a] hover:text-[#f2f0eb] rounded-xl text-xs font-medium h-9 gap-1.5 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('addChoice')}
                    </Button>
                  )}
                </div>

                {activeType === 'short_answer' && (
                  <div className="space-y-3 bg-[#1a1d26] border border-[#2c313d] rounded-2xl p-6">
                    <label className="text-sm font-semibold text-[#f2f0eb]">
                      {t('correctAnswerCI')}
                    </label>
                    <Input
                      type="text"
                      key={`correct-${activeQuestion.id}`}
                      defaultValue={activeQuestion.correct_answer}
                      placeholder={t('answerExample')}
                      className={`w-full ${inputClass} h-12`}
                      onBlur={(e) =>
                        handleQuestionCorrectAnswerBlur(
                          activeQuestion.id,
                          activeQuestion.questionText,
                          activeQuestion.timeLimit,
                          activeType,
                          e.target.value
                        )
                      }
                    />
                    <p className="text-xs text-[#9a9eab] leading-normal">
                      {t('typeAnswerHint')}
                    </p>
                  </div>
                )}

                {activeType === 'pin_answer' && (
                  <div className="bg-[#1a1d26] border border-[#2c313d] rounded-2xl p-6 text-center space-y-3">
                    <h5 className="text-sm font-semibold text-[#f2f0eb]">{t('configureHotspot')}</h5>
                    <p className="text-xs text-[#9a9eab] max-w-md mx-auto leading-normal">
                      {t('hotspotHint')}
                    </p>
                    <div className="inline-flex bg-[#12141a] border border-[#2c313d] px-3 py-1.5 rounded-xl text-xs font-medium text-[#c5c2ba]">
                      Target: {activeQuestion.correct_answer || '50,50'} (X, Y%)
                    </div>
                  </div>
                )}

                {(activeType === 'multiple_choice' || activeType === 'poll' || activeType === 'true_false') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(activeQuestion.options || []).map((option: any, oIndex: number) => {
                      const badgeColors = [
                        'bg-[#e85d4c]/15 border-[#e85d4c]/30 text-[#e85d4c]',
                        'bg-blue-500/15 border-blue-500/30 text-blue-400',
                        'bg-[#2dd4bf]/15 border-[#2dd4bf]/30 text-[#2dd4bf]',
                        'bg-amber-400/15 border-amber-400/30 text-amber-400',
                      ]
                      const badgeColor = badgeColors[oIndex % badgeColors.length]
                      const isCorrect = option.isCorrect

                      return (
                        <div
                          key={`opt-${activeQuestion.id}-${option.id}`}
                          className={`relative p-3 sm:p-5 rounded-xl border transition-all duration-200 flex flex-col gap-4 bg-[#1a1d26] ${
                            isCorrect && (activeType === 'multiple_choice' || activeType === 'true_false')
                              ? 'border-[#2dd4bf]/50 ring-1 ring-[#2dd4bf]/20 bg-[#2dd4bf]/5'
                              : 'border-[#2c313d]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`border w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0 ${badgeColor}`}>
                              {String.fromCharCode(65 + oIndex)}
                            </div>
                            <input
                              key={`opt-input-${activeQuestion.id}-${option.id}`}
                              type="text"
                              defaultValue={option.optionText}
                              placeholder={`Answer choice ${oIndex + 1}...`}
                              className="flex-1 min-w-0 bg-transparent border-none text-[#f2f0eb] text-base font-medium placeholder:text-[#5c6170] focus:outline-none"
                              onBlur={(e) =>
                                handleOptionTextBlur(
                                  activeQuestion.id,
                                  option.id,
                                  e.target.value,
                                  option.isCorrect
                                )
                              }
                            />
                            {activeQuestion.options.length > 2 && (
                              <button
                                onClick={() => handleDeleteOption(option.id, activeQuestion.id)}
                                className="text-[#9a9eab] hover:text-[#e85d4c] transition-colors bg-transparent border-none cursor-pointer p-2"
                                aria-label={t('deleteOption')}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-[#2c313d] gap-3">
                            <div className="flex items-center gap-3">
                              {option.mediaUrl ? (
                                <div className="relative w-16 h-10 rounded-lg overflow-hidden border border-[#2c313d] group/gif bg-[#12141a]">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={option.mediaUrl} alt={t('optionGif')} className="w-full h-full object-cover" />
                                  <button
                                    onClick={() => handleRemoveGif('option', activeQuestion.id, option.id)}
                                    className="absolute inset-0 bg-[#12141a]/90 flex items-center justify-center text-[#e85d4c] text-[10px] font-medium opacity-100 md:opacity-0 md:group-hover/gif:opacity-100 transition-opacity border-none cursor-pointer gap-1"
                                  >
                                    <X className="h-3 w-3" />
                                    {t('remove')}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => triggerGiphy('option', activeQuestion.id, option.id)}
                                  className="min-h-10 text-xs font-medium text-[#c5c2ba] bg-[#12141a] hover:bg-[#12141a]/80 px-3 py-1.5 rounded-xl border border-[#2c313d] cursor-pointer flex items-center gap-1.5"
                                >
                                  <ImagePlus className="h-3.5 w-3.5" />
                                  {t('addGif')}
                                </button>
                              )}
                            </div>

                            {(activeType === 'multiple_choice' || activeType === 'true_false') && (
                              <button
                                onClick={() =>
                                  handleUpdateOption(
                                    activeQuestion.id,
                                    option.id,
                                    option.optionText,
                                    !isCorrect,
                                    option.mediaUrl
                                  )
                                }
                                className={`px-3 py-2.5 sm:py-1.5 rounded-xl text-xs font-medium transition-all border cursor-pointer flex items-center gap-1.5 ${
                                  isCorrect
                                    ? 'bg-[#2dd4bf]/15 border-[#2dd4bf]/40 text-[#2dd4bf]'
                                    : 'bg-[#12141a] border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb]'
                                }`}
                              >
                                {isCorrect && <Check className="h-3.5 w-3.5" />}
                                {isCorrect ? t('correct') : t('markCorrect')}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Fixed at 18rem it stayed 288px wide on a 2560px screen, which is
            where the slide preview inside it became unreadable. It grows with
            the window now; the canvas still gets everything left over. */}
        <aside className="hidden lg:block w-72 xl:w-80 2xl:w-96 shrink-0 border-l border-[#2c313d] bg-[#1a1d26] p-6 space-y-6 overflow-y-auto select-none h-full">
          <h3 className="text-sm text-[#9a9eab] font-medium">{t('slideSettings')}</h3>
          {slideSettingsContent}
        </aside>
      </div>
      </fieldset>

      {activeQuestion && (
        <button
          type="button"
          onClick={() => setMobileSettingsOpen(true)}
          className="lg:hidden fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-50 flex items-center gap-2 rounded-full bg-[#1a1d26] border border-[#2c313d] text-[#f2f0eb] shadow-lg px-4 py-3 text-sm font-semibold cursor-pointer"
          aria-label={t('slideSettings')}
        >
          <SlidersHorizontal className="w-5 h-5" />
          {t('settings')}
        </button>
      )}

      {mobileSettingsOpen && (
        <div className="lg:hidden fixed inset-0 z-[70]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSettingsOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-2xl border-t border-[#2c313d] bg-[#1a1d26] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm text-[#9a9eab] font-medium">Slide settings</h3>
              <button
                type="button"
                onClick={() => setMobileSettingsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#9a9eab] hover:text-[#f2f0eb] cursor-pointer -mr-2"
                aria-label={t('closeSettings')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {slideSettingsContent}
          </div>
        </div>
      )}

      {importOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2c313d] bg-[#1a1d26] p-6 space-y-4 shadow-2xl max-h-[85dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#f2f0eb]">{t('importTitle')}</h2>
                <p className="text-xs text-[#9a9eab] mt-1">
                  {t('importBody')}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setImportOpen(false)}
                className="h-10 w-10 p-0 text-[#9a9eab] hover:text-[#f2f0eb]"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <select
              value={importSourceId}
              onChange={(e) => loadImportSource(e.target.value)}
              disabled={importLoading}
              className="w-full h-11 rounded-xl bg-[#12141a] border border-[#2c313d] text-[#f2f0eb] text-base sm:text-sm px-3"
            >
              <option value="">{t('importPick')}</option>
              {otherQuizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.questionCount} câu)
                </option>
              ))}
            </select>

            {!importLoading && otherQuizzes.length === 0 && (
              <p className="text-sm text-[#9a9eab]">{t('importEmpty')}</p>
            )}

            {importSourceQs.length > 0 && (
              <div className="space-y-2 max-h-[40dvh] sm:max-h-56 overflow-y-auto">
                {importSourceQs.map((q: any) => {
                  const id = String(q.id)
                  const checked = importSelected.has(id)
                  return (
                    <label
                      key={id}
                      className={`flex gap-3 items-start rounded-xl border px-3 py-2 cursor-pointer ${
                        checked
                          ? 'border-[#e85d4c]/40 bg-[#e85d4c]/5'
                          : 'border-[#2c313d] bg-[#12141a]/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleImportQ(id)}
                        className="mt-1 h-5 w-5 shrink-0 accent-[#e85d4c]"
                      />
                      <span className="text-sm text-[#f2f0eb] line-clamp-2">
                        {q.questionText || '—'}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setImportOpen(false)}
                className="flex-1 h-10 rounded-xl border-[#2c313d]"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                disabled={importLoading || importSelected.size === 0}
                onClick={confirmImport}
                className="flex-1 h-10 rounded-xl bg-[#e85d4c] hover:bg-[#d44e3e] text-white border-none font-semibold"
              >
                {importLoading ? t('importing') : t('importAddCount', { count: importSelected.size })}
              </Button>
            </div>
          </div>
        </div>
      )}

      {quizSettingsOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-[#2c313d] bg-[#1a1d26] p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2c313d] pb-3">
              <h2 className="text-lg font-bold text-[#f2f0eb]">{t('quizConfig')}</h2>
              <button
                onClick={() => setQuizSettingsOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#9a9eab] hover:text-[#f2f0eb] transition-colors bg-transparent border-none cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#c5c2ba]">{t('quizName')}</label>
                <Input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder={t('quizNamePlaceholder')}
                  className={`w-full ${inputClass} h-10`}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-[#c5c2ba]">{t('quizDescription')}</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={t('quizDescPlaceholder')}
                  rows={4}
                  className={`w-full bg-[#12141a] border border-[#2c313d] focus:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl p-3 focus:outline-none text-sm resize-none`}
                />
              </div>

              {isOwner && (
                <div className="border-t border-[#2c313d] pt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-[#9a9eab]" />
                    <h3 className="text-sm font-semibold text-[#f2f0eb]">{t('shareTitle')}</h3>
                  </div>
                  <p className="text-xs text-[#9a9eab] leading-relaxed">{t('shareHint')}</p>

                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!quiz.isPublic}
                      disabled={sharingSaving}
                      onChange={(e) => handleSharingChange(e.target.checked, !!quiz.allowEdit)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#e85d4c] cursor-pointer"
                    />
                    <span className="text-sm text-[#c5c2ba]">{t('sharePublic')}</span>
                  </label>

                  {quiz.isPublic && (
                    <>
                      <div className="pl-7 space-y-1.5">
                        <p className="text-xs text-amber-300/80 leading-relaxed">
                          {t('shareAnswersWarning')}
                        </p>
                        {/* Said plainly because it is the one part of sharing
                            that cannot be undone: unsharing stops new copies,
                            it does not reach the ones already taken. */}
                        <p className="text-xs text-amber-300/80 leading-relaxed">
                          {t('shareCopyWarning')}
                        </p>
                      </div>

                      <label className="flex items-start gap-3 cursor-pointer pl-7">
                        <input
                          type="checkbox"
                          checked={!!quiz.allowEdit}
                          disabled={sharingSaving}
                          onChange={(e) => handleSharingChange(true, e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#e85d4c] cursor-pointer"
                        />
                        <span className="text-sm text-[#c5c2ba]">{t('shareAllowEdit')}</span>
                      </label>
                      {quiz.allowEdit && (
                        <p className="text-xs text-amber-300/80 leading-relaxed pl-14">
                          {t('shareAllowEditWarning')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="border-t border-[#2c313d] pt-4">
                <QuizBrandingPanel
                  theme={quizTheme}
                  onChange={handleBrandingChange}
                  allowed={brandingAllowed === true}
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setQuizSettingsOpen(false)}
                className="h-11 w-full sm:h-10 sm:w-auto border-[#2c313d] bg-transparent text-[#f2f0eb] hover:bg-[#12141a] px-4 rounded-xl"
              >
                {tCommon('cancel')}
              </Button>
              <Button
                onClick={handleSaveQuizSettings}
                disabled={saving || !canEdit}
                className="h-11 w-full sm:h-10 sm:w-auto bg-[#e85d4c] hover:bg-[#d44e3e] text-white px-5 rounded-xl border-none"
              >
                {saving ? t('saving') : t('saveSettings')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <GiphyPicker
        isOpen={giphyOpen}
        onClose={() => {
          setGiphyOpen(false)
          setGiphyTarget(null)
        }}
        onSelect={handleGifSelect}
      />
      </div>
      <TourButton tour={quizEditorTour(tTour)} label={t('guide')} position="bottom-right" />
    </GameBackground>
  )
}
