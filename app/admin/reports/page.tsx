import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { ReportChampion } from '@/app/api/admin/reports/overview/route'
import { ReportsClient } from './ReportsClient'

async function fetchReportsData(): Promise<ReportChampion[]> {
  const supabase = createServiceClient()

  const [
    { data: users },
    { data: charters },
    { data: milestones },
  ] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('charter_submissions').select('user_id, project_name'),
    supabase
      .from('milestones')
      .select('id, user_id, title, status, week_number, start_date, due_date, bottleneck_type')
      .eq('publish_status', 'published')
      .order('week_number', { nullsFirst: false })
      .order('display_order'),
  ])

  const charterMap = new Map<string, string | null>()
  for (const c of charters ?? []) charterMap.set(c.user_id, c.project_name ?? null)

  const msMap = new Map<string, ReportChampion['milestones']>()
  for (const m of milestones ?? []) {
    if (!msMap.has(m.user_id)) msMap.set(m.user_id, [])
    msMap.get(m.user_id)!.push({
      id: m.id,
      title: m.title,
      status: m.status,
      week_number: m.week_number ?? null,
      start_date: m.start_date ?? null,
      due_date: m.due_date ?? null,
      hasBottleneck: m.bottleneck_type != null,
    })
  }

  return (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    return {
      userId: u.id,
      name: displayName,
      department,
      projectName: charterMap.get(u.id) ?? null,
      milestones: msMap.get(u.id) ?? [],
    }
  })
}

export default async function AdminReportsPage() {
  const initialData = await fetchReportsData()
  return <ReportsClient initialData={initialData} />
}
