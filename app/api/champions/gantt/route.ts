import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { MilestoneStatus } from '@/lib/types'

export interface GanttMilestone {
  id: string
  title: string
  start_date: string | null
  due_date: string | null
  status: MilestoneStatus
  week_number: number | null
  parent_milestone_id: string | null
  display_order: number | null
  charter_submission_id: string | null
}

export interface GanttCharter {
  id: string
  title: string | null
  projectName: string | null
  milestones: GanttMilestone[]
}

export interface GanttChampion {
  userId: string
  name: string
  department: string
  charters: GanttCharter[]
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
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
    supabase
      .from('charter_submissions')
      .select('user_id, id, project_name, title'),
    supabase
      .from('milestones')
      .select('id, user_id, charter_submission_id, title, start_date, due_date, status, week_number, parent_milestone_id, display_order')
      .eq('publish_status', 'published')
      .order('week_number', { nullsFirst: false })
      .order('display_order'),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (chartersErr) return NextResponse.json({ error: chartersErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })

  // user_id → charter[]
  const chartersByUser = new Map<string, typeof charters[0][]>()
  for (const c of charters ?? []) {
    if (!chartersByUser.has(c.user_id)) chartersByUser.set(c.user_id, [])
    chartersByUser.get(c.user_id)!.push(c)
  }

  // charter_id → milestone[]
  const msByCharter = new Map<string, GanttMilestone[]>()
  const orphanMsByUser = new Map<string, GanttMilestone[]>()
  for (const m of milestones ?? []) {
    const ms: GanttMilestone = {
      id: m.id,
      title: m.title,
      start_date: m.start_date,
      due_date: m.due_date,
      status: m.status as MilestoneStatus,
      week_number: m.week_number,
      parent_milestone_id: m.parent_milestone_id ?? null,
      display_order: m.display_order ?? null,
      charter_submission_id: m.charter_submission_id ?? null,
    }
    if (m.charter_submission_id) {
      if (!msByCharter.has(m.charter_submission_id)) msByCharter.set(m.charter_submission_id, [])
      msByCharter.get(m.charter_submission_id)!.push(ms)
    } else {
      // charter FK 없는 레거시 milestone: user_id로 첫 번째 charter에 귀속
      if (!orphanMsByUser.has(m.user_id)) orphanMsByUser.set(m.user_id, [])
      orphanMsByUser.get(m.user_id)!.push(ms)
    }
  }

  const result: GanttChampion[] = (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const userCharters = chartersByUser.get(u.id) ?? []
    const orphans = orphanMsByUser.get(u.id) ?? []

    const charterRows: GanttCharter[] = userCharters.map((c, idx) => ({
      id: c.id,
      title: c.title ?? null,
      projectName: c.project_name ?? null,
      milestones: [
        ...msByCharter.get(c.id) ?? [],
        ...(idx === 0 ? orphans : []), // 레거시 orphan milestone은 첫 번째 charter에 귀속
      ],
    }))

    // charter가 없는 champion에게도 orphan milestone이 있으면 빈 charter row 생성
    if (charterRows.length === 0 && orphans.length > 0) {
      charterRows.push({ id: '__orphan__' + u.id, title: null, projectName: null, milestones: orphans })
    }

    return { userId: u.id, name: displayName, department, charters: charterRows }
  })

  return NextResponse.json(result)
}
