import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('charter_submissions')
    .select('id, admin_approved_at')
    .eq('id', params.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('charter_submissions')
    .update({ admin_approved_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
