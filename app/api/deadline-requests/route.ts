import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { milestone_id, requested_due_date, reason } = await req.json()
  if (!milestone_id || !requested_due_date || !reason)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const supabase = createServiceClient()
  const { data: ms } = await supabase.from('milestones').select('due_date').eq('id', milestone_id).eq('user_id', user.id).single()
  if (!ms) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
  const { data, error } = await supabase
    .from('deadline_change_requests')
    .insert({ milestone_id, user_id: user.id, original_due_date: ms.due_date, requested_due_date, reason })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
