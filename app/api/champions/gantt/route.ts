import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { MilestoneStatus } from '@/lib/types'

export interface GanttMilestone {
  id: string
  title: string
  start_date: string
  due_date: string
  status: MilestoneStatus
  week_number: number
  parent_milestone_id: string | null
}

export interface GanttChampion {
  userId: string
  name: string
  department: string
  projectName: string | null
  charterSubmissionId: string | null
  milestones: GanttMilestone[]
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
    supabase
      .from('charter_submissions')
      .select('user_id, id, project_name'),
    supabase
      .from('milestones')
      .select('id, user_id, title, start_date, due_date, status, week_number, parent_milestone_id')
      .eq('publish_status', 'published')
      .not('start_date', 'is', null)
      .not('due_date', 'is', null)
      .order('week_number')
      .order('display_order'),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (chartersErr) return NextResponse.json({ error: chartersErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })
  const charterMap = new Map<string, { id: string; project_name: string | null }>()
  for (const c of charters ?? []) charterMap.set(c.user_id, c)

  const msMap = new Map<string, GanttMilestone[]>()
  for (const m of milestones ?? []) {
    if (!msMap.has(m.user_id)) msMap.set(m.user_id, [])
    msMap.get(m.user_id)!.push({
      id: m.id,
      title: m.title,
      start_date: m.start_date,
      due_date: m.due_date,
      status: m.status as MilestoneStatus,
      week_number: m.week_number,
      parent_milestone_id: m.parent_milestone_id ?? null,
    })
  }

  const result: GanttChampion[] = (users ?? [])
    .map(u => {
      const { displayName, department } = parseName(u.name)
      const charter = charterMap.get(u.id)
      return {
        userId: u.id,
        name: displayName,
        department,
        projectName: charter?.project_name ?? null,
        charterSubmissionId: charter?.id ?? null,
        milestones: msMap.get(u.id) ?? [],
      }
    })
    .filter(c => c.milestones.length > 0)

  return NextResponse.json(result)
}
