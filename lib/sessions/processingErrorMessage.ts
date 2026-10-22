import { isProcessingErrorCode, type ProcessingErrorCode } from '@/lib/sessions/processingError'

// 주의: 이 문구는 classifyFailure/isTransientError 를 거친다. "network", "fetch", "load failed" 같은
// 단어를 넣으면 네트워크 오류로 오분류되므로 쓰지 않는다 (테스트로 고정).
const MESSAGES: Record<Exclude<ProcessingErrorCode, 'unknown'>, string> = {
  stt_quota: '음성 전사(OpenAI) 크레딧이 부족해서 처리하지 못했어요. 크레딧을 충전한 뒤 [재처리]해 주세요.',
  stt_rate_limited: '음성 전사 요청이 몰려서 잠시 막혔어요. 잠시 후 [재처리]해 주세요.',
  stt_auth: '음성 전사 API 인증에 실패했어요. API 키를 확인해 달라고 개발 담당자에게 알려 주세요.',
  summary_quota: '요약(Claude) 크레딧이 부족해서 처리하지 못했어요. 크레딧을 충전한 뒤 [재처리]해 주세요.',
  summary_auth: '요약 API 인증에 실패했어요. API 키를 확인해 달라고 개발 담당자에게 알려 주세요.',
  upstream_unavailable: 'AI 서비스에 연결하지 못했어요. 잠시 후 [재처리]해 주세요.',
  summary_parse: '요약 결과를 읽지 못했어요. 전사 원문은 노트에 남겨 뒀어요. [재처리]해 주세요.',
}

/** 처리 실패 원인 코드 -> 안내 문구. unknown/없음/모르는 값은 null (호출부가 기존 문구를 쓴다). */
export function processingErrorMessage(code: string | null | undefined): string | null {
  if (!isProcessingErrorCode(code) || code === 'unknown') return null
  return MESSAGES[code]
}
