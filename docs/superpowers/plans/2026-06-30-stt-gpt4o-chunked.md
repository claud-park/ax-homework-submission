# 1-on-1 STT 견고화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저음량 1-on-1 녹음에서 whisper-1 환각 루프로 잘못 요약되던 문제를, 클라이언트 전처리(정규화·청크) + `gpt-4o-transcribe` + 품질 가드로 해결한다.

**Architecture:** 브라우저가 녹음 blob을 16kHz mono로 디코드→RMS 정규화→≤720s WAV 청크로 분할해 Storage에 직접 업로드한다. 서버 `process`는 청크별로 `gpt-4o-transcribe`(1400s 상한 우회)한 뒤 합쳐 요약하고, 전사 품질이 낮으면 `low_quality`로 표시한다.

**Tech Stack:** Next.js(App Router), TypeScript, Supabase Storage/Postgres, OpenAI `gpt-4o-transcribe`, Anthropic(요약, 변경 없음), Vitest, Web Audio API(`OfflineAudioContext`).

## Global Constraints

- 기계적 구현 subagent 모델 하한은 Sonnet(`claude-sonnet-4-6`).
- 순수 함수(normalize/chunk/quality)는 DOM/Storage/DB 의존 없이 Node에서 vitest로 테스트 가능해야 함.
- 청크는 항상 ≤1400초 AND ≤25MB. 기본 경계 ≤720초 + ≤24MB.
- 요약 모델/프롬프트 변경 금지. 핸드라이팅 노트는 `combineSessionNotes`로 보존.
- 스토리지 경로는 항상 `sessions/{sessionId}/`로 시작(경로 검증 유지).
- 커밋 메시지 prefix `[AX-1]`, 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- Create `lib/audio/normalize.ts` — `normalizePcm` (순수)
- Create `lib/audio/chunk.ts` — `planChunks`, `encodeWav` (순수)
- Create `lib/audio/quality.ts` — `assessTranscript` (순수)
- Create `lib/audio/prepareUpload.ts` — 브라우저 글루(`prepareAudioForUpload`)
- Modify `lib/audio-pipeline/transcribe.ts` — 모델 `gpt-4o-transcribe`
- Modify `lib/sessions/processAudio.ts` — 멀티 청크 전사 + 품질 가드
- Modify `app/api/sessions/[sessionId]/process/route.ts` — `audioPaths[]` 수용
- Modify `app/api/sessions/[sessionId]/upload-url/route.ts` — `index` → chunk 경로
- Modify `app/api/sessions/[sessionId]/reprocess/route.ts` — 폴더 list로 청크 수집
- Modify `components/sessions/RecordingPanel.tsx` — 멀티 청크 업로드
- Modify `lib/types.ts` — `processing_status`에 `'low_quality'`
- Create `supabase/migrations/20260630000000_session_low_quality_status.sql`
- Modify `components/sessions/AdminSessionDetail.tsx` (+ 리스트) — `low_quality` 배지
- Create `scripts/recover-sessions-stt.mjs` — 기존 두 세션 복구
- Tests: `test/lib/audio-normalize.test.ts`, `test/lib/audio-chunk.test.ts`, `test/lib/audio-quality.test.ts`, `test/lib/process-audio-chunks.test.ts`

---

### Task 1: `normalizePcm` (RMS 정규화 + 리미터)

**Files:**
- Create: `lib/audio/normalize.ts`
- Test: `test/lib/audio-normalize.test.ts`

**Interfaces:**
- Produces: `normalizePcm(samples: Float32Array, opts?: { targetRmsDb?: number; maxGainDb?: number; limitDb?: number }): Float32Array`

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/audio-normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizePcm } from '@/lib/audio/normalize'

function rmsDb(s: Float32Array) {
  let sum = 0
  for (const v of s) sum += v * v
  return 20 * Math.log10(Math.sqrt(sum / s.length))
}

describe('normalizePcm', () => {
  it('boosts quiet audio toward target RMS', () => {
    const quiet = new Float32Array(16000).map((_, i) => 0.01 * Math.sin(i / 4)) // ~-43dB
    const out = normalizePcm(quiet, { targetRmsDb: -20, maxGainDb: 30 })
    expect(rmsDb(out)).toBeGreaterThan(-24)
    expect(rmsDb(out)).toBeLessThan(-16)
  })

  it('passes silence through unchanged (no noise blow-up)', () => {
    const silence = new Float32Array(1000)
    const out = normalizePcm(silence)
    expect(Array.from(out).every(v => v === 0)).toBe(true)
  })

  it('limits peaks to limitDb', () => {
    const loud = new Float32Array(1000).map(() => 0.9)
    const out = normalizePcm(loud, { targetRmsDb: 0, maxGainDb: 30, limitDb: -1 })
    const limit = Math.pow(10, -1 / 20)
    expect(Math.max(...out)).toBeLessThanOrEqual(limit + 1e-6)
  })

  it('respects maxGainDb cap', () => {
    const veryQuiet = new Float32Array(1000).map(() => 0.001) // ~-60dB
    const out = normalizePcm(veryQuiet, { targetRmsDb: -20, maxGainDb: 10 })
    expect(rmsDb(out)).toBeLessThan(-45) // -60 + 10 ≈ -50, far below -20
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/audio-normalize.test.ts`
Expected: FAIL ("Cannot find module '@/lib/audio/normalize'")

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/audio/normalize.ts
export interface NormalizeOpts {
  targetRmsDb?: number
  maxGainDb?: number
  limitDb?: number
}

/**
 * RMS 기반 게인 정규화 + 하드 리미터. 저음량 음성을 일정 레벨로 끌어올리되,
 * maxGainDb로 노이즈 과증폭을 막고 limitDb로 클리핑한다. 무음은 그대로 통과.
 */
export function normalizePcm(samples: Float32Array, opts: NormalizeOpts = {}): Float32Array {
  const targetRmsDb = opts.targetRmsDb ?? -20
  const maxGainDb = opts.maxGainDb ?? 30
  const limitDb = opts.limitDb ?? -1

  let sumSq = 0
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i]
  const rms = Math.sqrt(sumSq / Math.max(1, samples.length))
  if (rms < 1e-6) return samples.slice()

  const targetRms = Math.pow(10, targetRmsDb / 20)
  const maxGain = Math.pow(10, maxGainDb / 20)
  const gain = Math.min(targetRms / rms, maxGain)
  const limit = Math.pow(10, limitDb / 20)

  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    let v = samples[i] * gain
    if (v > limit) v = limit
    else if (v < -limit) v = -limit
    out[i] = v
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/audio-normalize.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/audio/normalize.ts test/lib/audio-normalize.test.ts
git commit -m "[AX-1] feat(audio): RMS 게인 정규화 + 리미터 (저음량 보정)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `planChunks` + `encodeWav`

**Files:**
- Create: `lib/audio/chunk.ts`
- Test: `test/lib/audio-chunk.test.ts`

**Interfaces:**
- Produces:
  - `planChunks(totalSamples: number, sampleRate: number, opts?: { maxSec?: number; maxBytes?: number; bytesPerSample?: number }): { start: number; end: number }[]`
  - `encodeWav(samples: Float32Array, sampleRate: number): Uint8Array`

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/audio-chunk.test.ts
import { describe, it, expect } from 'vitest'
import { planChunks, encodeWav } from '@/lib/audio/chunk'

describe('planChunks', () => {
  it('splits by maxSec when that is the tighter bound', () => {
    const sr = 16000
    const total = sr * 1500 // 25 min
    const chunks = planChunks(total, sr, { maxSec: 720, maxBytes: 1e12 })
    expect(chunks.length).toBe(3) // 720,720,60
    expect(chunks[0]).toEqual({ start: 0, end: 720 * sr })
    expect(chunks[chunks.length - 1].end).toBe(total)
    for (const c of chunks) expect(c.end - c.start).toBeLessThanOrEqual(720 * sr)
  })

  it('splits by maxBytes when that is tighter', () => {
    const sr = 16000
    const total = sr * 1500
    // 24MB / 2 bytes ≈ 12.58M samples ≈ 786s → tighter than 1400s but looser than 720s
    const chunks = planChunks(total, sr, { maxSec: 1400, maxBytes: 24 * 1024 * 1024 })
    const maxSamples = Math.floor((24 * 1024 * 1024 - 44) / 2)
    for (const c of chunks) expect(c.end - c.start).toBeLessThanOrEqual(maxSamples)
  })

  it('returns one chunk for short audio', () => {
    const sr = 16000
    expect(planChunks(sr * 60, sr)).toEqual([{ start: 0, end: sr * 60 }])
  })
})

describe('encodeWav', () => {
  it('writes a valid 16kHz mono 16-bit WAV header', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000)
    const dv = new DataView(wav.buffer)
    expect(String.fromCharCode(wav[0], wav[1], wav[2], wav[3])).toBe('RIFF')
    expect(String.fromCharCode(wav[8], wav[9], wav[10], wav[11])).toBe('WAVE')
    expect(dv.getUint16(22, true)).toBe(1)       // mono
    expect(dv.getUint32(24, true)).toBe(16000)   // sample rate
    expect(dv.getUint16(34, true)).toBe(16)      // bits
    expect(dv.getUint32(40, true)).toBe(5 * 2)   // data bytes
    expect(wav.length).toBe(44 + 5 * 2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/audio-chunk.test.ts`
Expected: FAIL ("Cannot find module '@/lib/audio/chunk'")

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/audio/chunk.ts
const WAV_HEADER_BYTES = 44

export interface ChunkOpts {
  maxSec?: number
  maxBytes?: number
  bytesPerSample?: number
}

/** 청크 경계(샘플 인덱스) 계산: maxSec와 maxBytes 중 더 작은 상한으로 균등 분할. */
export function planChunks(
  totalSamples: number,
  sampleRate: number,
  opts: ChunkOpts = {}
): { start: number; end: number }[] {
  const maxSec = opts.maxSec ?? 720
  const maxBytes = opts.maxBytes ?? 24 * 1024 * 1024
  const bytesPerSample = opts.bytesPerSample ?? 2

  const byBytes = Math.floor((maxBytes - WAV_HEADER_BYTES) / bytesPerSample)
  const bySec = Math.floor(maxSec * sampleRate)
  const maxSamples = Math.max(1, Math.min(byBytes, bySec))

  const chunks: { start: number; end: number }[] = []
  for (let start = 0; start < totalSamples; start += maxSamples) {
    chunks.push({ start, end: Math.min(start + maxSamples, totalSamples) })
  }
  if (chunks.length === 0) chunks.push({ start: 0, end: 0 })
  return chunks
}

/** Float32 PCM → 16kHz mono 16-bit PCM WAV 바이트. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const n = samples.length
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + n * 2)
  const view = new DataView(buffer)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + n * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)            // PCM
  view.setUint16(22, 1, true)            // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)            // block align
  view.setUint16(34, 16, true)           // bits
  writeStr(36, 'data')
  view.setUint32(40, n * 2, true)
  let off = WAV_HEADER_BYTES
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]))
    s = s < 0 ? s * 0x8000 : s * 0x7fff
    view.setInt16(off, s, true)
    off += 2
  }
  return new Uint8Array(buffer)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/audio-chunk.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/audio/chunk.ts test/lib/audio-chunk.test.ts
git commit -m "[AX-1] feat(audio): 청크 경계 계산 + WAV 인코딩 (순수함수)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `assessTranscript` (품질 가드)

**Files:**
- Create: `lib/audio/quality.ts`
- Test: `test/lib/audio-quality.test.ts`

**Interfaces:**
- Produces: `assessTranscript(text: string, durationSec: number, opts?: { minCharsPerSec?: number; minRepetitionRatio?: number }): { ok: boolean; charsPerSec: number; repetitionRatio: number; reason?: string }`

- [ ] **Step 1: Write the failing test (실제 버그 transcript를 fixture로)**

```ts
// test/lib/audio-quality.test.ts
import { describe, it, expect } from 'vitest'
import { assessTranscript } from '@/lib/audio/quality'

const BAD_REPEAT = Array(40).fill('현금으로 따시면 됩니다').join(' ')              // 세션 A 환각
const BAD_COUNT = Array(60).fill(0).map((_, i) => `${i}.5cm로 잘라줍니다`).join(' ') // 세션 B 환각
const GOOD = '오늘 미팅에서는 상세페이지 자동화 아이디어를 논의했다. 디자이너 리소스를 줄일 수 있지만 담당자가 한 명이라 과한 투자일 수 있다. Claude Code 활용을 추천했고 과제정의서를 두 벌로 나누기로 했다. 크롤링과 상세페이지 제작을 분리한다.'

describe('assessTranscript', () => {
  it('flags repetitive hallucination loops', () => {
    const r = assessTranscript(BAD_REPEAT, 1528)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('repetitive')
  })

  it('flags low char-per-second yield', () => {
    const r = assessTranscript('짧은 내용 조금', 1500) // 매우 낮은 chars/sec
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('low-yield')
  })

  it('flags counting-loop hallucination', () => {
    expect(assessTranscript(BAD_COUNT, 1472).ok).toBe(false)
  })

  it('accepts a normal varied transcript', () => {
    const r = assessTranscript(GOOD, 120)
    expect(r.ok).toBe(true)
    expect(r.reason).toBeUndefined()
  })

  it('flags empty transcript', () => {
    expect(assessTranscript('   ', 100).reason).toBe('empty')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/audio-quality.test.ts`
Expected: FAIL ("Cannot find module '@/lib/audio/quality'")

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/audio/quality.ts
export interface TranscriptQuality {
  ok: boolean
  charsPerSec: number
  repetitionRatio: number
  reason?: 'empty' | 'repetitive' | 'low-yield'
}

/**
 * 전사 품질 휴리스틱. 저음량 환각은 (1) 같은 세그먼트 반복(낮은 고유비율),
 * (2) 길이 대비 매우 적은 글자수(낮은 chars/sec)로 드러난다.
 */
export function assessTranscript(
  text: string,
  durationSec: number,
  opts: { minCharsPerSec?: number; minRepetitionRatio?: number } = {}
): TranscriptQuality {
  const minCharsPerSec = opts.minCharsPerSec ?? 1.2
  const minRepetitionRatio = opts.minRepetitionRatio ?? 0.4

  const t = text.trim()
  const segs = t.split(/[\s.?!\n,]+/).map(s => s.trim()).filter(s => s.length > 2)
  const repetitionRatio = segs.length ? new Set(segs).size / segs.length : 0
  const charsPerSec = durationSec > 0 ? t.length / durationSec : 0

  let reason: TranscriptQuality['reason']
  if (segs.length === 0) reason = 'empty'
  else if (repetitionRatio < minRepetitionRatio) reason = 'repetitive'
  else if (charsPerSec < minCharsPerSec) reason = 'low-yield'

  return { ok: !reason, charsPerSec, repetitionRatio, reason }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/audio-quality.test.ts`
Expected: PASS. 실패 시 임계값(`minCharsPerSec`/`minRepetitionRatio`)을 fixture 통과하도록 조정.

- [ ] **Step 5: Commit**

```bash
git add lib/audio/quality.ts test/lib/audio-quality.test.ts
git commit -m "[AX-1] feat(audio): 전사 품질 가드 (반복/저수율 환각 탐지)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `transcribe.ts` 모델 교체

**Files:**
- Modify: `lib/audio-pipeline/transcribe.ts`

**Interfaces:**
- Produces: `transcribeAudio(audioBuffer: ArrayBuffer, filename: string): Promise<string>` (시그니처 동일, 모델만 변경)

- [ ] **Step 1: 모델 상수 교체**

`lib/audio-pipeline/transcribe.ts:22-26`의 `model: 'whisper-1'`을 `model: 'gpt-4o-transcribe'`로 변경. 나머지(`language: 'ko'`, `toFile`) 유지. 파일 상단에 주석 추가:

```ts
// gpt-4o-transcribe: whisper-1 대비 저음량/무음에서 환각 반복 루프가 없음.
// 단 1400초(~23분) 상한이 있어 호출부에서 청크 분할 후 청크 단위로 호출한다.
```

- [ ] **Step 2: 회귀 테스트 실행**

Run: `npx vitest run test/lib/audio-pipeline.test.ts`
Expected: PASS (transcribe 목 사용 — 모델 문자열 변경에 영향 없어야 함). 목이 `whisper-1`을 단정하면 `gpt-4o-transcribe`로 갱신.

- [ ] **Step 3: Commit**

```bash
git add lib/audio-pipeline/transcribe.ts test/lib/audio-pipeline.test.ts
git commit -m "[AX-1] fix(audio): STT 모델 whisper-1 → gpt-4o-transcribe (환각 루프 제거)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `processAudio` 멀티 청크 + 품질 가드

**Files:**
- Modify: `lib/sessions/processAudio.ts`
- Test: `test/lib/process-audio-chunks.test.ts`

**Interfaces:**
- Consumes: `transcribeAudio` (Task 4), `assessTranscript` (Task 3), `summarizeTranscript`/`combineSessionNotes` (기존)
- Produces: `processSessionAudio(supabase, sessionId: string, audioPaths: string[], durationSec: number): Promise<ProcessResult>` — **인자 `audioFilePath: string` → `audioPaths: string[]`로 변경**. `ProcessResult`에 `lowQuality?: boolean` 추가.

- [ ] **Step 1: Write the failing test (멀티 청크 join + 품질 분기)**

```ts
// test/lib/process-audio-chunks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/audio-pipeline/transcribe', () => ({
  transcribeAudio: vi.fn(),
}))
vi.mock('@/lib/audio-pipeline/summarize', () => ({
  summarizeTranscript: vi.fn(async () => ({ notes: '요약', actionItems: [], inputTokens: 1, outputTokens: 1 })),
}))

import { transcribeAudio } from '@/lib/audio-pipeline/transcribe'
import { processSessionAudio } from '@/lib/sessions/processAudio'

function fakeSupabase() {
  const updates: any[] = []
  const storage = {
    from: () => ({ download: vi.fn(async () => ({ data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null })) }),
  }
  const from = (table: string) => ({
    update: (vals: any) => { updates.push({ table, vals }); return { eq: () => ({ select: async () => ({ data: [{ id: 'x' }] }) }) } },
    delete: () => ({ eq: async () => ({}) }),
    insert: () => ({ select: async () => ({ data: [] }) }),
    select: () => ({ eq: () => ({ single: async () => ({ data: { notes: '' } }) }) }),
  })
  return { client: { from, storage } as any, updates }
}

describe('processSessionAudio (chunked)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('transcribes each chunk in order and joins', async () => {
    ;(transcribeAudio as any).mockResolvedValueOnce('첫번째 청크 내용 다양함 한국어 문장 여러개')
      .mockResolvedValueOnce('두번째 청크 또다른 내용 정상적인 대화')
    const { client } = fakeSupabase()
    const res = await processSessionAudio(client, 's1', ['sessions/s1/chunk_000.wav', 'sessions/s1/chunk_001.wav'], 120)
    expect((transcribeAudio as any).mock.calls.length).toBe(2)
    expect(res.notes).toContain('요약')
    expect(res.lowQuality).toBeFalsy()
  })

  it('marks lowQuality on repetitive transcript', async () => {
    ;(transcribeAudio as any).mockResolvedValue(Array(50).fill('같은말 반복').join(' '))
    const { client, updates } = fakeSupabase()
    const res = await processSessionAudio(client, 's1', ['sessions/s1/chunk_000.wav'], 1500)
    expect(res.lowQuality).toBe(true)
    expect(updates.some(u => u.vals.processing_status === 'low_quality')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/process-audio-chunks.test.ts`
Expected: FAIL (현재 `processSessionAudio`는 `audioFilePath: string`을 받음)

- [ ] **Step 3: Implement — `processAudio.ts` 수정**

`downloadSessionAudio`는 그대로 사용. `processSessionAudio` 본문을 아래로 교체(시그니처/전사 루프/품질 가드):

```ts
import { assessTranscript } from '@/lib/audio/quality'
// ...기존 import 유지...

export interface ProcessResult {
  notes: string
  actionItems: SessionActionItem[]
  usage: ProcessUsage
  lowQuality?: boolean
}

export async function processSessionAudio(
  supabase: SupabaseClient,
  sessionId: string,
  audioPaths: string[],
  durationSec: number
): Promise<ProcessResult> {
  await supabase.from('check_up_sessions')
    .update({ processing_status: 'transcribing' }).eq('id', sessionId)

  // 청크를 인덱스 순서대로 전사 후 join
  const parts: string[] = []
  for (const path of audioPaths) {
    const buf = await downloadSessionAudio(supabase, path)
    parts.push(await transcribeAudio(buf, path))
  }
  const transcript = parts.join(' ').trim()

  const quality = assessTranscript(transcript, durationSec)

  await supabase.from('check_up_sessions')
    .update({ processing_status: 'summarizing', raw_transcript: transcript }).eq('id', sessionId)

  let summary
  try {
    summary = await summarizeTranscript(transcript)
  } catch (err) {
    if (err instanceof SummaryParseError) {
      await supabase.from('check_up_sessions')
        .update({ processing_status: 'error', notes: err.rawText, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
    }
    throw err
  }

  const { data: prev } = await supabase.from('check_up_sessions')
    .select('notes').eq('id', sessionId).single()

  const qualityBanner = quality.ok ? '' : '> ⚠️ 전사 품질이 낮을 수 있습니다. 녹음 음량이 작거나 잡음이 많으면 재녹음/재처리를 권장합니다.\n\n'
  const combinedNotes = combineSessionNotes(prev?.notes ?? '', qualityBanner + summary.notes)

  const insertedActionItems = await persistPipelineResult(
    supabase, sessionId, combinedNotes, summary.actionItems, quality.ok ? 'done' : 'low_quality'
  )

  const usage = computeUsage(durationSec, summary.inputTokens, summary.outputTokens)
  return { notes: combinedNotes, actionItems: insertedActionItems, usage, lowQuality: !quality.ok }
}
```

`persistPipelineResult`에 상태 인자 추가:

```ts
async function persistPipelineResult(
  supabase: SupabaseClient,
  sessionId: string,
  notes: string,
  actionItems: { body: string }[],
  status: 'done' | 'low_quality' = 'done'
): Promise<SessionActionItem[]> {
  await supabase.from('session_action_items').delete().eq('session_id', sessionId)
  await supabase.from('check_up_sessions')
    .update({ processing_status: status, notes, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (actionItems.length === 0) return []
  const { data } = await supabase.from('session_action_items')
    .insert(actionItems.map((item, idx) => ({ session_id: sessionId, body: item.body, display_order: idx })))
    .select()
  return data ?? []
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/process-audio-chunks.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/processAudio.ts test/lib/process-audio-chunks.test.ts
git commit -m "[AX-1] feat(sessions): 멀티 청크 전사 + 품질 가드 (low_quality)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `process` / `reprocess` 라우트 — 청크 배열 수용

**Files:**
- Modify: `app/api/sessions/[sessionId]/process/route.ts`
- Modify: `app/api/sessions/[sessionId]/reprocess/route.ts`

**Interfaces:**
- Consumes: `processSessionAudio(supabase, sessionId, audioPaths: string[], durationSec)` (Task 5)

- [ ] **Step 1: `process/route.ts` 수정**

`process/route.ts:32-67` 구간을 아래로 교체. `audioPaths[]`(신규) 또는 `audioPath`(레거시) 모두 수용하고 전부 자기 폴더 검증:

```ts
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
      .update({ audio_file_path: rawPaths[0], recording_duration_sec: recordingDurationSec })
      .eq('id', params.sessionId)
    const result = await processSessionAudio(supabase, params.sessionId, rawPaths, recordingDurationSec)
    return NextResponse.json(result)
  } catch (err) {
```

(이하 catch 블록은 기존 유지.)

- [ ] **Step 2: `reprocess/route.ts` 수정 — 폴더 list로 청크 수집**

기존에 `audio_file_path` 단일값을 읽던 부분을, Storage 폴더 list로 청크를 모으도록 변경. 청크가 없으면(`audio_file_path`만 있는 레거시) 그 단일 경로 사용:

```ts
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
  const result = await processSessionAudio(supabase, params.sessionId, audioPaths, session.recording_duration_sec ?? 0)
```

(reprocess 라우트에서 `session` 조회 시 `audio_file_path, recording_duration_sec`를 select 하도록 보장.)

- [ ] **Step 3: typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add "app/api/sessions/[sessionId]/process/route.ts" "app/api/sessions/[sessionId]/reprocess/route.ts"
git commit -m "[AX-1] feat(api): process/reprocess 청크 배열 수용 + 폴더 list 수집

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `upload-url` 라우트 — chunk 경로

**Files:**
- Modify: `app/api/sessions/[sessionId]/upload-url/route.ts`

**Interfaces:**
- Produces: body `{ ext: 'wav', index?: number }` → 응답 `{ path, token, signedUrl }`, `index` 있으면 path=`sessions/{id}/chunk_{NNN}.wav`

- [ ] **Step 1: 경로 생성 로직 수정**

`upload-url/route.ts:37`의 `const path = ...`를 교체:

```ts
  const index = typeof body?.index === 'number' ? body.index : undefined
  const path = index !== undefined
    ? `sessions/${params.sessionId}/chunk_${String(index).padStart(3, '0')}.${ext}`
    : `sessions/${params.sessionId}/audio.${ext}`
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add "app/api/sessions/[sessionId]/upload-url/route.ts"
git commit -m "[AX-1] feat(api): upload-url chunk index 경로 지원

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 브라우저 글루 `prepareAudioForUpload`

**Files:**
- Create: `lib/audio/prepareUpload.ts`

**Interfaces:**
- Consumes: `normalizePcm` (Task 1), `planChunks`/`encodeWav` (Task 2)
- Produces: `prepareAudioForUpload(blob: Blob, opts?: { sampleRate?: number }): Promise<{ index: number; wav: Uint8Array }[]>`

- [ ] **Step 1: 구현 (브라우저 전용, OfflineAudioContext)**

```ts
// lib/audio/prepareUpload.ts
import { normalizePcm } from '@/lib/audio/normalize'
import { planChunks, encodeWav } from '@/lib/audio/chunk'

const TARGET_SR = 16000

/**
 * 녹음/업로드 blob을 16kHz mono로 디코드 → RMS 정규화 → ≤720s WAV 청크 배열로 변환.
 * 브라우저 전용(OfflineAudioContext). 디코드 실패 시 throw.
 */
export async function prepareAudioForUpload(
  blob: Blob,
  opts: { sampleRate?: number } = {}
): Promise<{ index: number; wav: Uint8Array }[]> {
  const sampleRate = opts.sampleRate ?? TARGET_SR
  const arrayBuf = await blob.arrayBuffer()

  // 임시 컨텍스트로 디코드 (브라우저가 원본 SR로 디코드)
  const AC: typeof AudioContext =
    (window as any).AudioContext ?? (window as any).webkitAudioContext
  const tmp = new AC()
  const decoded = await tmp.decodeAudioData(arrayBuf.slice(0))
  await tmp.close()

  // 16kHz mono로 리샘플/다운믹스
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * sampleRate), sampleRate)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  const mono = rendered.getChannelData(0)            // Float32Array @ sampleRate

  const normalized = normalizePcm(mono)
  const chunks = planChunks(normalized.length, sampleRate)
  return chunks.map((c, index) => ({
    index,
    wav: encodeWav(normalized.subarray(c.start, c.end), sampleRate),
  }))
}
```

- [ ] **Step 2: typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음 (브라우저 타입은 `lib.dom` 포함된 tsconfig 기준)

- [ ] **Step 3: Commit**

```bash
git add lib/audio/prepareUpload.ts
git commit -m "[AX-1] feat(audio): 브라우저 전처리 글루 (디코드·정규화·청크)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: `RecordingPanel` 멀티 청크 업로드

**Files:**
- Modify: `components/sessions/RecordingPanel.tsx` (`uploadAndProcess` 본문)

**Interfaces:**
- Consumes: `prepareAudioForUpload` (Task 8), `upload-url`(index), `process`(audioPaths)

- [ ] **Step 1: `uploadAndProcess` 교체**

`RecordingPanel.tsx:193-257`의 업로드/처리 본문을 아래 흐름으로 교체(토큰 갱신·진행률 UI는 유지하되 청크 루프로):

```ts
import { prepareAudioForUpload } from '@/lib/audio/prepareUpload'
// ...
async function uploadAndProcess(blob: Blob, _filename: string, durationSec: number, uploadEstimate: number, sttEstimate: number, summarizeEstimate: number) {
  const supabase = createSupabaseBrowserClient()
  let { data: { session } } = await supabase.auth.refreshSession()
  if (!session) session = (await supabase.auth.getSession()).data.session
  if (!session) { setPhase('error'); setErrorMsg('인증 오류'); return }

  try {
    const chunks = await prepareAudioForUpload(blob)
    if (chunks.length === 0) throw new Error('오디오를 처리할 수 없습니다.')

    setPhase('uploading'); setProgress(0)
    startProgressTimer(0, 20, uploadEstimate * 1000)
    const audioPaths: string[] = []
    for (const { index, wav } of chunks) {
      const urlRes = await fetch(`/api/sessions/${sessionId}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ext: 'wav', index }),
      })
      if (!urlRes.ok) throw new Error('업로드 URL을 가져오지 못했습니다.')
      const { path, token } = await urlRes.json()
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .uploadToSignedUrl(path, token, new Blob([wav], { type: 'audio/wav' }), { contentType: 'audio/wav', upsert: true })
      if (upErr) throw new Error(`업로드 실패: ${upErr.message}`)
      audioPaths.push(path)
    }
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    setProgress(20)

    setPhase('transcribing')
    startProgressTimer(20, 80, sttEstimate * 1000, () => { setPhase('summarizing'); startProgressTimer(80, 95, summarizeEstimate * 1000) })

    const procRes = await fetch(`/api/sessions/${sessionId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ audioPaths, recordingDurationSec: durationSec }),
    })
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    if (!procRes.ok) { const e = await procRes.json().catch(() => ({})); throw new Error(e.error ?? '처리 실패') }

    const result = await procRes.json()
    setProgress(100); setPhase('done')
    onProcessed(result.notes ?? '', result.actionItems ?? [])
    if (result.usage) setUsage(result.usage)
    if (result.lowQuality) toast.warning('전사 품질이 낮을 수 있습니다. 필요 시 재처리하세요.')
  } catch (err) {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    setPhase('error'); setErrorMsg(err instanceof Error ? err.message : '처리 실패')
  }
}
```

`resolveAudioType` import가 더 이상 필요 없으면 정리. `stopAndProcess`/`handleFileFromDrop`은 그대로 `uploadAndProcess(blob, ...)` 호출(두 번째 인자는 무시됨).

- [ ] **Step 2: typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add components/sessions/RecordingPanel.tsx
git commit -m "[AX-1] feat(recording): 청크 분할 업로드 + 품질 경고 토스트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: `low_quality` 상태 — 타입·마이그레이션·UI 배지

**Files:**
- Modify: `lib/types.ts` (`CheckUpSession.processing_status`)
- Create: `supabase/migrations/20260630000000_session_low_quality_status.sql`
- Modify: `components/sessions/AdminSessionDetail.tsx` (+ 리스트에서 상태 배지 렌더하는 곳)

**Interfaces:**
- Consumes: `processing_status === 'low_quality'`

- [ ] **Step 1: 타입 유니온에 추가**

`lib/types.ts`의 `CheckUpSession.processing_status` 유니온에 `| 'low_quality'` 추가.

- [ ] **Step 2: 마이그레이션 (CHECK 제약이 있으면 갱신, 없으면 no-op 주석)**

```sql
-- supabase/migrations/20260630000000_session_low_quality_status.sql
-- processing_status에 'low_quality' 허용. 기존 컬럼에 CHECK 제약이 없으면
-- 애플리케이션 레벨 상수만으로 충분하나, 제약이 있을 경우를 대비해 재정의한다.
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'check_up_sessions' and column_name = 'processing_status'
  ) then
    alter table check_up_sessions drop constraint if exists check_up_sessions_processing_status_check;
    alter table check_up_sessions add constraint check_up_sessions_processing_status_check
      check (processing_status in ('idle','uploading','transcribing','summarizing','done','error','low_quality'));
  end if;
end $$;
```

- [ ] **Step 3: UI 배지**

세션 상세/리스트에서 상태 표시 부분에 `low_quality`일 때 노란 배지(`⚠️ 품질 낮음`)와 재처리 버튼을 노출. 기존 `done` 배지 렌더 분기 옆에 추가:

```tsx
{session.processing_status === 'low_quality' && (
  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: 'var(--amber)', background: 'rgba(245,158,11,0.12)' }}>
    ⚠️ 전사 품질 낮음
  </span>
)}
```

- [ ] **Step 4: typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts supabase/migrations/20260630000000_session_low_quality_status.sql components/sessions/AdminSessionDetail.tsx
git commit -m "[AX-1] feat(sessions): low_quality 상태 + UI 배지 + 마이그레이션

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: 전체 검증

- [ ] **Step 1: 전체 테스트**

Run: `npx vitest run`
Expected: 전 테스트 PASS

- [ ] **Step 2: typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx next lint`
Expected: 에러 없음

- [ ] **Step 3: 빌드**

Run: `npx next build`
Expected: 성공

---

### Task 12: 기존 두 세션 복구 (로컬 스크립트, 배포 무관)

**Files:**
- Create: `scripts/recover-sessions-stt.mjs`

**설명:** 로컬 `ffmpeg`로 각 세션 오디오를 16kHz mono·정규화·≤720s 청크로 만들고, `gpt-4o-transcribe`로 전사→합침→`assessTranscript` 확인→기존 요약 로직으로 요약→`combineSessionNotes`로 핸드라이팅 노트 보존하며 DB 갱신. `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_KEY`/`OPENAI_API_KEY` 사용.

- [ ] **Step 1: 스크립트 작성** — 대상 세션 id 2개(`6e6156ec-6765-4c9f-af78-c5c1d9230919`, `f321502a-28c6-42a6-8091-736296a8d424`)를 인자로 받아 처리. **DRY-RUN 우선**: 먼저 전사·요약 결과를 출력만 하고, `--write` 플래그가 있을 때만 DB 갱신.

- [ ] **Step 2: DRY-RUN 실행 후 사용자에게 결과 보고**

Run: `node scripts/recover-sessions-stt.mjs`
Expected: 두 세션의 복구된 transcript/요약 미리보기 출력. 사용자 확인 후 `--write`로 반영.

- [ ] **Step 3: 사용자 승인 시 DB 반영**

Run: `node scripts/recover-sessions-stt.mjs --write`

- [ ] **Step 4: Commit (스크립트만)**

```bash
git add scripts/recover-sessions-stt.mjs
git commit -m "[AX-1] chore(sessions): 잘못 전사된 기존 세션 복구 스크립트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 완료 후

- 배포는 사용자 승인 후(Vercel). PR 생성.
- 별도 잠재 이슈로 분리해 둔 것: `GET /api/sessions` 정렬 비결정성, RecordingPanel `key` 누락 — 본 플랜 범위 밖.
