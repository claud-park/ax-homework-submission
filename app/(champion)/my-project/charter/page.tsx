import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentSeasonIdOrNil } from '@/lib/data/season'
import type { CharterSubmission } from '@/lib/types'
import { CharterListClient } from './CharterListClient'

export default async function CharterPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const seasonId = await getCurrentSeasonIdOrNil(serviceClient)
  // 현재 시즌 차터만 편집 대상. 지난 시즌의 제출본은 읽기전용 참고 목록으로 따로 내려준다(복귀 챔피언).
  const [{ data: submissions }, { data: previous }] = await Promise.all([
    serviceClient
      .from('charter_submissions')
      .select('*')
      .eq('user_id', user.id)
      .eq('season_id', seasonId)
      .order('submitted_at', { ascending: false }),
    serviceClient
      .from('charter_submissions')
      .select('*')
      .eq('user_id', user.id)
      .neq('season_id', seasonId)
      .eq('publish_status', 'published')
      .order('submitted_at', { ascending: false }),
  ])

  return (
    <CharterListClient
      initialCharters={(submissions ?? []) as CharterSubmission[]}
      previousCharters={(previous ?? []) as CharterSubmission[]}
    />
  )
}
