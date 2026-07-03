import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isAcceptedAudio } from '@/lib/audio'
import { processSessionAudio, SummaryParseError } from '@/lib/sessions/processAudio'
import { claimSessionForProcessing } from '@/lib/sessions/lock'
import { requireAdmin } from '@/lib/api/guard'

// Whisper + Claude on long recordings can take a while.
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

  try {
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
    const result = await processSessionAudio(supabase, params.sessionId, rawPaths, recordingDurationSec)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof SummaryParseError) {
      return NextResponse.json(
        { error: err.message, notes: err.rawText, actionItems: [] },
        { status: 422 }
      )
    }
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'error' })
      .eq('id', params.sessionId)
    const message = err instanceof Error ? err.message : 'Processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
