import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('deadline_change_requests')
    .select('*, milestones(*), users!deadline_change_requests_user_id_fkey(*)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map(({ users, milestones, ...rest }: any) => ({ ...rest, user: users, milestone: milestones }))
  return NextResponse.json(normalized)
}
