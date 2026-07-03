import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { nudgeChampion } from '@/lib/notifications'
import { requireAdmin } from '@/lib/api/guard'

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

  try {
    await nudgeChampion({ user: userData, nudgeType, milestoneTitle })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[nudge] email send failed:', e)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
