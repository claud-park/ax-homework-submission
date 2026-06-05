import { createServiceClient } from '@/lib/supabase/server'
import { DelayReportsClient } from './DelayReportsClient'

interface BottleneckReport {
  id: string
  week_number: number
  title: string
  bottleneck_type: string
  bottleneck_note: string | null
  bottleneck_admin_comment: string | null
  bottleneck_reviewed_at: string | null
  due_date: string
  users: { name: string; email: string; avatar_url: string | null } | null
}

export default async function AdminDelayReportsPage() {
  const supabase = createServiceClient()

  const [pendingResult, reviewedResult] = await Promise.all([
    supabase
      .from('milestones')
      .select('*, users(*)')
      .eq('publish_status', 'published')
      .not('bottleneck_type', 'is', null)
      .is('bottleneck_reviewed_at', null)
      .order('updated_at', { ascending: false }),
    supabase
      .from('milestones')
      .select('*, users(*)')
      .eq('publish_status', 'published')
      .not('bottleneck_type', 'is', null)
      .not('bottleneck_reviewed_at', 'is', null)
      .order('bottleneck_reviewed_at', { ascending: false }),
  ])

  const initialPending = (pendingResult.data ?? []) as BottleneckReport[]
  const initialReviewed = (reviewedResult.data ?? []) as BottleneckReport[]

  return (
    <DelayReportsClient
      initialPending={initialPending}
      initialReviewed={initialReviewed}
    />
  )
}
