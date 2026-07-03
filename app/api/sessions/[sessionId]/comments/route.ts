import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/api/guard'

type Params = { params: { sessionId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const isAdmin = !!user.user_metadata?.is_admin
  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const supabase = createServiceClient()

  // For champion: verify they own the session
  if (!isAdmin) {
    const { data: session } = await supabase
      .from('check_up_sessions')
      .select('champion_user_id')
      .eq('id', params.sessionId)
      .single()
    if (!session || session.champion_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('session_comments')
    .insert({
      session_id: params.sessionId,
      body: body.trim(),
      author_id: user.id,
      author_role: isAdmin ? 'admin' : 'champion',
    })
    .select('*')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
