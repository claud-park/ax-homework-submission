import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { notifyNewSubmission } from '@/lib/notifications'
import { createServiceClient } from '@/lib/supabase/server'

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx !== -1 ? name.slice(dotIdx) : ''
  const base = dotIdx !== -1 ? name.slice(0, dotIdx) : name
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') + ext
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const homeworkId = formData.get('homework_id') as string | null

  if (!file || !homeworkId)
    return NextResponse.json({ error: 'Missing file or homework_id' }, { status: 400 })

  const supabase = createServiceClient()

  // Determine attempt number
  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('homework_id', parseInt(homeworkId))
  const attemptNumber = (count ?? 0) + 1

  // Upload file
  const safeFileName = sanitizeFileName(file.name)
  const filePath = `${user.id}/${homeworkId}/${attemptNumber}/${safeFileName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('submissions')
    .upload(filePath, arrayBuffer, { contentType: file.type, upsert: false })
  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Create submission record
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      user_id: user.id,
      homework_id: parseInt(homeworkId),
      file_path: filePath,
      file_name: file.name,
      status: 'pending',
      attempt_number: attemptNumber,
    })
    .select()
    .single()
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
  void (async () => {
    try {
      const [{ data: homework }, { data: userRow }] = await Promise.all([
        supabase.from('homeworks').select('*').eq('id', parseInt(homeworkId)).single(),
        supabase.from('users').select('*').eq('id', user.id).single(),
      ])
      if (homework && userRow) {
        await notifyNewSubmission({ user: userRow, homework, submission: data })
      } else {
        console.warn('[email] skipped notifyNewSubmission: homework or user lookup returned null', { homeworkId, userId: user.id })
      }
    } catch (e) {
      console.error('[email] outer catch:', e)
    }
  })()

  return NextResponse.json(data, { status: 201 })
}
