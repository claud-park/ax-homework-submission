import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { MilestoneStatus } from '@/lib/types'

export interface ReportMilestoneSummary {
  id: string
  title: string
  status: MilestoneStatus
  week_number: number | null
  hasBottleneck: boolean
}

export interface ReportChampion {
  userId: string
  name: string
  department: string
  projectName: string | null
  milestones: ReportMilestoneSummary[]
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('charter_submissions').select('user_id, project_name'),
    supabase
      .from('milestones')
      .select('id, user_id, title, status, week_number, bottleneck_type')
      .eq('publish_status', 'published')
      .order('week_number', { nullsFirst: false })
      .order('display_order'),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (chartersErr) return NextResponse.json({ error: chartersErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })

  const charterMap = new Map<string, string | null>()
  for (const c of charters ?? []) charterMap.set(c.user_id, c.project_name ?? null)

  const msMap = new Map<string, ReportMilestoneSummary[]>()
  for (const m of milestones ?? []) {
    if (!msMap.has(m.user_id)) msMap.set(m.user_id, [])
    msMap.get(m.user_id)!.push({
      id: m.id,
      title: m.title,
      status: m.status as MilestoneStatus,
      week_number: m.week_number ?? null,
      hasBottleneck: m.bottleneck_type != null,
    })
  }

  const result: ReportChampion[] = (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    return {
      userId: u.id,
      name: displayName,
      department,
      projectName: charterMap.get(u.id) ?? null,
      milestones: msMap.get(u.id) ?? [],
    }
  })

  return NextResponse.json(result)
}
