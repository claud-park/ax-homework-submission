'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Send, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { SessionMiniGantt } from '@/components/SessionMiniGantt'
import { MarkdownView } from '@/components/MarkdownView'
import { SessionNotesEditor } from '@/components/sessions/SessionNotesEditor'
import { useSessionNotes } from '@/components/sessions/useSessionNotes'
import { useSessionActionItems } from '@/components/sessions/useSessionActionItems'
import { parseName } from '@/lib/utils'
import type { CheckUpSession, SessionActionItem, SessionComment, Milestone } from '@/lib/types'

interface Props {
  sessionId: string
  currentUserId: string
}

export function ChampionSessionDetail({ sessionId, currentUserId }: Props) {
  const router = useRouter()
  const [session, setSession] = useState<CheckUpSession | null>(null)
  const { notes, setNotes, isEditingNotes, setIsEditingNotes, saving, saveNotes } =
    useSessionNotes(sessionId, session, setSession, () => { /* champion은 새로고침 안내로 충분 */ })
  const {
    actionItems, setActionItems,
    newItemBody, setNewItemBody, addingItem,
    editingItemId, editingItemBody, setEditingItemBody,
    addItem, toggleItem, deleteItem, startEdit, cancelEdit, saveItemBody,
  } = useSessionActionItems(sessionId)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [comments, setComments] = useState<SessionComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')

  useEffect(() => {
    apiFetch<CheckUpSession & { action_items: SessionActionItem[]; comments: SessionComment[]; milestones: Milestone[] }>(
      `/api/sessions/${sessionId}`
    )
      .then(data => {
        setSession(data)
        setNotes(data.notes ?? '')
        setIsEditingNotes(false)
        setActionItems(data.action_items ?? [])
        setComments(data.comments ?? [])
        setMilestones(data.milestones ?? [])
      })
      .catch(() => toast.error('세션을 불러올 수 없습니다.'))
      .finally(() => setLoading(false))
  }, [sessionId])

  async function postComment() {
    if (!newComment.trim()) return
    setPostingComment(true)
    try {
      const c = await apiFetch<SessionComment>(`/api/sessions/${sessionId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: newComment.trim() }),
      })
      setComments(v => [...v, c])
      setNewComment('')
    } catch { toast.error('댓글 작성 실패') } finally { setPostingComment(false) }
  }

  async function saveEditComment(commentId: string) {
    try {
      const c = await apiFetch<SessionComment>(`/api/sessions/${sessionId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: editingBody.trim() }),
      })
      setComments(v => v.map(x => x.id === commentId ? c : x))
      setEditingCommentId(null)
    } catch { toast.error('수정 실패') }
  }

  async function deleteComment(commentId: string) {
    try {
      await apiFetch(`/api/sessions/${sessionId}/comments/${commentId}`, { method: 'DELETE' })
      setComments(v => v.filter(c => c.id !== commentId))
    } catch { toast.error('삭제 실패') }
  }

  function relativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return '방금'
    if (min < 60) return `${min}분 전`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}시간 전`
    return `${Math.floor(h / 24)}일 전`
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-5 rounded animate-pulse" style={{ background: 'var(--surface-secondary)', width: i === 1 ? '40%' : '100%' }} />
        ))}
      </div>
    )
  }
  if (!session) return null

  // Notion 스타일 섹션: 배경 없이 상단 구분선 + 여백 + 작은 라벨로 그룹 구분
  const sectionClass = 'mt-10 pt-6 border-t'
  const sectionBorder = { borderColor: 'var(--border-subtle)' }
  const labelClass = 'text-xs font-semibold mb-3'
  const labelStyle = { color: 'var(--text-tertiary)', letterSpacing: '0.02em' }

  return (
    <div>
      <button
        onClick={() => router.push('/my-project/sessions')}
        className="flex items-center gap-1 text-xs mb-8"
        style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 목록으로
      </button>

      {/* Title */}
      <h1 className="text-2xl font-bold mb-1.5" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{session.title}</h1>
      <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
        {session.session_date}{session.session_time ? ` · ${session.session_time.slice(0, 5)}` : ''}
      </p>

      {/* Milestone status */}
      {milestones.length > 0 && (
        <section className={sectionClass} style={sectionBorder}>
          <SessionMiniGantt milestones={milestones} sessionDate={session.session_date} bare />
        </section>
      )}

      {/* Meeting notes */}
      <section className={sectionClass} style={sectionBorder}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={labelClass} style={{ ...labelStyle, marginBottom: 0 }}>미팅 노트</h2>
          {!isEditingNotes && (
            <button
              onClick={() => setIsEditingNotes(true)}
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Pencil className="h-3 w-3" /> 수정
            </button>
          )}
        </div>
        {isEditingNotes ? (
          <div>
            <SessionNotesEditor value={notes} onChange={setNotes} />
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={() => { setNotes(session.notes ?? ''); setIsEditingNotes(false) }}
                className="text-xs px-2.5 py-1 rounded-md"
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
              >취소</button>
              <button
                onClick={saveNotes}
                disabled={saving}
                className="text-xs px-2.5 py-1 rounded-md font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
              >{saving ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        ) : session.notes?.trim() ? (
          <MarkdownView markdown={session.notes} />
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>아직 노트가 없어요. [수정]을 눌러 작성할 수 있어요.</p>
        )}
      </section>

      {/* Action items */}
      <section className={sectionClass} style={sectionBorder}>
        <h2 className={labelClass} style={labelStyle}>내 액션 아이템</h2>
        <div className="flex flex-col">
          {actionItems.map(item => (
            <div key={item.id} className="flex items-start gap-2.5 py-1.5 group">
              <input
                type="checkbox"
                checked={item.is_completed}
                onChange={() => toggleItem(item)}
                className="mt-0.5 h-4 w-4 cursor-pointer flex-shrink-0"
                style={{ accentColor: 'var(--blue-600)' }}
              />
              {editingItemId === item.id ? (
                <div className="flex-1">
                  <input
                    type="text"
                    value={editingItemBody}
                    onChange={e => setEditingItemBody(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveItemBody(item.id); if (e.key === 'Escape') cancelEdit() }}
                    autoFocus
                    className="w-full text-sm py-1"
                    style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', borderRadius: 0 }}
                  />
                  <div className="flex gap-1.5 mt-1">
                    <button onClick={cancelEdit} className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>취소</button>
                    <button onClick={() => saveItemBody(item.id)} className="text-xs px-2 py-0.5 rounded font-semibold"
                      style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}>저장</button>
                  </div>
                </div>
              ) : (
                <>
                  <span
                    className="text-sm leading-relaxed flex-1 cursor-text"
                    onClick={() => startEdit(item)}
                    style={{
                      color: item.is_completed ? 'var(--text-disabled)' : 'var(--text-primary)',
                      textDecoration: item.is_completed ? 'line-through' : 'none',
                    }}
                  >
                    {item.body}
                  </span>
                  <button
                    onClick={() => deleteItem(item.id)}
                    aria-label="삭제"
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    style={{ color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* 추가 입력 */}
        <div className="flex items-center gap-2 mt-2 pt-1">
          <input
            type="text"
            value={newItemBody}
            onChange={e => setNewItemBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem() }}
            placeholder="액션 아이템 추가..."
            className="flex-1 text-sm py-2"
            style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', borderRadius: 0 }}
          />
          <button
            onClick={addItem}
            disabled={addingItem || !newItemBody.trim()}
            className="text-xs font-semibold px-2.5 py-1 rounded-md disabled:opacity-30"
            style={{ background: 'transparent', color: 'var(--blue-600)', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >추가</button>
        </div>
      </section>

      {/* Comments */}
      <section className={sectionClass} style={sectionBorder}>
        <h2 className={labelClass} style={labelStyle}>댓글{comments.length > 0 ? ` ${comments.length}` : ''}</h2>

        <div className="flex flex-col">
          {comments.map((c, idx) => {
            const authorName = c.author?.name
              ? parseName(c.author.name).displayName
              : c.author_role === 'admin' ? '관리자' : '챔피언'
            const isOwn = c.author_id === currentUserId
            return (
              <div
                key={c.id}
                className="py-3"
                style={idx > 0 ? { borderTop: '1px solid var(--border-faint, var(--border-subtle))' } : undefined}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{authorName}</span>
                    {c.author_role === 'admin' && (
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>관리자</span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                  </div>
                  {isOwn && editingCommentId !== c.id && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body) }}
                        style={{ color: 'var(--text-disabled)', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer' }}
                      >편집</button>
                      <button
                        onClick={() => deleteComment(c.id)}
                        style={{ color: 'var(--error)', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer' }}
                      >삭제</button>
                    </div>
                  )}
                </div>
                {editingCommentId === c.id ? (
                  <div>
                    <textarea
                      value={editingBody}
                      onChange={e => setEditingBody(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border p-2 resize-none mb-1.5 text-sm"
                      style={{ background: 'transparent', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditingCommentId(null)}
                        className="text-xs px-2.5 py-1 rounded-md"
                        style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>취소</button>
                      <button onClick={() => saveEditComment(c.id)}
                        className="text-xs px-2.5 py-1 rounded-md font-semibold"
                        style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}>저장</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Comment input — borderless, only a bottom line */}
        <div
          className="flex items-end gap-2 mt-3 pt-1"
          style={{ borderTop: comments.length > 0 ? '1px solid var(--border-faint, var(--border-subtle))' : 'none' }}
        >
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postComment() }}
            placeholder="댓글 입력... (Cmd+Enter)"
            className="flex-1 text-sm py-2"
            style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', borderRadius: 0 }}
          />
          <button
            onClick={postComment}
            disabled={postingComment || !newComment.trim()}
            aria-label="댓글 등록"
            className="flex items-center justify-center text-xs rounded-md disabled:opacity-30"
            style={{ width: 32, height: 32, background: 'transparent', color: 'var(--blue-600)', border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </section>
    </div>
  )
}
