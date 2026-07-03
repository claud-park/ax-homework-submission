import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isAcceptedAudio } from '@/lib/audio'
import { claimSessionForProcessing } from '@/lib/sessions/lock'
import { runProcessingInBackground } from '@/lib/sessions/runProcessingInBackground'
import { requireAdmin } from '@/lib/api/guard'

// Whisper + Claude on long recordings can take a while. The pipeline runs in the
// background (waitUntil) so the client no longer has to keep the tab open; it polls
// GET /api/sessions/[sessionId] for processing_status. Still bounded by maxDuration.
export const maxDuration = 300

type Params = { params: { sessionId: string } }

/**
 * Process a session recording. The audio is uploaded directly to Storage by the
 * client (via a signed URL) to bypass Vercel's 4.5MB body limit, so this route
 * receives only the storage path + duration as JSON, then runs the shared
 * STT → summary pipeline.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('id')
    .eq('id', params.sessionId)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const rawPaths: string[] = Array.isArray(body?.audioPaths)
    ? body.audioPaths
    : body?.audioPath ? [body.audioPath] : []
  const recordingDurationSec =
    typeof body?.recordingDurationSec === 'number'
      ? body.recordingDurationSec
      : body?.recordingDurationSec ? parseInt(String(body.recordingDurationSec), 10) : 0

  if (rawPaths.length === 0) return NextResponse.json({ error: 'audioPaths required' }, { status: 400 })
  for (const p of rawPaths) {
    if (!isAcceptedAudio(p)) {
      return NextResponse.json({ error: '지원하지 않는 오디오 형식입니다.' }, { status: 400 })
    }
    if (!p.startsWith(`sessions/${params.sessionId}/`)) {
      return NextResponse.json({ error: 'invalid audio path' }, { status: 400 })
    }
  }

  // 클레임 + 오디오 경로 저장은 동기로 수행(409/실패를 즉시 반환).
  const claimed = await claimSessionForProcessing(supabase, params.sessionId)
  if (!claimed) {
    return NextResponse.json({ error: '이미 처리 중인 세션입니다. 잠시 후 다시 시도하세요.' }, { status: 409 })
  }
  await supabase.from('check_up_sessions')
    .update({
      audio_file_path: rawPaths[0], // 하위호환: 첫 청크
      audio_chunk_paths: rawPaths,  // 전체 청크(다운로드용)
      recording_duration_sec: recordingDurationSec,
    })
    .eq('id', params.sessionId)

  // STT→요약은 응답 후 백그라운드에서 실행. 클라이언트는 processing_status 를 폴링한다.
  runProcessingInBackground(supabase, params.sessionId, rawPaths, recordingDurationSec)

  return NextResponse.json({ status: 'processing' }, { status: 202 })
}
