import { isRecapDraftErrorCode, type RecapDraftErrorCode } from '@/lib/recap/draftError'

const MESSAGES: Record<Exclude<RecapDraftErrorCode, 'unknown'>, string> = {
  channel_not_found: 'recap 채널을 찾지 못했어요. 채널 ID를 확인하고, 비공개 채널이면 채널에서 /invite @AX-1on1-Recap 으로 봇을 초대해 주세요.',
  not_in_channel: 'recap 봇이 채널에 없어요. 채널에서 /invite @AX-1on1-Recap 으로 봇을 초대해 주세요.',
  invalid_auth: 'recap 봇 토큰이 올바르지 않아요. 개발 담당자에게 토큰 확인을 요청해 주세요.',
  missing_scope: 'recap 봇에 필요한 권한이 없어요. 개발 담당자에게 Slack 앱 권한 확인을 요청해 주세요.',
  rate_limited: 'Slack 요청이 몰려서 잠시 막혔어요. 잠시 후 다시 올려 주세요.',
  slack_unavailable: 'Slack에 연결하지 못했어요. 잠시 후 다시 올려 주세요.',
}

export const RECAP_DRAFT_GENERIC_FAILURE = 'recap 초안을 Slack에 올리지 못했어요.'

/** 초안 게시 실패 원인 코드 -> 안내 문구. unknown/없음/모르는 값은 null (호출부가 일반 문구를 쓴다). */
export function recapDraftErrorMessage(code: string | null | undefined): string | null {
  if (!isRecapDraftErrorCode(code) || code === 'unknown') return null
  return MESSAGES[code]
}

/** POST /recap-draft 응답의 reason(+errorCode) -> 토스트 문구. */
export function recapRedraftReasonMessage(reason: string | null | undefined, errorCode?: string | null): string {
  switch (reason) {
    case 'already_sent': return '이미 챔피언에게 발송된 recap이에요.'
    case 'not_done': return '노트 처리가 끝났거나 노트가 입력된 세션에서만 올릴 수 있어요.'
    case 'not_configured': return 'recap 설정이 아직 없어요. 개발 담당자에게 확인을 요청해 주세요.'
    case 'not_found': return '세션을 찾지 못했어요.'
    case 'db_error': return 'recap 초안을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
    case 'slack_error': return recapDraftErrorMessage(errorCode) ?? RECAP_DRAFT_GENERIC_FAILURE
    default: return RECAP_DRAFT_GENERIC_FAILURE
  }
}
