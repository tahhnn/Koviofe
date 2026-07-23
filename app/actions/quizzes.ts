'use server'

import { apiRequest } from '@/services/api/client'
import { revalidatePath } from 'next/cache'

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
    }
  })

  return {
    id: String(quiz.id),
    title: quiz.title,
    description: quiz.description,
    themeConfig: quiz.theme_config,
    questions: formattedQuestions,
  }
}

/** Deep-copy a quiz (metadata + questions) into a new playable quiz. */
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
  if (String(targetQuizId) === String(sourceQuizId)) {
    return { success: false as const, error: 'Không thể lấy câu từ chính quiz này' }
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
    return { success: false as const, error: 'Không có câu hỏi nào được chọn' }
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

  const startOrder = existing.reduce((m, q) => Math.max(m, q.order || 0), 0)
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
  const reqQuestions = quiz.questions.map((q) => ({
    id: Number(q.id),
    content: q.questionText,
    type: q.type || 'multiple_choice',
    options: q.options.map((opt) => ({ id: opt.id, text: opt.optionText, isCorrect: opt.isCorrect, mediaUrl: opt.mediaUrl || '' })),
    correct_answer: q.correct_answer || q.options.find((opt) => opt.isCorrect)?.id || 'A',
    duration: q.timeLimit,
    points: q.points || 1000,
    order: q.displayOrder,
  }))

  await apiRequest(`/quizzes/${quizId}`, 'PUT', {
    title,
    description,
    theme_config: quiz.themeConfig,
    questions: reqQuestions,
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
    options: (q.options || []).map((opt: any) => ({ id: opt.id, text: opt.optionText || opt.text, isCorrect: opt.isCorrect })),
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
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

export async function deleteQuiz(quizId: string) {
  await apiRequest(`/quizzes/${quizId}`, 'DELETE')
  revalidatePath('/quizzes')
  return { success: true }
}

// Editor actions managed via aggregating updates to Go backend Quiz aggregate
export async function addQuestion(quizId: string, questionText: string, timeLimit: number = 30) {
  const quiz = await getQuizById(quizId)
  
  const reqQuestions = quiz.questions.map((q) => ({
    id: Number(q.id),
    content: q.questionText,
    type: q.type || 'multiple_choice',
    options: q.options.map((opt) => ({ id: opt.id, text: opt.optionText, isCorrect: opt.isCorrect, mediaUrl: opt.mediaUrl || '' })),
    correct_answer: q.correct_answer || q.options.find((opt) => opt.isCorrect)?.id || 'A',
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
        } else if (type === 'slider') {
          opts = [
            { id: 'min', text: '0', isCorrect: false, mediaUrl: '' },
            { id: 'max', text: '100', isCorrect: false, mediaUrl: '' }
          ]
        } else if (type === 'puzzle') {
          opts = [
            { id: 'A', text: 'Item 1', isCorrect: true, mediaUrl: '' },
            { id: 'B', text: 'Item 2', isCorrect: true, mediaUrl: '' },
            { id: 'C', text: 'Item 3', isCorrect: true, mediaUrl: '' },
            { id: 'D', text: 'Item 4', isCorrect: true, mediaUrl: '' }
          ]
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
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

// Answer Options inside GORM Question array
export async function addAnswerOption(questionId: string, optionText: string, isCorrect: boolean) {
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

  let newOptId = 'A'
  let newOptionObj: any = null

  const reqQuestions = quizDetails.questions.map((q: any) => {
    let parsedOpts = []
    try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}

    if (String(q.id) === questionId) {
      // Find next letter A, B, C, D...
      const nextLetter = String.fromCharCode(65 + parsedOpts.length) // A=65, B=66...
      newOptId = nextLetter
      newOptionObj = { id: nextLetter, text: optionText, isCorrect }
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
  })

  revalidatePath(`/quizzes/${quizId}`)
  return {
    id: newOptId,
    questionId,
    optionText,
    isCorrect,
  }
}

export async function updateAnswerOption(optionId: string, optionText: string, isCorrect: boolean, mediaUrl: string = '') {
  const quizzes = await apiRequest('/quizzes')
  let quizId = ''
  let quizDetails: any = null
  let questionId = ''

  for (const q of quizzes) {
    const details = await apiRequest(`/quizzes/${q.id}`)
    for (const question of details.questions || []) {
      let parsedOpts = []
      try { parsedOpts = question.options ? JSON.parse(question.options) : [] } catch {}
      const hasOpt = parsedOpts.some((o: any) => o.id === optionId)
      if (hasOpt) {
        quizId = String(q.id)
        quizDetails = details
        questionId = String(question.id)
        break
      }
    }
    if (quizId) break
  }

  if (!quizId) throw new Error('Option not found')

  const reqQuestions = quizDetails.questions.map((q: any) => {
    let parsedOpts = []
    try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}

    if (String(q.id) === questionId) {
      let correctAns = q.correct_answer
      parsedOpts = parsedOpts.map((o: any) => {
        if (o.id === optionId) {
          if (isCorrect) correctAns = optionId
          return { ...o, text: optionText, isCorrect, mediaUrl }
        }
        // If this one is correct and isCorrect parameter is true, other options must be false (single-choice)
        if (isCorrect && o.isCorrect) {
          return { ...o, isCorrect: false }
        }
        return o
      })

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
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

export async function deleteAnswerOption(optionId: string) {
  const quizzes = await apiRequest('/quizzes')
  let quizId = ''
  let quizDetails: any = null
  let questionId = ''

  for (const q of quizzes) {
    const details = await apiRequest(`/quizzes/${q.id}`)
    for (const question of details.questions || []) {
      let parsedOpts = []
      try { parsedOpts = question.options ? JSON.parse(question.options) : [] } catch {}
      const hasOpt = parsedOpts.some((o: any) => o.id === optionId)
      if (hasOpt) {
        quizId = String(q.id)
        quizDetails = details
        questionId = String(question.id)
        break
      }
    }
    if (quizId) break
  }

  if (!quizId) throw new Error('Option not found')

  const reqQuestions = quizDetails.questions.map((q: any) => {
    let parsedOpts = []
    try { parsedOpts = q.options ? JSON.parse(q.options) : [] } catch {}

    if (String(q.id) === questionId) {
      parsedOpts = parsedOpts.filter((o: any) => o.id !== optionId)
      // Recalculate IDs (A, B, C...)
      parsedOpts = parsedOpts.map((o: any, idx: number) => ({
        id: String.fromCharCode(65 + idx),
        text: o.text,
        isCorrect: o.isCorrect,
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
  })

  revalidatePath(`/quizzes/${quizId}`)
  return { success: true }
}

// Game Sessions (Rooms)
export async function createGameSession(quizId: string, isPrivate: boolean = true) {
  const room = await apiRequest(`/rooms?quiz_id=${quizId}&is_private=${isPrivate}`, 'POST')
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
  const data = await apiRequest(`/rooms/${sessionId}`, 'GET', undefined, extra)

  // Host response: { room, players, max_players }; Player response: flat room fields
  const room = data.room || data
  if (!room?.id) {
    throw new Error('NOT_FOUND')
  }
  const players = data.players || room.players || []

  return {
    id: String(room.id),
    quizId: String(room.quiz_id || ''),
    hostUserId: String(room.host_id || ''),
    sessionCode: room.pin_code || '',
    status: room.status === 'active' ? 'playing' : room.status,
    isPrivate: room.is_private !== false,
    currentQuestionIndex: room.current_question_index ?? data.current_question_index ?? -1,
    themeConfig: room.theme_config ?? data.theme_config,
    currentQuestion: data.current_question || room.current_question || null,
    questionCount: Number(data.question_count || 0),
    maxPlayers: Number(data.max_players || room.max_players || 0),
    playerCount: Number(data.player_count ?? players.length),
    planId: data.plan_id || room.plan_id || '',
    planName: data.plan_name || room.plan_name || '',
    participants: players.map((p: any) => ({
      id: String(p.id),
      sessionId: String(p.room_id || room.id),
      username: p.nickname,
      isAnonymous: !p.user_id,
    })),
    leaderboard: players.map((p: any) => ({
      participantId: String(p.id),
      username: p.nickname,
      totalPoints: p.score,
    })).sort((a: any, b: any) => b.totalPoints - a.totalPoints),
  }
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

export async function joinGameSession(sessionCode: string, username: string, userId?: string) {
  const data = await apiRequest('/rooms/join', 'POST', {
    pin_code: sessionCode,
    nickname: username,
  })
  
  revalidatePath(`/play/${data.room_id}`)
  return {
    sessionId: String(data.room_id),
    participantId: String(data.player_id),
    playerToken: data.player_token, // Pass player signed token JWT
    centrifugoToken: data.centrifugo_tok, // Pass Centrifugo client JWT
    centrifugoClientId: data.centrifugo_cli,
  }
}

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

