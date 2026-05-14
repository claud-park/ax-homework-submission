'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Homework, Submission } from '@/lib/types'
import DOMPurify from 'dompurify'

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

export default function HomeworkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [homework, setHomework] = useState<Homework | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Homework>(`/api/homeworks/${id}`).then(setHomework)
    apiFetch<Submission[]>(`/api/submissions/mine/${id}`).then(setSubmissions)
  }, [id])

  const latest = submissions[0]
  const canSubmit = !latest || latest.status === 'declined'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('homework_id', id)
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body,
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const updated = await apiFetch<Submission[]>(`/api/submissions/mine/${id}`)
      setSubmissions(updated)
      setFile(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      {homework && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              # {String(homework.id).padStart(2, '0')}
            </span>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{homework.title}</h1>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>마감: {homework.due_date}</p>
          {homework.description && (
            <div
              className="text-sm rounded-xl p-4 border prose prose-invert max-w-none"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(homework.description) }}
            />
          )}
        </div>
      )}

      {canSubmit && (
        <form onSubmit={handleSubmit} className="mb-8 p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            {latest?.status === 'declined' ? '재제출' : '제출하기'}
          </p>
          <input
            type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="text-sm mb-3 block"
            style={{ color: 'var(--text-secondary)' }}
          />
          {error && <p className="text-xs mb-2" style={{ color: 'var(--error)' }}>{error}</p>}
          <button
            type="submit"
            disabled={!file || uploading}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            {uploading ? '업로드 중...' : '제출'}
          </button>
        </form>
      )}

      <div>
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>제출 이력</h2>
        <div className="flex flex-col gap-3">
          {submissions.map(sub => (
            <div key={sub.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>시도 #{sub.attempt_number} · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}>
                  {STATUS_LABEL[sub.status]}
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
              {sub.comments && sub.comments.length > 0 && (
                <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  {sub.comments.map(c => (
                    <p key={c.id} className="text-xs" style={{ color: 'var(--text-secondary)' }}>💬 {c.body}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {submissions.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>아직 제출 이력이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
