import type { MilestoneStatus } from '@/lib/types'

export interface OverdueCandidate {
  status: MilestoneStatus
  start_date: string | null
  due_date: string | null
}

/**
 * 마일스톤이 champion gantt view 에서 "빨간 박스"(지연/미완료)로 표시되는지 판정한다.
 * ChampionGanttView.getMilestoneStyle 의 delayed 판정과 정확히 일치시킨다:
 *
 * - completed → 아님(초록)
 * - 미래(start_date > today) → 아님(회색)
 * - status === 'delayed' → 지연(명시적)
 * - status ∈ {not_started, in_progress} 이고 due_date < today → 지연(마감 경과)
 *
 * 모든 날짜 비교는 YYYY-MM-DD 문자열 사전순(= 날짜순)으로 수행한다.
 */
export function isOverdueMilestone(m: OverdueCandidate, todayStr: string): boolean {
  if (m.status === 'completed') return false
  if (m.start_date && m.start_date > todayStr) return false // 아직 시작 전(미래)
  if (m.status === 'delayed') return true
  if ((m.status === 'not_started' || m.status === 'in_progress') && m.due_date && m.due_date < todayStr) {
    return true
  }
  return false
}

/** 마일스톤 목록에 빨간 박스가 하나라도 있으면 true. */
export function hasOverdueMilestone(milestones: OverdueCandidate[], todayStr: string): boolean {
  return milestones.some(m => isOverdueMilestone(m, todayStr))
}

/**
 * Asia/Seoul(KST) 기준 오늘 날짜를 YYYY-MM-DD 로 반환한다.
 * 서버(UTC) 크론이 KST 날짜 경계로 판정하도록 하기 위함.
 */
export function kstTodayStr(now: Date = new Date()): string {
  // en-CA 로케일은 YYYY-MM-DD 형식을 준다.
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}
