import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import type { CharterSubmission } from '@/lib/types'
import { CharterClient } from './CharterClient'

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

  return <CharterClient initialSubmission={(submissions?.[0] ?? null) as CharterSubmission | null} />
}
