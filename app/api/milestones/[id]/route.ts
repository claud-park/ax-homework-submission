import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

function computeStatus(milestone: { due_date: string; is_manual_progress: boolean }, hasDeliverable: boolean) {
  if (hasDeliverable) return 'completed'
  if (milestone.is_manual_progress) return 'in_progress'
  if (new Date(milestone.due_date) < new Date()) return 'delayed'
  return 'not_started'
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const supabase = createServiceClient()

  const { data: existing } = await supabase.from('milestones').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count: deliverableCount } = await supabase
    .from('milestone_deliverables')
    .select('*', { count: 'exact', head: true })
    .eq('milestone_id', params.id)

  const merged = { ...existing, ...body }
  const status = computeStatus(merged, (deliverableCount ?? 0) > 0)

  const { data, error } = await supabase
    .from('milestones')
    .update({ ...body, status, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('milestones').delete().eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
