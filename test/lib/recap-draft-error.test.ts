import { describe, it, expect } from 'vitest'
import { classifyRecapDraftError, isRecapDraftErrorCode } from '@/lib/recap/draftError'

const platform = (error: string) => ({ code: 'slack_webapi_platform_error', data: { ok: false, error } })

describe('classifyRecapDraftError', () => {
  it.each([
    ['channel_not_found', 'channel_not_found'],
    ['not_in_channel', 'not_in_channel'],
    ['invalid_auth', 'invalid_auth'],
    ['not_authed', 'invalid_auth'],
    ['account_inactive', 'invalid_auth'],
    ['token_revoked', 'invalid_auth'],
    ['missing_scope', 'missing_scope'],
    ['ratelimited', 'rate_limited'],
    ['something_else', 'unknown'],
  ])('platform error %s -> %s', (slack, code) => {
    expect(classifyRecapDraftError(platform(slack))).toBe(code)
  })

  it.each(['slack_webapi_request_error', 'slack_webapi_http_error'])('%s -> slack_unavailable', (code) => {
    expect(classifyRecapDraftError({ code, message: 'x' })).toBe('slack_unavailable')
  })

  it('rate limited SDK error -> rate_limited', () => {
    expect(classifyRecapDraftError({ code: 'slack_webapi_rate_limited_error', retryAfter: 3 })).toBe('rate_limited')
  })

  it('returns unknown for odd values without throwing', () => {
    const thrower = {
      get code(): string {
        throw new Error('boom')
      },
    }
    for (const v of [null, undefined, 'channel_not_found', 42, new Error('x'), {}, thrower]) {
      expect(classifyRecapDraftError(v)).toBe('unknown')
    }
  })
})

describe('isRecapDraftErrorCode', () => {
  it.each([
    ['channel_not_found', true],
    ['not_in_channel', true],
    ['invalid_auth', true],
    ['missing_scope', true],
    ['rate_limited', true],
    ['slack_unavailable', true],
    ['unknown', true],
    ['ratelimited', false],
    ['stt_quota', false],
    ['', false],
    [null, false],
    [undefined, false],
    [1, false],
  ])('%s -> %s', (v, expected) => {
    expect(isRecapDraftErrorCode(v)).toBe(expected)
  })
})
