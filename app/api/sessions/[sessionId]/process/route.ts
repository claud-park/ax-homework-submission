import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { isAcceptedAudio } from '@/lib/audio'
import { processSessionAudio, SummaryParseError } from '@/lib/sessions/processAudio'

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
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('id')
    .eq('id', params.sessionId)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const audioPath = body?.audioPath as string | undefined
  const recordingDurationSec =
    typeof body?.recordingDurationSec === 'number'
      ? body.recordingDurationSec
      : body?.recordingDurationSec
        ? parseInt(String(body.recordingDurationSec), 10)
        : 0

  if (!audioPath) return NextResponse.json({ error: 'audioPath required' }, { status: 400 })
  if (!isAcceptedAudio(audioPath)) {
    return NextResponse.json(
      { error: '지원하지 않는 오디오 형식입니다. (wav, mp3, m4a, webm)' },
      { status: 400 }
    )
  }
  // Confine the path to this session's folder (clients only ever upload here)
  if (!audioPath.startsWith(`sessions/${params.sessionId}/`)) {
    return NextResponse.json({ error: 'invalid audio path' }, { status: 400 })
  }

  try {
    await supabase
      .from('check_up_sessions')
      .update({ audio_file_path: audioPath, recording_duration_sec: recordingDurationSec })
      .eq('id', params.sessionId)

    const result = await processSessionAudio(supabase, params.sessionId, audioPath, recordingDurationSec)
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
