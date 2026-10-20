// app/(champion)/my-project/charter/[id]/page.tsx
import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import type { CharterSubmission } from '@/lib/types'
import { CharterClient } from '../CharterClient'
import { getCurrentSeasonIdOrNil } from '@/lib/data/season'

export default async function CharterDetailPage({ params }: { params: { id: string } }) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: submission } = await serviceClient
    .from('charter_submissions')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)  // 본인 charter만 접근 가능
    .single()

  if (!submission) redirect('/my-project/charter')
  // 지난 시즌 차터는 읽기전용 아카이브 — 편집기가 아니라 열람용 팝업으로 보낸다.
  if (submission.season_id !== await getCurrentSeasonIdOrNil(serviceClient)) redirect(`/charter-popup/${params.id}`)

  return <CharterClient
    initialSubmission={submission as CharterSubmission}
    charterId={params.id}
  />
}
