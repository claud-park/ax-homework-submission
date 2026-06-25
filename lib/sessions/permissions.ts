export type SessionRole = 'admin' | 'owner'

/** 세션(check_up_sessions) UPDATE 시 role별 허용 컬럼 화이트리스트 */
export function allowedSessionUpdateFields(role: SessionRole): readonly string[] {
  return role === 'admin' ? ['title', 'notes', 'session_date'] : ['notes']
}

/** 액션 아이템 UPDATE 시 role별 허용 컬럼 화이트리스트 (champion은 reorder 불가) */
export function allowedActionItemUpdateFields(role: SessionRole): readonly string[] {
  return role === 'admin' ? ['body', 'display_order', 'is_completed'] : ['body', 'is_completed']
}
