import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { processSessionAudio, SummaryParseError } from '@/lib/sessions/processAudio'
import { claimSessionForProcessing } from '@/lib/sessions/lock'

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

  const BUCKET = 'check-up-sessions'
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

  try {
    const claimed = await claimSessionForProcessing(supabase, params.sessionId)
    if (!claimed) {
      return NextResponse.json(
        { error: '이미 처리 중인 세션입니다. 잠시 후 다시 시도하세요.' },
        { status: 409 }
      )
    }

    const result = await processSessionAudio(supabase, params.sessionId, audioPaths, session.recording_duration_sec ?? 0)
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
