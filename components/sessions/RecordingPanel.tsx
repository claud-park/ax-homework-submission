'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { SessionActionItem } from '@/lib/types'

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
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartRef = useRef<number>(0)
  const progressStartRef = useRef<number>(0)
  const estimatedTotalRef = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
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
      recorder.stream.getTracks().forEach(t => t.stop())
    })

    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })

    // Estimate total processing time
    // Upload: 30s estimate | STT: durationSec * 0.08 | Summarize: 15s
    const uploadEstimate = 30
    const sttEstimate = Math.round(durationSec * 0.08)
    const summarizeEstimate = 15
    estimatedTotalRef.current = uploadEstimate + sttEstimate + summarizeEstimate

    setPhase('uploading')
    setProgress(0)
    progressStartRef.current = Date.now()

    // Start progress simulation via XHR
    await processWithXHR(audioBlob, durationSec, uploadEstimate, sttEstimate, summarizeEstimate)
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

      // Remaining time based on overall progress
      const overallPct = current
      if (overallPct > 5) {
        const elapsedSec = (Date.now() - progressStartRef.current) / 1000
        const rate = overallPct / elapsedSec
        const remaining = Math.round((100 - overallPct) / rate)
        setRemainingSec(remaining > 10 ? remaining : null)
      }

      if (frac >= 1) {
        clearInterval(progressIntervalRef.current!)
        onDone?.()
      }
    }, 200)
  }

  async function processWithXHR(
    blob: Blob,
    durationSec: number,
    _uploadEstimate: number,
    sttEstimate: number,
    summarizeEstimate: number
  ) {
    const supabase = createSupabaseBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPhase('error'); setErrorMsg('인증 오류'); return }

    const formData = new FormData()
    formData.append('audio', blob, 'audio.webm')
    formData.append('recordingDurationSec', String(durationSec))

    return new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest()

      // Upload progress (0 → 20%)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const uploadPct = (e.loaded / e.total) * 20
          setProgress(Math.round(uploadPct))
        }
      }

      // Upload complete → start STT simulation (20 → 80%)
      xhr.upload.onload = () => {
        setPhase('transcribing')
        startProgressTimer(20, 80, sttEstimate * 1000, () => {
          // STT done → start summarize simulation (80 → 95%)
          setPhase('summarizing')
          startProgressTimer(80, 95, summarizeEstimate * 1000)
        })
      }

      xhr.onload = () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(100)
          setRemainingSec(null)
          setPhase('done')
          try {
            const result = JSON.parse(xhr.responseText)
            onProcessed(result.notes ?? '', result.actionItems ?? [])
          } catch {
            onProcessed('', [])
          }
        } else {
          setPhase('error')
          try {
            const err = JSON.parse(xhr.responseText)
            setErrorMsg(err.error ?? '처리 실패')
          } catch {
            setErrorMsg('처리 실패')
          }
        }
        resolve()
      }

      xhr.onerror = () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
        setPhase('error')
        setErrorMsg('네트워크 오류')
        resolve()
      }

      xhr.open('POST', `/api/sessions/${sessionId}/process`)
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
      xhr.send(formData)
    })
  }

  function reset() {
    setPhase('idle')
    setProgress(0)
    setElapsed(0)
    setRemainingSec(null)
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
        <button
          onClick={startRecording}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Mic className="h-4 w-4" />
          녹음 시작
        </button>
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
            녹음 종료 & 처리
          </button>
        </div>
      )}

      {isProcessing && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              세션 처리 중...
            </span>
            {remainingSec && remainingSec > 10 ? (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                남은 시간 {formatTime(remainingSec)}
              </span>
            ) : remainingSec !== null ? (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>거의 완료 중...</span>
            ) : null}
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
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}>
          <span>✅</span>
          <span className="font-semibold">처리 완료! 아래 내용을 확인하고 수정하세요.</span>
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
