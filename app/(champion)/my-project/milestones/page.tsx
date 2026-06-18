import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Milestone, CharterSubmission } from '@/lib/types'
import { MilestonesClient } from './MilestonesClient'

export default async function WorkStatusPage({
  searchParams,
}: {
  searchParams: { charter_id?: string }
}) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const [{ data: milestonesData }, { data: chartersData }] = await Promise.all([
    serviceClient
      .from('milestones')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order')
      .order('start_date', { ascending: true, nullsFirst: false }),
    serviceClient
      .from('charter_submissions')
      .select('id, title, project_name, admin_approved_at')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false }),
  ])

  const charters = (chartersData ?? []) as Pick<CharterSubmission, 'id' | 'title' | 'project_name' | 'admin_approved_at'>[]
  const charterId = searchParams.charter_id ?? charters[0]?.id ?? null

  const firstCharterId = charters[0]?.id ?? null
  const milestones = (milestonesData ?? []).filter(m => {
    if (!charterId) return true
    if (m.charter_submission_id === charterId) return true
    // orphan 마일스톤(FK null)은 첫 번째 charter에 표시 (Gantt와 동일)
    if (m.charter_submission_id === null && charterId === firstCharterId) return true
    return false
  }) as Milestone[]

  const charterApproved = charters.some(c => !!c.admin_approved_at)

  return (
    <MilestonesClient
      initialMilestones={milestones}
      charterApproved={charterApproved}
      charters={charters}
      currentCharterId={charterId}
    />
  )
}
