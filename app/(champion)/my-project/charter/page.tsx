import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import type { CharterSubmission } from '@/lib/types'
import { CharterListClient } from './CharterListClient'

export default async function CharterPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: submissions } = await serviceClient
    .from('charter_submissions')
    .select('*')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  const charters = (submissions ?? []) as CharterSubmission[]

  return <CharterListClient initialCharters={charters} />
}
