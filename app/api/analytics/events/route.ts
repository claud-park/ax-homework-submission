import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { DUAL_WRITE_EVENTS, type AnalyticsEventName } from '@/lib/analytics/events'

// 핵심 전환 이벤트 dual-write 수신부. 클라이언트 track() 이 대상 이벤트일 때 호출.
export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { event_name, properties } = await req.json().catch(() => ({}))

  // 허용된 dual-write 이벤트만 적재(임의 이벤트 쓰기 방지).
  if (!event_name || !DUAL_WRITE_EVENTS.has(event_name as AnalyticsEventName)) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  }

  const props =
    properties && typeof properties === 'object' && !Array.isArray(properties)
      ? properties
      : {}

  const supabase = createServiceClient()
  const { error } = await supabase.from('analytics_events').insert({
    user_id: user.id,
    event_name,
    properties: props,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true }, { status: 201 })
}
