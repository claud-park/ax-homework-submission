'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { Submission, Comment, CharterSubmission, CharterComment, Milestone } from '@/lib/types'
import ReactMarkdown from 'react-markdown'
import DOMPurify from 'dompurify'
import { FullPageSpinner, Spinner } from '@/components/ui/spinner'
import { ResizeHandle, useResizableWidth } from '@/components/ui/resize-handle'

// ─── helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

// ─── shared constants ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}
const MILESTONE_STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const MILESTONE_STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const CHARTER_SECTIONS = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)' },
  { key: 'goal', label: '목표 (TO-BE)' },
  { key: 'scope_in', label: '범위 In' },
  { key: 'scope_out', label: '범위 Out' },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
] as const

// ─── submission tab ───────────────────────────────────────────────────────────

function AdminCommentItem({ comment, onEdit }: { comment: Comment; onEdit: (c: Comment, body: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!body.trim() || body.trim() === comment.body) { setEditing(false); return }
    setSaving(true)
    try { await onEdit(comment, body.trim()); setEditing(false) } finally { setSaving(false) }
  }

  const isAdmin = comment.author_role === 'admin'
  const badge = isAdmin
    ? { label: '관리자', color: 'var(--amber)', bg: 'rgba(217,119,6,0.1)' }
    : { label: '챔피언', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.1)' }

  return (
    <div className="mb-2 p-2 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0"
          style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>{badge.label}</span>
        {editing ? (
          <div className="flex-1">
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
              className="w-full text-xs rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-accent"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2 mt-1">
              <button onClick={() => { setEditing(false); setBody(comment.body) }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>취소</button>
              <button onClick={save} disabled={saving || !body.trim()}
                className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-between gap-2">
            <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{comment.body}</p>
            {isAdmin && <button onClick={() => setEditing(true)} className="text-xs shrink-0" style={{ color: 'var(--text-disabled)' }}>편집</button>}
          </div>
        )}
      </div>
      <p className="text-xs mt-1 ml-[52px]" style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
        {relativeTime(comment.created_at)}
        {comment.updated_at !== comment.created_at && ' · 편집됨'}
      </p>
    </div>
  )
}


function SubmissionTab({ homeworkId, userId }: { homeworkId: string; userId: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeSubId, setActiveSubId] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const { width: previewWidth, onMouseDown: onResizePreview } = useResizableWidth({
    initialWidth: 420,
    min: 360,
    max: 900,
    side: 'left',
  })

  useEffect(() => {
    apiFetch<Submission[]>(`/api/admin/homeworks/${homeworkId}/submissions/${userId}`).then(subs => {
      setSubmissions(subs)
      if (subs.length > 0) setActiveSubId(subs[0].id)
    })
  }, [homeworkId, userId])

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
      toast.success(status === 'accepted' ? '합격 처리되었습니다.' : '불합격 처리되었습니다.')
    } catch (e) {
      toast.error('상태 변경 실패: ' + (e as Error).message)
    } finally { setSaving(false) }
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
      toast.success('코멘트가 작성되었습니다.')
    } catch (e) {
      toast.error('코멘트 저장 실패: ' + (e as Error).message)
    } finally { setSaving(false) }
  }

  async function handleEditComment(subId: string, c: Comment, newBody: string) {
    try {
      const updated = await apiFetch<Comment>(`/api/admin/submissions/${subId}/comments/${c.id}`, {
        method: 'PATCH', body: JSON.stringify({ body: newBody }),
      })
      setSubmissions(prev => prev.map(s =>
        s.id === subId ? { ...s, comments: (s.comments ?? []).map(cm => cm.id === c.id ? updated : cm) } : s
      ))
      toast.success('코멘트가 수정되었습니다.')
    } catch (e) {
      toast.error('코멘트 수정 실패: ' + (e as Error).message)
    }
  }

  const activeSub = submissions.find(s => s.id === activeSubId)

  return (
    <div className="flex gap-0" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
      {/* Main: submission info + actions + comments */}
      <div className="flex-1 overflow-y-auto pr-4">
        {submissions.length > 1 && (
          <div className="flex gap-2 mb-4">
            {submissions.map(sub => (
              <button key={sub.id} onClick={() => setActiveSubId(sub.id)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: activeSubId === sub.id ? 'var(--blue-600)' : 'var(--surface-primary)', color: activeSubId === sub.id ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                시도 #{sub.attempt_number}
              </button>
            ))}
          </div>
        )}
        {activeSub && (
          <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{activeSub.file_name}</p>
                <button
                  onClick={() => setPanelOpen(v => !v)}
                  className="text-xs px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors"
                  style={panelOpen
                    ? { background: 'rgba(37,99,235,0.12)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }
                    : { background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                  {panelOpen ? '패널 닫기' : '파일 보기 →'}
                </button>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded shrink-0" style={{ color: STATUS_COLOR[activeSub.status], background: `${STATUS_COLOR[activeSub.status]}20` }}>
                {STATUS_LABEL[activeSub.status]}
              </span>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => handleStatus(activeSub.id, 'accepted')} disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>✓ 합격</button>
              <button onClick={() => handleStatus(activeSub.id, 'declined')} disabled={saving}
                className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>✗ 불합격</button>
            </div>
            {activeSub.comments && activeSub.comments.length > 0 && (
              <div className="pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>코멘트</p>
                {activeSub.comments.map(c => (
                  <AdminCommentItem key={c.id} comment={c} onEdit={(cm, body) => handleEditComment(activeSub.id, cm, body)} />
                ))}
              </div>
            )}
            <div className="mt-4">
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="코멘트 입력..." rows={3}
                className="w-full text-sm rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-accent"
                style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
              <button onClick={() => handleComment(activeSub.id)} disabled={saving || !comment.trim()}
                className="mt-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>코멘트 저장</button>
            </div>
          </div>
        )}
        {submissions.length === 0 && <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>제출 이력이 없습니다.</p>}
      </div>

      {/* Side panel: file preview */}
      {panelOpen && activeSub && (
        <div className="relative flex flex-col rounded-xl border overflow-hidden"
          style={{ width: `${previewWidth}px`, borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}>
          <ResizeHandle side="left" onMouseDown={onResizePreview} />
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 whitespace-nowrap"
            style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{activeSub.file_name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>시도 #{activeSub.attempt_number}</p>
            </div>
            <button onClick={() => setPanelOpen(false)}
              className="text-xs px-2 py-1 rounded shrink-0 ml-2"
              style={{ color: 'var(--text-disabled)', background: 'var(--surface-secondary)' }}>✕</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FilePanelContent submission={activeSub} fileUrl={fileUrl} />
          </div>
        </div>
      )}
    </div>
  )
}

function FilePanelContent({ submission, fileUrl }: { submission: Submission; fileUrl: string | null }) {
  const ext = submission.file_name.split('.').pop()?.toLowerCase()
  const [mdContent, setMdContent] = useState<string | null>(null)

  useEffect(() => {
    setMdContent(null)
    if (ext === 'md' && fileUrl) {
      fetch(fileUrl).then(r => r.text()).then(setMdContent).catch(() => setMdContent('파일을 불러올 수 없습니다.'))
    }
  }, [fileUrl, ext])

  if (!fileUrl) return (
    <div className="flex items-center justify-center h-32">
      <Spinner size="md" />
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {ext === 'md' && mdContent !== null ? (
          <div className="p-4 prose max-w-none text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>
            <ReactMarkdown disallowedElements={['script', 'iframe', 'object', 'embed']} unwrapDisallowed>{mdContent}</ReactMarkdown>
          </div>
        ) : ext === 'pdf' ? (
          <iframe src={fileUrl} className="w-full" style={{ height: '100%', minHeight: '500px', background: '#fff' }} title="PDF preview" sandbox="allow-scripts allow-same-origin" />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 gap-3" style={{ background: 'var(--surface-secondary)' }}>
            <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>미리보기를 지원하지 않는 파일 형식입니다.</p>
            <p className="text-xs text-center" style={{ color: 'var(--text-disabled)' }}>{submission.file_name}</p>
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}>
        <button onClick={() => window.open(fileUrl, '_blank')}
          className="w-full px-4 py-2.5 rounded-lg text-xs font-semibold text-center"
          style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
          ⬇ 다운로드
        </button>
      </div>
    </div>
  )
}

// ─── charter review tab ───────────────────────────────────────────────────────

function CharterThreadComment({
  comment, isAdmin, onReply, onEdit, onResolve,
}: {
  comment: CharterComment
  isAdmin: boolean
  onReply: (parentId: string, body: string) => Promise<void>
  onEdit: (commentId: string, body: string) => Promise<void>
  onResolve: (commentId: string, resolved: boolean) => Promise<void>
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  const isTopLevel = comment.parent_id === null
  const authorIsAdmin = comment.author_role === 'admin'
  const badge = authorIsAdmin
    ? { label: '관리자', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.08)' }
    : { label: '챔피언', color: 'var(--success)', bg: 'rgba(22,163,74,0.08)' }

  async function submitReply() {
    if (!replyBody.trim()) return
    setSaving(true)
    try { await onReply(comment.id, replyBody.trim()); setReplyBody(''); setReplyOpen(false) } finally { setSaving(false) }
  }

  async function submitEdit() {
    if (!editBody.trim() || editBody.trim() === comment.body) { setEditOpen(false); return }
    setSaving(true)
    try { await onEdit(comment.id, editBody.trim()); setEditOpen(false) } finally { setSaving(false) }
  }

  const dimmed = isTopLevel && comment.is_resolved

  return (
    <div style={{ opacity: dimmed ? 0.45 : 1, transition: 'opacity 0.2s' }}>
      <div className="rounded-xl border p-3 mb-1"
        style={{
          background: 'var(--surface-primary)',
          borderColor: dimmed ? 'var(--border-subtle)' : isTopLevel ? 'var(--blue-600)' : 'var(--border-subtle)',
          borderLeftWidth: isTopLevel ? '3px' : '1px',
        }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>{badge.label}</span>
            <span className="text-xs" style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
              {relativeTime(comment.created_at)}
              {comment.updated_at !== comment.created_at && ' · 편집됨'}
            </span>
          </div>
          {isTopLevel && isAdmin && (
            <button
              onClick={() => onResolve(comment.id, !comment.is_resolved)}
              className="text-xs px-2 py-0.5 rounded font-semibold"
              style={comment.is_resolved
                ? { background: 'var(--surface-secondary)', color: 'var(--text-disabled)', border: '1px solid var(--border-subtle)' }
                : { background: 'rgba(22,163,74,0.1)', color: 'var(--success)', border: '1px solid var(--success)' }}>
              {comment.is_resolved ? '✓ 해결됨' : '✓ 해결'}
            </button>
          )}
          {isTopLevel && !isAdmin && comment.is_resolved && (
            <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>✓ 해결됨</span>
          )}
        </div>

        {editOpen ? (
          <div>
            <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={2}
              className="w-full text-xs rounded-lg p-2 resize-none mb-1"
              style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2">
              <button onClick={() => { setEditOpen(false); setEditBody(comment.body) }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
              <button onClick={submitEdit} disabled={saving}
                className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: dimmed ? 'var(--text-disabled)' : 'var(--text-primary)', textDecoration: dimmed ? 'line-through' : 'none' }}>
            {comment.body}
          </p>
        )}

        {!editOpen && !dimmed && (authorIsAdmin || isTopLevel) && (
          <div className="flex gap-3 mt-2">
            {authorIsAdmin && <button onClick={() => setEditOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>편집</button>}
            {isTopLevel && !replyOpen && (
              <button onClick={() => setReplyOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>↩ 답글</button>
            )}
          </div>
        )}
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-4 border-l pl-3 mb-2" style={{ borderColor: 'var(--border-subtle)' }}>
          {comment.replies.map(reply => (
            <CharterThreadComment key={reply.id} comment={reply} isAdmin={isAdmin}
              onReply={onReply} onEdit={onEdit} onResolve={onResolve} />
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyOpen && (
        <div className="ml-4 border-l pl-3 mb-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={2}
            placeholder="답글 작성..."
            className="w-full text-xs rounded-lg p-2 resize-none mb-1"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2">
            <button onClick={() => { setReplyOpen(false); setReplyBody('') }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
            <button onClick={submitReply} disabled={saving || !replyBody.trim()}
              className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}>답글 작성</button>
          </div>
        </div>
      )}
    </div>
  )
}

function CharterReviewTab({ homeworkId, userId }: { homeworkId: number; userId: string }) {
  const [charter, setCharter] = useState<CharterSubmission | null | 'loading'>('loading')
  const [comments, setComments] = useState<CharterComment[]>([])
  const [filter, setFilter] = useState<'unresolved' | 'all'>('unresolved')
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    apiFetch<CharterSubmission[]>(`/api/charter/submissions?homework_id=${homeworkId}&user_id=${userId}`)
      .then(data => setCharter(data[0] ?? null))
  }, [homeworkId, userId])

  useEffect(() => {
    if (!charter || charter === 'loading') return
    apiFetch<CharterComment[]>(`/api/charter/submissions/${charter.id}/comments`)
      .then(flat => {
        const map = new Map<string, CharterComment>()
        flat.forEach(c => map.set(c.id, { ...c, replies: [] }))
        const roots: CharterComment[] = []
        map.forEach(c => {
          if (c.parent_id) map.get(c.parent_id)?.replies?.push(c)
          else roots.push(c)
        })
        setComments(roots)
      })
  }, [charter])

  function updateCommentInTree(list: CharterComment[], updated: CharterComment): CharterComment[] {
    return list.map(c => {
      if (c.id === updated.id) return { ...updated, replies: c.replies }
      return { ...c, replies: c.replies ? updateCommentInTree(c.replies, updated) : [] }
    })
  }

  async function handlePost() {
    if (!newComment.trim() || !charter || charter === 'loading') return
    setPosting(true)
    try {
      const created = await apiFetch<CharterComment>(`/api/charter/submissions/${charter.id}/comments`, {
        method: 'POST', body: JSON.stringify({ body: newComment.trim() }),
      })
      setComments(prev => [...prev, { ...created, replies: [] }])
      setNewComment('')
      toast.success('피드백이 작성되었습니다.')
    } catch (e) {
      toast.error('피드백 작성 실패: ' + (e as Error).message)
    } finally { setPosting(false) }
  }

  async function handleReply(parentId: string, body: string) {
    if (!charter || charter === 'loading') return
    try {
      const created = await apiFetch<CharterComment>(
        `/api/charter/submissions/${charter.id}/comments/${parentId}/replies`,
        { method: 'POST', body: JSON.stringify({ body }) }
      )
      setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c))
      toast.success('답글이 작성되었습니다.')
    } catch (e) {
      toast.error('답글 작성 실패: ' + (e as Error).message)
    }
  }

  async function handleEdit(commentId: string, body: string) {
    try {
      const updated = await apiFetch<CharterComment>(`/api/charter/comments/${commentId}`, {
        method: 'PATCH', body: JSON.stringify({ body }),
      })
      setComments(prev => updateCommentInTree(prev, updated))
      toast.success('피드백이 수정되었습니다.')
    } catch (e) {
      toast.error('피드백 수정 실패: ' + (e as Error).message)
    }
  }

  async function handleResolve(commentId: string, is_resolved: boolean) {
    try {
      const updated = await apiFetch<CharterComment>(`/api/charter/comments/${commentId}/resolve`, {
        method: 'PATCH', body: JSON.stringify({ is_resolved }),
      })
      setComments(prev => prev.map(c => c.id === commentId ? { ...updated, replies: c.replies } : c))
      toast.success(is_resolved ? '피드백이 해결됨으로 표시되었습니다.' : '피드백이 미해결로 표시되었습니다.')
    } catch (e) {
      toast.error('해결 상태 변경 실패: ' + (e as Error).message)
    }
  }

  const unresolvedCount = comments.filter(c => !c.is_resolved).length
  const filtered = filter === 'unresolved' ? comments.filter(c => !c.is_resolved) : comments

  if (charter === 'loading') return <FullPageSpinner />

  if (charter === null) return (
    <div className="p-6 text-center">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>이 챔피언은 아직 과제정의서를 제출하지 않았습니다.</p>
    </div>
  )

  return (
    <div className="flex" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
      {/* Left: charter content */}
      <div className="flex-1 overflow-y-auto p-5" style={{ borderRight: '1px solid var(--border-subtle)' }}>
        <div className="mb-4">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>프로젝트명</p>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{charter.project_name ?? '(미입력)'}</p>
        </div>
        {CHARTER_SECTIONS.map(s => {
          const html = (charter.content as Record<string, string>)[s.key]
          if (!html) return null
          return (
            <div key={s.key} className="mb-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
              </div>
              <div className="p-4 prose max-w-none text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
            </div>
          )
        })}
        <p className="text-xs mt-2" style={{ color: 'var(--text-disabled)' }}>
          마지막 수정: {new Date(charter.updated_at).toLocaleString('ko-KR')}
        </p>
      </div>

      {/* Right: feedback panel */}
      <div className="flex flex-col" style={{ width: '300px', minWidth: '280px' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>피드백</span>
          <div className="flex gap-1.5">
            <button onClick={() => setFilter('unresolved')}
              className="text-xs px-2.5 py-1 rounded-md font-semibold"
              style={filter === 'unresolved'
                ? { background: 'rgba(124,58,237,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }
                : { background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              미해결 {unresolvedCount}
            </button>
            <button onClick={() => setFilter('all')}
              className="text-xs px-2.5 py-1 rounded-md font-semibold"
              style={filter === 'all'
                ? { background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }
                : { background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              전체
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 && (
            <p className="text-xs text-center mt-8" style={{ color: 'var(--text-disabled)' }}>
              {filter === 'unresolved' ? '미해결 피드백이 없습니다.' : '피드백이 없습니다.'}
            </p>
          )}
          {filtered.map(c => (
            <CharterThreadComment key={c.id} comment={c} isAdmin
              onReply={handleReply} onEdit={handleEdit} onResolve={handleResolve} />
          ))}
        </div>

        <div className="p-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
            placeholder="새 피드백 작성..."
            rows={2}
            className="w-full text-xs rounded-lg p-2 resize-none mb-2"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <div className="flex justify-end">
            <button onClick={handlePost} disabled={posting || !newComment.trim()}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}>
              {posting ? '작성 중...' : '작성'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── milestones admin tab ─────────────────────────────────────────────────────

function MilestonesAdminTab({ homeworkId, userId }: { homeworkId: number; userId: string }) {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<Milestone[]>(`/api/milestones?homework_id=${homeworkId}&user_id=${userId}`)
      .then(data => { setMilestones(data); setLoading(false) })
      .catch((e: Error) => { toast.error('마일스톤 로드 실패: ' + e.message); setLoading(false) })
  }, [homeworkId, userId])

  if (loading) return <FullPageSpinner />

  if (milestones.length === 0) return (
    <div className="p-6 text-center">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>등록된 마일스톤이 없습니다.</p>
    </div>
  )

  return (
    <div className="p-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)' }}>
            <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤명</th>
            <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>기간</th>
            <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>상태</th>
            <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>산출물</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map(m => (
            <tr key={m.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <td className="py-3 pr-4">
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                {m.description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{m.description}</p>}
              </td>
              <td className="py-3 pr-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                {m.start_date} ~ {m.due_date}
              </td>
              <td className="py-3 pr-4">
                <span className="text-xs font-semibold" style={{ color: MILESTONE_STATUS_COLOR[m.status] }}>
                  {MILESTONE_STATUS_LABEL[m.status]}
                </span>
              </td>
              <td className="py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {m.deliverables && m.deliverables.length > 0 ? `${m.deliverables.length}개` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

type Tab = 'submission' | 'charter' | 'milestones'

export default function SubmissionReviewPage() {
  const { id, userId } = useParams<{ id: string; userId: string }>()
  const homeworkId = Number(id)
  const [activeTab, setActiveTab] = useState<Tab>('charter')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'charter', label: '과제정의서' },
    { key: 'milestones', label: '마일스톤 (WBS)' },
    { key: 'submission', label: '제출물' },
  ]

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <a href={`/admin/homework/${id}`} className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 목록으로</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>제출 검토</h1>
      </div>

      {/* Tab bar */}
      <div className="flex border-b mb-6 whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors"
            style={{
              borderColor: activeTab === t.key ? 'var(--blue-600)' : 'transparent',
              color: activeTab === t.key ? 'var(--blue-600)' : 'var(--text-secondary)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'submission' && <SubmissionTab homeworkId={id} userId={userId} />}
      {activeTab === 'charter' && <CharterReviewTab homeworkId={homeworkId} userId={userId} />}
      {activeTab === 'milestones' && <MilestonesAdminTab homeworkId={homeworkId} userId={userId} />}
    </div>
  )
}
