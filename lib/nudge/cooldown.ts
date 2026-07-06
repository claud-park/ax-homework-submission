import type { SupabaseClient } from '@supabase/supabase-js'

export type NudgeType = 'no_charter' | 'no_milestone' | 'delayed_milestone' | 'overdue_milestones'
export type NudgeSource = 'manual' | 'cron'

/** 같은 (user, type) 넛지를 이 시간 안에 다시 보내지 않는다. */
export const NUDGE_COOLDOWN_HOURS = 20

/**
 * 마지막 발송 시각과 쿨다운으로 남은 대기 시간(시간 단위, 올림)을 계산한다.
 * 쿨다운이 지났으면(재발송 허용) 0 을 반환한다. (순수 함수 — 테스트 대상)
 */
export function hoursUntilNextNudge(
  lastSentAt: Date | null,
  now: Date,
  cooldownH: number = NUDGE_COOLDOWN_HOURS,
): number {
  if (!lastSentAt) return 0
  const elapsedH = (now.getTime() - lastSentAt.getTime()) / 3_600_000
  const remaining = cooldownH - elapsedH
  return remaining > 0 ? Math.ceil(remaining) : 0
}

/** 쿨다운 창 내 마지막 발송 시각을 반환. 없으면 null(=발송 허용). */
export async function findRecentNudge(
  supabase: Pick<SupabaseClient, 'from'>,
  userId: string,
  nudgeType: NudgeType,
  cooldownH: number = NUDGE_COOLDOWN_HOURS,
): Promise<Date | null> {
  const cutoff = new Date(Date.now() - cooldownH * 3_600_000).toISOString()
  const { data } = await supabase
    .from('nudge_log')
    .select('sent_at')
    .eq('user_id', userId)
    .eq('nudge_type', nudgeType)
    .gte('sent_at', cutoff)
    .order('sent_at', { ascending: false })
    .limit(1)
  const row = (data as { sent_at: string }[] | null)?.[0]
  return row ? new Date(row.sent_at) : null
}

/** 넛지 발송을 기록한다. */
export async function recordNudge(
  supabase: Pick<SupabaseClient, 'from'>,
  userId: string,
  nudgeType: NudgeType,
  source: NudgeSource,
): Promise<void> {
  await supabase.from('nudge_log').insert({ user_id: userId, nudge_type: nudgeType, source })
}
