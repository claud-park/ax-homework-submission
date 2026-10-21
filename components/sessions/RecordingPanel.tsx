'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { SessionActionItem } from '@/lib/types'
import { AUDIO_ACCEPT, MAX_AUDIO_BYTES, MAX_AUDIO_MB, isAcceptedAudio } from '@/lib/audio'
import { prepareAudioForUpload } from '@/lib/audio/prepareUpload'
import { pollProcessing } from '@/lib/sessions/pollProcessing'
import { HttpError, withRetry } from '@/lib/sessions/retry'
import { AuthError, classifyFailure } from '@/lib/sessions/uploadErrors'
import { deleteRecording, loadRecording, saveRecording, type StoredRecording } from '@/lib/audio/localRecordingStore'

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
  transcribing: '음성 전사 중 (AI)',
  summarizing: 'AI 요약 생성 중 (Claude)',
  done: '완료',
  error: '오류 발생',
}

const PHASE_ORDER: Phase[] = ['idle', 'recording', 'uploading', 'transcribing', 'summarizing', 'done']

const CONNECTION_LOST_NOTICE =
  '연결이 끊겨 확인하지 못했어요. 서버에서는 계속 처리 중일 수 있어요. 연결되면 자동으로 이어갈게요'

// 녹음(webm) 기준 진행 추정치. stopAndProcess와 복원(이어서 처리)이 같은 식을 쓴다.
// Upload: by size | STT: durationSec * 0.15 | Summarize: 15s
function recordingEstimates(sizeBytes: number, durationSec: number) {
  return {
    uploadEstimate: Math.max(5, Math.round((sizeBytes / (1024 * 1024)) * 3)),
    sttEstimate: Math.max(10, Math.round(durationSec * 0.15)),
    summarizeEstimate: 15,
  }
}

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
  // 폴링 중 연결이 끊겼을 때만 true. phase는 바꾸지 않고 진행 영역에 안내만 띄운다.
  const [connectionLost, setConnectionLost] = useState(false)
  // 이전에 업로드하지 못하고 이 기기(IndexedDB)에 남은 녹음. idle 화면 위 복원 배너용.
  const [restorable, setRestorable] = useState<StoredRecording | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartRef = useRef<number>(0)
  const estimatedTotalRef = useRef<number>(0)
  // Holds the last upload+process job so "다시 시도" can retry with the already-recorded
  // audio instead of discarding it. Null when there is nothing to retry (e.g. record again).
  const lastJobRef = useRef<{
    blob: Blob
    filename: string
    durationSec: number
    uploadEstimate: number
    sttEstimate: number
    summarizeEstimate: number
  } | null>(null)
  // 현재 lastJob의 녹음이 IndexedDB에 보관됐는지. 보관 실패 시 오류 화면에서도 이탈 경고를 유지한다.
  const localCopySavedRef = useRef(false)

  // 마운트 시 업로드하지 못한 녹음이 남아 있으면 복원 배너를 띄운다. 실패(null)는 무시.
  useEffect(() => {
    let cancelled = false
    void loadRecording(sessionId).then(rec => {
      if (!cancelled && rec) setRestorable(rec)
    })
    return () => { cancelled = true }
  }, [sessionId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [])

  // 녹음 중이거나 업로드 중일 때 이탈 경고.
  // 전사/요약은 서버 백그라운드에서 진행되므로 탭을 닫아도 유실되지 않는다(폴링으로 재확인 가능).
  // 오류 화면에서는 녹음이 메모리에만 있고 이 기기에 보관하지 못한 경우에만 경고한다
  // (보관됐다면 다시 열 때 복원 배너로 이어갈 수 있고, 파일 올리기는 원본이 디스크에 있다).
  useEffect(() => {
    const active = phase === 'recording' || phase === 'uploading' || phase === 'error'
    if (!active) return
    const handler = (e: BeforeUnloadEvent) => {
      if (phase === 'error') {
        const job = lastJobRef.current
        const unsaved = job !== null && !(job.blob instanceof File) && !localCopySavedRef.current
        if (!unsaved) return
      }
      e.preventDefault()
      e.returnValue = '녹음/업로드가 진행 중입니다. 페이지를 벗어나면 이 작업이 중단됩니다.'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  async function startRecording() {
    // 복원 대기 중인 녹음이 있으면 덮어쓰지 않도록 막는다([이어서 처리]/[버리기]를 먼저 고르게 한다).
    if (restorable) return
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
      lastJobRef.current = null
      localCopySavedRef.current = false
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
      setErrorMsg(`녹음이 너무 깁니다 (${(audioBlob.size / (1024 * 1024)).toFixed(1)}MB). STT 한도는 ${MAX_AUDIO_MB}MB입니다. 나눠서 녹음해 주세요.`)
      return
    }

    // 업로드 전에 이 기기에 먼저 보관한다(탭 종료/네트워크 단절 대비).
    // 보관 실패(private 모드, 쿼터 초과 등)는 녹음/업로드 흐름을 막지 않는다.
    localCopySavedRef.current = false
    void saveRecording({ sessionId, blob: audioBlob, durationSec, filename: 'audio.webm', savedAt: Date.now() })
      .then(ok => { if (ok && lastJobRef.current?.blob === audioBlob) localCopySavedRef.current = true })

    const { uploadEstimate, sttEstimate, summarizeEstimate } = recordingEstimates(audioBlob.size, durationSec)
    estimatedTotalRef.current = uploadEstimate + sttEstimate + summarizeEstimate

    setPhase('uploading')
    setProgress(0)

    await uploadAndProcess(audioBlob, 'audio.webm', durationSec, uploadEstimate, sttEstimate, summarizeEstimate)
  }

  async function handleFileFromDrop(file: File) {
    // 파일 업로드 성공 시 deleteRecording이 복원 대기 녹음을 지우므로, 배너가 떠 있는 동안은 막는다.
    if (restorable) return
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
    localCopySavedRef.current = false
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
  async function uploadAndProcess(blob: Blob, filename: string, durationSec: number, uploadEstimate: number, sttEstimate: number, summarizeEstimate: number) {
    // Retain the job so a failure can be retried with the same recorded audio
    // (the record path's blob is otherwise never persisted and would be lost).
    lastJobRef.current = { blob, filename, durationSec, uploadEstimate, sttEstimate, summarizeEstimate }

    const supabase = createSupabaseBrowserClient()

    try {
      let session: { access_token: string } | null = null
      try {
        session = (await supabase.auth.refreshSession()).data.session
      } catch { /* 오프라인 등 — 아래 getSession으로 대체 */ }
      if (!session) {
        try { session = (await supabase.auth.getSession()).data.session } catch { /* 아래에서 처리 */ }
      }
      if (!session) {
        // 오프라인이라 세션을 확보하지 못한 것이면 인증 문제가 아니라 네트워크 실패로 본다.
        if (navigator.onLine === false) throw new TypeError('offline')
        throw new AuthError()
      }
      const initialToken = session.access_token
      // 오래 대기(오프라인)한 뒤 재시도할 때 만료된 토큰을 쓰지 않도록 요청마다 최신 토큰을 읽는다.
      const currentToken = async (): Promise<string> => {
        try {
          const t = (await supabase.auth.getSession()).data.session?.access_token
          if (t) return t
        } catch { /* 저장된 토큰으로 대체 */ }
        return initialToken
      }

      const chunks = await prepareAudioForUpload(blob)
      if (chunks.length === 0) throw new Error('오디오를 처리할 수 없습니다.')

      setPhase('uploading'); setProgress(0)
      startProgressTimer(0, 20, uploadEstimate * 1000)
      const audioPaths: string[] = []
      for (const { index, wav } of chunks) {
        const { path, token } = await withRetry(async () => {
          const urlRes = await fetch(`/api/sessions/${sessionId}/upload-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await currentToken()}` },
            body: JSON.stringify({ ext: 'wav', index }),
          })
          if (!urlRes.ok) throw new HttpError(urlRes.status, '업로드 URL을 가져오지 못했습니다.')
          return (await urlRes.json()) as { path: string; token: string }
        })
        const wavBlob = new Blob([new Uint8Array(wav.buffer as ArrayBuffer, wav.byteOffset, wav.byteLength)], { type: 'audio/wav' })
        await withRetry(async () => {
          const { error: upErr } = await supabase.storage.from(BUCKET)
            .uploadToSignedUrl(path, token, wavBlob, { contentType: 'audio/wav', upsert: true })
          // 메시지로 일시 오류(네트워크)를 판별하도록 원문 메시지를 그대로 던진다.
          if (upErr) throw new Error(upErr.message)
        })
        audioPaths.push(path)
      }
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      setProgress(20)

      setPhase('transcribing'); setProgress(40)

      await withRetry(async () => {
        const procRes = await fetch(`/api/sessions/${sessionId}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await currentToken()}` },
          body: JSON.stringify({ audioPaths, recordingDurationSec: durationSec }),
        })
        // 409: 서버가 이미 처리 중(예: 직전 요청은 접수됐는데 응답만 유실됨) → 오류가 아니라 폴링으로 넘어간다.
        if (procRes.status === 409) return
        if (!procRes.ok) {
          const e = await procRes.json().catch(() => ({}))
          throw new HttpError(procRes.status, e.error ?? '처리 실패')
        }
      })

      // 202(또는 409): 서버가 백그라운드에서 처리한다. 탭을 닫아도 처리는 계속되며, 여기선 상태를 폴링한다.
      const final = await pollProcessing(
        sessionId,
        currentToken,
        status => {
          if (status === 'summarizing') { setPhase('summarizing'); setProgress(85) }
          else if (status === 'transcribing') { setPhase('transcribing'); setProgress(60) }
        },
        { onConnection: connected => setConnectionLost(!connected) },
      )
      setConnectionLost(false)

      if (final.processing_status === 'error') {
        // 메시지를 비워 classifyFailure가 server 기본 문구를 쓰게 한다. 로컬 복사본은 남겨 둔다.
        throw new HttpError(500, '')
      }

      // 서버에 반영 완료 → 이 기기의 보관본은 더 이상 필요 없다.
      void deleteRecording(sessionId)
      setProgress(100); setPhase('done')
      onProcessed(final.notes ?? '', final.action_items ?? [])
      if (final.processing_usage) setUsage(final.processing_usage)
      if (final.processing_status === 'low_quality') toast.warning('전사 품질이 낮을 수 있습니다. 필요 시 재처리하세요.')
    } catch (err) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      setConnectionLost(false)
      setPhase('error'); setErrorMsg(classifyFailure(err, navigator.onLine !== false).message)
    }
  }

  function reset() {
    // "새로 시작"은 사용자가 녹음을 의도적으로 버리는 것 → 이 기기의 보관본도 지운다.
    void deleteRecording(sessionId)
    setRestorable(null)
    lastJobRef.current = null
    localCopySavedRef.current = false
    setConnectionLost(false)
    setPhase('idle')
    setProgress(0)
    setElapsed(0)
    setErrorMsg(null)
  }

  /** Re-run the failed upload+process with the already-recorded audio (no re-recording). */
  function retry() {
    const job = lastJobRef.current
    if (!job) { reset(); return }
    setErrorMsg(null)
    setProgress(0)
    setPhase('uploading')
    void uploadAndProcess(job.blob, job.filename, job.durationSec, job.uploadEstimate, job.sttEstimate, job.summarizeEstimate)
  }

  /** 복원 배너 [이어서 처리]: 이 기기에 남은 녹음으로 업로드+처리를 이어간다. */
  async function resumeRestorable() {
    const rec = restorable
    if (!rec) return
    setRestorable(null)
    const { uploadEstimate, sttEstimate, summarizeEstimate } = recordingEstimates(rec.blob.size, rec.durationSec)
    estimatedTotalRef.current = uploadEstimate + sttEstimate + summarizeEstimate
    // IndexedDB에서 읽어 온 녹음이므로 이미 보관돼 있다.
    localCopySavedRef.current = true
    setErrorMsg(null)
    setPhase('uploading')
    setProgress(0)
    await uploadAndProcess(rec.blob, rec.filename, rec.durationSec, uploadEstimate, sttEstimate, summarizeEstimate)
  }

  /** 복원 배너 [버리기] */
  function discardRestorable() {
    void deleteRecording(sessionId)
    setRestorable(null)
  }

  const isProcessing = ['uploading', 'transcribing', 'summarizing'].includes(phase)

  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
    >
      <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>녹음</p>

      {phase === 'idle' && restorable && (
        <div
          className="flex items-center justify-between gap-3 rounded-lg border p-3 mb-3"
          style={{ background: 'var(--surface-primary)', borderColor: 'var(--amber)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
            업로드하지 못한 녹음이 있어요. 이어서 처리할까요?
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { void resumeRestorable() }}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'var(--blue-600)', border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              <RefreshCw className="h-3 w-3" />
              이어서 처리
            </button>
            <button
              onClick={discardRestorable}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              버리기
            </button>
          </div>
        </div>
      )}

      {/* 복원 배너가 떠 있는 동안은 녹음/파일 올리기 컨트롤(토글·드롭존·숨은 input 포함)을 렌더하지 않는다. */}
      {phase === 'idle' && !restorable && (
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

          {connectionLost && (
            <p className="text-xs mb-3" role="status" style={{ color: 'var(--amber)' }}>
              {CONNECTION_LOST_NOTICE}
            </p>
          )}

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
              {`STT ${formatTime(usage.stt.durationSec)} ($${usage.stt.cost.toFixed(3)})`}
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--error)' }}>
            <span>❌</span>
            <span>{errorMsg ?? '처리 중 오류가 발생했습니다.'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lastJobRef.current && (
              <button
                onClick={retry}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'var(--blue-600)', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                <RefreshCw className="h-3 w-3" />
                다시 시도
              </button>
            )}
            <button
              onClick={reset}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              새로 시작
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
