import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { status, review_note, support_assignee } = await req.json()
  if (!['approved', 'rejected'].includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: req_ } = await supabase.from('deadline_change_requests').select('*').eq('id', params.id).single()
  if (!req_) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('deadline_change_requests')
    .update({ status, review_note, support_assignee, reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (status === 'approved') {
    await supabase.from('milestones').update({ due_date: req_.requested_due_date }).eq('id', req_.milestone_id)
  }

  return NextResponse.json(data)
}
