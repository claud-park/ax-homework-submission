'use client'

import { useEffect } from 'react'
import { initMixpanel } from '@/lib/analytics'

// Root layout 에 마운트. Mixpanel 초기화만 담당(토큰 없으면 no-op).
export function AnalyticsProvider() {
  useEffect(() => {
    initMixpanel()
  }, [])
  return null
}
