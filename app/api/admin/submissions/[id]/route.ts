import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const body = await req.json()
  const { status, feedback } = body
  if (!['pending', 'accepted', 'declined'].includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const update: Record<string, unknown> = { status }
  if (feedback !== undefined) {
    update.feedback = feedback === '' ? null : feedback
    update.feedback_updated_at = feedback === '' ? null : new Date().toISOString()
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
