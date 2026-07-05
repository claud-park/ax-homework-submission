'use client'

import mixpanel from 'mixpanel-browser'

// NEXT_PUBLIC_MIXPANEL_TOKEN 미설정 시 전부 no-op.
// (개발/CI/프리뷰에서 크래시·콘솔 에러 없이 조용히 비활성화)
const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN

let initialized = false

export function isEnabled(): boolean {
  return Boolean(TOKEN) && initialized
}

export function initMixpanel(): void {
  if (initialized) return
  if (!TOKEN) return
  if (typeof window === 'undefined') return

  mixpanel.init(TOKEN, {
    persistence: 'localStorage',
    // SPA — 자동 pageview 비활성화. usePageTracking 훅으로 직접 계측.
    track_pageview: false,
    // beforeunload/pagehide 유실 방지
    api_transport: 'sendBeacon',
    ignore_dnt: false,
  })
  initialized = true
}

export function mpTrack(
  event: string,
  props?: Record<string, unknown>,
): void {
  if (!isEnabled()) return
  try {
    mixpanel.track(event, props)
  } catch {
    // 트래킹 실패는 UX에 영향 주지 않음
  }
}

export function mpIdentify(distinctId: string): void {
  if (!isEnabled()) return
  try {
    mixpanel.identify(distinctId)
  } catch {
    /* no-op */
  }
}

export function mpPeopleSet(props: Record<string, unknown>): void {
  if (!isEnabled()) return
  try {
    mixpanel.people.set(props)
  } catch {
    /* no-op */
  }
}

export function mpRegister(props: Record<string, unknown>): void {
  if (!isEnabled()) return
  try {
    mixpanel.register(props)
  } catch {
    /* no-op */
  }
}

export function mpReset(): void {
  if (!isEnabled()) return
  try {
    mixpanel.reset()
  } catch {
    /* no-op */
  }
}
