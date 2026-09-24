/**
 * Response shaping for GET /rooms/:id and GET /rooms/:id/standings.
 *
 * Kept apart from the callers because there are two of them: the host page
 * still reads through server actions (its credential is the httpOnly `token`
 * cookie, which the browser cannot attach to an API call itself), while the
 * play page calls the API directly (lib/player-session.ts). Both must hand the
 * page the same shape, so the mapping lives here once, with no server-only
 * imports.
 */

export function mapGameSession(data: any) {
  // Host response: { room, players, max_players }; Player response: flat room fields
  const room = data?.room || data
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
    questionActiveUntil: room.question_active_until ?? data.question_active_until ?? null,
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
      totalPoints: p.score ?? 0,
      correctAnswers: p.correct_answers ?? 0,
      // Solo mode progress. current_question_id is omitted by the API once a
      // player has no question left, which is exactly "finished" — but only in
      // solo mode; classic players never carry one, so read it there instead.
      answeredCount: p.answered_count ?? 0,
      currentQuestionId: p.current_question_id ? String(p.current_question_id) : null,
    })),
    leaderboard: players.map((p: any) => ({
      participantId: String(p.id),
      username: p.nickname,
      totalPoints: p.score,
    })).sort((a: any, b: any) => b.totalPoints - a.totalPoints),
  }
}

export type GameSession = ReturnType<typeof mapGameSession>

export function mapStandings(data: any) {
  const row = (p: any) => ({
    id: String(p.id),
    nickname: String(p.nickname || ''),
    score: Number(p.score || 0),
    rank: Number(p.rank || 0),
  })
  return {
    top: (data?.top || []).map(row),
    me: data?.me ? row(data.me) : null,
    total: Number(data?.total || 0),
  }
}

export type Standings = ReturnType<typeof mapStandings>
