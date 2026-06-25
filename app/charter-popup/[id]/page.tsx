import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import CharterPopupClient from './CharterPopupClient'
import { filterMilestonesByCharter } from '@/lib/milestone-filter'
import type { Milestone } from '@/lib/types'

type CharterWithUser = {
  id: string
  user_id: string
  project_name: string | null
  content: Record<string, string>
  submitted_at: string
  updated_at: string
  admin_approved_at: string | null
  users: { id: string; name: string; email: string; avatar_url: string | null }
}

export default async function CharterPopupPage({ params }: { params: { id: string } }) {
  const userClient = createUserServerClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) redirect('/login')
  const isAdmin = !!user.user_metadata?.is_admin

  const supabase = createServiceClient()

  const [charterResult, milestonesResult] = await Promise.all([
    supabase
      .from('charter_submissions')
      .select('*, users(*)')
      .eq('id', params.id)
      .single(),
    supabase
      .from('milestones')
      .select('*')
      .eq('publish_status', 'published')
      .order('display_order'),
  ])

  if (charterResult.error || !charterResult.data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--font-pretendard, sans-serif)' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>과제정의서를 찾을 수 없습니다.</p>
      </div>
    )
  }

  const charter = charterResult.data as CharterWithUser
  const allMilestones = (milestonesResult.data ?? []) as Milestone[]

  // orphan 마일스톤(FK null)은 챔피언의 첫 번째 published charter에만 표시
  // (champion 본인 편집 화면 / Gantt와 동일)
  const { data: publishedCharters } = await supabase
    .from('charter_submissions')
    .select('id')
    .eq('user_id', charter.user_id)
    .eq('publish_status', 'published')
    .order('submitted_at', { ascending: false })
  const firstCharterId = publishedCharters?.[0]?.id ?? null

  const charterMilestones = filterMilestonesByCharter(allMilestones, charter.id, {
    includeOrphans: charter.id === firstCharterId,
  })

  return <CharterPopupClient charter={charter} milestones={charterMilestones} isAdmin={isAdmin} />
}
