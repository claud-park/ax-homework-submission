export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

const NETWORK_MESSAGE = /failed to fetch|network|load failed/i

export function isTransientError(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status === 408 || err.status === 429 || err.status >= 500
  }
  if (err instanceof TypeError) return true
  if (err instanceof Error) return NETWORK_MESSAGE.test(err.message)
  return false
}

export function waitForOnline(): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve()
  return new Promise((resolve) => {
    window.addEventListener('online', () => resolve(), { once: true })
  })
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const { attempts = 5, baseMs = 1000, sleep = defaultSleep } = opts
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (!isTransientError(err)) throw err
      // 오프라인 중 실패는 시도 횟수에 세지 않고 복구를 기다린 뒤 재시도한다.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await waitForOnline()
        continue
      }
      attempt++
      if (attempt >= attempts) throw err
      await sleep(baseMs * 2 ** (attempt - 1))
    }
  }
}
