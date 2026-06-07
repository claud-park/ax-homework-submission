import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import { SubmissionClient } from './SubmissionClient'

export default async function SubmissionPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: submissions } = await serviceClient
    .from('submissions')
    .select('*, comments(*)')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  return <SubmissionClient initialSubmissions={submissions ?? []} />
}
