import { describe, it, expect } from 'vitest'
import { recapDraftErrorMessage, recapRedraftReasonMessage } from '@/lib/recap/draftErrorMessage'

const EXPECTED: Record<string, string> = {
  channel_not_found: 'recap 채널을 찾지 못했어요. 채널 ID를 확인하고, 비공개 채널이면 채널에서 /invite @AX-1on1-Recap 으로 봇을 초대해 주세요.',
  not_in_channel: 'recap 봇이 채널에 없어요. 채널에서 /invite @AX-1on1-Recap 으로 봇을 초대해 주세요.',
  invalid_auth: 'recap 봇 토큰이 올바르지 않아요. 개발 담당자에게 토큰 확인을 요청해 주세요.',
  missing_scope: 'recap 봇에 필요한 권한이 없어요. 개발 담당자에게 Slack 앱 권한 확인을 요청해 주세요.',
  rate_limited: 'Slack 요청이 몰려서 잠시 막혔어요. 잠시 후 다시 올려 주세요.',
  slack_unavailable: 'Slack에 연결하지 못했어요. 잠시 후 다시 올려 주세요.',
}

describe('recapDraftErrorMessage', () => {
  for (const [code, msg] of Object.entries(EXPECTED)) {
    it(`${code} -> 해요체 문구`, () => {
      expect(recapDraftErrorMessage(code)).toBe(msg)
    })
  }

  it('unknown / 없음 / 모르는 값은 null', () => {
    expect(recapDraftErrorMessage('unknown')).toBeNull()
    expect(recapDraftErrorMessage(undefined)).toBeNull()
    expect(recapDraftErrorMessage(null)).toBeNull()
    expect(recapDraftErrorMessage('')).toBeNull()
    expect(recapDraftErrorMessage('something_else')).toBeNull()
    expect(recapDraftErrorMessage('toString')).toBeNull()
  })
})

describe('recapRedraftReasonMessage', () => {
  it('고정 reason 문구', () => {
    expect(recapRedraftReasonMessage('already_sent')).toBe('이미 챔피언에게 발송된 recap이에요.')
    expect(recapRedraftReasonMessage('not_done')).toBe('노트 처리가 끝났거나 노트가 입력된 세션에서만 올릴 수 있어요.')
    expect(recapRedraftReasonMessage('not_configured')).toBe('recap 설정이 아직 없어요. 개발 담당자에게 확인을 요청해 주세요.')
    expect(recapRedraftReasonMessage('not_found')).toBe('세션을 찾지 못했어요.')
    expect(recapRedraftReasonMessage('db_error')).toBe('recap 초안을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
  })

  it('slack_error 는 코드 문구, 없거나 모르는 코드면 일반 문구', () => {
    expect(recapRedraftReasonMessage('slack_error', 'not_in_channel')).toBe(EXPECTED.not_in_channel)
    expect(recapRedraftReasonMessage('slack_error')).toBe('recap 초안을 Slack에 올리지 못했어요.')
    expect(recapRedraftReasonMessage('slack_error', 'unknown')).toBe('recap 초안을 Slack에 올리지 못했어요.')
  })

  it('모르는 reason 도 일반 문구', () => {
    expect(recapRedraftReasonMessage('weird')).toBe('recap 초안을 Slack에 올리지 못했어요.')
    expect(recapRedraftReasonMessage(undefined)).toBe('recap 초안을 Slack에 올리지 못했어요.')
  })
})
