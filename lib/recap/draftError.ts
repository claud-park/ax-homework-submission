/**
 * recap 초안 게시 실패 원인 코드. DB(check_up_sessions.recap_draft_error)에는 이 코드만 저장한다.
 * (Slack 원본 메시지/토큰은 저장하지 않는다.)
 */
export type RecapDraftErrorCode =
  | 'channel_not_found'
  | 'not_in_channel'
  | 'invalid_auth'
  | 'missing_scope'
  | 'rate_limited'
  | 'slack_unavailable'
  | 'unknown'

const CODES: readonly string[] = [
  'channel_not_found',
  'not_in_channel',
  'invalid_auth',
  'missing_scope',
  'rate_limited',
  'slack_unavailable',
  'unknown',
]

export function isRecapDraftErrorCode(v: unknown): v is RecapDraftErrorCode {
  return typeof v === 'string' && CODES.includes(v)
}

const AUTH_ERRORS = ['invalid_auth', 'not_authed', 'account_inactive', 'token_revoked']

/**
 * @slack/web-api 오류 형태(errors.js 기준):
 * - 플랫폼 오류: code 'slack_webapi_platform_error', data.error 에 Slack 오류 문자열
 * - 요청/네트워크/타임아웃: 'slack_webapi_request_error', HTTP: 'slack_webapi_http_error'
 * - 속도 제한: 'slack_webapi_rate_limited_error'
 * throw 하지 않는다.
 */
export function classifyRecapDraftError(err: unknown): RecapDraftErrorCode {
  try {
    if (typeof err !== 'object' || err === null) return 'unknown'
    const e = err as { code?: unknown; data?: { error?: unknown } | null }
    switch (e.code) {
      case 'slack_webapi_platform_error': {
        const slackError = e.data?.error
        if (slackError === 'channel_not_found') return 'channel_not_found'
        if (slackError === 'not_in_channel') return 'not_in_channel'
        if (slackError === 'missing_scope') return 'missing_scope'
        if (slackError === 'ratelimited') return 'rate_limited'
        if (typeof slackError === 'string' && AUTH_ERRORS.includes(slackError)) return 'invalid_auth'
        return 'unknown'
      }
      case 'slack_webapi_rate_limited_error':
        return 'rate_limited'
      case 'slack_webapi_request_error':
      case 'slack_webapi_http_error':
        return 'slack_unavailable'
      default:
        return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}
