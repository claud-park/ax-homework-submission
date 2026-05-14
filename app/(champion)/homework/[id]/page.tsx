'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Homework, Submission, Comment } from '@/lib/types'
import DOMPurify from 'dompurify'

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

function CommentItem({
  comment, isOwn, onEdit,
}: {
  comment: Comment
  isOwn: boolean
  onEdit: (c: Comment, newBody: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!body.trim() || body.trim() === comment.body) { setEditing(false); return }
    setSaving(true)
    try {
      await onEdit(comment, body.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const isAdmin = comment.author_role === 'admin'
  const badge = isAdmin
    ? { label: '관리자', color: 'var(--amber)', bg: 'rgba(217,119,6,0.1)' }
    : { label: '챔피언', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.1)' }

  return (
    <div className="mb-2 p-2 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0"
          style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>
          {badge.label}
        </span>
        {editing ? (
          <div className="flex-1">
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={2}
              className="w-full text-xs rounded p-2 resize-none"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <div className="flex gap-2 mt-1">
              <button onClick={() => { setEditing(false); setBody(comment.body) }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                취소
              </button>
              <button onClick={save} disabled={saving || !body.trim()}
                className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>
                저장
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-between gap-2">
            <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{comment.body}</p>
            {isOwn && (
              <button onClick={() => setEditing(true)}
                className="text-xs shrink-0"
                style={{ color: 'var(--text-disabled)' }}>
                편집
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs mt-1 ml-[52px]" style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
        {new Date(comment.created_at).toLocaleString('ko-KR')}
        {comment.updated_at !== comment.created_at && ' · 편집됨'}
      </p>
    </div>
  )
}

export default function HomeworkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [homework, setHomework] = useState<Homework | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newComments, setNewComments] = useState<Record<string, string>>({})
  const [submittingComment, setSubmittingComment] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Homework>(`/api/homeworks/${id}`).then(setHomework)
    apiFetch<Submission[]>(`/api/submissions/mine/${id}`).then(setSubmissions)
    import('@/lib/supabase/client').then(({ createSupabaseBrowserClient }) => {
      createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
        setUserId(session?.user?.id ?? null)
      })
    })
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

  async function handleAddComment(subId: string) {
    const body = newComments[subId]?.trim()
    if (!body) return
    setSubmittingComment(subId)
    try {
      const newComment = await apiFetch<Comment>(`/api/submissions/${subId}/comments`, {
        method: 'POST', body: JSON.stringify({ body }),
      })
      setSubmissions(prev => prev.map(s =>
        s.id === subId ? { ...s, comments: [...(s.comments ?? []), newComment] } : s
      ))
      setNewComments(prev => ({ ...prev, [subId]: '' }))
    } finally {
      setSubmittingComment(null)
    }
  }

  async function handleEditComment(subId: string, comment: Comment, newBody: string) {
    const updated = await apiFetch<Comment>(`/api/submissions/${subId}/comments/${comment.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: newBody }),
    })
    setSubmissions(prev => prev.map(s =>
      s.id === subId
        ? { ...s, comments: (s.comments ?? []).map(c => c.id === comment.id ? updated : c) }
        : s
    ))
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
              className="text-sm rounded-xl p-4 border prose max-w-none"
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
            {uploading ? '업로드 중...' : '제출하기'}
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
              <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>

              {/* Comments */}
              {sub.comments && sub.comments.length > 0 && (
                <div className="mb-3 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                  {sub.comments.map(c => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      isOwn={c.author_role === 'user' && c.author_id === userId}
                      onEdit={(comment, newBody) => handleEditComment(sub.id, comment, newBody)}
                    />
                  ))}
                </div>
              )}

              {/* New comment form */}
              <div className="border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                <textarea
                  value={newComments[sub.id] ?? ''}
                  onChange={e => setNewComments(prev => ({ ...prev, [sub.id]: e.target.value }))}
                  placeholder="코멘트 입력..."
                  rows={2}
                  className="w-full text-xs rounded-lg p-2 resize-none"
                  style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={() => handleAddComment(sub.id)}
                  disabled={submittingComment === sub.id || !newComments[sub.id]?.trim()}
                  className="mt-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: 'var(--blue-600)', color: '#fff' }}
                >
                  코멘트 작성
                </button>
              </div>
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
