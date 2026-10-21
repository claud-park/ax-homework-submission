import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { claimSessionForProcessing } from '@/lib/sessions/lock'
import { runProcessingInBackground } from '@/lib/sessions/runProcessingInBackground'
import { listStoredChunkPaths } from '@/lib/sessions/storedAudio'
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

  // 오디오 경로 확정 + 클레임은 동기(409/400 즉시 반환).
  const chunkPaths = await listStoredChunkPaths(supabase, params.sessionId)
  let audioPaths: string[]
  if (chunkPaths.length > 0) {
    audioPaths = chunkPaths
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

  // 업로드만 끝나고 /process 가 돌지 못한 세션(audio_file_path 비어 있음)을 복구하는 경우,
  // /process 와 동일하게 경로를 저장해 완료 후 화면이 다운로드 영역으로 전환되게 한다.
  // audio_file_path 가 이미 있으면(일반 재처리) 아무것도 바꾸지 않는다.
  if (!session.audio_file_path) {
    await supabase.from('check_up_sessions')
      .update({ audio_file_path: audioPaths[0], audio_chunk_paths: audioPaths })
      .eq('id', params.sessionId)
  }

  // 재처리도 응답 후 백그라운드에서 실행.
  runProcessingInBackground(supabase, params.sessionId, audioPaths, session.recording_duration_sec ?? 0)

  return NextResponse.json({ status: 'processing' }, { status: 202 })
}
