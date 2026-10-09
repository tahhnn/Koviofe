'use client'

import { useTranslations } from 'next-intl'
import type { QuestionStat } from '@/lib/game-session'

/**
 * The results screen's second tab: how many people got each question right.
 *
 * The rate is correct / everyone in the room, not / everyone who answered — a
 * player who let the clock run out did not get it right either. The row still
 * says how many never answered, so a question nobody reached in time does not
 * read the same as one everybody got wrong.
 */

/** Same thresholds for every room, so "hard" means the same thing each game. */
function rateTone(pct: number) {
  if (pct >= 70) return { bar: 'bg-emerald-400', text: 'text-emerald-300' }
  if (pct >= 40) return { bar: 'bg-amber-400', text: 'text-amber-300' }
  return { bar: 'bg-[#e85d4c]', text: 'text-[#e85d4c]' }
}

function CorrectAnswer({ stat }: { stat: QuestionStat }) {
  const t = useTranslations('results.questionStats')
  let answer: string
  if (stat.type === 'pin_answer') {
    answer = t('answerPin')
  } else if (stat.correctText) {
    // Option-id keys: show the letter players saw next to the option text.
    answer = stat.type === 'multiple_choice' ? `${stat.correctAnswer.toUpperCase()}. ${stat.correctText}` : stat.correctText
  } else if (stat.type === 'true_false') {
    answer = /^(true|a)$/i.test(stat.correctAnswer) ? t('answerTrue') : t('answerFalse')
  } else {
    answer = stat.correctAnswer
  }
  return (
    <p className="text-xs xl:text-sm text-[#9a9eab] break-words">
      {t('correctAnswer')}: <span className="font-semibold text-emerald-300">{answer}</span>
    </p>
  )
}

function StatRow({ stat }: { stat: QuestionStat }) {
  const t = useTranslations('results.questionStats')
  const total = stat.totalPlayers
  const isPoll = stat.type === 'poll'
  const pct = total > 0 ? Math.round((stat.correct / total) * 100) : 0
  const noAnswer = Math.max(0, total - stat.answered)
  const tone = rateTone(pct)

  return (
    <li className="rounded-xl bg-[#12141a]/80 px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9a9eab]">
            {t('questionLabel', { n: stat.order })}
          </p>
          <p className="font-medium text-[#f2f0eb] break-words line-clamp-2 xl:text-lg">{stat.content}</p>
          {isPoll ? (
            <p className="text-xs xl:text-sm text-[#9a9eab]">{t('pollNote')}</p>
          ) : (
            <CorrectAnswer stat={stat} />
          )}
        </div>
        {!isPoll && (
          <p className={`shrink-0 text-xl xl:text-2xl font-black tabular-nums ${tone.text}`}>{pct}%</p>
        )}
      </div>

      {!isPoll && (
        <div
          className="h-2 rounded-full bg-white/5 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t('questionLabel', { n: stat.order })}
        >
          <div className={`h-full ${tone.bar} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
        </div>
      )}

      <p className="text-xs text-[#9a9eab] tabular-nums">
        {isPoll
          ? t('pollCount', { answered: stat.answered, total })
          : t('correctOfTotal', { correct: stat.correct, total })}
        {noAnswer > 0 && <> · {t('noAnswer', { count: noAnswer })}</>}
      </p>
    </li>
  )
}

export function QuestionStatsList({ stats, roomFinished }: { stats: QuestionStat[]; roomFinished: boolean }) {
  const t = useTranslations('results.questionStats')
  if (stats.length === 0) {
    return <p className="text-sm text-[#9a9eab]">{roomFinished ? t('empty') : t('pending')}</p>
  }
  return (
    <ul className="space-y-2 max-h-[50vh] md:max-h-[60vh] overflow-y-auto">
      {stats.map(stat => (
        <StatRow key={stat.order} stat={stat} />
      ))}
    </ul>
  )
}
