'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { SessionActionItem } from '@/lib/types'
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, MAX_AUDIO_MB, isAcceptedAudio } from '@/lib/audio'
import { prepareAudioForUpload } from '@/lib/audio/prepareUpload'

const BUCKET = 'check-up-sessions'

interface UsageSummary {
  stt: { durationSec: number; cost: number }
  claude: { inputTokens: number; outputTokens: number; cost: number }
  totalCost: number
}

interface Props {
  sessionId: string
  onProcessed: (notes: string, actionItems: SessionActionItem[]) => void
}

type Phase = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'summarizing' | 'done' | 'error'

const PHASE_LABELS: Record<Phase, string> = {
  idle: '대기',
  recording: '녹음 중',
  uploading: '파일 업로드 중',
  transcribing: '음성 전사 중 (Whisper AI)',
  summarizing: 'AI 요약 생성 중 (Claude)',
  done: '완료',
  error: '오류 발생',
}

const PHASE_ORDER: Phase[] = ['idle', 'recording', 'uploading', 'transcribing', 'summarizing', 'done']

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function RecordingPanel({ sessionId, onProcessed }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)      // recording elapsed seconds
  const [progress, setProgress] = useState(0)    // 0-100
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [mode, setMode] = useState<'record' | 'upload'>('record')
  const [dragOver, setDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartRef = useRef<number>(0)
  const estimatedTotalRef = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [])

  // Warn before leaving page while recording or processing
  useEffect(() => {
    const active = phase === 'recording' || phase === 'uploading' || phase === 'transcribing' || phase === 'summarizing'
    if (!active) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '세션 녹음이 진행되고 있습니다. 페이지를 벗어나면 녹음 내용이 저장되지 않습니다.'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      // 32kbps mono Opus keeps long recordings small: ~30min ≈ 7MB, ~60min ≈ 14MB,
      // well under Whisper's 25MB cap. Speech transcription quality is unaffected.
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 32000,
      })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(1000)
      mediaRecorderRef.current = recorder
      recordingStartRef.current = Date.now()
      setPhase('recording')
      setElapsed(0)
      elapsedIntervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - recordingStartRef.current) / 1000))
      }, 1000)
    } catch {
      toast.error('마이크 접근 권한이 필요합니다.')
    }
  }

  async function stopAndProcess() {
    if (!mediaRecorderRef.current) return

    const recorder = mediaRecorderRef.current
    const durationSec = Math.floor((Date.now() - recordingStartRef.current) / 1000)

    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)

    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })
    // Stop tracks after onstop fires so the final ondataavailable chunk is captured
    recorder.stream.getTracks().forEach(t => t.stop())

    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })

    if (audioBlob.size > MAX_AUDIO_BYTES) {
      setPhase('error')
      setErrorMsg(`녹음이 너무 깁니다 (${(audioBlob.size / (1024 * 1024)).toFixed(1)}MB). Whisper 한도는 ${MAX_AUDIO_MB}MB입니다. 나눠서 녹음해 주세요.`)
      return
    }

    // Estimate processing time | Upload: by size | STT: durationSec * 0.15 | Summarize: 15s
    const uploadEstimate = Math.max(5, Math.round((audioBlob.size / (1024 * 1024)) * 3))
    const sttEstimate = Math.max(10, Math.round(durationSec * 0.15))
    const summarizeEstimate = 15
    estimatedTotalRef.current = uploadEstimate + sttEstimate + summarizeEstimate

    setPhase('uploading')
    setProgress(0)

    await uploadAndProcess(audioBlob, 'audio.webm', durationSec, uploadEstimate, sttEstimate, summarizeEstimate)
  }

  async function handleFileFromDrop(file: File) {
    if (!isAcceptedAudio(file.name)) {
      toast.error('지원하지 않는 형식입니다. wav, mp3, m4a, webm 파일을 올려주세요.')
      return
    }
    if (file.size > MAX_AUDIO_BYTES) {
      toast.error(`파일이 너무 큽니다. 최대 ${MAX_AUDIO_MB}MB까지 업로드할 수 있습니다.`)
      return
    }

    // Upload duration is unknown; use file size for a rough progress estimate.
    const fileSizeMB = file.size / (1024 * 1024)
    const uploadEstimate = Math.max(10, Math.round(fileSizeMB * 3))
    const sttEstimate = Math.max(15, Math.round(fileSizeMB * 8))
    const summarizeEstimate = 15
    estimatedTotalRef.current = uploadEstimate + sttEstimate + summarizeEstimate

    setPhase('uploading')
    setProgress(0)

    // duration unknown for uploads → 0 (Whisper cost shown as estimate)
    await uploadAndProcess(file, file.name, 0, uploadEstimate, sttEstimate, summarizeEstimate)
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    await handleFileFromDrop(file)
  }

  function startProgressTimer(fromPct: number, toPct: number, durationMs: number, onDone?: () => void) {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    const startTime = Date.now()
    const range = toPct - fromPct
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const frac = Math.min(elapsed / durationMs, 1)
      const current = fromPct + range * frac
      setProgress(Math.round(current))

      if (frac >= 1) {
        clearInterval(progressIntervalRef.current!)
        onDone?.()
      }
    }, 200)
  }

  /**
   * Upload audio directly to Supabase Storage via a server-issued signed URL
   * (bypasses Vercel's 4.5MB function body limit), then ask the process route
   * to transcribe + summarize from the stored path.
   */
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
          .uploadToSignedUrl(path, token, new Blob([new Uint8Array(wav.buffer as ArrayBuffer, wav.byteOffset, wav.byteLength)], { type: 'audio/wav' }), { contentType: 'audio/wav', upsert: true })
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

  function reset() {
    setPhase('idle')
    setProgress(0)
    setElapsed(0)
    setErrorMsg(null)
  }

  const isProcessing = ['uploading', 'transcribing', 'summarizing'].includes(phase)

  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
    >
      <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>녹음</p>

      {phase === 'idle' && (
        <div>
          {/* Mode toggle: record vs upload */}
          <div className="flex gap-1 mb-3 p-1 rounded-lg w-fit" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)' }}>
            {([['record', '녹음하기'], ['upload', '파일 올리기']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-3 py-1.5 rounded-md text-xs font-semibold"
                style={{
                  background: mode === m ? 'var(--blue-600)' : 'transparent',
                  color: mode === m ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'record' ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Mic className="h-4 w-4" />
              녹음 시작
            </button>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                const file = e.dataTransfer.files?.[0]
                if (file) handleFileFromDrop(file)
              }}
              className="rounded-xl border-2 border-dashed p-6 text-center"
              style={{ borderColor: dragOver ? 'var(--blue-600)' : 'var(--border-subtle)', background: dragOver ? 'var(--surface-secondary)' : 'transparent' }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={AUDIO_ACCEPT}
                onChange={handleFileSelected}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold mx-auto"
                style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                <Upload className="h-4 w-4" />
                파일 선택
              </button>
              <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                wav, mp3, m4a, webm · 최대 {MAX_AUDIO_MB}MB
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
                또는 파일을 여기로 드래그
              </p>
            </div>
          )}
        </div>
      )}

      {phase === 'recording' && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{
                background: '#ef4444',
                animation: 'pulse 1.2s cubic-bezier(0.4,0,0.6,1) infinite',
              }}
            />
            <span className="text-sm font-mono font-semibold" style={{ color: 'var(--error)' }}>
              REC {formatTime(elapsed)}
            </span>
          </div>
          <button
            onClick={stopAndProcess}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--error)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <Square className="h-4 w-4" />
            녹음 종료 & AI 요약
          </button>
        </div>
      )}

      {isProcessing && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              세션 처리 중...
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="w-full rounded-full h-2 mb-4"
            style={{ background: 'var(--border-subtle)' }}
          >
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: 'var(--blue-600)' }}
            />
          </div>
          <div className="text-right text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            {progress}%
          </div>

          {/* Stage list */}
          <div className="flex flex-col gap-1.5">
            {(['uploading', 'transcribing', 'summarizing', 'done'] as Phase[]).map((p) => {
              const phaseIdx = PHASE_ORDER.indexOf(p)
              const currentIdx = PHASE_ORDER.indexOf(phase)
              const isDone = phaseIdx < currentIdx
              const isCurrent = p === phase
              return (
                <div key={p} className="flex items-center gap-2 text-xs">
                  {isDone ? (
                    <span style={{ color: 'var(--success)' }}>✅</span>
                  ) : isCurrent ? (
                    <span style={{ color: 'var(--blue-600)', animation: 'pulse 1s infinite' }}>🔄</span>
                  ) : (
                    <span style={{ color: 'var(--text-disabled)' }}>⬜</span>
                  )}
                  <span style={{ color: isCurrent ? 'var(--text-primary)' : isDone ? 'var(--text-secondary)' : 'var(--text-disabled)', fontWeight: isCurrent ? 600 : 400 }}>
                    {PHASE_LABELS[p]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}>
            <span>✅</span>
            <span className="font-semibold">처리 완료! 아래 내용을 확인하고 수정하세요.</span>
          </div>
          {usage && (
            <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-disabled)' }}>
              {`Whisper ${formatTime(usage.stt.durationSec)} ($${usage.stt.cost.toFixed(3)})`}
              {' · '}
              Claude {(usage.claude.inputTokens + usage.claude.outputTokens).toLocaleString()} 토큰
              {' '}(입력 {usage.claude.inputTokens.toLocaleString()} / 출력 {usage.claude.outputTokens.toLocaleString()})
              {' $'}{usage.claude.cost.toFixed(4)}
              {' · '}
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                합계 ${usage.totalCost.toFixed(4)}
              </span>
            </p>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--error)' }}>
            <span>❌</span>
            <span>{errorMsg ?? '처리 중 오류가 발생했습니다.'}</span>
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <RefreshCw className="h-3 w-3" />
            다시 시도
          </button>
        </div>
      )}
    </div>
  )
}
