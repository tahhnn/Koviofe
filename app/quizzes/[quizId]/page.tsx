'use client'

import { useEffect, useRef, useState } from 'react'
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
  updateQuizThemeConfig,
  importQuestionsFromQuiz,
} from '@/app/actions/quizzes'
import { GameBackground } from '@/components/game-background'
import { useToast } from '@/components/ui/toast'
import { ArrowLeft, Plus, Trash2, ImagePlus, Check, X, FileQuestion, CopyPlus } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { TourButton } from '@/components/tour-button'
import { quizEditorTour } from '@/lib/tours'

export default function QuizEditorPage() {
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

  useEffect(() => {
    const loadQuiz = async () => {
      try {
        const quizData = await getQuizById(quizId)
        setQuiz(quizData)
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
  }, [quizId, router])

  // Automatically select first question if none is active
  useEffect(() => {
    if (quiz && quiz.questions && quiz.questions.length > 0 && !activeQuestionId) {
      setActiveQuestionId(quiz.questions[0].id)
    }
  }, [quiz, activeQuestionId])

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

  const handleAddQuestion = async () => {
    setSaving(true)
    try {
      const newQuestion = await addQuestion(quizId, 'New Question Text', 30)
      console.log('[handleAddQuestion] newQuestion:', newQuestion)
      // Refetch full quiz to ensure local state matches server and avoids stale UI
      const updatedQuiz = await getQuizById(quizId)
      console.log('[handleAddQuestion] refetched quiz questions:', updatedQuiz.questions.map((q: any) => ({ id: q.id, text: q.questionText?.slice(0, 30), opts: q.options?.length })))
      setQuiz(updatedQuiz)
      setActiveQuestionId(String(newQuestion.id))
    } catch (error) {
      console.error('Error adding question:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteQuestion = (qId: string) => {
    toast.confirm(
      'Xóa câu hỏi',
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
          toast.success('Đã xóa câu hỏi thành công!')
        } catch (error) {
          console.error('Error deleting question:', error)
          toast.error('Lỗi khi xóa câu hỏi', 'Không thể hoàn tất thao tác xóa.')
        } finally {
          setSaving(false)
        }
      },
      'Hành động này không thể khôi phục. Bạn có chắc chắn muốn xóa câu hỏi này không?'
    )
  }

  const handleAddOption = async (questionId: string) => {
    setSaving(true)
    try {
      const newOption = await addAnswerOption(questionId, 'New Answer Choice', false)
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

  const handleQuestionTextBlur = async (questionId: string, newText: string, timeLimit: number, type: string, correctAns: string) => {
    try {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      const mediaUrl = q ? parseQuestionContent(q.questionText).mediaUrl : ''
      const formattedContent = JSON.stringify({ text: newText, mediaUrl })

      await updateQuestion(questionId, formattedContent, timeLimit, type, correctAns)
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
    try {
      await updateQuestion(questionId, newContent, timeLimit, type, correctAns)
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
    try {
      await updateQuestion(questionId, contentStr, newTimeLimit, type, correctAns)
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
    try {
      let correctAns = ''
      if (newType === 'true_false') correctAns = 'A'
      if (newType === 'short_answer') correctAns = 'Answer Text'
      if (newType === 'slider') correctAns = '50'
      if (newType === 'pin_answer') correctAns = '50,50'
      if (newType === 'puzzle') correctAns = 'A,B,C,D'
      if (newType === 'poll') correctAns = 'POLL'

      await updateQuestion(questionId, contentStr, timeLimit, newType, correctAns)

      // Reload details from API to keep fully in sync
      const updatedQuiz = await getQuizById(quizId)
      setQuiz(updatedQuiz)
    } catch (error) {
      console.error('Error updating question type:', error)
    }
  }

  const handleQuestionCorrectAnswerBlur = async (questionId: string, contentStr: string, timeLimit: number, type: string, correctAns: string) => {
    try {
      await updateQuestion(questionId, contentStr, timeLimit, type, correctAns)
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
    try {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      const opt = q?.options.find((o: any) => o.id === optionId)
      const mediaUrl = opt ? opt.mediaUrl : ''

      await updateAnswerOption(optionId, newText, isCorrect, mediaUrl)
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
    try {
      await updateAnswerOption(optionId, optionText, isCorrect, mediaUrl)
      setQuiz((prev: any) => ({
        ...prev,
        questions: prev.questions.map((q: any) => {
          if (q.id === questionId) {
            return {
              ...q,
              options: q.options.map((o: any) => {
                if (o.id === optionId) {
                  return { ...o, isCorrect, mediaUrl }
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
    }
  }

  const handleDeleteOption = async (optionId: string, questionId: string) => {
    try {
      await deleteAnswerOption(optionId)
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

  const handleStartGame = async (mode: 'classic' | 'solo') => {
    setSaving(true)
    try {
      // License/Pro gating deferred — Solo is open for all hosts for now.
      // See backend/internal/pkg/license/LICENSE_DEFERRED.md
      const modeConfig = JSON.stringify({ game_mode: mode === 'solo' ? 'player_paced' : 'host_paced' })
      await updateQuizThemeConfig(quizId, modeConfig)
      const session = await createGameSession(quizId)
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
    if (!importSourceId || importSelected.size === 0) {
      toast.error('Chọn ít nhất 1 câu hỏi')
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
        toast.error(res.error || 'Không thêm được câu')
        return
      }
      const updated = await getQuizById(quizId)
      setQuiz(updated)
      setImportOpen(false)
      toast.success(`Đã thêm ${res.imported} câu`, `Quiz giờ có ${res.totalAfter} câu`)
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
    if (!giphyTarget) return
    const { type, questionId, optionId } = giphyTarget

    if (type === 'question') {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      if (q) {
        const parsed = parseQuestionContent(q.questionText)
        const newContent = JSON.stringify({ text: parsed.text, mediaUrl: url })
        await handleQuestionTextUpdate(questionId, newContent, q.timeLimit, q.type || 'multiple_choice', q.correct_answer)
      }
    } else if (type === 'option' && optionId) {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      if (q) {
        const opt = q.options.find((o: any) => o.id === optionId)
        if (opt) {
          await handleUpdateOption(questionId, optionId, opt.optionText, opt.isCorrect, url)
        }
      }
    }
  }

  const handleRemoveGif = async (type: 'question' | 'option', questionId: string, optionId?: string) => {
    if (type === 'question') {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      if (q) {
        const parsed = parseQuestionContent(q.questionText)
        const newContent = JSON.stringify({ text: parsed.text, mediaUrl: '' })
        await handleQuestionTextUpdate(questionId, newContent, q.timeLimit, q.type || 'multiple_choice', q.correct_answer)
      }
    } else if (type === 'option' && optionId) {
      const q = quiz.questions.find((item: any) => item.id === questionId)
      if (q) {
        const opt = q.options.find((o: any) => o.id === optionId)
        if (opt) {
          await handleUpdateOption(questionId, optionId, opt.optionText, opt.isCorrect, '')
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
            <p className="text-sm text-[#9a9eab] font-medium">Loading quiz...</p>
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
              <p className="text-[#f2f0eb] font-semibold text-lg">Quiz not found</p>
              <p className="text-sm text-[#9a9eab]">This quiz may have been deleted or you lack access.</p>
            </div>
            <Link href="/dashboard">
              <Button className="bg-[#e85d4c] hover:bg-[#d44e3e] text-[#fff8f5] font-semibold rounded-xl">
                Back to Dashboard
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

  // Parse min/max values for slider
  const sliderMin = activeQuestion?.options?.find((o: any) => o.id === 'min')?.optionText || '0'
  const sliderMax = activeQuestion?.options?.find((o: any) => o.id === 'max')?.optionText || '100'

  const typeLabels: Record<string, string> = {
    multiple_choice: 'Quiz',
    true_false: 'T/F',
    short_answer: 'Short',
    slider: 'Slider',
    pin_answer: 'Pin',
    puzzle: 'Puzzle',
    poll: 'Poll',
  }

  const inputClass =
    'bg-[#12141a] border-[#2c313d] focus:border-[#e85d4c] text-[#f2f0eb] placeholder:text-[#5c6170] rounded-xl'

  return (
    <GameBackground variant="dashboard">
      <div className="flex-1 flex flex-col relative">

      <header className="border-b border-[#2c313d] bg-[#1a1d26]/90 backdrop-blur-xl sticky top-0 z-50" data-tour="quiz-editor-header">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4 max-w-7xl">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/dashboard">
              <Button
                variant="ghost"
                className="text-[#c5c2ba] hover:text-[#f2f0eb] hover:bg-[#12141a] rounded-xl gap-2 h-10 px-3"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="h-6 w-px bg-[#2c313d] hidden sm:block" />
            <div className="hidden sm:flex items-center gap-3 min-w-0">
              <BrandMark size="sm" href="/dashboard" />
              <h1 className="text-base font-semibold text-[#f2f0eb] truncate">
                {quiz.title}
              </h1>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0" data-tour="launch-mode">
            <div className="flex gap-2 flex-wrap justify-end">
              <Button
                onClick={openImportPanel}
                disabled={saving}
                variant="outline"
                title="Lấy câu hỏi từ quiz khác của bạn"
                className="border-[#2c313d] bg-transparent text-[#f2f0eb] hover:bg-[#12141a] font-semibold px-4 rounded-xl h-10 text-sm gap-1.5"
              >
                <CopyPlus className="w-4 h-4" />
                Thêm từ quiz
              </Button>
              <Button
                onClick={() => handleStartGame('classic')}
                disabled={saving || quiz.questions?.length === 0}
                title="Host controls the pace: everyone sees the same question at the same time"
                className="bg-[#e85d4c] hover:bg-[#d44e3e] disabled:opacity-40 text-[#fff8f5] font-semibold px-5 rounded-xl h-10 text-sm border-none"
              >
                {saving ? 'Launching...' : 'Classic'}
              </Button>
              <Button
                onClick={() => handleStartGame('solo')}
                disabled={saving || quiz.questions?.length === 0}
                variant="outline"
                title="Each player goes through questions at their own speed"
                className="border-[#2c313d] bg-transparent text-[#f2f0eb] hover:bg-[#12141a] hover:text-[#f2f0eb] disabled:opacity-40 font-semibold px-5 rounded-xl h-10 text-sm"
              >
                {saving ? 'Launching...' : 'Solo'}
              </Button>
            </div>
            <p className="text-xs text-[#9a9eab] hidden sm:block">
              Classic = host-paced. Solo = self-paced.
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-[calc(100vh-73px)] font-sans">
        <aside className="w-64 border-r border-[#2c313d] bg-[#1a1d26] flex flex-col h-[calc(100vh-73px)] select-none" data-tour="question-slides">
          <div className="p-4 border-b border-[#2c313d] flex items-center justify-between shrink-0">
            <h3 className="text-sm text-[#9a9eab] font-medium">Questions</h3>
            <span className="text-xs font-medium bg-[#12141a] text-[#c5c2ba] px-2 py-0.5 rounded-lg border border-[#2c313d]">
              {quiz.questions?.length || 0}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2" ref={slidesRef}>
            {quiz.questions?.map((q: any, idx: number) => {
              const isActive = q.id === activeQuestionId
              const parsed = parseQuestionContent(q.questionText)
              const typeLabel = typeLabels[q.type || 'multiple_choice'] || 'Quiz'

              return (
                <div
                  key={`slide-${q.id || idx}-${idx}`}
                  data-slide-id={q.id}
                  onClick={() => setActiveQuestionId(q.id)}
                  className={`group relative flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
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
                    <div className="w-10 h-7 rounded-lg border border-[#2c313d] bg-[#12141a] overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={parsed.mediaUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteQuestion(q.id)
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[#9a9eab] hover:text-[#e85d4c] transition-opacity bg-transparent border-none cursor-pointer p-1 shrink-0"
                    aria-label="Delete slide"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>

          <div className="p-4 border-t border-[#2c313d] shrink-0">
            <Button
              onClick={handleAddQuestion}
              disabled={saving}
              variant="outline"
              className="w-full border-[#2c313d] bg-[#12141a] hover:bg-[#12141a]/80 text-[#f2f0eb] font-semibold py-3 rounded-xl cursor-pointer gap-2"
            >
              <Plus className="h-4 w-4" />
              Add slide
            </Button>
          </div>
        </aside>

        <section className="flex-1 bg-[#12141a] p-8 overflow-y-auto flex flex-col space-y-6" data-tour="question-editor">
          {!activeQuestion ? (
            <div className="h-full flex flex-col items-center justify-center space-y-5 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2c313d] bg-[#1a1d26]">
                <FileQuestion className="h-8 w-8 text-[#9a9eab]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-[#f2f0eb]">No slide selected</h2>
                <p className="text-sm text-[#9a9eab] max-w-sm leading-relaxed">
                  Select a slide from the left or create a new one to start editing.
                </p>
              </div>
              <Button
                onClick={handleAddQuestion}
                disabled={saving}
                className="bg-[#e85d4c] hover:bg-[#d44e3e] text-[#fff8f5] font-semibold rounded-xl px-6 gap-2"
              >
                <Plus className="h-4 w-4" />
                {saving ? 'Adding...' : 'Add first slide'}
              </Button>
            </div>
          ) : (
            <div className="space-y-8 max-w-4xl mx-auto w-full">
              <div className="space-y-2">
                <label className="text-sm text-[#9a9eab]">Question</label>
                <textarea
                  key={`text-${activeQuestion.id}`}
                  defaultValue={activeParsedContent.text}
                  placeholder="Type your question here..."
                  rows={2}
                  className={`w-full ${inputClass} px-6 py-5 text-xl md:text-2xl font-semibold resize-none transition-all text-center`}
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
                className={`w-full aspect-video md:h-80 md:w-auto mx-auto rounded-2xl border border-dashed border-[#2c313d] bg-[#1a1d26] flex flex-col items-center justify-center relative overflow-hidden group ${
                  activeType === 'pin_answer' && activeParsedContent.mediaUrl ? 'cursor-crosshair' : ''
                }`}
              >
                {activeParsedContent.mediaUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeParsedContent.mediaUrl}
                      alt="Question Graphic"
                      className="w-full h-full object-contain pointer-events-none"
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

                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          triggerGiphy('question', activeQuestion.id)
                        }}
                        className="bg-[#1a1d26]/90 hover:bg-[#1a1d26] border border-[#2c313d] cursor-pointer h-9 px-3 rounded-xl text-xs font-medium text-[#f2f0eb] gap-1.5"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        Change
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveGif('question', activeQuestion.id)
                        }}
                        className="bg-[#1a1d26]/90 hover:bg-[#e85d4c]/20 border border-[#2c313d] hover:border-[#e85d4c]/40 cursor-pointer h-9 px-3 rounded-xl text-xs font-medium text-[#e85d4c] gap-1.5"
                      >
                        <X className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-4 p-8">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2c313d] bg-[#12141a]">
                      <ImagePlus className="h-7 w-7 text-[#9a9eab]" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-[#f2f0eb]">Add media</p>
                      <p className="text-xs text-[#9a9eab]">Insert a GIF from the Giphy library</p>
                    </div>
                    <Button
                      onClick={() => triggerGiphy('question', activeQuestion.id)}
                      className="bg-[#e85d4c] hover:bg-[#d44e3e] text-[#fff8f5] font-semibold rounded-xl px-5 h-10 border-none cursor-pointer gap-2"
                    >
                      <ImagePlus className="h-4 w-4" />
                      Find GIF
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-6" data-tour="answer-options">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm text-[#9a9eab] font-medium">Answers</h4>
                  {(activeType === 'multiple_choice' || activeType === 'poll') && (
                    <Button
                      onClick={() => handleAddOption(activeQuestion.id)}
                      disabled={saving || (activeQuestion.options?.length || 0) >= 4}
                      size="sm"
                      variant="outline"
                      className="border-[#2c313d] text-[#c5c2ba] hover:bg-[#12141a] hover:text-[#f2f0eb] rounded-xl text-xs font-medium h-9 gap-1.5 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add choice
                    </Button>
                  )}
                </div>

                {activeType === 'short_answer' && (
                  <div className="space-y-3 bg-[#1a1d26] border border-[#2c313d] rounded-2xl p-6">
                    <label className="text-sm font-semibold text-[#f2f0eb]">
                      Correct answer (case-insensitive)
                    </label>
                    <Input
                      type="text"
                      key={`correct-${activeQuestion.id}`}
                      defaultValue={activeQuestion.correct_answer}
                      placeholder="E.g. Paris"
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
                      Players must type this text. White space differences are handled automatically.
                    </p>
                  </div>
                )}

                {activeType === 'slider' && (
                  <div className="bg-[#1a1d26] border border-[#2c313d] rounded-2xl p-6 space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm text-[#9a9eab]">Min value</label>
                        <Input
                          type="number"
                          placeholder="0"
                          defaultValue={sliderMin}
                          className={inputClass}
                          onBlur={async (e) => {
                            let opt = activeQuestion.options.find((o: any) => o.id === 'min')
                            if (opt) {
                              await handleUpdateOption(activeQuestion.id, 'min', e.target.value, false)
                            } else {
                              const newOpt = await addAnswerOption(activeQuestion.id, e.target.value, false)
                              const updatedQuiz = await getQuizById(quizId)
                              setQuiz(updatedQuiz)
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm text-[#9a9eab]">Max value</label>
                        <Input
                          type="number"
                          placeholder="100"
                          defaultValue={sliderMax}
                          className={inputClass}
                          onBlur={async (e) => {
                            let opt = activeQuestion.options.find((o: any) => o.id === 'max')
                            if (opt) {
                              await handleUpdateOption(activeQuestion.id, 'max', e.target.value, false)
                            } else {
                              const newOpt = await addAnswerOption(activeQuestion.id, e.target.value, false)
                              const updatedQuiz = await getQuizById(quizId)
                              setQuiz(updatedQuiz)
                            }
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm text-[#9a9eab]">Correct number</label>
                        <Input
                          type="number"
                          placeholder="50"
                          defaultValue={activeQuestion.correct_answer || '50'}
                          className={inputClass}
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
                      </div>
                    </div>
                    <p className="text-xs text-[#9a9eab]">
                      Players will slide a bar between min and max. Points are awarded based on proximity to the correct number.
                    </p>
                  </div>
                )}

                {activeType === 'pin_answer' && (
                  <div className="bg-[#1a1d26] border border-[#2c313d] rounded-2xl p-6 text-center space-y-3">
                    <h5 className="text-sm font-semibold text-[#f2f0eb]">Configure hotspot</h5>
                    <p className="text-xs text-[#9a9eab] max-w-md mx-auto leading-normal">
                      Add a GIF or image above, then click directly on the preview to set the correct pin target coordinate.
                    </p>
                    <div className="inline-flex bg-[#12141a] border border-[#2c313d] px-3 py-1.5 rounded-xl text-xs font-medium text-[#c5c2ba]">
                      Target: {activeQuestion.correct_answer || '50,50'} (X, Y%)
                    </div>
                  </div>
                )}

                {activeType === 'puzzle' && (
                  <div className="space-y-4">
                    <div className="bg-[#1a1d26] border border-[#2c313d] rounded-2xl p-4 text-xs text-[#9a9eab]">
                      Add 4 options below in the correct sort order (1 to 4). Players drag and drop to match this sequence.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {['A', 'B', 'C', 'D'].map((letter, oIndex) => {
                        const option = activeQuestion.options?.find((o: any) => o.id === letter) || { optionText: `Item ${oIndex + 1}`, id: letter }
                        const puzzleColors = [
                          'bg-[#e85d4c]/10 border-[#e85d4c]/30',
                          'bg-blue-500/10 border-blue-500/30',
                          'bg-[#2dd4bf]/10 border-[#2dd4bf]/30',
                          'bg-amber-400/10 border-amber-400/30',
                        ]

                        return (
                          <div key={`puz-${letter}`} className={`p-5 rounded-xl border flex items-center gap-3 bg-[#1a1d26] ${puzzleColors[oIndex]}`}>
                            <span className="font-semibold text-sm text-[#c5c2ba] bg-[#12141a] w-7 h-7 rounded-lg flex items-center justify-center border border-[#2c313d]">
                              {oIndex + 1}
                            </span>
                            <input
                              type="text"
                              defaultValue={option.optionText}
                              placeholder={`Sequence item ${oIndex + 1}...`}
                              className="flex-1 bg-transparent border-none text-[#f2f0eb] text-base font-medium focus:outline-none placeholder:text-[#5c6170]"
                              onBlur={(e) =>
                                handleOptionTextBlur(
                                  activeQuestion.id,
                                  option.id,
                                  e.target.value,
                                  true
                                )
                              }
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {(activeType === 'multiple_choice' || activeType === 'poll') && (
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
                          key={`opt-${option.id}`}
                          className={`relative p-5 rounded-xl border transition-all duration-200 flex flex-col gap-4 bg-[#1a1d26] ${
                            isCorrect && activeType === 'multiple_choice'
                              ? 'border-[#2dd4bf]/50 ring-1 ring-[#2dd4bf]/20 bg-[#2dd4bf]/5'
                              : 'border-[#2c313d]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`border w-9 h-9 rounded-lg flex items-center justify-center font-semibold text-sm shrink-0 ${badgeColor}`}>
                              {String.fromCharCode(65 + oIndex)}
                            </div>
                            <input
                              type="text"
                              defaultValue={option.optionText}
                              placeholder={`Answer choice ${oIndex + 1}...`}
                              className="flex-1 bg-transparent border-none text-[#f2f0eb] text-base font-medium placeholder:text-[#5c6170] focus:outline-none"
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
                                className="text-[#9a9eab] hover:text-[#e85d4c] transition-colors bg-transparent border-none cursor-pointer p-1"
                                aria-label="Delete option"
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
                                  <img src={option.mediaUrl} alt="option gif" className="w-full h-full object-cover" />
                                  <button
                                    onClick={() => handleRemoveGif('option', activeQuestion.id, option.id)}
                                    className="absolute inset-0 bg-[#12141a]/90 flex items-center justify-center text-[#e85d4c] text-[10px] font-medium opacity-0 group-hover/gif:opacity-100 transition-opacity border-none cursor-pointer gap-1"
                                  >
                                    <X className="h-3 w-3" />
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => triggerGiphy('option', activeQuestion.id, option.id)}
                                  className="text-xs font-medium text-[#c5c2ba] bg-[#12141a] hover:bg-[#12141a]/80 px-3 py-1.5 rounded-xl border border-[#2c313d] cursor-pointer flex items-center gap-1.5"
                                >
                                  <ImagePlus className="h-3.5 w-3.5" />
                                  Add GIF
                                </button>
                              )}
                            </div>

                            {activeType === 'multiple_choice' && (
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
                                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border cursor-pointer flex items-center gap-1.5 ${
                                  isCorrect
                                    ? 'bg-[#2dd4bf]/15 border-[#2dd4bf]/40 text-[#2dd4bf]'
                                    : 'bg-[#12141a] border-[#2c313d] text-[#9a9eab] hover:text-[#f2f0eb]'
                                }`}
                              >
                                {isCorrect && <Check className="h-3.5 w-3.5" />}
                                {isCorrect ? 'Correct' : 'Mark correct'}
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

        <aside className="w-72 border-l border-[#2c313d] bg-[#1a1d26] p-6 space-y-6 overflow-y-auto select-none">
          <h3 className="text-sm text-[#9a9eab] font-medium">Slide settings</h3>

          {activeQuestion ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-sm text-[#9a9eab] block">Test knowledge</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'multiple_choice', name: 'Quiz' },
                      { id: 'true_false', name: 'True/False' },
                      { id: 'short_answer', name: 'Type answer' },
                      { id: 'slider', name: 'Slider' },
                      { id: 'pin_answer', name: 'Pin answer' },
                      { id: 'puzzle', name: 'Puzzle' },
                    ].map(typeItem => (
                      <button
                        key={typeItem.id}
                        onClick={() => handleQuestionTypeChange(activeQuestion.id, activeQuestion.questionText, activeQuestion.timeLimit, typeItem.id)}
                        className={`flex items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-medium ${
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
                  <span className="text-sm text-[#9a9eab] block">Collect opinions</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'poll', name: 'Poll' },
                    ].map(typeItem => (
                      <button
                        key={typeItem.id}
                        onClick={() => handleQuestionTypeChange(activeQuestion.id, activeQuestion.questionText, activeQuestion.timeLimit, typeItem.id)}
                        className={`flex items-center justify-center p-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-medium ${
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
                <label className="text-sm text-[#9a9eab]">Time limit</label>
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
                  className={`w-full ${inputClass} px-4 py-3 text-sm font-medium cursor-pointer`}
                >
                  {[10, 20, 30, 45, 60, 90, 120].map((t) => (
                    <option key={t} value={t} className="bg-[#12141a] text-[#f2f0eb]">
                      {t} seconds
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-[#9a9eab]">Score reward</label>
                <div className="bg-[#12141a] border border-[#2c313d] rounded-xl px-4 py-3 text-sm font-medium text-[#2dd4bf] flex items-center justify-between">
                  <span className="text-[#c5c2ba]">Standard points</span>
                  <span>{activeQuestion.points || 1000} pts</span>
                </div>
              </div>

              <div className="pt-6 border-t border-[#2c313d]">
                <Button
                  onClick={() => handleDeleteQuestion(activeQuestion.id)}
                  variant="outline"
                  className="w-full border-[#2c313d] bg-transparent hover:bg-[#e85d4c]/10 hover:border-[#e85d4c]/40 text-[#e85d4c] font-semibold py-3 rounded-xl cursor-pointer gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete slide
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#9a9eab]">Select a slide to view settings</p>
          )}
        </aside>
      </div>

      {importOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2c313d] bg-[#1a1d26] p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#f2f0eb]">Thêm câu từ quiz khác</h2>
                <p className="text-xs text-[#9a9eab] mt-1">
                  Chọn quiz nguồn, tick câu cần lấy — copy vào quiz hiện tại (không tạo kho riêng).
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setImportOpen(false)}
                className="text-[#9a9eab] hover:text-[#f2f0eb]"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <select
              value={importSourceId}
              onChange={(e) => loadImportSource(e.target.value)}
              disabled={importLoading}
              className="w-full h-11 rounded-xl bg-[#12141a] border border-[#2c313d] text-[#f2f0eb] text-sm px-3"
            >
              <option value="">Chọn quiz nguồn…</option>
              {otherQuizzes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.questionCount} câu)
                </option>
              ))}
            </select>

            {!importLoading && otherQuizzes.length === 0 && (
              <p className="text-sm text-[#9a9eab]">Chưa có quiz khác có câu hỏi để lấy.</p>
            )}

            {importSourceQs.length > 0 && (
              <div className="space-y-2 max-h-56 overflow-y-auto">
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
                        className="mt-1 accent-[#e85d4c]"
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
                Hủy
              </Button>
              <Button
                disabled={importLoading || importSelected.size === 0}
                onClick={confirmImport}
                className="flex-1 h-10 rounded-xl bg-[#e85d4c] hover:bg-[#d44e3e] text-white border-none font-semibold"
              >
                {importLoading ? 'Đang thêm…' : `Thêm ${importSelected.size} câu`}
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
      <TourButton tour={quizEditorTour} label="Hướng dẫn" position="bottom-right" />
    </GameBackground>
  )
}
