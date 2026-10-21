import { waitForOnline } from '@/lib/sessions/retry'
import type { CheckUpSession, SessionActionItem, SessionProcessingStatus } from '@/lib/types'

export type PolledSession = CheckUpSession & { action_items?: SessionActionItem[] }

const TERMINAL: SessionProcessingStatus[] = ['done', 'low_quality', 'error']

export function isTerminalStatus(status: SessionProcessingStatus): boolean {
  return TERMINAL.includes(status)
}

/**
 * /process 또는 /reprocess 가 202 를 반환한 뒤, GET /api/sessions/[sessionId] 의
 * processing_status 를 폴링해 처리가 끝날 때까지 기다린다.
 *
 * - getToken: 매 요청에 쓸 access token 반환(만료 대비 refresh 포함 권장).
 * - onStatus: 폴링마다 현재 status 를 콜백(진행 표시용).
 * - terminal 상태(done/low_quality/error)에 도달하면 그 세션을 resolve.
 * - timeoutMs 초과 시 throw(서버 킬로 status 가 stuck 된 경우의 백스톱).
 * - fetch 가 throw(네트워크 단절)해도 포기하지 않고 계속 폴링하며, 단절된 시간은
 *   타임아웃 시계에서 제외한다. 연결 상태 전이 시 onConnection 을 호출한다.
 */
export async function pollProcessing(
  sessionId: string,
  getToken: () => Promise<string | null>,
  onStatus: (status: SessionProcessingStatus) => void,
  opts: { intervalMs?: number; timeoutMs?: number; onConnection?: (connected: boolean) => void } = {},
): Promise<PolledSession> {
  const interval = opts.intervalMs ?? 2500
  const timeout = opts.timeoutMs ?? 320_000
  const start = Date.now()
  let disconnectedMs = 0
  let disconnectedAt: number | null = null

  for (;;) {
    // 단절 중에는 타임아웃을 판정하지 않는다(단절 시간은 시계에서 제외).
    if (disconnectedAt === null && Date.now() - start - disconnectedMs > timeout) {
      throw new Error('처리 시간이 초과됐습니다. 잠시 후 새로고침해 상태를 확인하세요.')
    }
    await new Promise(resolve => setTimeout(resolve, interval))

    const token = await getToken()
    let res: Response
    try {
      res = await fetch(`/api/sessions/${sessionId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
    } catch {
      if (disconnectedAt === null) {
        disconnectedAt = Date.now()
        opts.onConnection?.(false)
      }
      await waitForOnline()
      continue
    }
    if (disconnectedAt !== null) {
      disconnectedMs += Date.now() - disconnectedAt
      disconnectedAt = null
      opts.onConnection?.(true)
    }
    if (!res.ok) continue // 401/일시 오류는 타임아웃까지 재시도

    const data = (await res.json()) as PolledSession
    onStatus(data.processing_status)
    if (isTerminalStatus(data.processing_status)) return data
  }
}
