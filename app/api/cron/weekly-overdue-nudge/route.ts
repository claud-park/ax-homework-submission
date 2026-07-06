import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { nudgeOverdueMilestones } from '@/lib/notifications'
import { findRecentNudge, recordNudge } from '@/lib/nudge/cooldown'
import { hasOverdueMilestone, kstTodayStr, type OverdueCandidate } from '@/lib/nudge/overdue'
import type { MilestoneStatus } from '@/lib/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 매주 월요일 10:30 KST(= 01:30 UTC, vercel.json cron "30 1 * * 1").
 * 지연/미완료(gantt 빨간 박스) 마일스톤이 있는 champion 에게 부드러운 넛지를 발송.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const todayStr = kstTodayStr()

  const { data: champions, error: usersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('user_group', 'champion')

  if (usersErr || !champions) {
    console.error('[cron/weekly-overdue-nudge] users fetch error:', usersErr)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  const { data: milestones, error: msErr } = await supabase
    .from('milestones')
    .select('user_id, status, start_date, due_date')
    .eq('publish_status', 'published')

  if (msErr) {
    console.error('[cron/weekly-overdue-nudge] milestones fetch error:', msErr)
    return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 })
  }

  // champion 별 마일스톤 그룹핑
  const byUser = new Map<string, OverdueCandidate[]>()
  for (const m of (milestones ?? []) as { user_id: string; status: MilestoneStatus; start_date: string | null; due_date: string | null }[]) {
    const list = byUser.get(m.user_id) ?? []
    list.push({ status: m.status, start_date: m.start_date, due_date: m.due_date })
    byUser.set(m.user_id, list)
  }

  const results: { userId: string; name: string; ok: boolean; skipped?: boolean }[] = []

  for (const user of champions) {
    const list = byUser.get(user.id) ?? []
    if (!hasOverdueMilestone(list, todayStr)) continue // 빨간 박스 없음 → 대상 아님

    // 쿨다운: 최근에 이미 보냈으면 건너뜀(크론 재실행 안전).
    if (await findRecentNudge(supabase, user.id, 'overdue_milestones')) {
      results.push({ userId: user.id, name: user.name, ok: true, skipped: true })
      continue
    }

    try {
      await nudgeOverdueMilestones({ user })
      await recordNudge(supabase, user.id, 'overdue_milestones', 'cron')
      results.push({ userId: user.id, name: user.name, ok: true })
    } catch (e) {
      console.error(`[cron/weekly-overdue-nudge] nudge failed for ${user.id}:`, e)
      results.push({ userId: user.id, name: user.name, ok: false })
    }
  }

  console.log('[cron/weekly-overdue-nudge] done:', { today: todayStr, results })
  return NextResponse.json({ today: todayStr, sent: results.filter(r => r.ok && !r.skipped).length, results })
}
