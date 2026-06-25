import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSessionRole } from '@/lib/sessions/access'
import { allowedActionItemUpdateFields } from '@/lib/sessions/permissions'

type Params = { params: { sessionId: string; itemId: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const role = await resolveSessionRole(supabase, params.sessionId, user)
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // 아이템이 이 세션 소속인지 확인
  const { data: item } = await supabase
    .from('session_action_items')
    .select('id, session_id')
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)
    .single()
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }
  let touched = false
  for (const key of allowedActionItemUpdateFields(role)) {
    if (!(key in body)) continue
    if (key === 'is_completed') {
      updates.is_completed = body.is_completed
      updates.completed_at = body.is_completed ? now : null
    } else if (key === 'body') {
      updates.body = body.body?.trim()
    } else if (key === 'display_order') {
      updates.display_order = body.display_order
    }
    touched = true
  }
  if (!touched) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('session_action_items')
    .update(updates)
    .eq('id', params.itemId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const role = await resolveSessionRole(supabase, params.sessionId, user)
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase
    .from('session_action_items')
    .delete()
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
