import { describe, it, expect } from 'vitest'
import { processingErrorMessage } from '@/lib/sessions/processingErrorMessage'
import { classifyFailure } from '@/lib/sessions/uploadErrors'
import { isTransientError } from '@/lib/sessions/retry'

const EXPECTED: Record<string, string> = {
  stt_quota: '음성 전사(OpenAI) 크레딧이 부족해서 처리하지 못했어요. 크레딧을 충전한 뒤 [재처리]해 주세요.',
  stt_rate_limited: '음성 전사 요청이 몰려서 잠시 막혔어요. 잠시 후 [재처리]해 주세요.',
  stt_auth: '음성 전사 API 인증에 실패했어요. API 키를 확인해 달라고 개발 담당자에게 알려 주세요.',
  summary_quota: '요약(Claude) 크레딧이 부족해서 처리하지 못했어요. 크레딧을 충전한 뒤 [재처리]해 주세요.',
  summary_auth: '요약 API 인증에 실패했어요. API 키를 확인해 달라고 개발 담당자에게 알려 주세요.',
  upstream_unavailable: 'AI 서비스에 연결하지 못했어요. 잠시 후 [재처리]해 주세요.',
  summary_parse: '요약 결과를 읽지 못했어요. 전사 원문은 노트에 남겨 뒀어요. [재처리]해 주세요.',
}

describe('processingErrorMessage', () => {
  for (const [code, msg] of Object.entries(EXPECTED)) {
    it(`${code} -> 해요체 문구`, () => {
      expect(processingErrorMessage(code)).toBe(msg)
    })
  }

  it('unknown / 없음 / 모르는 값은 null', () => {
    expect(processingErrorMessage('unknown')).toBeNull()
    expect(processingErrorMessage(undefined)).toBeNull()
    expect(processingErrorMessage(null)).toBeNull()
    expect(processingErrorMessage('')).toBeNull()
    expect(processingErrorMessage('something_else')).toBeNull()
    expect(processingErrorMessage('toString')).toBeNull()
  })

  it('classifyFailure 가 원인 문구를 그대로 보여 주고 network 로 분류하지 않는다', () => {
    for (const msg of Object.values(EXPECTED)) {
      const err = new Error(msg)
      expect(isTransientError(err)).toBe(false)
      expect(classifyFailure(err, true)).toEqual({ kind: 'server', message: msg })
    }
  })
})
