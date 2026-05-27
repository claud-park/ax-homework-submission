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
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

  const supabase = createServiceClient()

  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const attemptNumber = (count ?? 0) + 1

  const safeFileName = sanitizeFileName(file.name)
  const filePath = `${user.id}/${attemptNumber}/${safeFileName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('submissions')
    .upload(filePath, arrayBuffer, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      user_id: user.id,
      file_path: filePath,
      file_name: file.name,
      status: 'pending',
      attempt_number: attemptNumber,
    })
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

  return NextResponse.json(data, { status: 201 })
}
