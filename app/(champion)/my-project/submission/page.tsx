'use client'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Submission } from '@/lib/types'
import { toast } from 'sonner'
import { Upload, FileCheck, Link } from 'lucide-react'

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
  const [linkUrl, setLinkUrl] = useState('')
  const [submittingLink, setSubmittingLink] = useState(false)
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

  async function handleLinkSubmit() {
    const trimmed = linkUrl.trim()
    if (!trimmed) return
    setSubmittingLink(true)
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_url: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '제출 실패')
      }
      toast.success('제출되었습니다.')
      setLinkUrl('')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '제출 실패')
    } finally {
      setSubmittingLink(false)
    }
  }

  const latest = submissions[0] ?? null

  return (
    <div>
      {/* 제출 섹션 */}
      <div
        className="rounded-xl border p-4 mb-6"
        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
      >
        {latest && (
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            최근 제출: {latest.link_url ? latest.link_url : latest.file_name} · 시도 {latest.attempt_number}회
          </p>
        )}

        {/* 파일 업로드 */}
        <div className="flex items-center gap-3 mb-3">
          <label
            className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm cursor-pointer"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'var(--surface-secondary)',
              color: 'var(--text-secondary)',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <Upload className="h-4 w-4 shrink-0" />
            <span className="truncate">{uploading ? '업로드 중...' : '파일 선택'}</span>
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0"
            style={{ background: 'var(--blue-600)', color: '#fff', opacity: uploading ? 0.6 : 1 }}
          >
            {uploading ? '업로드 중...' : latest ? '파일 재제출' : '파일 제출'}
          </button>
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-2 my-3">
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
          <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>또는</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
        </div>

        {/* 링크 제출 */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-secondary)' }}
          >
            <Link className="h-4 w-4 shrink-0" style={{ color: 'var(--text-disabled)' }} />
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLinkSubmit() }}
              placeholder="https://..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
              disabled={submittingLink}
            />
          </div>
          <button
            onClick={handleLinkSubmit}
            disabled={submittingLink || !linkUrl.trim()}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0 disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            {submittingLink ? '제출 중...' : latest ? '링크 재제출' : '링크 제출'}
          </button>
        </div>
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
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>파일 또는 링크로 제출하세요.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map(sub => (
            <div
              key={sub.id}
              className="flex items-center justify-between p-4 rounded-xl border"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                {sub.link_url
                  ? <Link className="h-4 w-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                  : <FileCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                }
                <div className="min-w-0">
                  {sub.link_url ? (
                    <a
                      href={sub.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium truncate block"
                      style={{ color: 'var(--blue-600)' }}
                    >
                      {sub.link_url}
                    </a>
                  ) : (
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
                  )}
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              </div>
              <span
                className="text-xs font-semibold px-2 py-1 rounded-md shrink-0 ml-3"
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
