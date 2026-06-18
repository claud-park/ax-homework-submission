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
  type RawMs = { id: string; user_id: string; title: string; start_date: string | null; due_date: string | null; status: string; week_number: number | null; parent_milestone_id: string | null; display_order: number | null; charter_submission_id: string | null }
  const msByCharter = new Map<string, RawMs[]>()
  const orphanMsByUser = new Map<string, RawMs[]>()
  for (const m of (milestones ?? []) as RawMs[]) {
    if (m.charter_submission_id) {
      if (!msByCharter.has(m.charter_submission_id)) msByCharter.set(m.charter_submission_id, [])
      msByCharter.get(m.charter_submission_id)!.push(m)
    } else {
      if (!orphanMsByUser.has(m.user_id)) orphanMsByUser.set(m.user_id, [])
      orphanMsByUser.get(m.user_id)!.push(m)
    }
  }

  return (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const userCharters = chartersByUser.get(u.id) ?? []
    const orphans = orphanMsByUser.get(u.id) ?? []

    const charterRows = userCharters.map((c, idx) => ({
      id: c.id,
      title: (c as { title?: string | null }).title ?? null,
      projectName: c.project_name ?? null,
      milestones: [
        ...(msByCharter.get(c.id) ?? []).map(m => ({
          id: m.id, title: m.title, start_date: m.start_date, due_date: m.due_date,
          status: m.status as import('@/lib/types').MilestoneStatus,
          week_number: m.week_number, parent_milestone_id: m.parent_milestone_id ?? null,
          display_order: m.display_order ?? null, charter_submission_id: m.charter_submission_id,
        })),
        ...(idx === 0 ? orphans : []).map(m => ({
          id: m.id, title: m.title, start_date: m.start_date, due_date: m.due_date,
          status: m.status as import('@/lib/types').MilestoneStatus,
          week_number: m.week_number, parent_milestone_id: m.parent_milestone_id ?? null,
          display_order: m.display_order ?? null, charter_submission_id: m.charter_submission_id,
        })),
      ],
    }))

    if (charterRows.length === 0 && orphans.length > 0) {
      charterRows.push({
        id: '__orphan__' + u.id,
        title: null,
        projectName: null,
        milestones: orphans.map(m => ({
          id: m.id, title: m.title, start_date: m.start_date, due_date: m.due_date,
          status: m.status as import('@/lib/types').MilestoneStatus,
          week_number: m.week_number, parent_milestone_id: m.parent_milestone_id ?? null,
          display_order: m.display_order ?? null, charter_submission_id: m.charter_submission_id,
        })),
      })
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
