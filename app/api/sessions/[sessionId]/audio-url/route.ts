import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

const BUCKET = 'check-up-sessions'

type Params = { params: { sessionId: string } }

/** Issue a short-lived signed URL to download the session's recorded audio (admin only). */
export async function GET(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('audio_file_path, title')
    .eq('id', params.sessionId)
    .single()

  if (!session?.audio_file_path) {
    return NextResponse.json({ error: '저장된 오디오가 없습니다.' }, { status: 404 })
  }

  const ext = session.audio_file_path.split('.').pop() || 'webm'
  const safeTitle = (session.title || 'session').replace(/[^\w가-힣.-]+/g, '_')
  const filename = `${safeTitle}.${ext}`

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(session.audio_file_path, 60, { download: filename })
  if (error || !data) {
    return NextResponse.json({ error: `다운로드 URL 생성 실패: ${error?.message ?? 'unknown'}` }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
