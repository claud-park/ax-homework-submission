import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import OpenAI from 'openai'
import { toFile } from 'openai'

const MODEL = 'claude-sonnet-4-6'
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: process.env.GROQ_API_KEY ? 'https://api.groq.com/openai/v1' : undefined,
})

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
      model: process.env.GROQ_API_KEY ? 'whisper-large-v3-turbo' : 'whisper-1',
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

    const { text, usage: claudeUsage } = await generateText({
      model: anthropic(MODEL),
      prompt,
    })

    let notes = ''
    let actionItems: { body: string }[] = []
    try {
      // Claude sometimes wraps JSON in code fences — strip them first
      let jsonStr = text.trim()
      const fenceMatch = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
      if (fenceMatch) jsonStr = fenceMatch[1].trim()
      const parsed = JSON.parse(jsonStr)
      notes = parsed.notes ?? ''
      actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : []
    } catch {
      // Claude returned non-JSON; surface as error so admin knows to review
      await supabase
        .from('check_up_sessions')
        .update({ processing_status: 'error', notes: text, updated_at: new Date().toISOString() })
        .eq('id', params.sessionId)
      return NextResponse.json(
        { error: 'AI 요약 결과를 파싱할 수 없습니다. 전사 텍스트를 확인하세요.', notes: text, actionItems: [] },
        { status: 422 }
      )
    }

    // 7. Save results
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'done', notes, updated_at: new Date().toISOString() })
      .eq('id', params.sessionId)

    let insertedActionItems: import('@/lib/types').SessionActionItem[] = []
    if (actionItems.length > 0) {
      const { data } = await supabase
        .from('session_action_items')
        .insert(
          actionItems.map((item, idx) => ({
            session_id: params.sessionId,
            body: item.body,
            display_order: idx,
          }))
        )
        .select()
      insertedActionItems = data ?? []
    }

    const durationMin = (recordingDurationSec ?? 0) / 60
    const whisperCost = process.env.GROQ_API_KEY ? 0 : durationMin * 0.006
    const claudeInputCost = ((claudeUsage.inputTokens ?? 0) / 1_000_000) * 3
    const claudeOutputCost = ((claudeUsage.outputTokens ?? 0) / 1_000_000) * 15
    const claudeCost = claudeInputCost + claudeOutputCost

    return NextResponse.json({
      notes,
      actionItems: insertedActionItems,
      usage: {
        stt: {
          provider: process.env.GROQ_API_KEY ? 'groq' : 'openai',
          durationSec: recordingDurationSec ?? 0,
          cost: whisperCost,
        },
        claude: {
          inputTokens: claudeUsage.inputTokens ?? 0,
          outputTokens: claudeUsage.outputTokens ?? 0,
          cost: claudeCost,
        },
        totalCost: whisperCost + claudeCost,
      },
    })
  } catch (err) {
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'error' })
      .eq('id', params.sessionId)
    const message = err instanceof Error ? err.message : 'Processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
