import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { claimSessionForProcessing } from '@/lib/sessions/lock'
import { runProcessingInBackground } from '@/lib/sessions/runProcessingInBackground'
import { requireAdmin } from '@/lib/api/guard'

// 재처리도 백그라운드 실행 + 폴링. 클라이언트는 processing_status 를 폴링한다.
export const maxDuration = 300

type Params = { params: { sessionId: string } }

/** Re-run STT + summary on the audio already stored for this session. */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('id, audio_file_path, recording_duration_sec')
    .eq('id', params.sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const BUCKET = 'check-up-sessions'

  // 오디오 경로 확정 + 클레임은 동기(409/400 즉시 반환).
  const { data: listed } = await supabase.storage.from(BUCKET).list(`sessions/${params.sessionId}`, { limit: 100 })
  const chunkNames = (listed ?? [])
    .map(o => o.name)
    .filter(n => /^chunk_\d+\.wav$/.test(n))
    .sort()
  let audioPaths: string[]
  if (chunkNames.length > 0) {
    audioPaths = chunkNames.map(n => `sessions/${params.sessionId}/${n}`)
  } else if (session.audio_file_path) {
    audioPaths = [session.audio_file_path]   // 레거시 단일 파일
  } else {
    return NextResponse.json({ error: '오디오가 없습니다.' }, { status: 400 })
  }

  const claimed = await claimSessionForProcessing(supabase, params.sessionId)
  if (!claimed) {
    return NextResponse.json(
      { error: '이미 처리 중인 세션입니다. 잠시 후 다시 시도하세요.' },
      { status: 409 }
    )
  }

  // 재처리도 응답 후 백그라운드에서 실행.
  runProcessingInBackground(supabase, params.sessionId, audioPaths, session.recording_duration_sec ?? 0)

  return NextResponse.json({ status: 'processing' }, { status: 202 })
}
