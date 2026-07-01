'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { AnalyticsEvent } from './events'
import { normalizeRoute } from './route'
import { track } from './index'

export { normalizeRoute }

// page_viewed / page_dwell 계측 훅.
// - 라우트 진입 시 page_viewed
// - 라우트 이탈 / 탭 숨김 / 언로드 시 page_dwell (duration_ms, active_ms)
export function usePageTracking(): void {
  const pathname = usePathname()

  // 현재 라우트의 계측 상태 (ref 로 유지, dwell flush 는 한 번만)
  const stateRef = useRef<{
    route: string
    enteredAt: number
    activeAccum: number // 탭 활성 상태로 누적된 시간(ms)
    lastActiveAt: number | null // 현재 활성 구간 시작 시각(숨김이면 null)
    flushed: boolean
  } | null>(null)

  useEffect(() => {
    const route = normalizeRoute(pathname)
    const now = Date.now()
    const state = {
      route,
      enteredAt: now,
      activeAccum: 0,
      lastActiveAt: document.visibilityState === 'visible' ? now : null,
      flushed: false,
    }
    stateRef.current = state

    track(AnalyticsEvent.PAGE_VIEWED, { route, title: document.title })

    const flushDwell = () => {
      const s = stateRef.current
      if (!s || s.flushed) return
      s.flushed = true
      const end = Date.now()
      // 활성 구간이 열려 있으면 마감
      let active = s.activeAccum
      if (s.lastActiveAt != null) active += end - s.lastActiveAt
      track(AnalyticsEvent.PAGE_DWELL, {
        route: s.route,
        duration_ms: end - s.enteredAt,
        active_ms: active,
      })
    }

    const onVisibility = () => {
      const s = stateRef.current
      if (!s) return
      if (document.visibilityState === 'hidden') {
        // 활성 구간 마감 + 누적
        if (s.lastActiveAt != null) {
          s.activeAccum += Date.now() - s.lastActiveAt
          s.lastActiveAt = null
        }
        // 탭 숨김도 dwell 신호로 flush (모바일 백그라운드 대비)
        flushDwell()
      } else {
        // 다시 활성 → 구간 재시작. 새 dwell 세션으로 취급하려면 재진입 필요하므로
        // 여기서는 활성 누적만 재개 (page_viewed 재발화는 하지 않음)
        if (!s.flushed) s.lastActiveAt = Date.now()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushDwell)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushDwell)
      // 라우트 변경(언마운트) 시 dwell flush
      flushDwell()
    }
  }, [pathname])
}
