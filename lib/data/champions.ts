import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { GanttChampion } from '@/app/api/champions/gantt/route'
import type { ChampionSummary, MilestoneStatus } from '@/lib/types'

export async function fetchGanttData(): Promise<GanttChampion[]> {
  const supabase = createServiceClient()
  const [
    { data: users },
    { data: charters },
    { data: milestones },
  ] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
    supabase.from('charter_submissions').select('user_id, id, project_name'),
    supabase.from('milestones')
      .select('id, user_id, title, start_date, due_date, status, week_number, parent_milestone_id')
      .eq('publish_status', 'published')
      .order('week_number', { nullsFirst: false })
      .order('display_order'),
  ])

  const charterMap = new Map((charters ?? []).map(c => [c.user_id, c]))
  const msMap = new Map<string, GanttChampion['milestones']>()
  for (const m of milestones ?? []) {
    if (!msMap.has(m.user_id)) msMap.set(m.user_id, [])
    msMap.get(m.user_id)!.push({
      id: m.id, title: m.title, start_date: m.start_date, due_date: m.due_date,
      status: m.status, week_number: m.week_number, parent_milestone_id: m.parent_milestone_id ?? null,
    })
  }

  return (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const charter = charterMap.get(u.id)
    return {
      userId: u.id, name: displayName, department,
      projectName: charter?.project_name ?? null,
      charterSubmissionId: charter?.id ?? null,
      milestones: msMap.get(u.id) ?? [],
    }
  })
}

export async function fetchSummaryData(): Promise<ChampionSummary[]> {
  const supabase = createServiceClient()
  const [{ data: users }, { data: charters }, { data: milestones }] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
    supabase.from('charter_submissions').select('user_id, id, project_name, publish_status'),
    supabase.from('milestones').select('user_id, week_number, status').eq('publish_status', 'published'),
  ])

  const charterMap = new Map((charters ?? []).map(c => [c.user_id, c]))
  const msMap = new Map<string, { week: number; status: string }[]>()
  for (const m of milestones ?? []) {
    if (!msMap.has(m.user_id)) msMap.set(m.user_id, [])
    msMap.get(m.user_id)!.push({ week: m.week_number, status: m.status })
  }

  return (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const charter = charterMap.get(u.id)
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
