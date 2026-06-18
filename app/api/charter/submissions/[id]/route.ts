import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

function stripHtml(s: string | undefined | null) {
  return (s ?? '').replace(/<[^>]*>/g, '').trim()
}

function validateCharter(content: Record<string, string>, projectName: string | null) {
  const fields: { field: string; message: string }[] = []
  if (!projectName || !projectName.trim()) fields.push({ field: 'project_name', message: '프로젝트명은 필수입니다.' })
  for (const key of ['summary', 'problem', 'user', 'goal', 'solution', 'build']) {
    if (!stripHtml(content?.[key])) fields.push({ field: key, message: '필수 항목입니다.' })
  }
  return fields
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { project_name, content, homework_id, publish_status } = await req.json()

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('charter_submissions').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.publish_status === 'published' && publish_status === 'draft') {
    return NextResponse.json(
      { error: 'invalid_transition', message: 'Cannot revert published item to draft' },
      { status: 400 }
    )
  }

  const nextStatus: 'draft' | 'published' =
    publish_status === 'published' || existing.publish_status === 'published'
      ? 'published'
      : (publish_status === 'draft' ? 'draft' : existing.publish_status)

  if (nextStatus === 'published') {
    const effContent = { ...(existing.content ?? {}), ...(content ?? {}) }
    const effProjectName = project_name ?? existing.project_name
    const fields = validateCharter(effContent, effProjectName)
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    publish_status: nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (project_name !== undefined) patch.project_name = project_name
  if (content !== undefined) patch.content = content
  if (homework_id !== undefined) patch.homework_id = homework_id

  const { data, error } = await supabase
    .from('charter_submissions')
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
    .from('charter_submissions').select('id').eq('id', params.id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase
    .from('charter_submissions').delete().eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
