'use server'

import { apiRequest } from '@/services/api/client'
import { revalidatePath } from 'next/cache'

export type QuestionBankPack = {
  id: number
  host_id?: number
  title: string
  description?: string
  questions?: string
  question_count?: number
  created_at?: string
  updated_at?: string
}

export type BankQuestion = {
  content: string
  type: string
  options: any
  correct_answer: string
  duration: number
  points: number
}

function packId(t: any): number {
  return Number(t?.id ?? t?.ID ?? 0)
}

export async function getMyQuestionBanks(): Promise<QuestionBankPack[]> {
  try {
    const templates = await apiRequest('/templates', 'GET')
    if (!Array.isArray(templates)) return []
    return templates.map((t: any) => ({
      id: packId(t),
      host_id: t.host_id,
      title: t.title,
      description: t.description || '',
      question_count: t.question_count ?? 0,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }))
  } catch (error) {
    console.error('Error fetching question banks:', error)
    return []
  }
}

/** @deprecated use getMyQuestionBanks */
export async function getMyTemplates() {
  return getMyQuestionBanks()
}

export async function getQuestionBankById(id: string | number) {
  const t = await apiRequest(`/templates/${id}`, 'GET')
  let questions: BankQuestion[] = []
  try {
    const parsed = JSON.parse(t.questions || '[]')
    if (Array.isArray(parsed)) questions = parsed
  } catch {}
  return {
    id: packId(t),
    title: t.title as string,
    description: (t.description || '') as string,
    question_count: t.question_count ?? questions.length,
    questions,
    rawQuestions: t.questions as string,
  }
}

export async function saveQuizToQuestionBank(
  quizId: string,
  opts?: { title?: string; description?: string }
) {
  try {
    const res = await apiRequest(`/templates/from-quiz/${quizId}`, 'POST', {
      title: opts?.title,
      description: opts?.description,
    })
    revalidatePath('/templates')
    revalidatePath('/dashboard')
    return { success: true as const, pack: res as QuestionBankPack }
  } catch (error: any) {
    return { success: false as const, error: error.message as string }
  }
}

export async function updateQuestionBankMeta(
  packId: string | number,
  title: string,
  description: string
) {
  try {
    const res = await apiRequest(`/templates/${packId}`, 'PUT', {
      title,
      description,
    })
    revalidatePath('/templates')
    return { success: true as const, pack: res }
  } catch (error: any) {
    return { success: false as const, error: error.message as string }
  }
}

/** @deprecated */
export async function updateTemplateAction(templateId: string, title: string, description: string) {
  return updateQuestionBankMeta(templateId, title, description)
}

export async function deleteQuestionBank(packId: string | number) {
  try {
    await apiRequest(`/templates/${packId}`, 'DELETE')
    revalidatePath('/templates')
    revalidatePath('/dashboard')
    return { success: true as const }
  } catch (error: any) {
    return { success: false as const, error: error.message as string }
  }
}

/** @deprecated */
export async function deleteTemplateAction(templateId: string) {
  return deleteQuestionBank(templateId)
}

/** Create a new playable quiz from an entire bank pack. */
export async function createQuizFromQuestionBank(packId: string | number, title?: string) {
  try {
    const res = await apiRequest(`/templates/${packId}/instantiate`, 'POST', {
      title: title || undefined,
    })
    revalidatePath('/dashboard')
    revalidatePath('/quizzes')
    return { success: true as const, quizId: String(res.quiz_id) }
  } catch (error: any) {
    return { success: false as const, error: error.message as string }
  }
}

/** @deprecated use createQuizFromQuestionBank */
export async function createQuizFromTemplate(templateId: string) {
  return createQuizFromQuestionBank(templateId)
}

/** Remix: append selected bank questions into an existing quiz. */
export async function importBankQuestionsToQuiz(
  packId: string | number,
  quizId: string | number,
  indices?: number[]
) {
  try {
    const res = await apiRequest(`/templates/${packId}/import`, 'POST', {
      quiz_id: Number(quizId),
      indices: indices ?? [],
    })
    revalidatePath(`/quizzes/${quizId}`)
    revalidatePath('/dashboard')
    return {
      success: true as const,
      imported: res.imported as number,
      totalAfter: res.total_after as number,
    }
  } catch (error: any) {
    return { success: false as const, error: error.message as string }
  }
}

/** Legacy empty create — kept for compatibility; prefer saveQuizToQuestionBank. */
export async function createTemplateAction(title: string, description: string, questionsJson: string) {
  try {
    const res = await apiRequest('/templates', 'POST', {
      title,
      description,
      questions: questionsJson,
    })
    revalidatePath('/templates')
    return { success: true as const, template: res }
  } catch (error: any) {
    return { success: false as const, error: error.message as string }
  }
}
