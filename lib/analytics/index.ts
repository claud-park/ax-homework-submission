'use client'

import {
  initMixpanel,
  mpTrack,
  mpIdentify,
  mpPeopleSet,
  mpRegister,
  mpReset,
} from './client'
import { dualWrite } from './dual-write'
import {
  AnalyticsEvent,
  DUAL_WRITE_EVENTS,
  type AnalyticsEventName,
  type EventPropsMap,
} from './events'

export { AnalyticsEvent, initMixpanel }
export type { AnalyticsEventName, EventPropsMap }
export { usePageTracking, normalizeRoute } from './use-page-tracking'

// 공개 track: Mixpanel 전송 + (대상 이벤트면) Supabase dual-write.
// 타입 안전: 이벤트명에 맞는 props 만 허용.
export function track<E extends AnalyticsEventName>(
  event: E,
  props?: E extends keyof EventPropsMap ? EventPropsMap[E] : Record<string, unknown>,
): void {
  const p = props as Record<string, unknown> | undefined
  mpTrack(event, p)
  if (DUAL_WRITE_EVENTS.has(event)) {
    dualWrite(event, p)
  }
}

export interface ChampionIdentity {
  userId: string
  email?: string | null
  userGroup?: string | null
  isAdmin: boolean
}

// 로그인 세션 확보 후 1회: identify + person props + super props.
export function identifyChampion(identity: ChampionIdentity): void {
  const role = identity.isAdmin ? 'admin' : 'champion'
  mpIdentify(identity.userId)
  mpPeopleSet({
    $email: identity.email ?? undefined,
    email: identity.email ?? undefined,
    user_group: identity.userGroup ?? undefined,
    role,
  })
  mpRegister({
    role,
    user_group: identity.userGroup ?? undefined,
    is_admin: identity.isAdmin,
  })
}

export function resetAnalytics(): void {
  mpReset()
}
