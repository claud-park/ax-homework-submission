'use client'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Submission } from '@/lib/types'
import { toast } from 'sonner'
import { Upload, FileCheck } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

export default function SubmissionPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function load() {
    apiFetch<Submission[]>('/api/submissions/mine')
      .then(setSubmissions)
      .catch((e: Error) => toast.error('로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/submissions', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '제출 실패')
      }
      toast.success('제출되었습니다.')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '제출 실패')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const latest = submissions[0] ?? null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          {latest && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              최근 제출: {latest.file_name} · 시도 {latest.attempt_number}회
            </p>
          )}
        </div>
        <label
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
          style={{ background: 'var(--blue-600)', color: '#fff', opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? '업로드 중...' : latest ? '재제출' : '제출하기'}
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Upload className="h-8 w-8" style={{ color: 'var(--text-disabled)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>아직 제출하지 않았습니다</p>
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>파일을 업로드해 제출하세요.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map(sub => (
            <div
              key={sub.id}
              className="flex items-center justify-between p-4 rounded-xl border"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-3">
                <FileCheck className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              </div>
              <span
                className="text-xs font-semibold px-2 py-1 rounded-md"
                style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}
              >
                {STATUS_LABEL[sub.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
