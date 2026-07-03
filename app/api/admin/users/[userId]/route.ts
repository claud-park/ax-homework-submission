import { NextRequest, NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const { userId } = params
  const body = await req.json() as { userGroup: string }
  const { userGroup } = body

  if (!['champion', 'partner'].includes(userGroup)) {
    return NextResponse.json(
      { error: 'admin 그룹은 이 API로 변경할 수 없습니다' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(userId)
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
  if (isAdminUser(authUser.user)) {
    return NextResponse.json(
      { error: 'admin 유저의 그룹은 변경할 수 없습니다' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('users')
    .update({ user_group: userGroup })
    .eq('id', userId)
    .select('id, name, user_group')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
