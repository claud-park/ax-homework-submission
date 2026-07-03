import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { AUDIO_CONTENT_TYPES } from '@/lib/audio'
import { requireAdmin } from '@/lib/api/guard'

const BUCKET = 'check-up-sessions'

type Params = { params: { sessionId: string } }

/**
 * Issue a signed upload URL so the client can PUT audio directly to Supabase
 * Storage, bypassing Vercel's 4.5MB function body limit. The service-role key
 * creates the URL (RLS-exempt); the returned token authorizes the upload.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  const ext = (body?.ext as string | undefined)?.toLowerCase()
  if (!ext || !AUDIO_CONTENT_TYPES[ext]) {
    return NextResponse.json(
      { error: '지원하지 않는 오디오 형식입니다. (wav, mp3, m4a, webm)' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('id')
    .eq('id', params.sessionId)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const index = typeof body?.index === 'number' ? body.index : undefined
  const path = index !== undefined
    ? `sessions/${params.sessionId}/chunk_${String(index).padStart(3, '0')}.${ext}`
    : `sessions/${params.sessionId}/audio.${ext}`
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: true })
  if (error || !data) {
    return NextResponse.json(
      { error: `업로드 URL 생성 실패: ${error?.message ?? 'unknown'}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl })
}
