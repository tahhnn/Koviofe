'use client'

import { useTranslations } from 'next-intl'
import { Trophy } from 'lucide-react'

/**
 * The scoreboard shown between questions: the top of the room, plus the row of
 * the person looking at it.
 *
 * Deliberately not the host's live sidebar in a different shape. That board is
 * a monitoring tool — twenty rows, always on screen, glanceable. This is a
 * slide: it takes the screen for a few seconds after a question, so it carries
 * five rows at a size a room can read from the back, and it answers one
 * question for the player holding a phone — where am I?
 */
export type StandingRow = {
  id: string
  nickname: string
  score: number
  rank: number
}

const MEDALS = ['🥇', '🥈', '🥉']

/** Podium tints for the first three; everyone else shares the flat row. */
const RANK_STYLES = [
  'border-amber-400/30 bg-gradient-to-r from-amber-400/15 to-transparent',
  'border-slate-300/25 bg-gradient-to-r from-slate-300/10 to-transparent',
  'border-amber-700/30 bg-gradient-to-r from-amber-700/12 to-transparent',
]

function Row({
  row,
  isMe,
  stage,
  delayMs,
  animate,
}: {
  row: StandingRow
  isMe: boolean
  stage: boolean
  delayMs: number
  animate: boolean
}) {
  const podium = row.rank <= 3 ? RANK_STYLES[row.rank - 1] : 'border-white/5 bg-black/30'
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${stage ? 'sm:px-5 sm:py-4' : ''} ${podium} ${
        isMe ? 'ring-2 ring-[#2dd4bf]/70' : ''
      } ${animate ? 'animate-explain-item' : ''}`}
      style={{ animationDelay: animate ? `${delayMs}ms` : undefined }}
    >
      <div
        className={`shrink-0 flex items-center justify-center rounded-lg bg-black/40 font-black tabular-nums ${
          stage ? 'w-10 h-10 sm:w-12 sm:h-12 text-lg sm:text-xl' : 'w-9 h-9 text-sm'
        }`}
      >
        {row.rank <= 3 ? MEDALS[row.rank - 1] : `#${row.rank}`}
      </div>
      <p
        className={`min-w-0 flex-1 truncate font-bold ${isMe ? 'text-[#2dd4bf]' : 'text-[#f2f0eb]'} ${
          stage ? 'text-lg sm:text-2xl lg:text-3xl' : 'text-base'
        }`}
      >
        {row.nickname}
      </p>
      <p
        className={`shrink-0 font-black tabular-nums text-[#e85d4c] ${
          stage ? 'text-xl sm:text-3xl lg:text-4xl' : 'text-lg'
        }`}
      >
        {row.score}
      </p>
    </div>
  )
}

export type LeaderboardSlideProps = {
  rows: StandingRow[]
  /** The viewer's own row. Null on the host screen, which is nobody's row. */
  me?: StandingRow | null
  /** Players in the room, so a rank outside the top can be read as "of 40". */
  total?: number
  /** Points won on the question that just ended, when the viewer is a player. */
  pointsEarned?: number | null
  /** 'stage' fills a host screen; 'sheet' fills a player's portrait panel. */
  variant?: 'stage' | 'sheet'
  animate?: boolean
  className?: string
}

export function LeaderboardSlide({
  rows,
  me = null,
  total = 0,
  pointsEarned = null,
  variant = 'stage',
  animate = true,
  className = '',
}: LeaderboardSlideProps) {
  const t = useTranslations('leaderboardSlide')
  const stage = variant === 'stage'
  // Only when they are not already up there. Printing the same player twice
  // reads as a bug, and the top rows are the ones carrying the highlight.
  const meBelow = me && !rows.some(r => r.id === me.id) ? me : null

  return (
    <div
      className={`relative w-full h-full overflow-hidden flex flex-col bg-[#12141a] ${
        stage ? 'p-5 sm:p-8 lg:p-10 gap-4 sm:gap-6' : 'p-4 gap-3'
      } ${className}`}
    >
      <div className="shrink-0 flex items-center gap-3">
        <Trophy className={`text-amber-400 ${stage ? 'w-6 h-6 sm:w-8 sm:h-8' : 'w-5 h-5'}`} />
        <div className="min-w-0">
          <h2 className={`font-black text-[#f2f0eb] leading-tight ${stage ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-lg'}`}>
            {t('title')}
          </h2>
          {total > 0 && (
            <p className={`text-[#9a9eab] ${stage ? 'text-sm sm:text-base' : 'text-xs'}`}>
              {t('playerCount', { count: total })}
            </p>
          )}
        </div>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto ${stage ? 'space-y-2.5 sm:space-y-3' : 'space-y-2'}`}>
        {rows.length === 0 ? (
          <p className={`text-[#9a9eab] ${stage ? 'text-lg' : 'text-sm'}`}>{t('empty')}</p>
        ) : (
          rows.map((row, i) => (
            <Row
              key={row.id || row.rank}
              row={row}
              isMe={!!me && me.id === row.id}
              stage={stage}
              delayMs={i * 70}
              animate={animate}
            />
          ))
        )}
      </div>

      {meBelow && (
        <div className={`shrink-0 border-t border-white/10 ${stage ? 'pt-4 sm:pt-5' : 'pt-3'} space-y-2`}>
          <p className={`text-[#9a9eab] uppercase tracking-wider font-semibold ${stage ? 'text-xs sm:text-sm' : 'text-[11px]'}`}>
            {total > 0 ? t('yourPositionOf', { rank: meBelow.rank, total }) : t('yourPosition')}
          </p>
          <Row row={meBelow} isMe stage={stage} delayMs={0} animate={animate} />
        </div>
      )}

      {pointsEarned !== null && pointsEarned > 0 && (
        <p
          className={`shrink-0 text-center font-bold text-[#2dd4bf] ${stage ? 'text-lg' : 'text-sm'}`}
        >
          {t('pointsThisRound', { points: pointsEarned })}
        </p>
      )}
    </div>
  )
}
