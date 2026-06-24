'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { SessionMiniGantt } from '@/components/SessionMiniGantt'
import { parseName } from '@/lib/utils'
import type { CheckUpSession, SessionActionItem, SessionComment, Milestone } from '@/lib/types'

interface Props {
  sessionId: string
  currentUserId: string
}

export function ChampionSessionDetail({ sessionId, currentUserId }: Props) {
  const router = useRouter()
  const [session, setSession] = useState<CheckUpSession | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [actionItems, setActionItems] = useState<SessionActionItem[]>([])
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
        setActionItems(data.action_items ?? [])
        setComments(data.comments ?? [])
        setMilestones(data.milestones ?? [])
      })
      .catch(() => toast.error('세션을 불러올 수 없습니다.'))
      .finally(() => setLoading(false))
  }, [sessionId])

  async function toggleItem(item: SessionActionItem) {
    try {
      const updated = await apiFetch<SessionActionItem>(
        `/api/sessions/${sessionId}/action-items/${item.id}`,
        { method: 'PATCH', body: JSON.stringify({ is_completed: !item.is_completed }) }
      )
      setActionItems(v => v.map(i => i.id === item.id ? updated : i))
    } catch { toast.error('업데이트 실패') }
  }

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
      <div className="flex flex-col gap-2">
        {[1,2,3].map(i => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }
  if (!session) return null

  return (
    <div>
      <button
        onClick={() => router.push('/my-project/sessions')}
        className="flex items-center gap-1 text-xs mb-4"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3 w-3" /> 목록으로
      </button>

      <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{session.title}</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{session.session_date}</p>

      {/* Mini Gantt */}
      <SessionMiniGantt milestones={milestones} sessionDate={session.session_date} />

      {/* Notes — read only */}
      {session.notes && (
        <div
          className="rounded-xl border p-4 mb-4"
          style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>📝 미팅 노트</p>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{session.notes}</p>
        </div>
      )}

      {/* Action Items — toggle only */}
      {actionItems.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>✅ 내 액션 아이템</p>
          <div className="flex flex-col gap-1.5">
            {actionItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2 rounded-lg border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <input
                  type="checkbox"
                  checked={item.is_completed}
                  onChange={() => toggleItem(item)}
                  className="h-4 w-4 cursor-pointer"
                  style={{ accentColor: 'var(--blue-600)' }}
                />
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: 'var(--text-primary)',
                    textDecoration: item.is_completed ? 'line-through' : 'none',
                    opacity: item.is_completed ? 0.5 : 1,
                  }}
                >
                  {item.body}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>💬 댓글 ({comments.length})</p>
        <div className="flex flex-col gap-2 mb-2">
          {comments.map(c => {
            const authorName = c.author?.name
              ? parseName(c.author.name).displayName
              : c.author_role === 'admin' ? '관리자' : '챔피언'
            const isOwn = c.author_id === currentUserId
            return (
              <div
                key={c.id}
                className="rounded-lg border p-2 text-xs"
                style={{
                  background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex justify-between mb-0.5">
                  <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                    {authorName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                    {isOwn && (
                      <>
                        <button
                          onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body) }}
                          style={{ color: 'var(--text-disabled)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                        >편집</button>
                        <button
                          onClick={() => deleteComment(c.id)}
                          style={{ color: 'var(--error)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                        >삭제</button>
                      </>
                    )}
                  </div>
                </div>
                {editingCommentId === c.id ? (
                  <div>
                    <textarea
                      value={editingBody}
                      onChange={e => setEditingBody(e.target.value)}
                      rows={2}
                      className="w-full rounded border p-1.5 resize-none mb-1 text-xs"
                      style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditingCommentId(null)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>취소</button>
                      <button onClick={() => saveEditComment(c.id)}
                        className="text-xs px-2 py-0.5 rounded font-semibold"
                        style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}>저장</button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postComment() }}
            placeholder="댓글 입력... (Cmd+Enter)"
            className="flex-1 rounded-lg border px-3 py-2 text-xs"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button
            onClick={postComment}
            disabled={postingComment || !newComment.trim()}
            className="text-xs px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
