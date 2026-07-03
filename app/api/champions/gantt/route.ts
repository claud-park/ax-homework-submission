import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
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
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
    supabase
      .from('charter_submissions')
      .select('user_id, id, project_name, title')
      .eq('publish_status', 'published'),
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

  // published charter ID 집합 — 이 목록에 없는 milestone은 표시하지 않음
  const publishedCharterIds = new Set(charters?.map(c => c.id) ?? [])

  // charter_id → milestone[] (published charter 소속만)
  const msByCharter = new Map<string, GanttMilestone[]>()
  for (const m of milestones ?? []) {
    if (!m.charter_submission_id || !publishedCharterIds.has(m.charter_submission_id)) continue
    const ms: GanttMilestone = {
      id: m.id,
      title: m.title,
      start_date: m.start_date,
      due_date: m.due_date,
      status: m.status as MilestoneStatus,
      week_number: m.week_number,
      parent_milestone_id: m.parent_milestone_id ?? null,
      display_order: m.display_order ?? null,
      charter_submission_id: m.charter_submission_id,
    }
    if (!msByCharter.has(m.charter_submission_id)) msByCharter.set(m.charter_submission_id, [])
    msByCharter.get(m.charter_submission_id)!.push(ms)
  }

  const result: GanttChampion[] = (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const userCharters = chartersByUser.get(u.id) ?? []

    const charterRows: GanttCharter[] = userCharters.map(c => ({
      id: c.id,
      title: c.title ?? null,
      projectName: c.project_name ?? null,
      milestones: msByCharter.get(c.id) ?? [],
    }))

    return { userId: u.id, name: displayName, department, charters: charterRows }
  })

  return NextResponse.json(result)
}
