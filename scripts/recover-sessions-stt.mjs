// One-off recovery for sessions whose AI summary was produced from a whisper-1
// hallucination loop (low-volume audio). Re-runs the NEW pipeline locally:
//   ffmpeg decode -> 16kHz mono PCM -> normalizePcm -> planChunks/encodeWav
//   -> gpt-4o-transcribe each chunk -> assessTranscript -> Claude summary
//   -> combineSessionNotes (preserve handwritten notes) -> DB update.
//
// The pure-function logic below mirrors lib/audio/{normalize,chunk,quality}.ts
// and lib/audio-pipeline/{notes,summarize}.ts (kept in sync intentionally — this
// is a throwaway ops script that cannot import the project's .ts modules without
// a TS loader). ffmpeg performs the decode/resample/downmix that the browser's
// OfflineAudioContext does in prepareUpload.ts.
//
// Usage:
//   node scripts/recover-sessions-stt.mjs            # DRY-RUN (prints, no writes)
//   node scripts/recover-sessions-stt.mjs --write    # apply to DB

import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const TARGETS = [
  '6e6156ec-6765-4c9f-af78-c5c1d9230919',
  'f321502a-28c6-42a6-8091-736296a8d424',
]
const SR = 16000
const BUCKET = 'check-up-sessions'
const WRITE = process.argv.includes('--write')

// ---- env ----
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_KEY
process.env.OPENAI_API_KEY = env.OPENAI_API_KEY
process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY

// ---- pure fns (mirror of lib/audio/*) ----
function normalizePcm(s, { targetRmsDb = -20, maxGainDb = 30, limitDb = -1 } = {}) {
  let sq = 0; for (let i = 0; i < s.length; i++) sq += s[i] * s[i]
  const rms = Math.sqrt(sq / Math.max(1, s.length))
  if (rms < 1e-6) return s.slice()
  const gain = Math.min(Math.pow(10, targetRmsDb / 20) / rms, Math.pow(10, maxGainDb / 20))
  const limit = Math.pow(10, limitDb / 20)
  const o = new Float32Array(s.length)
  for (let i = 0; i < s.length; i++) { let v = s[i] * gain; o[i] = v > limit ? limit : v < -limit ? -limit : v }
  return o
}
function planChunks(total, sr, { maxSec = 720, maxBytes = 24 * 1024 * 1024, bytesPerSample = 2 } = {}) {
  const HARD_MAX_SEC = 1400, HARD_MAX_BYTES = 25 * 1024 * 1024
  const byBytes = Math.floor((Math.min(maxBytes, HARD_MAX_BYTES) - 44) / bytesPerSample)
  const bySec = Math.floor(Math.min(maxSec, HARD_MAX_SEC) * sr)
  const max = Math.max(1, Math.min(byBytes, bySec))
  const out = []
  for (let start = 0; start < total; start += max) out.push({ start, end: Math.min(start + max, total) })
  return out.length ? out : [{ start: 0, end: 0 }]
}
function encodeWav(samples, sr) {
  const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, n * 2, true)
  let off = 44
  for (let i = 0; i < n; i++) { let x = Math.max(-1, Math.min(1, samples[i])); x = x < 0 ? x * 0x8000 : x * 0x7fff; v.setInt16(off, x, true); off += 2 }
  return new Uint8Array(buf)
}
function assessTranscript(text, durationSec, { minCharsPerSec = 1.2, minRepetitionRatio = 0.4 } = {}) {
  const t = text.trim()
  const segs = t.split(/[\s.?!\n,]+/).map(s => s.trim()).filter(s => s.length >= 1)
  const repetitionRatio = segs.length ? new Set(segs).size / segs.length : 0
  const charsPerSec = durationSec > 0 ? t.length / durationSec : 0
  let reason
  if (segs.length === 0) reason = 'empty'
  else if (repetitionRatio < minRepetitionRatio) reason = 'repetitive'
  else if (charsPerSec < minCharsPerSec) reason = 'low-yield'
  return { ok: !reason, charsPerSec, repetitionRatio, reason }
}
const AI_DIVIDER = '\n\n---\n\n**🤖 AI 요약**\n\n'
const AI_DIVIDER_RE = /\n+-{3,}\n+[*_]*🤖 AI 요약[*_]*\n+/
function combineSessionNotes(prev, summary) {
  const userPart = (prev ?? '').split(AI_DIVIDER_RE)[0].trimEnd()
  return userPart ? `${userPart}${AI_DIVIDER}${summary}` : summary
}
function buildSummaryPrompt(transcript) {
  return `당신은 1:1 미팅 노트 작성 전문가입니다.\n아래는 Admin과 Champion 간의 1-on-1 세션 전사 내용입니다.\n\n다음 두 가지를 JSON으로 반환하세요:\n1. "notes": 미팅 주요 내용 요약 (plain text, 한국어, 3~5문단)\n2. "actionItems": 액션 아이템 배열 (각 항목은 { "body": string } 형식)\n\n전사 내용:\n${transcript}\n\nJSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.`
}
function parseSummaryResponse(text) {
  let j = text.trim()
  const f = j.match(/```(?:json)?\n?([\s\S]*?)\n?```/); if (f) j = f[1].trim()
  const p = JSON.parse(j)
  return { notes: p.notes ?? '', actionItems: Array.isArray(p.actionItems) ? p.actionItems : [] }
}

// ---- helpers ----
async function sb(path, init = {}) {
  return fetch(`${URL}${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...(init.headers || {}) } })
}
async function getSession(id) {
  const r = await sb(`/rest/v1/check_up_sessions?id=eq.${id}&select=id,audio_file_path,recording_duration_sec,notes`)
  return (await r.json())[0]
}
async function downloadAudio(path) {
  const r = await sb(`/storage/v1/object/${BUCKET}/${path}`)
  if (!r.ok) throw new Error(`download ${path}: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}
function decodePcm(webmBuf) {
  const tmp = `/tmp/recover-${process.pid}.webm`
  fs.writeFileSync(tmp, webmBuf)
  const out = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 })
  fs.rmSync(tmp, { force: true })
  return new Float32Array(out.buffer, out.byteOffset, Math.floor(out.byteLength / 4))
}
async function transcribeChunk(openai, toFile, wav) {
  const f = await toFile(new Blob([wav], { type: 'audio/wav' }), 'audio.wav', { type: 'audio/wav' })
  const t = await openai.audio.transcriptions.create({ file: f, model: 'gpt-4o-transcribe', language: 'ko' })
  return t.text
}

async function main() {
  const OpenAI = (await import('openai')).default
  const { toFile } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const { generateText } = await import('ai')
  const { anthropic } = await import('@ai-sdk/anthropic')

  for (const id of TARGETS) {
    console.log(`\n================ session ${id}`)
    const sess = await getSession(id)
    if (!sess?.audio_file_path) { console.log('  no audio_file_path, skip'); continue }
    const dur = sess.recording_duration_sec ?? 0

    const pcm = normalizePcm(decodePcm(await downloadAudio(sess.audio_file_path)))
    const chunks = planChunks(pcm.length, SR).map(c => encodeWav(pcm.subarray(c.start, c.end), SR))
    console.log(`  duration=${dur}s  samples=${pcm.length}  chunks=${chunks.length}`)

    const parts = []
    for (let i = 0; i < chunks.length; i++) parts.push(await transcribeChunk(openai, toFile, chunks[i]))
    const transcript = parts.join(' ').trim()
    const q = assessTranscript(transcript, dur)
    console.log(`  transcript: ${transcript.length} chars | charsPerSec=${q.charsPerSec.toFixed(2)} repRatio=${q.repetitionRatio.toFixed(2)} ok=${q.ok}${q.reason ? ' (' + q.reason + ')' : ''}`)
    console.log(`  head: ${JSON.stringify(transcript.slice(0, 220))}`)

    const { text } = await generateText({ model: anthropic('claude-sonnet-4-6'), prompt: buildSummaryPrompt(transcript) })
    let summary
    try { summary = parseSummaryResponse(text) } catch { console.log('  ⚠️ summary parse failed; raw:', text.slice(0, 200)); continue }
    const banner = q.ok ? '' : '> ⚠️ 전사 품질이 낮을 수 있습니다. 녹음 음량이 작거나 잡음이 많으면 재녹음/재처리를 권장합니다.\n\n'
    const combined = combineSessionNotes(sess.notes ?? '', banner + summary.notes)
    const status = q.ok ? 'done' : 'low_quality'
    console.log(`  → status=${status}, actionItems=${summary.actionItems.length}`)
    console.log(`  notes preview:\n${combined.split('\n').slice(0, 14).map(l => '    ' + l).join('\n')}`)

    if (!WRITE) { console.log('  [DRY-RUN] no DB write'); continue }
    await sb(`/rest/v1/session_action_items?session_id=eq.${id}`, { method: 'DELETE' })
    if (summary.actionItems.length) {
      await sb(`/rest/v1/session_action_items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary.actionItems.map((a, idx) => ({ session_id: id, body: a.body, display_order: idx }))),
      })
    }
    const up = await sb(`/rest/v1/check_up_sessions?id=eq.${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ raw_transcript: transcript, notes: combined, processing_status: status, updated_at: new Date().toISOString() }),
    })
    console.log(`  [WRITE] update status: ${up.status}`)
  }
  console.log(`\nDone.${WRITE ? '' : ' (DRY-RUN — re-run with --write to apply)'}`)
}
main().catch(e => { console.error(e); process.exit(1) })
