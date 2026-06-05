import { createServiceClient } from '@/lib/supabase/server'
import type { Milestone, User } from '@/lib/types'
import { ProgressClient } from './ProgressClient'

type MilestoneWithUser = Milestone & { users: User }

type CharterWithUser = {
  id: string
  user_id: string
  project_name: string | null
  content: Record<string, string | undefined>
  submitted_at: string
  updated_at: string
  admin_approved_at: string | null
  users: User
}

export default async function AdminProgressPage() {
  const supabase = createServiceClient()

  const [milestonesResult, chartersResult] = await Promise.all([
    supabase
      .from('milestones')
      .select('*, users(*)')
      .eq('publish_status', 'published')
      .order('user_id').order('week_number').order('display_order'),
    supabase
      .from('charter_submissions')
      .select('*, users(*)')
      .eq('publish_status', 'published')
      .order('submitted_at', { ascending: false }),
  ])

  const milestones = (milestonesResult.data ?? []) as MilestoneWithUser[]
  const charters = (chartersResult.data ?? []) as CharterWithUser[]

  return (
    <ProgressClient
      initialMilestones={milestones}
      initialCharters={charters}
    />
  )
}
