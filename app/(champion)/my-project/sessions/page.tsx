import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import type { CheckUpSession } from '@/lib/types'
import { SessionListClient } from './SessionListClient'

export default async function ChampionSessionsPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: sessions } = await serviceClient
    .from('check_up_sessions')
    .select('*')
    .eq('champion_user_id', user.id)
    .order('session_date', { ascending: false })

  return <SessionListClient sessions={(sessions ?? []) as CheckUpSession[]} />
}
