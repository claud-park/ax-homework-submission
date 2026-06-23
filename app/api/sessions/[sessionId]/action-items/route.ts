import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { sessionId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { body, display_order } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('session_action_items')
    .insert({ session_id: params.sessionId, body: body.trim(), display_order: display_order ?? 0 })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
