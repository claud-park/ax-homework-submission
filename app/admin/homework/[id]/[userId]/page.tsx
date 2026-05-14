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

function FilePreview({ submission, downloadUrl }: { submission: Submission; downloadUrl: string }) {
  const ext = submission.file_name.split('.').pop()?.toLowerCase()
  const [mdContent, setMdContent] = useState<string | null>(null)

  useEffect(() => {
    if (ext === 'md') {
      fetch(downloadUrl).then(r => r.text()).then(setMdContent)
    }
  }, [downloadUrl, ext])

  return (
    <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      {ext === 'md' && mdContent !== null ? (
        <div className="p-4 prose prose-invert max-w-none text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>
          <ReactMarkdown>{mdContent}</ReactMarkdown>
        </div>
      ) : ext === 'pdf' ? (
        <iframe src={downloadUrl} className="w-full" style={{ height: '500px', background: '#fff' }} title="PDF preview" />
      ) : (
        <div className="p-4 text-center" style={{ background: 'var(--surface-secondary)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>미리보기를 지원하지 않는 파일 형식입니다.</p>
        </div>
      )}
      <div className="p-3 border-t" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <a href={downloadUrl} download={submission.file_name}>
          <button className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
            ⬇ 다운로드 ({submission.file_name})
          </button>
        </a>
      </div>
    </div>
  )
}

export default function SubmissionReviewPage() {
  const { id, userId } = useParams<{ id: string; userId: string }>()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeSubId, setActiveSubId] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Submission[]>(`/api/admin/homeworks/${id}/submissions/${userId}`).then(subs => {
      setSubmissions(subs)
      if (subs.length > 0) setActiveSubId(subs[0].id)
      subs.forEach(sub => {
        setDownloadUrls(prev => ({ ...prev, [sub.id]: `/api/admin/storage/${sub.id}/download` }))
      })
    })
  }, [id, userId])

  async function handleStatus(subId: string, status: string) {
    setSaving(true)
    await apiFetch(`/api/admin/submissions/${subId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: status as Submission['status'] } : s))
    setSaving(false)
  }

  async function handleComment(subId: string) {
    if (!comment.trim()) return
    setSaving(true)
    const newComment = await apiFetch<Comment>(`/api/admin/submissions/${subId}/comments`, {
      method: 'POST', body: JSON.stringify({ body: comment }),
    })
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, comments: [...(s.comments ?? []), newComment] } : s))
    setComment('')
    setSaving(false)
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

          {downloadUrls[activeSub.id] && (
            <FilePreview submission={activeSub} downloadUrl={downloadUrls[activeSub.id]} />
          )}

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

          {activeSub.comments && activeSub.comments.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              {activeSub.comments.map(c => (
                <div key={c.id} className="mb-2 p-2 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>{new Date(c.created_at).toLocaleString('ko-KR')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
