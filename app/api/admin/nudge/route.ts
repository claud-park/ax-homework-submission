import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { nudgeChampion } from '@/lib/notifications'
import { requireAdmin } from '@/lib/api/guard'
import { findRecentNudge, recordNudge, hoursUntilNextNudge } from '@/lib/nudge/cooldown'

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  let body: { userId?: string; nudgeType?: 'no_charter' | 'no_milestone' | 'delayed_milestone'; milestoneTitle?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, nudgeType, milestoneTitle } = body

  if (!userId || !nudgeType) {
    return NextResponse.json({ error: 'userId and nudgeType are required' }, { status: 400 })
  }
  if (nudgeType === 'delayed_milestone' && !milestoneTitle) {
    return NextResponse.json({ error: 'milestoneTitle is required for delayed_milestone' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('id', userId)
    .single()

  if (userErr || !userData) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // 쿨다운: 같은 (user, type) 을 최근에 넛지했으면 재발송 차단(스팸 방지).
  const recent = await findRecentNudge(supabase, userId, nudgeType)
  if (recent) {
    const retryAfterH = hoursUntilNextNudge(recent, new Date())
    return NextResponse.json(
      { error: `이미 최근에 알림을 보냈어요. 약 ${retryAfterH}시간 후 다시 보낼 수 있어요.`, retryAfterH },
      { status: 429 },
    )
  }

  try {
    await nudgeChampion({ user: userData, nudgeType, milestoneTitle })
    await recordNudge(supabase, userId, nudgeType, 'manual')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[nudge] email send failed:', e)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
