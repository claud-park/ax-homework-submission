import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Milestone, CharterSubmission } from '@/lib/types'
import { filterMilestonesByCharter } from '@/lib/milestone-filter'
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
      .eq('publish_status', 'published')
      .order('submitted_at', { ascending: false }),
  ])

  const charters = (chartersData ?? []) as Pick<CharterSubmission, 'id' | 'title' | 'project_name' | 'admin_approved_at'>[]
  const requestedId = searchParams.charter_id ?? null
  const charterId = (requestedId && charters.some(c => c.id === requestedId))
    ? requestedId
    : charters[0]?.id ?? null

  const firstCharterId = charters[0]?.id ?? null
  // 게시된 charter가 하나도 없으면(charterId === null) 마일스톤을 노출하지 않는다.
  const milestones = charterId
    ? filterMilestonesByCharter((milestonesData ?? []) as Milestone[], charterId, {
        includeOrphans: charterId === firstCharterId,
      })
    : []

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
