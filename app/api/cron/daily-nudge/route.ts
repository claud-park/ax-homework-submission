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

  // admin 유저 ID 수집 (auth.users metadata 기준)
  const { data: authUsers, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) {
    console.error('[cron/daily-nudge] auth.listUsers error:', authErr)
    return NextResponse.json({ error: 'Failed to fetch auth users' }, { status: 500 })
  }
  const adminIds = new Set(
    authUsers.users
      .filter(u => !!u.user_metadata?.is_admin)
      .map(u => u.id)
  )

  // 모든 champion 유저 조회 (admin 제외)
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, email, name')

  if (usersErr || !users) {
    console.error('[cron/daily-nudge] users fetch error:', usersErr)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  const champions = users.filter(u => !adminIds.has(u.id))

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
