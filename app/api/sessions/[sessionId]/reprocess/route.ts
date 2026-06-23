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

  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('id, audio_file_path, processing_status')
    .eq('id', params.sessionId)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!session.audio_file_path) {
    return NextResponse.json({ error: '저장된 오디오 파일이 없습니다.' }, { status: 400 })
  }

  try {
    // 1. Download audio from Storage
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'transcribing' })
      .eq('id', params.sessionId)

    const { data: audioData, error: dlError } = await supabase.storage
      .from('check-up-sessions')
      .download(session.audio_file_path)
    if (dlError || !audioData) throw new Error(`오디오 다운로드 실패: ${dlError?.message}`)

    // 2. Whisper STT
    const audioBuffer = await audioData.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' })
    const whisperFile = await toFile(audioBlob, 'audio.webm', { type: 'audio/webm' })
    const transcription = await openai.audio.transcriptions.create({
      file: whisperFile,
      model: 'whisper-1',
      language: 'ko',
    })
    const transcript = transcription.text

    // 3. Claude summarization
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'summarizing', raw_transcript: transcript })
      .eq('id', params.sessionId)

    const prompt = `당신은 1:1 미팅 노트 작성 전문가입니다.
아래는 Admin과 Champion 간의 체크업 세션 전사 내용입니다.

다음 두 가지를 JSON으로 반환하세요:
1. "notes": 미팅 주요 내용 요약 (plain text, 한국어, 3~5문단)
2. "actionItems": 액션 아이템 배열 (각 항목은 { "body": string } 형식)

전사 내용:
${transcript}

JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.`

    const { text, usage: claudeUsage } = await generateText({ model: anthropic(MODEL), prompt })

    let notes = ''
    let actionItems: { body: string }[] = []
    try {
      let jsonStr = text.trim()
      const fenceMatch = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/)
      if (fenceMatch) jsonStr = fenceMatch[1].trim()
      const parsed = JSON.parse(jsonStr)
      notes = parsed.notes ?? ''
      actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : []
    } catch {
      await supabase
        .from('check_up_sessions')
        .update({ processing_status: 'error', notes: text, updated_at: new Date().toISOString() })
        .eq('id', params.sessionId)
      return NextResponse.json(
        { error: 'AI 요약 결과를 파싱할 수 없습니다.', notes: text, actionItems: [] },
        { status: 422 }
      )
    }

    // 4. Delete old action items, insert fresh ones
    await supabase.from('session_action_items').delete().eq('session_id', params.sessionId)

    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'done', notes, updated_at: new Date().toISOString() })
      .eq('id', params.sessionId)

    let insertedActionItems: import('@/lib/types').SessionActionItem[] = []
    if (actionItems.length > 0) {
      const { data } = await supabase
        .from('session_action_items')
        .insert(actionItems.map((item, idx) => ({
          session_id: params.sessionId,
          body: item.body,
          display_order: idx,
        })))
        .select()
      insertedActionItems = data ?? []
    }

    // Audio duration from Storage metadata is unavailable; use session field if set
    const { data: sessionMeta } = await supabase
      .from('check_up_sessions')
      .select('recording_duration_sec')
      .eq('id', params.sessionId)
      .single()
    const durationSec = sessionMeta?.recording_duration_sec ?? 0
    const durationMin = durationSec / 60
    const whisperCost = durationMin * 0.006
    const claudeInputCost = ((claudeUsage.inputTokens ?? 0) / 1_000_000) * 3
    const claudeOutputCost = ((claudeUsage.outputTokens ?? 0) / 1_000_000) * 15
    const claudeCost = claudeInputCost + claudeOutputCost

    return NextResponse.json({
      notes,
      actionItems: insertedActionItems,
      usage: {
        stt: {
          durationSec,
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
    const message = err instanceof Error ? err.message : 'Reprocess failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
