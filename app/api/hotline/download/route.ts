// app/api/hotline/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  let body: { file_path?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.file_path) {
    return NextResponse.json({ error: 'file_path is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from('hotline')
    .createSignedUrl(body.file_path, 60 * 60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
