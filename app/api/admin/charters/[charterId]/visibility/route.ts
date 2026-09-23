import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { charterId: string } },
) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const { isPublic } = await req.json() as { isPublic: boolean }
  if (typeof isPublic !== 'boolean') {
    return NextResponse.json({ error: 'isPublic은 boolean이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .update({ is_public: isPublic })
    .eq('id', params.charterId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Charter not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
