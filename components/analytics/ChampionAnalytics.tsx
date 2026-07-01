'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  AnalyticsEvent,
  identifyChampion,
  track,
  usePageTracking,
} from '@/lib/analytics'

interface Props {
  userId: string
  email?: string | null
  userGroup?: string | null
  isAdmin: boolean
}

const LOGIN_TRACKED_KEY = 'champion_login_tracked'

// (champion) layout 에 마운트. 서버에서 확보한 user 정보를 prop 으로 받아:
// - identify + super props
// - champion_login_completed (로그인당 1회)
// - page_viewed / page_dwell 계측
export function ChampionAnalytics({ userId, email, userGroup, isAdmin }: Props) {
  usePageTracking()

  const searchParams = useSearchParams()

  useEffect(() => {
    identifyChampion({ userId, email, userGroup, isAdmin })

    // 로그인 완료는 세션당 1회만. sessionStorage 로 중복 발화 방지.
    if (typeof window !== 'undefined') {
      const already = sessionStorage.getItem(LOGIN_TRACKED_KEY)
      if (!already) {
        sessionStorage.setItem(LOGIN_TRACKED_KEY, '1')
        track(AnalyticsEvent.CHAMPION_LOGIN_COMPLETED, {
          is_new_user: searchParams.get('new') === '1',
        })
      }
    }
    // identity 는 마운트 시 1회 확정. searchParams 변화로 재발화하지 않음.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAdmin])

  return null
}
