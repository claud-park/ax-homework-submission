// app/api/hotline/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const filePath = `${user.id}/${randomUUID()}/${file.name}`
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
    if (signed) result.url = signed.signedUrl
  }

  return NextResponse.json(result)
}
