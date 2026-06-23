import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { sessionId: string; itemId: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const body = await req.json()
  const supabase = createServiceClient()

  // Verify the action item belongs to this session
  const { data: item } = await supabase
    .from('session_action_items')
    .select('id, session_id')
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)
    .single()
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (isAdmin) {
    // Admin can update everything
    if ('body' in body) updates.body = body.body?.trim()
    if ('display_order' in body) updates.display_order = body.display_order
    if ('is_completed' in body) {
      updates.is_completed = body.is_completed
      updates.completed_at = body.is_completed ? new Date().toISOString() : null
    }
  } else {
    // Champion can only toggle is_completed
    if ('is_completed' in body) {
      // Verify champion owns the session
      const { data: session } = await supabase
        .from('check_up_sessions')
        .select('champion_user_id')
        .eq('id', params.sessionId)
        .single()
      if (!session || session.champion_user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      updates.is_completed = body.is_completed
      updates.completed_at = body.is_completed ? new Date().toISOString() : null
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

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
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('session_action_items')
    .delete()
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
