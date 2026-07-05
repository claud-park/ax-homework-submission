'use client'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { AnalyticsEventName } from './events'

// P0/핵심 이벤트를 Supabase analytics_events 테이블에 fire-and-forget 로 적재.
// 실패는 무시(트래킹은 UX 크리티컬 경로가 아님).
export function dualWrite(
  event: AnalyticsEventName,
  props?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return

  void (async () => {
    try {
      const supabase = createSupabaseBrowserClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      const body = JSON.stringify({ event_name: event, properties: props ?? {} })

      // 언로드 중이면 sendBeacon 으로 유실 방지. 단, 인증 토큰을 헤더로 못 실으므로
      // beacon 은 토큰을 쿼리로 넘기지 않도록 fetch(keepalive) 를 우선 사용.
      await fetch('/api/analytics/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body,
        keepalive: true,
      })
    } catch {
      /* no-op */
    }
  })()
}
