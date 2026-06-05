import { createUserServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Milestone } from '@/lib/types'
import { MilestonesClient } from './MilestonesClient'

export default async function WorkStatusPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: milestones }, { data: charters }] = await Promise.all([
    supabase.from('milestones').select('*').eq('user_id', user.id).order('display_order'),
    supabase.from('charter_submissions')
      .select('id, admin_approved_at')
      .eq('user_id', user.id),
  ])

  const charterApproved = (charters ?? []).some(c => !!c.admin_approved_at)

  return (
    <MilestonesClient
      initialMilestones={(milestones ?? []) as Milestone[]}
      charterApproved={charterApproved}
    />
  )
}
