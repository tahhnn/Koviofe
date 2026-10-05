'use server'

import { apiRequest } from '@/services/api/client'
import { mapGameSession } from '@/lib/game-session'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { BrandingPatch } from '@/lib/theme'

// Quiz CRUD
export async function createQuiz(title: string, description?: string) {
  const quiz = await apiRequest('/quizzes', 'POST', {
    title,
    description,
    theme_config: JSON.stringify({
      primary_color: '#6d28d9',
      background_color: '#0f172a',
      card_background: 'rgba(255, 255, 255, 0.05)',
    }),
    questions: [],
  })
  revalidatePath('/quizzes')
  return {
    id: String(quiz.id),
    title: quiz.title,
    description: quiz.description,
  }
}

export async function getMyQuizzes() {
  const quizzes = await apiRequest('/quizzes')
  const list = Array.isArray(quizzes) ? quizzes : []
  return list.map((quiz: any) => ({
    id: String(quiz.id),
    title: quiz.title,
    description: quiz.description,
    createdAt: new Date(quiz.created_at),
    questionCount: Number(
      quiz.question_count ??
        (Array.isArray(quiz.questions) ? quiz.questions.length : 0)
    ),
    isPublic: !!quiz.is_public,
    allowEdit: !!quiz.allow_edit,
  }))
}

export async function getQuizById(quizId: string) {
  const quiz = await apiRequest(`/quizzes/${quizId}`)
  
  const formattedQuestions = (quiz.questions || [])
    .sort((a: any, b: any) => (a.order - b.order) || (a.id - b.id))
    .map((q: any) => {
    let parsedOptions = []
    try {
      parsedOptions = q.options ? JSON.parse(q.options) : []
    } catch {}

    const options = parsedOptions.map((opt: any) => ({
      id: opt.id,
      optionText: opt.text,
      isCorrect: opt.isCorrect ?? (opt.id === q.correct_answer),
      mediaUrl: opt.mediaUrl || '',
    }))

    return {
      id: String(q.id),
      quizId: String(q.quiz_id),
      questionText: q.content,
      type: q.type || 'multiple_choice',
      timeLimit: q.duration,
      points: q.points,
      displayOrder: q.order,
      options,
      correct_answer: q.correct_answer || '',
      explanation: q.explanation || '',
    }
  })

  return {
    id: String(quiz.id),
    title: quiz.title,
    description: quiz.description,
    themeConfig: quiz.theme_config,
    questions: formattedQuestions,
    // Sharing state and what this viewer may do with it. The server decides;
    // the UI only reflects the answer, so a hidden button is never the only
    // thing standing between a reader and someone else's quiz.
    isPublic: !!quiz.is_public,
    allowEdit: !!quiz.allow_edit,
    // Defaulting to true when the field is absent keeps an older API from
    // locking a host out of their own quiz during a rolling deploy. The server
    // is the authority either way — it rejects a write the viewer may not make.
    isOwner: quiz.is_owner ?? true,
    canEdit: quiz.can_edit ?? true,
    canHost: quiz.can_host ?? true,
    // The row version, handed back on save so two editors cannot overwrite
    // each other silently.
    updatedAt: quiz.updated_at as string | undefined,
  }
}

/**
 * Publish or unpublish a quiz, and choose whether others may edit the original.
 *
 * Owner only — the API checks independently. Unpublishing clears edit rights
 * server-side, so read the answer back rather than assuming what was sent.
 */
export async function updateQuizSharing(
  quizId: string,
  isPublic: boolean,
  allowEdit: boolean
) {
  const data = await apiRequest(`/quizzes/${quizId}/sharing`, 'PATCH', {
    is_public: isPublic,
    allow_edit: allowEdit,
  })
  revalidatePath(`/quizzes/${quizId}`)
  revalidatePath('/dashboard')
  return { isPublic: !!data.is_public, allowEdit: !!data.allow_edit }
}

/** Quizzes other hosts have published. Paginated: this list is platform-wide. */
export async function getSharedQuizzes(search = '', page = 1, pageSize = 20) {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (search.trim()) params.set('q', search.trim())

  const data = await apiRequest(`/quizzes/shared?${params.toString()}`)
  const list = Array.isArray(data?.quizzes) ? data.quizzes : []
  return {
    quizzes: list.map((quiz: any) => ({
      id: String(quiz.id),
      title: quiz.title,
      description: quiz.description,
      questionCount: Number(quiz.question_count ?? 0),
      allowEdit: !!quiz.allow_edit,
      isOwner: !!quiz.is_owner,
      authorName: quiz.author_name || '',
      createdAt: new Date(quiz.created_at),
    })),
    total: Number(data?.total ?? 0),
    page: Number(data?.page ?? page),
    pageSize: Number(data?.page_size ?? pageSize),
  }
}

/**
 * Deep-copy a quiz (metadata + questions) into a new quiz owned by the caller.
 *
 * Works on any quiz the caller may read, which since sharing includes other
 * people's public ones — that is how somebody "edits" a shared quiz: they take
 * their own copy. The copy is independent, so unsharing the original later does
 * not reach it.
 */
export async function duplicateQuiz(quizId: string) {
  const source = await getQuizById(quizId)
  const created = await createQuiz(
    `${source.title} (Copy)`,
    source.description || undefined
  )

  const reqQuestions = (source.questions || []).map((q: any, index: number) => ({
    id: 0,
    content: q.questionText,
    type: q.type || 'multiple_choice',
    options: (q.options || []).map((opt: any) => ({
      id: opt.id,
      text: opt.optionText,
      isCorrect: !!opt.isCorrect,
      mediaUrl: opt.mediaUrl || '',
    })),
    correct_answer:
      q.correct_answer ||
      (q.options || []).find((o: any) => o.isCorrect)?.id ||
      'A',
    duration: q.timeLimit || 30,
    points: q.points || 1000,
    order: index + 1,
  }))

  // No expected_updated_at here: the target was created a line ago and nobody
  // else can have it open, so there is no version to guard.
  await apiRequest(`/quizzes/${created.id}`, 'PUT', {
    title: created.title,
    description: source.description || '',
    theme_config: source.themeConfig || '',
    questions: reqQuestions,
  })

  revalidatePath('/dashboard')
  revalidatePath('/quizzes')
  return { id: created.id, title: created.title }
}

/**
 * Append questions from another quiz into the target quiz.
 * sourceQuestionIds empty/undefined = import all from source.
 */
export async function importQuestionsFromQuiz(
  targetQuizId: string,
  sourceQuizId: string,
  sourceQuestionIds?: string[]
) {
  const t = await getTranslations('editor')
  if (String(targetQuizId) === String(sourceQuizId)) {
    return { success: false as const, error: t('importSameQuiz') }
  }

  const [target, source] = await Promise.all([
    getQuizById(targetQuizId),
    getQuizById(sourceQuizId),
  ])

  let toImport = source.questions || []
  if (sourceQuestionIds && sourceQuestionIds.length > 0) {
    const want = new Set(sourceQuestionIds.map(String))
    toImport = toImport.filter((q: any) => want.has(String(q.id)))
  }
  if (toImport.length === 0) {
    return { success: false as const, error: t('importNothingSelected') }
  }

  const existing = (target.questions || []).map((q: any, index: number) => ({
    id: Number(q.id),
    content: q.questionText,
    type: q.type || 'multiple_choice',
    options: (q.options || []).map((opt: any) => ({
      id: opt.id,
      text: opt.optionText,
      isCorrect: !!opt.isCorrect,
      mediaUrl: opt.mediaUrl || '',
    })),
    correct_answer:
      q.correct_answer ||
      (q.options || []).find((o: any) => o.isCorrect)?.id ||
      'A',
    duration: q.timeLimit || 30,
    points: q.points || 1000,
    order: q.displayOrder ?? index + 1,
  }))

  const startOrder = existing.reduce((m: number, q: any) => Math.max(m, q.order || 0), 0)
  const imported = toImport.map((q: any, i: number) => ({
    id: 0,
    content: q.questionText,
    type: q.type || 'multiple_choice',
    options: (q.options || []).map((opt: any) => ({
      id: opt.id,
      text: opt.optionText,
      isCorrect: !!opt.isCorrect,
      mediaUrl: opt.mediaUrl || '',
    })),
    correct_answer:
      q.correct_answer ||
      (q.options || []).find((o: any) => o.isCorrect)?.id ||
      'A',
    duration: q.timeLimit || 30,
    points: q.points || 1000,
    order: startOrder + i + 1,
  }))

  await apiRequest(`/quizzes/${targetQuizId}`, 'PUT', {
    title: target.title,
    description: target.description || '',
    theme_config: target.themeConfig || '',
    questions: [...existing, ...imported],
     expected_updated_at: target.updatedAt,
  })

  revalidatePath(`/quizzes/${targetQuizId}`)
  revalidatePath('/dashboard')
  return {
    success: true as const,
    imported: imported.length,
    totalAfter: existing.length + imported.length,
  }
}

export async function updateQuiz(quizId: string, title: string, description?: string) {
  const quiz = await getQuizById(quizId)
  const reqQuestions = (quiz.questions || []).map((q: any) => ({
    id: Number(q.id),
    content: q.questionText,
    type: q.type || 'multiple_choice',
    options: (q.options || []).map((opt: any) => ({ id: opt.id, text: opt.optionText, isCorrect: !!opt.isCorrect, mediaUrl: opt.mediaUrl || '' })),
    correct_answer: q.correct_answer || (q.options || []).find((opt: any) => opt.isCorrect)?.id || 'A',
    duration: q.timeLimit,
    points: q.points || 1000,
    order: q.displayOrder,
  }))

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title,
    description,
    theme_config: quiz.themeConfig,
    questions: reqQuestions,
     expected_updated_at: quiz.updatedAt,
  })

  revalidatePath('/quizzes')
  return { success: true }
}

export async function updateQuizThemeConfig(quizId: string, themeConfig: string) {
  const quiz = await getQuizById(quizId)
  const reqQuestions = (quiz.questions || []).map((q: any) => ({
    id: Number(q.id),
    content: q.questionText,
    type: q.type || 'multiple_choice',
    options: (q.options || []).map((opt: any) => ({
      id: opt.id,
      text: opt.optionText || opt.text,
      isCorrect: opt.isCorrect,
      mediaUrl: opt.mediaUrl || '',
    })),
    correct_answer: q.correct_answer || (q.options || []).find((opt: any) => opt.isCorrect)?.id || 'A',
    duration: q.timeLimit,
    points: q.points || 1000,
    order: q.displayOrder,
  }))

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title: quiz.title,
    description: quiz.description,
    theme_config: themeConfig,
    questions: reqQuestions,
     expected_updated_at: quiz.updatedAt,
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

/**
 * Quiz-level setting: how long a solo player's explanation slide stays up
 * before it advances on its own. Merges into theme_config rather than
 * replacing it, so it survives alongside game_mode.
 */
export async function updateQuizExplanationDuration(quizId: string, seconds: number) {
  const quiz = await getQuizById(quizId)
  let config: Record<string, any> = {}
  try { config = JSON.parse(quiz.themeConfig || '{}') || {} } catch {}
  config.explanation_duration = Math.min(Math.max(Math.round(seconds) || 10, 3), 60)
  return updateQuizThemeConfig(quizId, JSON.stringify(config))
}

/**
 * Quiz-level branding: the key visuals, the logo and the scrim over them.
 *
 * Merges into theme_config for the same reason updateQuizExplanationDuration
 * does — a write that replaced the object would drop game_mode, and the room
 * created next would start in the wrong mode.
 *
 * Only the keys present in `patch` are touched. Passing an empty string for
 * one clears it, which is how the UI removes an image; leaving it out keeps
 * whatever is stored.
 */
export async function updateQuizBranding(quizId: string, patch: BrandingPatch) {
  const quiz = await getQuizById(quizId)
  let config: Record<string, any> = {}
  try { config = JSON.parse(quiz.themeConfig || '{}') || {} } catch {}

  for (const [key, value] of Object.entries(patch)) {
    // An empty string is a deliberate clear, and the key is dropped rather
    // than stored blank so the row stays as small as it was before the host
    // ever opened the branding panel.
    if (value === '' || value === undefined || value === null) {
      delete config[key]
    } else {
      config[key] = value
    }
  }

  // The backend clamps and re-checks all of this; sending a coherent object
  // just keeps the optimistic UI and the stored value in agreement.
  return updateQuizThemeConfig(quizId, JSON.stringify(config))
}

export async function deleteQuiz(quizId: string) {
  await apiRequest(`/quizzes/${quizId}`, 'DELETE')
  revalidatePath('/quizzes')
  return { success: true }
}

// Editor actions managed via aggregating updates to Go backend Quiz aggregate
export async function addQuestion(quizId: string, questionText: string, timeLimit: number = 30) {
  const quiz = await getQuizById(quizId)
  
  const reqQuestions = (quiz.questions || []).map((q: any) => ({
    id: Number(q.id),
    content: q.questionText,
    type: q.type || 'multiple_choice',
    options: (q.options || []).map((opt: any) => ({ id: opt.id, text: opt.optionText, isCorrect: !!opt.isCorrect, mediaUrl: opt.mediaUrl || '' })),
    correct_answer: q.correct_answer || (q.options || []).find((opt: any) => opt.isCorrect)?.id || 'A',
    duration: q.timeLimit,
    points: q.points || 1000,
    order: q.displayOrder,
  }))

  // Add new question structure
  reqQuestions.push({
    id: 0,
    content: questionText,
    type: 'multiple_choice',
    options: [
      { id: 'A', text: 'Answer A', isCorrect: true },
      { id: 'B', text: 'Answer B', isCorrect: false },
      { id: 'C', text: 'Answer C', isCorrect: false },
      { id: 'D', text: 'Answer D', isCorrect: false },
    ],
    correct_answer: 'A',
    duration: timeLimit,
    points: 1000,
    order: reqQuestions.length + 1,
  })

  const updatedQuiz = await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title: quiz.title,
    description: quiz.description,
    theme_config: quiz.themeConfig,
    questions: reqQuestions,
     expected_updated_at: quiz.updatedAt,
  })

  revalidatePath(`/quizzes/${quizId}`)

  // Format and return the newly added question
  const existingIds = new Set((quiz.questions || []).map((q: any) => Number(q.id)))
  const questions = updatedQuiz.questions || []
  let newQ = questions.find((q: any) => !existingIds.has(Number(q.id)))

  if (!newQ) {
    newQ = questions[questions.length - 1]
  }

  let parsedOpts = []
  try {
    parsedOpts = newQ.options ? JSON.parse(newQ.options) : []
  } catch {}

  return {
    id: String(newQ.id),
    quizId: String(newQ.quiz_id),
    questionText: newQ.content,
    timeLimit: newQ.duration,
    points: newQ.points,
    displayOrder: newQ.order,
    correct_answer: newQ.correct_answer || '',
    options: parsedOpts.map((o: any) => ({
      id: o.id,
      optionText: o.text,
      isCorrect: o.isCorrect,
      mediaUrl: o.mediaUrl || '',
    })),
  }
}

export async function updateQuestion(
  questionId: string, 
  questionText: string, 
  timeLimit: number,
  type: string = 'multiple_choice',
  correctAnswer: string = ''
) {
  // Find which quiz this question belongs to by list query and ID comparison
  const quizzes = await apiRequest('/quizzes')
  let quizId = ''
  let quizDetails: any = null

  for (const q of quizzes) {
    const details = await apiRequest(`/quizzes/${q.id}`)
    const found = (details.questions || []).some((item: any) => String(item.id) === questionId)
    if (found) {
      quizId = String(q.id)
      quizDetails = details
      break
    }
  }

  if (!quizId) throw new Error('Question not found')

  const reqQuestions = quizDetails.questions.map((q: any) => {
    let parsedOpts = []
    try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}
    
    if (String(q.id) === questionId) {
      let opts = parsedOpts
      if (type !== q.type) {
        if (type === 'true_false') {
          opts = [
            { id: 'A', text: 'True', isCorrect: true, mediaUrl: '' },
            { id: 'B', text: 'False', isCorrect: false, mediaUrl: '' }
          ]
        } else if (type === 'short_answer' || type === 'pin_answer') {
          opts = []
        } else if (type === 'poll' || type === 'multiple_choice') {
          opts = [
            { id: 'A', text: 'Choice 1', isCorrect: type === 'multiple_choice', mediaUrl: '' },
            { id: 'B', text: 'Choice 2', isCorrect: false, mediaUrl: '' }
          ]
        }
      }

      return {
        id: q.id,
        content: questionText,
        type: type,
        options: opts,
        correct_answer: correctAnswer || q.correct_answer,
        duration: timeLimit,
        points: q.points,
        order: q.order,
      }
    }
    return {
      id: q.id,
      content: q.content,
      type: q.type,
      options: parsedOpts,
      correct_answer: q.correct_answer,
      duration: q.duration,
      points: q.points,
      order: q.order,
    }
  })

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title: quizDetails.title,
    description: quizDetails.description,
    theme_config: quizDetails.theme_config,
    questions: reqQuestions,
    expected_updated_at: quizDetails.updated_at,
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

/**
 * Saves (or clears) a question's explanation slide.
 *
 * Every other mutation here rebuilds the whole quiz payload and omits
 * `explanation`, which the API reads as "leave it alone" — so this is the only
 * writer of the field, and none of the others can clobber a slide by accident.
 */
export async function updateQuestionExplanation(
  quizId: string,
  questionId: string,
  explanation: string
) {
  const quizDetails = await apiRequest(`/quizzes/${quizId}`)

  const reqQuestions = (quizDetails.questions || []).map((q: any) => {
    let parsedOpts: any[] = []
    try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}

    const base = {
      id: Number(q.id),
      content: q.content,
      type: q.type,
      options: parsedOpts,
      correct_answer: q.correct_answer,
      duration: q.duration,
      points: q.points,
      order: q.order,
    }

    return String(q.id) === String(questionId)
      ? { ...base, explanation }
      : base
  })

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title: quizDetails.title,
    description: quizDetails.description,
    theme_config: quizDetails.theme_config,
    questions: reqQuestions,
    expected_updated_at: quizDetails.updated_at,
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

export async function deleteQuestion(questionId: string) {
  const quizzes = await apiRequest('/quizzes')
  let quizId = ''
  let quizDetails: any = null

  for (const q of quizzes) {
    const details = await apiRequest(`/quizzes/${q.id}`)
    const found = (details.questions || []).some((item: any) => String(item.id) === questionId)
    if (found) {
      quizId = String(q.id)
      quizDetails = details
      break
    }
  }

  if (!quizId) throw new Error('Question not found')

  const reqQuestions = quizDetails.questions
    .filter((q: any) => String(q.id) !== questionId)
    .map((q: any, index: number) => {
      let parsedOpts = []
      try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}
      return {
        id: q.id,
        content: q.content,
        type: q.type,
        options: parsedOpts,
        correct_answer: q.correct_answer,
        duration: q.duration,
        points: q.points,
        order: index + 1, // Re-order questions
      }
    })

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title: quizDetails.title,
    description: quizDetails.description,
    theme_config: quizDetails.theme_config,
    questions: reqQuestions,
    expected_updated_at: quizDetails.updated_at,
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

// Answer Options inside GORM Question array
export async function addAnswerOption(
  quizId: string,
  questionId: string,
  optionText: string,
  isCorrect: boolean
) {
  const quizDetails = await apiRequest(`/quizzes/${quizId}`)

  let newOptId = 'A'
  let newOptionObj: any = null

  const reqQuestions = (quizDetails.questions || []).map((q: any) => {
    let parsedOpts = []
    try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}

    if (String(q.id) === questionId) {
      // Find next letter A, B, C, D...
      const nextLetter = String.fromCharCode(65 + parsedOpts.length) // A=65, B=66...
      newOptId = nextLetter
      newOptionObj = { id: nextLetter, text: optionText, isCorrect, mediaUrl: '' }
      parsedOpts.push(newOptionObj)
      
      return {
        id: q.id,
        content: q.content,
        type: q.type,
        options: parsedOpts,
        correct_answer: isCorrect ? nextLetter : q.correct_answer,
        duration: q.duration,
        points: q.points,
        order: q.order,
      }
    }
    return {
      id: q.id,
      content: q.content,
      type: q.type,
      options: parsedOpts,
      correct_answer: q.correct_answer,
      duration: q.duration,
      points: q.points,
      order: q.order,
    }
  })

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title: quizDetails.title,
    description: quizDetails.description,
    theme_config: quizDetails.theme_config,
    questions: reqQuestions,
    expected_updated_at: quizDetails.updated_at,
  })

  revalidatePath(`/quizzes/${quizId}`)
  return {
    id: newOptId,
    questionId,
    optionText,
    isCorrect,
  }
}

export async function updateAnswerOption(
  quizId: string,
  questionId: string,
  optionId: string,
  optionText: string,
  isCorrect: boolean,
  mediaUrl: string = ''
) {
  const quizDetails = await apiRequest(`/quizzes/${quizId}`)

  const reqQuestions = (quizDetails.questions || []).map((q: any) => {
    let parsedOpts: any[] = []
    try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}

    if (String(q.id) === String(questionId)) {
      let correctAns = q.correct_answer
      let matched = false
      parsedOpts = parsedOpts.map((o: any) => {
        if (String(o.id) === String(optionId)) {
          matched = true
          if (isCorrect) correctAns = String(o.id)
          return {
            ...o,
            id: String(o.id),
            text: optionText || o.text || '',
            isCorrect,
            mediaUrl: mediaUrl || '',
          }
        }
        // If this one is correct and isCorrect parameter is true, other options must be false (single-choice)
        if (isCorrect && o.isCorrect) {
          return { ...o, isCorrect: false }
        }
        return o
      })

      if (!matched) {
        throw new Error(`Option ${optionId} not found on question ${questionId}`)
      }

      return {
        id: q.id,
        content: q.content,
        type: q.type,
        options: parsedOpts,
        correct_answer: correctAns,
        duration: q.duration,
        points: q.points,
        order: q.order,
      }
    }
    return {
      id: q.id,
      content: q.content,
      type: q.type,
      options: parsedOpts,
      correct_answer: q.correct_answer,
      duration: q.duration,
      points: q.points,
      order: q.order,
    }
  })

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title: quizDetails.title,
    description: quizDetails.description,
    theme_config: quizDetails.theme_config,
    questions: reqQuestions,
    expected_updated_at: quizDetails.updated_at,
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

export async function deleteAnswerOption(quizId: string, questionId: string, optionId: string) {
  const quizDetails = await apiRequest(`/quizzes/${quizId}`)

  const reqQuestions = (quizDetails.questions || []).map((q: any) => {
    let parsedOpts = []
    try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}

    if (String(q.id) === questionId) {
      parsedOpts = parsedOpts.filter((o: any) => o.id !== optionId)
      // Recalculate IDs (A, B, C...)
      parsedOpts = parsedOpts.map((o: any, idx: number) => ({
        id: String.fromCharCode(65 + idx),
        text: o.text,
        isCorrect: o.isCorrect,
        mediaUrl: o.mediaUrl || '',
      }))
      
      const newCorrect = parsedOpts.find((o: any) => o.isCorrect)?.id || 'A'

      return {
        id: q.id,
        content: q.content,
        type: q.type,
        options: parsedOpts,
        correct_answer: newCorrect,
        duration: q.duration,
        points: q.points,
        order: q.order,
      }
    }
    return {
      id: q.id,
      content: q.content,
      type: q.type,
      options: parsedOpts,
      correct_answer: q.correct_answer,
      duration: q.duration,
      points: q.points,
      order: q.order,
    }
  })

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title: quizDetails.title,
    description: quizDetails.description,
    theme_config: quizDetails.theme_config,
    questions: reqQuestions,
    expected_updated_at: quizDetails.updated_at,
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

// Game Sessions (Rooms)
/**
 * Open a room for one game.
 *
 * `mode` is passed to the API and applied to the room's own copy of the theme.
 * It used to be saved onto the quiz first, which made starting a game a write:
 * picking Solo rewrote the author's quiz for everyone, and on a shared quiz it
 * failed outright, because a guest may not write to someone else's quiz.
 */
export async function createGameSession(
  quizId: string,
  isPrivate: boolean = true,
  mode: 'classic' | 'solo' = 'classic'
) {
  const room = await apiRequest(
    `/rooms?quiz_id=${quizId}&is_private=${isPrivate}&game_mode=${mode}`,
    'POST'
  )
  revalidatePath('/host')
  return {
    id: String(room.id),
    quizId: String(room.quiz_id),
    hostUserId: String(room.host_id),
    sessionCode: room.pin_code,
    status: room.status,
    isPrivate: room.is_private !== false,
    currentQuestionIndex: room.current_question_index,
    maxPlayers: Number(room.max_players || 0),
    planId: room.plan_id || 'free',
  }
}

export async function updateRoomPrivacy(sessionId: string, isPrivate: boolean) {
  const data = await apiRequest(`/rooms/${sessionId}/privacy`, 'PATCH', {
    is_private: isPrivate,
  })
  revalidatePath(`/host/${sessionId}`)
  return {
    id: String(data.id),
    isPrivate: !!data.is_private,
  }
}

export async function getGameSession(sessionId: string, playerToken?: string) {
  const extra = playerToken ? { 'X-Player-Token': playerToken } : undefined
  return mapGameSession(await apiRequest(`/rooms/${sessionId}`, 'GET', undefined, extra))
}

export async function startGameSession(sessionId: string) {
  await apiRequest(`/rooms/${sessionId}/start`, 'POST')
  revalidatePath('/host')
  revalidatePath(`/host/${sessionId}`)
  revalidatePath(`/play/${sessionId}`)
  return { success: true }
}

export async function endGameSession(sessionId: string) {
  await apiRequest(`/rooms/${sessionId}/end`, 'POST')
  revalidatePath('/host')
  revalidatePath(`/host/${sessionId}`)
  revalidatePath(`/play/${sessionId}`)
  return { success: true }
}

/**
 * Returns the failure instead of throwing it.
 *
 * A Server Action that throws has its message redacted in production builds —
 * the join form received "An error occurred in the Server Components render…"
 * and showed that to the player, so the single most common join failure,
 * a nickname already taken in the room, was reported as an internal error.
 */
export async function getDashboardStats() {
  try {
    const rooms = await apiRequest('/logs', 'GET')
    if (!Array.isArray(rooms)) return { totalSessions: 0, totalPlayers: 0, averageScore: '0%' }
    
    let totalPlayers = 0
    let totalCorrectAnswers = 0
    let totalAnswersCount = 0

    // Fetch details for each finished room in parallel
    const detailsPromises = rooms.map(room => apiRequest(`/logs/${room.id}`, 'GET').catch(() => null))
    const roomsDetails = await Promise.all(detailsPromises)

    roomsDetails.forEach(details => {
      if (details) {
        if (Array.isArray(details.players)) {
          totalPlayers += details.players.length
        }
        if (Array.isArray(details.answers)) {
          details.answers.forEach((ans: any) => {
            totalAnswersCount++
            if (ans.is_correct) {
              totalCorrectAnswers++
            }
          })
        }
      }
    })

    const averageScore = totalAnswersCount > 0 
      ? `${Math.round((totalCorrectAnswers / totalAnswersCount) * 100)}%` 
      : '0%'

    return {
      totalSessions: rooms.length,
      totalPlayers,
      averageScore
    }
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    return { totalSessions: 0, totalPlayers: 0, averageScore: '0%' }
  }
}

export async function createQuizFromMockTemplate(theme: string) {
  let title = "General Trivia"
  let description = "A quick general knowledge quiz"
  let questions: any[] = []

  if (theme === 'math') {
    title = "Math Challenge"
    description = "Test your basic math skills!"
    questions = [
      {
        id: 0,
        content: "What is 7 x 8?",
        type: "multiple_choice",
        options: [
          { id: "A", text: "54", isCorrect: false },
          { id: "B", text: "56", isCorrect: true },
          { id: "C", text: "64", isCorrect: false },
          { id: "D", text: "48", isCorrect: false },
        ],
        correct_answer: "B",
        duration: 20,
        points: 1000,
        order: 1
      },
      {
        id: 0,
        content: "What is the smallest prime number?",
        type: "multiple_choice",
        options: [
          { id: "A", text: "0", isCorrect: false },
          { id: "B", text: "1", isCorrect: false },
          { id: "C", text: "2", isCorrect: true },
          { id: "D", text: "3", isCorrect: false },
        ],
        correct_answer: "C",
        duration: 20,
        points: 1000,
        order: 2
      },
      {
        id: 0,
        content: "What is the square root of 144?",
        type: "multiple_choice",
        options: [
          { id: "A", text: "12", isCorrect: true },
          { id: "B", text: "14", isCorrect: false },
          { id: "C", text: "16", isCorrect: false },
          { id: "D", text: "10", isCorrect: false },
        ],
        correct_answer: "A",
        duration: 20,
        points: 1000,
        order: 3
      }
    ]
  } else if (theme === 'science') {
    title = "Science Trivia"
    description = "A quick test on general science!"
    questions = [
      {
        id: 0,
        content: "What is the boiling point of water in Celsius?",
        type: "multiple_choice",
        options: [
          { id: "A", text: "90°C", isCorrect: false },
          { id: "B", text: "100°C", isCorrect: true },
          { id: "C", text: "120°C", isCorrect: false },
          { id: "D", text: "80°C", isCorrect: false },
        ],
        correct_answer: "B",
        duration: 20,
        points: 1000,
        order: 1
      },
      {
        id: 0,
        content: "Which planet is closest to the Sun?",
        type: "multiple_choice",
        options: [
          { id: "A", text: "Venus", isCorrect: false },
          { id: "B", text: "Mercury", isCorrect: true },
          { id: "C", text: "Mars", isCorrect: false },
          { id: "D", text: "Earth", isCorrect: false },
        ],
        correct_answer: "B",
        duration: 20,
        points: 1000,
        order: 2
      }
    ]
  } else if (theme === 'programming') {
    title = "Web Development Basics"
    description = "Test your HTML, CSS, and JS fundamentals!"
    questions = [
      {
        id: 0,
        content: "Which of the following is NOT a programming language?",
        type: "multiple_choice",
        options: [
          { id: "A", text: "JavaScript", isCorrect: false },
          { id: "B", text: "Python", isCorrect: false },
          { id: "C", text: "HTML", isCorrect: true },
          { id: "D", text: "Go", isCorrect: false },
        ],
        correct_answer: "C",
        duration: 20,
        points: 1000,
        order: 1
      },
      {
        id: 0,
        content: "Which symbol represents an ID selector in CSS?",
        type: "multiple_choice",
        options: [
          { id: "A", text: ".", isCorrect: false },
          { id: "B", text: "#", isCorrect: true },
          { id: "C", text: "*", isCorrect: false },
          { id: "D", text: "@", isCorrect: false },
        ],
        correct_answer: "B",
        duration: 20,
        points: 1000,
        order: 2
      }
    ]
  } else {
    title = "General Knowledge"
    description = "Challenge yourself with miscellaneous facts!"
    questions = [
      {
        id: 0,
        content: "What is the capital of France?",
        type: "multiple_choice",
        options: [
          { id: "A", text: "London", isCorrect: false },
          { id: "B", text: "Berlin", isCorrect: false },
          { id: "C", text: "Paris", isCorrect: true },
          { id: "D", text: "Rome", isCorrect: false },
        ],
        correct_answer: "C",
        duration: 20,
        points: 1000,
        order: 1
      }
    ]
  }

  const created = await apiRequest('/quizzes', 'POST', {
    title,
    description,
    theme_config: JSON.stringify({
      primary_color: '#6d28d9',
      background_color: '#0f172a',
      card_background: 'rgba(255, 255, 255, 0.05)',
    }),
    questions,
  })

  revalidatePath('/quizzes')
  return {
    id: String(created.id),
    title: created.title,
    description: created.description,
  }
}
