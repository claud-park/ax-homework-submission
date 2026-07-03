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
    .select('audio_file_path, audio_chunk_paths, title')
    .eq('id', params.sessionId)
    .single()

  if (!session?.audio_file_path) {
    return NextResponse.json({ error: '저장된 오디오가 없습니다.' }, { status: 404 })
  }

  // 멀티청크면 전체 청크, 아니면 단일 파일. (과거 데이터는 audio_chunk_paths 가 null → 첫 청크 fallback)
  const paths: string[] =
    Array.isArray(session.audio_chunk_paths) && session.audio_chunk_paths.length > 0
      ? session.audio_chunk_paths
      : [session.audio_file_path]

  const safeTitle = (session.title || 'session').replace(/[^\w가-힣.-]+/g, '_')
  const multi = paths.length > 1

  const urls: string[] = []
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i]
    const ext = p.split('.').pop() || 'webm'
    const filename = multi ? `${safeTitle}-${i + 1}.${ext}` : `${safeTitle}.${ext}`
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(p, 60, { download: filename })
    if (error || !data) {
      return NextResponse.json({ error: `다운로드 URL 생성 실패: ${error?.message ?? 'unknown'}` }, { status: 500 })
    }
    urls.push(data.signedUrl)
  }

  // url: 하위호환(첫 청크), urls: 전체 청크
  return NextResponse.json({ url: urls[0], urls })
}
