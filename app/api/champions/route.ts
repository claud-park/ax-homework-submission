import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { ChampionSummary, MilestoneStatus } from '@/lib/types'

function aggregateWeekStatus(milestones: { status: MilestoneStatus }[]): MilestoneStatus {
  if (milestones.some(m => m.status === 'delayed')) return 'delayed'
  if (milestones.some(m => m.status === 'in_progress')) return 'in_progress'
  if (milestones.every(m => m.status === 'completed')) return 'completed'
  return 'not_started'
}

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('charter_submissions').select('user_id, id, project_name, publish_status'),
    supabase.from('milestones').select('user_id, week_number, status').eq('publish_status', 'published'),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (chartersErr) return NextResponse.json({ error: chartersErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })

  const charterMap = new Map<string, NonNullable<typeof charters>[number]>()
  for (const c of charters ?? []) charterMap.set(c.user_id, c)

  const milestonesByUser = new Map<string, Map<number, { status: MilestoneStatus }[]>>()
  for (const m of milestones ?? []) {
    if (!milestonesByUser.has(m.user_id)) milestonesByUser.set(m.user_id, new Map())
    const byWeek = milestonesByUser.get(m.user_id)!
    if (!byWeek.has(m.week_number)) byWeek.set(m.week_number, [])
    byWeek.get(m.week_number)!.push({ status: m.status as MilestoneStatus })
  }

  const result: ChampionSummary[] = (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const charter = charterMap.get(u.id)
    const byWeek = milestonesByUser.get(u.id) ?? new Map<number, { status: MilestoneStatus }[]>()
    const weeklyStatus: Record<number, MilestoneStatus> = {}
    byWeek.forEach((mss, week) => {
      weeklyStatus[week] = aggregateWeekStatus(mss)
    })
    return {
      userId: u.id,
      name: displayName,
      department,
      projectName: charter?.project_name ?? null,
      charterStatus: (charter?.publish_status as ChampionSummary['charterStatus']) ?? null,
      charterSubmissionId: charter?.id ?? null,
      weeklyStatus,
    }
  })

  return NextResponse.json(result)
}
