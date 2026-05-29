import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('sub_tasks')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) {
    const trimmedTitle = String(body.title).trim()
    if (!trimmedTitle) {
      return NextResponse.json(
        { error: 'validation_failed', fields: [{ field: 'title', message: '필수 항목입니다.' }] },
        { status: 400 }
      )
    }
    patch.title = trimmedTitle
  }
  if (body.description !== undefined) patch.description = body.description?.trim() ?? null
  if (body.display_order !== undefined) patch.display_order = body.display_order
  if (body.publish_status !== undefined) patch.publish_status = body.publish_status

  const { data, error } = await supabase
    .from('sub_tasks')
    .update(patch)
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
  const { data: existing } = await supabase
    .from('sub_tasks')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // milestones.sub_task_id는 ON DELETE SET NULL이므로 DB가 자동 처리
  const { error } = await supabase
    .from('sub_tasks')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
