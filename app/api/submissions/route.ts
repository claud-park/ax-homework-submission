import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { notifyNewSubmission } from '@/lib/notifications'
import { createServiceClient } from '@/lib/supabase/server'

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx !== -1 ? name.slice(dotIdx) : ''
  const base = dotIdx !== -1 ? name.slice(0, dotIdx) : name
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') + ext
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const contentType = req.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  const supabase = createServiceClient()

  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const attemptNumber = (count ?? 0) + 1

  let insertPayload: Record<string, unknown>

  if (isJson) {
    const body = await req.json() as { link_url?: string }
    const linkUrl = body.link_url?.trim()
    if (!linkUrl) return NextResponse.json({ error: 'Missing link_url' }, { status: 400 })
    insertPayload = {
      user_id: user.id,
      file_path: null,
      file_name: null,
      link_url: linkUrl,
      status: 'pending',
      attempt_number: attemptNumber,
    }
  } else {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

    const safeFileName = sanitizeFileName(file.name)
    const filePath = `${user.id}/${attemptNumber}/${safeFileName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('submissions')
      .upload(filePath, arrayBuffer, { contentType: file.type, upsert: false })
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

    insertPayload = {
      user_id: user.id,
      file_path: filePath,
      file_name: file.name,
      link_url: null,
      status: 'pending',
      attempt_number: attemptNumber,
    }
  }

  const { data, error } = await supabase
    .from('submissions')
    .insert(insertPayload)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void (async () => {
    try {
      const { data: userRow } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (userRow) await notifyNewSubmission({ user: userRow, submission: data })
    } catch (e) {
      console.error('[email] outer catch:', e)
    }
  })()

  // 산출물 제출 시 완료되지 않은 모든 마일스톤을 완료로 표시
  void supabase
    .from('milestones')
    .update({ is_manual_completed: true, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('publish_status', 'published')
    .eq('is_manual_completed', false)

  return NextResponse.json(data, { status: 201 })
}
