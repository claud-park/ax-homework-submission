import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { UserManagementEntry } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: authData, error: authErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name, user_group, created_at').order('created_at', { ascending: true }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const authMap = new Map<string, { email: string; isAdmin: boolean }>()
  for (const u of authData.users) {
    authMap.set(u.id, {
      email: u.email ?? '',
      isAdmin: !!u.user_metadata?.is_admin,
    })
  }

  const result: UserManagementEntry[] = (users ?? []).map(u => {
    const auth = authMap.get(u.id)
    const { displayName, department } = parseName(u.name)
    return {
      id: u.id,
      name: u.name,
      displayName,
      department,
      email: auth?.email ?? '',
      userGroup: auth?.isAdmin ? 'admin' : (u.user_group as 'champion' | 'partner'),
      createdAt: u.created_at,
    }
  })

  return NextResponse.json(result)
}
