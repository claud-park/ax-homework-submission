import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import type { Submission } from '@/lib/types'
import { SubmissionClient } from './SubmissionClient'

export default async function SubmissionPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*, comments(*)')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  return <SubmissionClient initialSubmissions={(submissions ?? []) as Submission[]} />
}
