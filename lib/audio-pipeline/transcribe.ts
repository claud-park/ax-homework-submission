import OpenAI from 'openai'
import { toFile } from 'openai'
import { MAX_AUDIO_BYTES, MAX_AUDIO_MB, resolveAudioType } from '@/lib/audio'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/** Whisper STT — no Supabase or DB dependencies. */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  filename: string
): Promise<string> {
  if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    const mb = (audioBuffer.byteLength / (1024 * 1024)).toFixed(1)
    throw new Error(
      `오디오가 너무 큽니다 (${mb}MB). Whisper 전사 한도는 ${MAX_AUDIO_MB}MB입니다. 더 짧게 녹음하거나 나눠서 업로드하세요.`
    )
  }

  const { ext, contentType } = resolveAudioType(filename)
  const audioBlob = new Blob([audioBuffer], { type: contentType })
  const whisperFile = await toFile(audioBlob, `audio.${ext}`, { type: contentType })
  const transcription = await openai.audio.transcriptions.create({
    file: whisperFile,
    model: 'whisper-1',
    language: 'ko',
  })
  return transcription.text
}
