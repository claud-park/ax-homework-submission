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

  const milestones = (milestonesData ?? []).filter(m =>
    charterId ? m.charter_submission_id === charterId : true
  ) as Milestone[]

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
