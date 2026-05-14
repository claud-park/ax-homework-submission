'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Submission, Comment } from '@/lib/types'
import ReactMarkdown from 'react-markdown'

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

function CommentItem({
  comment, onEdit,
}: {
  comment: Comment
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
            {isAdmin && (
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

function FilePreview({ submission, fileUrl }: { submission: Submission; fileUrl: string | null }) {
  const ext = submission.file_name.split('.').pop()?.toLowerCase()
  const [mdContent, setMdContent] = useState<string | null>(null)

  useEffect(() => {
    setMdContent(null)
    if (ext === 'md' && fileUrl) {
      fetch(fileUrl).then(r => r.text()).then(setMdContent).catch(() => setMdContent('파일을 불러올 수 없습니다.'))
    }
  }, [fileUrl, ext])

  if (!fileUrl) {
    return (
      <div className="mt-3 rounded-xl border p-4 text-center" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-secondary)' }}>
        <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>파일 URL 로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      {ext === 'md' && mdContent !== null ? (
        <div className="p-4 prose max-w-none text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>
          <ReactMarkdown disallowedElements={['script', 'iframe', 'object', 'embed']} unwrapDisallowed>{mdContent}</ReactMarkdown>
        </div>
      ) : ext === 'pdf' ? (
        <iframe src={fileUrl} className="w-full" style={{ height: '500px', background: '#fff' }} title="PDF preview" sandbox="allow-scripts allow-same-origin" />
      ) : (
        <div className="p-4 text-center" style={{ background: 'var(--surface-secondary)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>미리보기를 지원하지 않는 파일 형식입니다.</p>
        </div>
      )}
      <div className="p-3 border-t" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <button
          onClick={() => window.open(fileUrl, '_blank')}
          className="px-4 py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
        >
          ⬇ 다운로드 ({submission.file_name})
        </button>
      </div>
    </div>
  )
}

export default function SubmissionReviewPage() {
  const { id, userId } = useParams<{ id: string; userId: string }>()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeSubId, setActiveSubId] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Submission[]>(`/api/admin/homeworks/${id}/submissions/${userId}`).then(subs => {
      setSubmissions(subs)
      if (subs.length > 0) setActiveSubId(subs[0].id)
    })
  }, [id, userId])

  useEffect(() => {
    if (!activeSubId) return
    setFileUrl(null)
    apiFetch<{ url: string }>(`/api/admin/storage/${activeSubId}/download`)
      .then(data => setFileUrl(data.url))
      .catch(() => setFileUrl(null))
  }, [activeSubId])

  async function handleStatus(subId: string, status: string) {
    setSaving(true)
    try {
      await apiFetch(`/api/admin/submissions/${subId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: status as Submission['status'] } : s))
    } finally {
      setSaving(false)
    }
  }

  async function handleComment(subId: string) {
    if (!comment.trim()) return
    setSaving(true)
    try {
      const newComment = await apiFetch<Comment>(`/api/admin/submissions/${subId}/comments`, {
        method: 'POST', body: JSON.stringify({ body: comment }),
      })
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, comments: [...(s.comments ?? []), newComment] } : s))
      setComment('')
    } finally {
      setSaving(false)
    }
  }

  async function handleEditComment(subId: string, c: Comment, newBody: string) {
    const updated = await apiFetch<Comment>(`/api/admin/submissions/${subId}/comments/${c.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: newBody }),
    })
    setSubmissions(prev => prev.map(s =>
      s.id === subId
        ? { ...s, comments: (s.comments ?? []).map(cm => cm.id === c.id ? updated : cm) }
        : s
    ))
  }

  const activeSub = submissions.find(s => s.id === activeSubId)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <a href={`/admin/homework/${id}`} className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 목록으로</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>제출 검토</h1>
      </div>

      {submissions.length > 1 && (
        <div className="flex gap-2 mb-4">
          {submissions.map(sub => (
            <button
              key={sub.id}
              onClick={() => setActiveSubId(sub.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{
                background: activeSubId === sub.id ? 'var(--blue-600)' : 'var(--surface-primary)',
                color: activeSubId === sub.id ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              시도 #{sub.attempt_number}
            </button>
          ))}
        </div>
      )}

      {activeSub && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{activeSub.file_name}</p>
            <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: STATUS_COLOR[activeSub.status], background: `${STATUS_COLOR[activeSub.status]}20` }}>
              {STATUS_LABEL[activeSub.status]}
            </span>
          </div>

          <FilePreview submission={activeSub} fileUrl={fileUrl} />

          <div className="mt-4 flex gap-2">
            <button onClick={() => handleStatus(activeSub.id, 'accepted')} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>
              ✓ 합격
            </button>
            <button onClick={() => handleStatus(activeSub.id, 'declined')} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
              ✗ 불합격
            </button>
          </div>

          {/* Comments */}
          {activeSub.comments && activeSub.comments.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>코멘트</p>
              {activeSub.comments.map(c => (
                <CommentItem
                  key={c.id}
                  comment={c}
                  onEdit={(comment, newBody) => handleEditComment(activeSub.id, comment, newBody)}
                />
              ))}
            </div>
          )}

          {/* New comment form */}
          <div className="mt-4">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="코멘트 입력..."
              rows={3}
              className="w-full text-sm rounded-lg p-3 resize-none"
              style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => handleComment(activeSub.id)}
              disabled={saving || !comment.trim()}
              className="mt-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}
            >
              코멘트 저장
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
