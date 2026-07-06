'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { useConfirm } from '@/components/ui/confirm'
import type { CharterComment } from '@/lib/types'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

function CommentThread({
  comment, currentUserId, onReply, onEdit, onDelete,
}: {
  comment: CharterComment
  currentUserId: string | null
  onReply: (parentId: string, body: string) => Promise<void>
  onEdit: (commentId: string, body: string) => Promise<void>
  onDelete: (commentId: string) => Promise<void>
}) {
  const confirm = useConfirm()
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isOwn = comment.author_id === currentUserId
  const isAdminComment = comment.author_role === 'admin'
  const isTopLevel = comment.parent_id === null
  const dimmed = isTopLevel && comment.is_resolved

  async function handleDeleteClick() {
    if (!(await confirm({ description: '코멘트를 삭제할까요?', confirmText: '삭제', destructive: true }))) return
    setDeleting(true)
    try { await onDelete(comment.id) } finally { setDeleting(false) }
  }

  const badge = isAdminComment
    ? { label: '관리자', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.08)' }
    : { label: '챔피언', color: 'var(--success)', bg: 'rgba(22,163,74,0.08)' }

  async function submitReply() {
    if (!replyBody.trim()) return
    setSaving(true)
    try { await onReply(comment.id, replyBody.trim()); setReplyBody(''); setReplyOpen(false) }
    finally { setSaving(false) }
  }

  async function submitEdit() {
    if (!editBody.trim() || editBody.trim() === comment.body) { setEditOpen(false); return }
    setSaving(true)
    try { await onEdit(comment.id, editBody.trim()); setEditOpen(false) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ opacity: dimmed ? 0.5 : 1, marginBottom: '8px' }}>
      <div className="rounded-xl border p-3"
        style={{
          background: 'var(--surface-primary)',
          borderColor: dimmed ? 'var(--border-subtle)' : isTopLevel ? 'var(--blue-600)' : 'var(--border-subtle)',
          borderLeftWidth: isTopLevel ? '3px' : '1px',
        }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>{badge.label}</span>
            <span style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
              {relativeTime(comment.created_at)}
              {comment.updated_at !== comment.created_at && ' · 편집됨'}
            </span>
          </div>
          {isTopLevel && comment.is_resolved && (
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

        {!editOpen && !dimmed && (
          <div className="flex gap-3 mt-2">
            {isOwn && <button onClick={() => setEditOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>편집</button>}
            {isOwn && (
              <button onClick={handleDeleteClick} disabled={deleting} className="text-xs disabled:opacity-50"
                style={{ color: 'var(--error)' }}>삭제</button>
            )}
            {isTopLevel && !replyOpen && (
              <button onClick={() => setReplyOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>↩ 답글</button>
            )}
          </div>
        )}
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-4 border-l pl-3 mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
          {comment.replies.map(r => (
            <CommentThread key={r.id} comment={r} currentUserId={currentUserId} onReply={onReply} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}

      {replyOpen && (
        <div className="ml-4 border-l pl-3 mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
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

export function CharterCommentPanel({ charterId }: { charterId: string }) {
  const [comments, setComments] = useState<CharterComment[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unresolved'>('all')

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createSupabaseBrowserClient }) => {
      createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
        setCurrentUserId(session?.user?.id ?? null)
      })
    })
    apiFetch<CharterComment[]>(`/api/charter/submissions/${charterId}/comments`).then(flat => {
      const map = new Map<string, CharterComment>()
      flat.forEach(c => map.set(c.id, { ...c, replies: [] }))
      const roots: CharterComment[] = []
      map.forEach(c => {
        if (c.parent_id) map.get(c.parent_id)?.replies?.push(c)
        else roots.push(c)
      })
      setComments(roots)
    })
  }, [charterId])

  function updateInTree(list: CharterComment[], updated: CharterComment): CharterComment[] {
    return list.map(c => {
      if (c.id === updated.id) return { ...updated, replies: c.replies }
      return { ...c, replies: c.replies ? updateInTree(c.replies, updated) : [] }
    })
  }

  async function handlePost() {
    if (!newBody.trim()) return
    setPosting(true)
    try {
      const created = await apiFetch<CharterComment>(`/api/charter/submissions/${charterId}/comments`, {
        method: 'POST', body: JSON.stringify({ body: newBody.trim() }),
      })
      setComments(prev => [...prev, { ...created, replies: [] }])
      setNewBody('')
    } finally { setPosting(false) }
  }

  async function handleReply(parentId: string, body: string) {
    const created = await apiFetch<CharterComment>(
      `/api/charter/submissions/${charterId}/comments/${parentId}/replies`,
      { method: 'POST', body: JSON.stringify({ body }) }
    )
    setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c))
  }

  async function handleEdit(commentId: string, body: string) {
    const updated = await apiFetch<CharterComment>(`/api/charter/comments/${commentId}`, {
      method: 'PATCH', body: JSON.stringify({ body }),
    })
    setComments(prev => updateInTree(prev, updated))
  }

  function removeFromTree(list: CharterComment[], id: string): CharterComment[] {
    return list
      .filter(c => c.id !== id)
      .map(c => ({ ...c, replies: c.replies ? removeFromTree(c.replies, id) : [] }))
  }

  async function handleDelete(commentId: string) {
    await apiFetch(`/api/charter/comments/${commentId}`, { method: 'DELETE' })
    setComments(prev => removeFromTree(prev, commentId))
  }

  const unresolvedCount = comments.filter(c => !c.is_resolved).length
  const filtered = filter === 'unresolved' ? comments.filter(c => !c.is_resolved) : comments

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 whitespace-nowrap"
        style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>피드백</span>
          {unresolvedCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', fontSize: '10px' }}>
              {unresolvedCount}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setFilter('all')}
            className="text-xs px-2.5 py-1 rounded-md font-semibold"
            style={filter === 'all'
              ? { background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }
              : { background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
            전체
          </button>
          <button onClick={() => setFilter('unresolved')}
            className="text-xs px-2.5 py-1 rounded-md font-semibold"
            style={filter === 'unresolved'
              ? { background: 'rgba(239,68,68,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }
              : { background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
            미해결 {unresolvedCount > 0 ? unresolvedCount : ''}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 && (
          <p className="text-xs text-center mt-8" style={{ color: 'var(--text-disabled)' }}>
            {filter === 'unresolved' ? '미해결 피드백이 없습니다.' : '아직 피드백이 없습니다.'}
          </p>
        )}
        {filtered.map(c => (
          <CommentThread key={c.id} comment={c} currentUserId={currentUserId}
            onReply={handleReply} onEdit={handleEdit} onDelete={handleDelete} />
        ))}
      </div>

      <div className="p-3 border-t shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
        <textarea value={newBody} onChange={e => setNewBody(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              handlePost()
            }
          }}
          placeholder="새 코멘트 작성..."
          rows={2}
          className="w-full text-xs rounded-lg p-2 resize-none mb-2"
          style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
        <div className="flex justify-end">
          <button onClick={handlePost} disabled={posting || !newBody.trim()}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}>
            {posting ? '작성 중...' : '작성'}
          </button>
        </div>
      </div>
    </div>
  )
}
