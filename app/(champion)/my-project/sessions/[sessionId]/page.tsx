import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { ChampionSessionDetail } from '@/components/sessions/ChampionSessionDetail'

export default async function ChampionSessionDetailPage({ params }: { params: { sessionId: string } }) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ChampionSessionDetail sessionId={params.sessionId} currentUserId={user.id} />
}
