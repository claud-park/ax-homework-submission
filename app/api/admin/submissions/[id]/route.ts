import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { status } = body
  if (!['pending', 'accepted', 'declined'].includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .update({ status })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
