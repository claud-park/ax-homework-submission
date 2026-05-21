import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = parseInt(params.id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Drafts visible only to author
  if (data.publish_status === 'draft' && data.created_by !== admin.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = parseInt(params.id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json()
  const { title, description, due_date, publish_status } = body

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('homeworks').select('*').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Draft author check — per spec, PATCH from non-owner on a draft → 403 (not 404).
  // GET handler returns 404 for the same case; PATCH returns 403 because the caller
  // already holds the ID and we want to signal "not yours" explicitly.
  if (existing.publish_status === 'draft' && existing.created_by !== admin.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Status transition guard: published -> draft is rejected
  if (existing.publish_status === 'published' && publish_status === 'draft') {
    return NextResponse.json(
      { error: 'invalid_transition', message: 'Cannot revert published item to draft' },
      { status: 400 }
    )
  }

  // Effective resulting status
  const nextStatus: 'draft' | 'published' =
    publish_status === 'published' || existing.publish_status === 'published'
      ? 'published'
      : (publish_status === 'draft' ? 'draft' : existing.publish_status)

  // Validation when result is published
  if (nextStatus === 'published') {
    const effectiveTitle = title ?? existing.title
    const effectiveDueDate = due_date ?? existing.due_date
    const fields: { field: string; message: string }[] = []
    if (!effectiveTitle) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!effectiveDueDate) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const patch: Record<string, unknown> = { publish_status: nextStatus }
  if (title !== undefined) patch.title = title
  if (description !== undefined) patch.description = description
  if (due_date !== undefined) patch.due_date = due_date

  const { data, error } = await supabase
    .from('homeworks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = parseInt(params.id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('homeworks').select('publish_status, created_by').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Draft existence privacy: non-author admins must not be able to distinguish
  // "exists but not yours" from "doesn't exist" — match GET semantics with 404.
  if (existing.publish_status === 'draft' && existing.created_by !== admin.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (existing.publish_status !== 'draft') {
    return NextResponse.json(
      { error: 'cannot_delete_published', message: '게시된 과제는 삭제할 수 없습니다.' },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('homeworks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
