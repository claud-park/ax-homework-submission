import { HttpError, isTransientError } from '@/lib/sessions/retry'

export class AuthError extends Error {
  constructor(message = 'auth') {
    super(message)
    this.name = 'AuthError'
  }
}

export type FailureKind = 'network' | 'auth' | 'server'

const NETWORK_MESSAGE =
  '네트워크 연결이 끊겨 처리가 중단됐어요. 녹음은 이 기기에 보관돼 있어요. 연결되면 [다시 시도]를 눌러 주세요.'
const AUTH_MESSAGE =
  '로그인이 만료됐어요. 새로고침 후 다시 로그인해 주세요. 녹음은 이 기기에 보관돼 있어요.'
const SERVER_FALLBACK_MESSAGE =
  '서버에서 처리하지 못했어요. [다시 시도]하거나 세션 화면에서 상태를 확인하세요.'

export function classifyFailure(
  err: unknown,
  online: boolean,
): { kind: FailureKind; message: string } {
  // 오프라인이면 원인과 무관하게 네트워크 문제로 본다 (인증 문제로 단정하지 않는다).
  if (!online) return { kind: 'network', message: NETWORK_MESSAGE }
  if (err instanceof AuthError) return { kind: 'auth', message: AUTH_MESSAGE }
  // 재시도가 소진된 5xx HttpError는 서버 문제로 분류한다.
  if (!(err instanceof HttpError) && isTransientError(err)) {
    return { kind: 'network', message: NETWORK_MESSAGE }
  }
  const message = err instanceof Error && err.message ? err.message : SERVER_FALLBACK_MESSAGE
  return { kind: 'server', message }
}
