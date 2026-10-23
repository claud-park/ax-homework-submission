// 챔피언별 recap Slack 채널 ID(users.recap_slack_channel_id) 검증·공용 헬퍼.
// DB CHECK 제약과 같은 정규식을 쓴다(supabase/migrations/20261023000000_users_recap_slack_channel.sql).

export const RECAP_CHANNEL_ID_RE = /^[CG][A-Z0-9]{8,}$/

export const RECAP_CHANNEL_FORMAT_HINT =
  'C… 또는 G… 로 시작하는 채널 ID. 채널 이름 → 채널 세부정보 맨 아래에서 복사'

export const RECAP_CHANNEL_MIGRATION_MESSAGE =
  'recap 채널 컬럼이 아직 없어요. 마이그레이션 적용이 필요합니다 (20261023000000_users_recap_slack_channel.sql)'

export function isRecapChannelId(v: unknown): v is string {
  return typeof v === 'string' && RECAP_CHANNEL_ID_RE.test(v)
}

/** 입력값을 trim해 검증한다. null·빈 문자열은 지우기(null). 대문자 변환은 하지 않는다. */
export function parseRecapChannelId(
  input: unknown,
): { ok: true; channelId: string | null } | { ok: false; error: string } {
  if (input === null) return { ok: true, channelId: null }
  if (typeof input !== 'string') {
    return { ok: false, error: 'channelId는 문자열이거나 null이어야 해요' }
  }
  const trimmed = input.trim()
  if (trimmed === '') return { ok: true, channelId: null }
  if (!RECAP_CHANNEL_ID_RE.test(trimmed)) {
    return {
      ok: false,
      error: `채널 ID 형식이 올바르지 않아요. ${RECAP_CHANNEL_FORMAT_HINT}`,
    }
  }
  return { ok: true, channelId: trimmed }
}

/**
 * 마이그레이션 미적용으로 컬럼이 없을 때의 오류인지.
 * 42703 = Postgres undefined_column, PGRST204 = PostgREST 스키마 캐시에 컬럼 없음.
 */
export function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const { code, message } = err as { code?: unknown; message?: unknown }
  if (code === '42703' || code === 'PGRST204') return true
  return typeof message === 'string' && message.includes('recap_slack_channel_id') && /does not exist|could not find/i.test(message)
}
