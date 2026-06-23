import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import OpenAI from 'openai'
import { toFile } from 'openai'

const MODEL = 'claude-sonnet-4-6'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type Params = { params: { sessionId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  // Get session
  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('id, champion_user_id')
    .eq('id', params.sessionId)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Parse multipart form data
  const formData = await req.formData()
  const audioFile = formData.get('audio') as File | null
  const durationStr = formData.get('recordingDurationSec') as string | null
  if (!audioFile) return NextResponse.json({ error: 'audio file required' }, { status: 400 })

  const recordingDurationSec = durationStr ? parseInt(durationStr, 10) : null

  try {
    // 1. Update status: uploading
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'uploading', recording_duration_sec: recordingDurationSec })
      .eq('id', params.sessionId)

    // 2. Upload audio to Supabase Storage
    const audioBuffer = await audioFile.arrayBuffer()
    const filePath = `sessions/${params.sessionId}/audio.webm`
    const { error: uploadError } = await supabase.storage
      .from('check-up-sessions')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/webm',
        upsert: true,
      })
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    // 3. Update status: transcribing
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'transcribing', audio_file_path: filePath })
      .eq('id', params.sessionId)

    // 4. Whisper STT
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' })
    const whisperFile = await toFile(audioBlob, 'audio.webm', { type: 'audio/webm' })
    const transcription = await openai.audio.transcriptions.create({
      file: whisperFile,
      model: 'whisper-1',
      language: 'ko',
    })
    const transcript = transcription.text

    // 5. Update status: summarizing
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'summarizing', raw_transcript: transcript })
      .eq('id', params.sessionId)

    // 6. Claude summarization
    const prompt = `당신은 1:1 미팅 노트 작성 전문가입니다.
아래는 Admin과 Champion 간의 체크업 세션 전사 내용입니다.

다음 두 가지를 JSON으로 반환하세요:
1. "notes": 미팅 주요 내용 요약 (plain text, 한국어, 3~5문단)
2. "actionItems": 액션 아이템 배열 (각 항목은 { "body": string } 형식)

전사 내용:
${transcript}

JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.`

    const { text } = await generateText({
      model: anthropic(MODEL),
      prompt,
    })

    let notes = ''
    let actionItems: { body: string }[] = []
    try {
      const parsed = JSON.parse(text.trim())
      notes = parsed.notes ?? ''
      actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : []
    } catch {
      // If JSON parsing fails, use the raw text as notes
      notes = text
    }

    // 7. Save results
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'done', notes, updated_at: new Date().toISOString() })
      .eq('id', params.sessionId)

    if (actionItems.length > 0) {
      await supabase.from('session_action_items').insert(
        actionItems.map((item, idx) => ({
          session_id: params.sessionId,
          body: item.body,
          display_order: idx,
        }))
      )
    }

    return NextResponse.json({ notes, actionItems })
  } catch (err) {
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'error' })
      .eq('id', params.sessionId)
    const message = err instanceof Error ? err.message : 'Processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
