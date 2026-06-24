import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { processSessionAudio, SummaryParseError } from '@/lib/sessions/processAudio'

export const maxDuration = 300

type Params = { params: { sessionId: string } }

/** Re-run STT + summary on the audio already stored for this session. */
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('id, audio_file_path, recording_duration_sec')
    .eq('id', params.sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!session.audio_file_path) {
    return NextResponse.json({ error: '저장된 오디오 파일이 없습니다.' }, { status: 400 })
  }

  try {
    const durationSec = session.recording_duration_sec ?? 0
    const result = await processSessionAudio(supabase, params.sessionId, session.audio_file_path, durationSec)
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
    const message = err instanceof Error ? err.message : 'Reprocess failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
