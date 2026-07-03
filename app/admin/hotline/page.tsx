import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/auth'
import { HotlineInboxClient } from './HotlineInboxClient'

export default async function HotlinePage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminUser(user)) redirect('/admin/login')

  return <HotlineInboxClient />
}
