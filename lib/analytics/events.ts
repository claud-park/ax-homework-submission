// 이벤트명 상수 + 이벤트별 property 타입.
// 네이밍 규칙: object_action, 과거형, snake_case.

export const AnalyticsEvent = {
  // --- 페이지/체류 ---
  PAGE_VIEWED: 'page_viewed',
  PAGE_DWELL: 'page_dwell',

  // --- P0 핵심 활성화 퍼널 ---
  CHAMPION_LOGIN_COMPLETED: 'champion_login_completed',
  CHARTER_CREATION_STARTED: 'charter_creation_started',
  CHARTER_PUBLISHED: 'charter_published',
  MILESTONE_ADDED: 'milestone_added',
  MILESTONE_MARKED_COMPLETE: 'milestone_marked_complete',
  SUBMISSION_COMPLETED: 'submission_completed',

  // --- P1 마찰·품질 신호 ---
  MILESTONE_ISSUE_REPORTED: 'milestone_issue_reported',
  MILESTONE_DEADLINE_EXTENDED: 'milestone_deadline_extended',
  SUBMISSION_DECLINED_VIEWED: 'submission_declined_viewed',
  ONE_ON_ONE_BOOKED: 'one_on_one_booked',
  HOTLINE_MESSAGE_SENT: 'hotline_message_sent',
} as const

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]

// Supabase analytics_events 테이블에 dual-write 하는 이벤트 집합.
// P0 퍼널 6종 + milestone_issue_reported.
export const DUAL_WRITE_EVENTS: ReadonlySet<AnalyticsEventName> = new Set([
  AnalyticsEvent.CHAMPION_LOGIN_COMPLETED,
  AnalyticsEvent.CHARTER_CREATION_STARTED,
  AnalyticsEvent.CHARTER_PUBLISHED,
  AnalyticsEvent.MILESTONE_ADDED,
  AnalyticsEvent.MILESTONE_MARKED_COMPLETE,
  AnalyticsEvent.SUBMISSION_COMPLETED,
  AnalyticsEvent.MILESTONE_ISSUE_REPORTED,
])

// 이벤트별 property 타입 (호출부 타입 안전성용). 선택적 index로 유연성 유지.
export interface EventPropsMap {
  page_viewed: { route: string; title?: string }
  page_dwell: { route: string; duration_ms: number; active_ms: number }
  champion_login_completed: { is_new_user: boolean }
  charter_creation_started: Record<string, never>
  charter_published: { days_since_signup?: number }
  milestone_added: { method: 'manual' | 'ai'; count: number }
  milestone_marked_complete: { is_first_checkin: boolean }
  submission_completed: {
    type: 'file' | 'link'
    attempt_number: number
    is_resubmission: boolean
  }
  milestone_issue_reported: { bottleneck_type?: string }
  milestone_deadline_extended: Record<string, never>
  submission_declined_viewed: { attempt_number?: number }
  one_on_one_booked: { duration?: number; has_agenda: boolean }
  hotline_message_sent: Record<string, never>
}
