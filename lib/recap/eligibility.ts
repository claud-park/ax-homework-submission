/**
 * recap 초안 게시·발송이 가능한 세션인가.
 * - 오디오 처리가 끝난 세션('done')
 * - 녹음 없이 노트만 직접 올린 세션: 처리 상태가 'idle'이고 노트가 비어 있지 않을 때
 * 처리 중(uploading/transcribing/summarizing), error, low_quality는 불가.
 */
export function isRecapEligible(session: { processing_status?: string | null; notes?: string | null }): boolean {
  if (session.processing_status === 'done') return true
  return session.processing_status === 'idle' && !!session.notes?.trim()
}
