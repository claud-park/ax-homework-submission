export interface RetryOptions {
  /** 총 시도 횟수 (기본 3). */
  attempts?: number
  /** 첫 재시도 지연(ms). 지수 백오프로 base * 2^i (기본 400). */
  baseDelayMs?: number
  /** 각 실패 시 호출 (로깅용). attempt 는 1-based. */
  onRetry?: (err: unknown, attempt: number) => void
}

/**
 * fn 을 실패 시 지수 백오프로 재시도한다. 마지막 시도까지 실패하면 마지막 에러를 던진다.
 * 성공하면 즉시 결과를 반환한다 (재시도 없음).
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3
  const base = opts.baseDelayMs ?? 400
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      opts.onRetry?.(err, i + 1)
      if (i < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, base * 2 ** i))
      }
    }
  }
  throw lastErr
}
