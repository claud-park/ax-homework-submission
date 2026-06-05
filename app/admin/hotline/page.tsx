import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { HotlineInboxClient } from './HotlineInboxClient'

export default async function HotlinePage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.user_metadata?.is_admin) redirect('/admin/login')

  return <HotlineInboxClient />
}
