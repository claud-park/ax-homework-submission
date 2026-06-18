import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { GanttChampion, GanttMilestone } from '@/app/api/champions/gantt/route'
import type { ChampionSummary, MilestoneStatus } from '@/lib/types'

export async function fetchGanttData(): Promise<GanttChampion[]> {
  const supabase = createServiceClient()
  const [
    { data: users },
    { data: charters },
    { data: milestones },
  ] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
    supabase.from('charter_submissions').select('user_id, id, project_name, title'),
    supabase.from('milestones')
      .select('id, user_id, charter_submission_id, title, start_date, due_date, status, week_number, parent_milestone_id, display_order')
      .eq('publish_status', 'published')
      .order('week_number', { nullsFirst: false })
      .order('display_order'),
  ])

  // user_id → charter[]
  const chartersByUser = new Map<string, NonNullable<typeof charters>[0][]>()
  for (const c of charters ?? []) {
    if (!chartersByUser.has(c.user_id)) chartersByUser.set(c.user_id, [])
    chartersByUser.get(c.user_id)!.push(c)
  }

  // charter_id → milestone[]
  const msByCharter = new Map<string, GanttMilestone[]>()
  const orphanMsByUser = new Map<string, GanttMilestone[]>()
  for (const m of milestones ?? []) {
    const ms: GanttMilestone = {
      id: m.id, title: m.title, start_date: m.start_date, due_date: m.due_date,
      status: m.status as MilestoneStatus, week_number: m.week_number,
      parent_milestone_id: m.parent_milestone_id ?? null,
      display_order: m.display_order ?? null,
      charter_submission_id: m.charter_submission_id ?? null,
    }
    if (m.charter_submission_id) {
      if (!msByCharter.has(m.charter_submission_id)) msByCharter.set(m.charter_submission_id, [])
      msByCharter.get(m.charter_submission_id)!.push(ms)
    } else {
      if (!orphanMsByUser.has(m.user_id)) orphanMsByUser.set(m.user_id, [])
      orphanMsByUser.get(m.user_id)!.push(ms)
    }
  }

  return (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const userCharters = chartersByUser.get(u.id) ?? []
    const orphans = orphanMsByUser.get(u.id) ?? []

    const charterRows = userCharters.map((c, idx) => ({
      id: c.id,
      title: c.title ?? null,
      projectName: c.project_name ?? null,
      milestones: [
        ...(msByCharter.get(c.id) ?? []),
        ...(idx === 0 ? orphans : []),
      ],
    }))

    if (charterRows.length === 0 && orphans.length > 0) {
      charterRows.push({ id: '__orphan__' + u.id, title: null, projectName: null, milestones: orphans })
    }

    return { userId: u.id, name: displayName, department, charters: charterRows }
  })
}

export async function fetchSummaryData(): Promise<ChampionSummary[]> {
  const supabase = createServiceClient()
  const [{ data: users }, { data: charters }, { data: milestones }] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
    supabase.from('charter_submissions').select('user_id, id, project_name, publish_status'),
    supabase.from('milestones').select('user_id, week_number, status').eq('publish_status', 'published'),
  ])

  // user_id → charter[] (1:N)
  const chartersByUser = new Map<string, NonNullable<typeof charters>[0][]>()
  for (const c of charters ?? []) {
    if (!chartersByUser.has(c.user_id)) chartersByUser.set(c.user_id, [])
    chartersByUser.get(c.user_id)!.push(c)
  }

  const msMap = new Map<string, { week: number; status: string }[]>()
  for (const m of milestones ?? []) {
    if (!msMap.has(m.user_id)) msMap.set(m.user_id, [])
    msMap.get(m.user_id)!.push({ week: m.week_number, status: m.status })
  }

  return (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    // ChampionSummary: 첫 번째 charter 기준 유지 (향후 확장 가능)
    const charter = chartersByUser.get(u.id)?.[0]
    const weeklyStatus: Record<number, MilestoneStatus> = {}
    for (const { week, status } of msMap.get(u.id) ?? []) {
      weeklyStatus[week] = status as MilestoneStatus
    }
    return {
      userId: u.id, name: displayName, department,
      projectName: charter?.project_name ?? null,
      charterStatus: (charter?.publish_status ?? null) as ChampionSummary['charterStatus'],
      charterSubmissionId: charter?.id ?? null,
      weeklyStatus,
    }
  })
}
