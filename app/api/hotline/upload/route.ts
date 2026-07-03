// app/api/hotline/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  // Check file size limit (50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File size exceeds 50MB limit' },
      { status: 413 }
    )
  }

  // Check MIME type allowlist
  const ALLOWED_MIME_TYPES = new Set([
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Documents
    'application/pdf',
    'text/plain',
    'text/csv',
    // Office
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ])

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'File type not allowed' },
      { status: 400 }
    )
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : ''
  const safeFilename = ext ? `file.${ext}` : 'file'
  const filePath = `${user.id}/${randomUUID()}/${safeFilename}`
  const arrayBuffer = await file.arrayBuffer()

  const supabase = createServiceClient()
  const { error: uploadError } = await supabase.storage
    .from('hotline')
    .upload(filePath, arrayBuffer, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const result: {
    file_path: string
    file_name: string
    file_size: number
    mime_type: string
    url?: string
  } = {
    file_path: filePath,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
  }

  if (file.type.startsWith('image/')) {
    const { data: signed } = await supabase.storage
      .from('hotline')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365)
    if (signed) {
      result.url = signed.signedUrl
    } else {
      console.warn('[hotline-upload] signed URL generation failed', filePath)
    }
  }

  return NextResponse.json(result)
}
