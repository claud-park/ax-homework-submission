'use client'
import { useEffect, useState } from 'react'
import { ArrowLeft, Trash2, Send, RefreshCw, Download, Pencil } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { SessionMiniGantt } from '@/components/SessionMiniGantt'
import { RecordingPanel } from '@/components/sessions/RecordingPanel'
import { MarkdownView } from '@/components/MarkdownView'
import { SessionNotesEditor } from '@/components/sessions/SessionNotesEditor'
import { parseName } from '@/lib/utils'
import type { CheckUpSession, SessionActionItem, SessionComment, Milestone } from '@/lib/types'
import { useSessionActionItems } from '@/components/sessions/useSessionActionItems'
import { useSessionNotes } from '@/components/sessions/useSessionNotes'

interface Props {
  sessionId: string
  currentAdminId: string
  onBack: () => void
  onDeleted: () => void
}

export function AdminSessionDetail({ sessionId, currentAdminId, onBack, onDeleted }: Props) {
  const {
    actionItems, setActionItems,
    newItemBody, setNewItemBody, addingItem,
    editingItemId, editingItemBody, setEditingItemBody,
    addItem, toggleItem, deleteItem, startEdit, cancelEdit, saveItemBody,
  } = useSessionActionItems(sessionId)

  const [session, setSession] = useState<CheckUpSession | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [comments, setComments] = useState<SessionComment[]>([])
  const [loading, setLoading] = useState(true)

  const {
    notes, setNotes, isEditingNotes, setIsEditingNotes, saving, saveNotes,
  } = useSessionNotes(sessionId, session, setSession, load)

  const [deleting, setDeleting] = useState(false)

  const [reprocessing, setReprocessing] = useState(false)

  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [downloadingAudio, setDownloadingAudio] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<CheckUpSession & { action_items: SessionActionItem[]; comments: SessionComment[]; milestones: Milestone[] }>(
        `/api/sessions/${sessionId}`
      )
      setSession(data)
      setNotes(data.notes ?? '')
      // 첫 세션(노트 미저장)은 편집 뷰를 기본 열림 — 녹음 중 바로 작성 가능.
      // 한 번이라도 저장돼 노트가 있으면 read-only(+[수정])로 진입.
      setIsEditingNotes(!(data.notes ?? '').trim())
      setActionItems(data.action_items ?? [])
      setComments(data.comments ?? [])
      setMilestones(data.milestones ?? [])
    } catch {
      toast.error('세션을 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sessionId])

  async function refreshSessionMeta() {
    try {
      const data = await apiFetch<CheckUpSession>(`/api/sessions/${sessionId}`)
      setSession(prev => prev ? { ...prev, updated_at: data.updated_at } : prev)
    } catch { /* best-effort: stale updated_at만 갱신 실패, 치명적 아님 */ }
  }

  async function deleteSession() {
    if (!confirm('이 세션을 삭제할까요?')) return
    setDeleting(true)
    try {
      await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      toast.success('삭제되었습니다.')
      onDeleted()
    } catch { toast.error('삭제 실패') } finally { setDeleting(false) }
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

  function handleProcessed(processedNotes: string, processedItems: SessionActionItem[]) {
    setNotes(processedNotes)
    setActionItems(processedItems)
    setSession(prev => prev ? { ...prev, processing_status: 'done' } : prev)
    void refreshSessionMeta()
  }

  async function reprocess() {
    setReprocessing(true)
    setSession(prev => prev ? { ...prev, processing_status: 'transcribing' } : prev)
    try {
      const result = await apiFetch<{
        notes: string
        actionItems: SessionActionItem[]
        usage?: { stt: { durationSec: number; cost: number }; claude: { inputTokens: number; outputTokens: number; cost: number }; totalCost: number }
      }>(`/api/sessions/${sessionId}/reprocess`, { method: 'POST' })
      setNotes(result.notes)
      setActionItems(result.actionItems)
      setSession(prev => prev ? { ...prev, processing_status: 'done', notes: result.notes } : prev)
      await refreshSessionMeta()
      if (result.usage) {
        const u = result.usage
        toast.success(`재처리 완료! Whisper $${u.stt.cost.toFixed(3)} · Claude $${u.claude.cost.toFixed(4)} · 합계 $${u.totalCost.toFixed(4)}`)
      } else {
        toast.success('재처리 완료!')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '재처리 실패'
      toast.error(msg)
      setSession(prev => prev ? { ...prev, processing_status: 'error' } : prev)
    } finally {
      setReprocessing(false)
    }
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

  function relativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return '방금'
    if (min < 60) return `${min}분 전`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}시간 전`
    return `${Math.floor(h / 24)}일 전`
  }

  async function saveTitle() {
    if (!titleDraft.trim()) return
    setSavingTitle(true)
    try {
      const updated = await apiFetch<CheckUpSession>(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: titleDraft.trim(), expectedUpdatedAt: session?.updated_at }),
      })
      setSession(updated)
      setEditingTitle(false)
      toast.success('제목이 수정되었습니다.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '제목 수정 실패')
    } finally {
      setSavingTitle(false)
    }
  }

  function downloadText(filename: string, text: string) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadAudio() {
    setDownloadingAudio(true)
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/sessions/${sessionId}/audio-url`)
      const a = document.createElement('a')
      a.href = url
      a.click()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '오디오 다운로드 실패')
    } finally {
      setDownloadingAudio(false)
    }
  }

  const safeTitle = (session?.title || 'session').replace(/[^\w가-힣.-]+/g, '_')

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs"
          style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft className="h-3 w-3" /> 목록으로
        </button>
        <button
          onClick={deleteSession}
          disabled={deleting}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg disabled:opacity-40"
          style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
        >
          <Trash2 className="h-3 w-3" />
          삭제
        </button>
      </div>

      {editingTitle ? (
        <div className="flex items-center gap-2 mb-1">
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
            className="flex-1 rounded-lg border px-2 py-1 text-base font-bold"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button onClick={saveTitle} disabled={savingTitle || !titleDraft.trim()} className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40" style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}>{savingTitle ? '저장 중...' : '저장'}</button>
          <button onClick={() => setEditingTitle(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>취소</button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 mb-1">
          <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{session.title}</h3>
          <button onClick={() => { setTitleDraft(session.title); setEditingTitle(true) }} title="제목 수정" className="p-1 rounded-md" style={{ background: 'transparent', border: 'none', color: 'var(--text-disabled)', cursor: 'pointer' }}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{session.session_date}{session.session_time ? ` ${session.session_time.slice(0, 5)}` : ''}</p>

      {/* Mini Gantt */}
      <SessionMiniGantt milestones={milestones} sessionDate={session.session_date} />

      {/* Reprocess banner — shown when previous processing failed but audio exists */}
      {session.processing_status === 'error' && session.audio_file_path && (
        <div
          className="rounded-xl border p-3 mb-4 flex items-center justify-between"
          style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}
        >
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--error)' }}>이전 처리 실패</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>저장된 오디오로 재처리할 수 있습니다.</p>
          </div>
          <button
            onClick={reprocess}
            disabled={reprocessing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <RefreshCw className={`h-3 w-3 ${reprocessing ? 'animate-spin' : ''}`} />
            {reprocessing ? '처리 중...' : '재처리'}
          </button>
        </div>
      )}

      {/* Recording panel (new session) OR downloads (already-recorded session) */}
      {!session.audio_file_path ? (
        <RecordingPanel sessionId={sessionId} onProcessed={handleProcessed} />
      ) : (
        <div
          className="rounded-xl border p-3 mb-4"
          style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>다운로드</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadAudio}
              disabled={downloadingAudio}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', cursor: 'pointer' }}
            >
              <Download className="h-3.5 w-3.5" /> {downloadingAudio ? '준비 중...' : '녹음 파일'}
            </button>
            {session.raw_transcript?.trim() && (
              <button
                onClick={() => downloadText(`${safeTitle}-transcript.txt`, session.raw_transcript ?? '')}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                <Download className="h-3.5 w-3.5" /> 전사 (txt)
              </button>
            )}
            {notes.trim() && (
              <button
                onClick={() => downloadText(`${safeTitle}-summary.md`, notes)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                <Download className="h-3.5 w-3.5" /> AI 요약 (md)
              </button>
            )}
          </div>
          {!session.raw_transcript?.trim() && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-disabled)' }}>전사 텍스트가 아직 없습니다.</p>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>📝 미팅 노트</p>
          {!isEditingNotes && (
            <button
              onClick={() => setIsEditingNotes(true)}
              className="text-xs font-semibold px-2 py-1 rounded-md"
              style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              수정
            </button>
          )}
        </div>
        {isEditingNotes ? (
          <SessionNotesEditor value={notes} onChange={setNotes} />
        ) : (
          <div className="rounded-xl border p-3" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
            <MarkdownView markdown={notes} />
          </div>
        )}
      </div>

      {/* Action Items */}
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>✅ 액션 아이템</p>
        <div className="flex flex-col gap-1.5 mb-2">
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
              {editingItemId === item.id ? (
                <>
                  <input
                    type="text"
                    value={editingItemBody}
                    onChange={e => setEditingItemBody(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveItemBody(item.id) }}
                    className="flex-1 rounded border px-2 py-1 text-sm"
                    style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
                    autoFocus
                  />
                  <button
                    onClick={() => saveItemBody(item.id)}
                    className="text-xs font-semibold"
                    style={{ color: 'var(--blue-600)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >저장</button>
                  <button
                    onClick={() => cancelEdit()}
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >취소</button>
                </>
              ) : (
                <>
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
                  <button
                    onClick={() => startEdit(item)}
                    className="text-xs"
                    style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >수정</button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="text-xs"
                    style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >삭제</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newItemBody}
            onChange={e => setNewItemBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem() }}
            placeholder="액션 아이템 추가..."
            className="flex-1 rounded-lg border px-3 py-2 text-xs"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button
            onClick={addItem}
            disabled={addingItem || !newItemBody.trim()}
            className="text-xs px-3 py-2 rounded-lg font-semibold disabled:opacity-40"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            추가
          </button>
        </div>
      </div>

      {/* Comments */}
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>💬 댓글 ({comments.length})</p>
        <div className="flex flex-col gap-2 mb-2">
          {comments.map(c => {
            const authorName = c.author?.name
              ? parseName(c.author.name).displayName
              : c.author_role === 'admin' ? '관리자' : '챔피언'
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
                    {c.author_id === currentAdminId && (
                      <button
                        onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body) }}
                        style={{ color: 'var(--text-disabled)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                      >편집</button>
                    )}
                    <button
                      onClick={() => deleteComment(c.id)}
                      style={{ color: 'var(--error)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                    >삭제</button>
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

      {/* Save / Cancel Buttons — only in edit mode */}
      {isEditingNotes && (
        <div className="flex gap-2">
          <button
            onClick={() => { setIsEditingNotes(false); setNotes(session?.notes ?? '') }}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >취소</button>
          <button
            onClick={saveNotes}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >{saving ? '저장 중...' : '저장'}</button>
        </div>
      )}
    </div>
  )
}
