import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx !== -1 ? name.slice(dotIdx) : ''
  const base = dotIdx !== -1 ? name.slice(0, dotIdx) : name
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') + ext
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: milestone } = await supabase
    .from('milestones')
    .select('id, week_number')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!milestone) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })

  // Check for existing deliverables (re-submission)
  const { data: existing } = await supabase.from('milestone_deliverables').select('id, file_path').eq('milestone_id', params.id)
  const isResubmit = (existing ?? []).length > 0

  if (isResubmit) {
    const oldPaths = (existing ?? []).map((d: { file_path: string }) => d.file_path)
    await supabase.storage.from('milestone-deliverables').remove(oldPaths)
    await supabase.from('milestone_deliverables').delete().eq('milestone_id', params.id)
  }

  const safeFileName = sanitizeFileName(file.name)
  const filePath = `${user.id}/${params.id}/${safeFileName}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('milestone-deliverables')
    .upload(filePath, arrayBuffer, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  await supabase.from('milestone_deliverables').insert({ milestone_id: params.id, file_path: filePath, file_name: file.name })
  const newStatus = isResubmit ? 'in_progress' : 'completed'
  await supabase.from('milestones').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', params.id).eq('user_id', user.id)

  // On re-submission: also create a homework submission (week_number → homework_id)
  if (isResubmit) {
    const homeworkId = milestone.week_number
    const { count } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('homework_id', homeworkId)
    const attemptNumber = (count ?? 0) + 1
    const subFilePath = `${user.id}/${homeworkId}/${attemptNumber}/${safeFileName}`
    await supabase.storage
      .from('submissions')
      .upload(subFilePath, arrayBuffer, { contentType: file.type, upsert: false })
    await supabase.from('submissions').insert({
      user_id: user.id,
      homework_id: homeworkId,
      file_path: subFilePath,
      file_name: file.name,
      status: 'pending',
      attempt_number: attemptNumber,
    })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
