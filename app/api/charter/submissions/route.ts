import { NextRequest, NextResponse } from 'next/server'
import { isAdminUser } from '@/lib/auth'
import { requireUser } from '@/lib/api/guard'
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

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const isAdmin = isAdminUser(user)
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()

  if (isAdmin && !targetUserId) {
    const { data, error } = await supabase
      .from('charter_submissions')
      .select('*, users(*)')
      .eq('publish_status', 'published')
      .order('submitted_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  let query = supabase
    .from('charter_submissions')
    .select('*')
    .eq('user_id', effectiveUserId)
    .order('submitted_at', { ascending: false })

  if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user
  const { title, project_name, content, publish_status } = await req.json()
  const status = publish_status === 'published' ? 'published' : 'draft'

  if (status === 'published') {
    const fields = validateCharter(content ?? {}, project_name)
    if (fields.length > 0) return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .insert({
      user_id: user.id,
      title: title ?? null,
      project_name: project_name ?? null,
      content: content ?? {},
      publish_status: status,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
