import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { nudgeChampion } from '@/lib/notifications'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const results: { userId: string; name: string; nudgeType: string; ok: boolean }[] = []

  for (const user of champions) {
    const hasCharter = publishedCharterUserIds.has(user.id)
    const hasMilestone = milestoneUserIds.has(user.id)

    if (!hasCharter) {
      // 과제정의서 미제출
      try {
        await nudgeChampion({ user, nudgeType: 'no_charter' })
        results.push({ userId: user.id, name: user.name, nudgeType: 'no_charter', ok: true })
      } catch (e) {
        console.error(`[cron/daily-nudge] no_charter nudge failed for ${user.id}:`, e)
        results.push({ userId: user.id, name: user.name, nudgeType: 'no_charter', ok: false })
      }
    } else if (!hasMilestone) {
      // 과제정의서는 있지만 마일스톤 미등록
      try {
        await nudgeChampion({ user, nudgeType: 'no_milestone' })
        results.push({ userId: user.id, name: user.name, nudgeType: 'no_milestone', ok: true })
      } catch (e) {
        console.error(`[cron/daily-nudge] no_milestone nudge failed for ${user.id}:`, e)
        results.push({ userId: user.id, name: user.name, nudgeType: 'no_milestone', ok: false })
      }
    }
  }

  console.log('[cron/daily-nudge] done:', results)
  return NextResponse.json({ sent: results.length, results })
}
