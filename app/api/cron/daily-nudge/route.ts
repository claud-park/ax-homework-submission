import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { nudgeChampion } from '@/lib/notifications'
import { findRecentNudge, recordNudge } from '@/lib/nudge/cooldown'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 주말(토/일, KST 기준)에는 발송하지 않음. cron은 UTC(05:00 = KST 14:00)로 실행되므로 KST 요일로 판단
  const kstWeekday = new Date().toLocaleDateString('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  })
  if (kstWeekday === 'Sat' || kstWeekday === 'Sun') {
    console.log(`[cron/daily-nudge] skipped: weekend (${kstWeekday})`)
    return NextResponse.json({ skipped: true, reason: 'weekend', weekday: kstWeekday })
  }

  const supabase = createServiceClient()

  // user_group = 'champion' 인 유저만 조회
  const { data: champions, error: usersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('user_group', 'champion')

  if (usersErr || !champions) {
    console.error('[cron/daily-nudge] users fetch error:', usersErr)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  // 게시된 과제정의서 & 등록된 마일스톤 현황
  const [chartersResult, milestonesResult] = await Promise.all([
    supabase
      .from('charter_submissions')
      .select('user_id')
      .eq('publish_status', 'published'),
    supabase
      .from('milestones')
      .select('user_id')
      .eq('publish_status', 'published'),
  ])

  const publishedCharterUserIds = new Set(
    (chartersResult.data ?? []).map(c => c.user_id)
  )
  const milestoneUserIds = new Set(
    (milestonesResult.data ?? []).map(m => m.user_id)
  )

  const results: { userId: string; name: string; nudgeType: string; ok: boolean; skipped?: boolean }[] = []

  for (const user of champions) {
    const hasCharter = publishedCharterUserIds.has(user.id)
    const hasMilestone = milestoneUserIds.has(user.id)

    // 미제출 → no_charter, 과제정의서는 있지만 마일스톤 미등록 → no_milestone
    const nudgeType = !hasCharter ? 'no_charter' : !hasMilestone ? 'no_milestone' : null
    if (!nudgeType) continue

    // 쿨다운: 최근(수동/크론 포함)에 이미 같은 넛지를 보냈으면 건너뜀(중복 방지·크론 재실행 안전).
    if (await findRecentNudge(supabase, user.id, nudgeType)) {
      results.push({ userId: user.id, name: user.name, nudgeType, ok: true, skipped: true })
      continue
    }

    try {
      await nudgeChampion({ user, nudgeType })
      await recordNudge(supabase, user.id, nudgeType, 'cron')
      results.push({ userId: user.id, name: user.name, nudgeType, ok: true })
    } catch (e) {
      console.error(`[cron/daily-nudge] ${nudgeType} nudge failed for ${user.id}:`, e)
      results.push({ userId: user.id, name: user.name, nudgeType, ok: false })
    }
  }

  console.log('[cron/daily-nudge] done:', results)
  return NextResponse.json({ sent: results.length, results })
}
