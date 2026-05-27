'use client'
import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Download, ExternalLink, Send } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { FullPageSpinner, Spinner } from '@/components/ui/spinner'
import { ResizeHandle, useResizableWidth } from '@/components/ui/resize-handle'
import type { KanbanCard, Submission, SubmissionStatus, Comment } from '@/lib/types'

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: '검토 중',
  accepted: '합격',
  declined: '불합격',
}

const STATUS_COLOR: Record<SubmissionStatus, string> = {
  pending: 'var(--blue-600)',
  accepted: 'var(--success)',
  declined: 'var(--error)',
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

interface Props {
  card: KanbanCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusChanged: () => void
}

export function SubmissionDetailPanel({ card, open, onOpenChange, onStatusChanged }: Props) {
  const [submissions, setSubmissions] = useState<(Submission & { comments?: Comment[] })[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<SubmissionStatus | null>(null)
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const { width: sheetWidth, onMouseDown: onResizeSheet } = useResizableWidth({
    initialWidth: 520,
    min: 380,
    max: 1000,
    side: 'left',
  })

  const fetchDetail = useCallback(() => {
    if (!card) return
    setLoading(true)
    apiFetch<(Submission & { comments?: Comment[] })[]>(`/api/admin/users/${card.userId}/submissions`)
      .then(setSubmissions)
      .catch((e: Error) => toast.error('제출 이력 로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }, [card])

  useEffect(() => {
    if (open && card) {
      fetchDetail()
      setNewComment('')
    }
  }, [open, card, fetchDetail])

  if (!card?.latestSubmission) return null

  const latest = submissions[0] ?? null
  const currentStatus = latest?.status ?? card.latestSubmission.status
  const submissionId = latest?.id ?? card.latestSubmission.id
  const comments = latest?.comments?.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) ?? []

  async function changeStatus(newStatus: SubmissionStatus) {
    if (newStatus === currentStatus) return
    setUpdatingStatus(newStatus)
    try {
      await apiFetch(`/api/admin/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      toast.success('상태가 변경되었습니다.')
      fetchDetail()
      onStatusChanged()
    } catch (e) {
      toast.error('상태 변경 실패: ' + (e as Error).message)
    } finally {
      setUpdatingStatus(null)
    }
  }

  async function postComment() {
    const trimmed = newComment.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      await apiFetch(`/api/admin/submissions/${submissionId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: trimmed }),
      })
      toast.success('코멘트가 작성되었습니다.')
      setNewComment('')
      fetchDetail()
    } catch (e) {
      toast.error('코멘트 작성 실패: ' + (e as Error).message)
    } finally {
      setPosting(false)
    }
  }

  async function downloadFile(subId: string) {
    setDownloadingId(subId)
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/admin/storage/${subId}/download`)
      window.open(url, '_blank')
    } catch (e) {
      toast.error('다운로드 URL 생성 실패: ' + (e as Error).message)
    } finally {
      setDownloadingId(null)
    }
  }

  const fullReviewLink = `/admin/champions/${card.userId}`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="overflow-y-auto !max-w-none"
        style={{ width: `${sheetWidth}px` }}
      >
        <ResizeHandle side="left" onMouseDown={onResizeSheet} />
        <SheetHeader>
          <SheetTitle>{card.user.name}</SheetTitle>
          <SheetDescription>
            제출 이력
          </SheetDescription>
        </SheetHeader>

        {loading && submissions.length === 0 ? (
          <FullPageSpinner />
        ) : (
          <div className="mt-6 space-y-6">
            {/* 현재 상태 + 변경 버튼 */}
            <section>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                상태
              </div>
              <div className="flex flex-wrap gap-2">
                {(['pending', 'accepted', 'declined'] as SubmissionStatus[]).map(s => {
                  const isActive = s === currentStatus
                  const isUpdating = updatingStatus === s
                  return (
                    <button
                      key={s}
                      onClick={() => changeStatus(s)}
                      disabled={isActive || updatingStatus !== null}
                      className="text-xs rounded-md px-3 py-1.5 font-semibold transition-opacity disabled:cursor-default"
                      style={{
                        background: isActive ? STATUS_COLOR[s] : 'transparent',
                        color: isActive ? '#fff' : STATUS_COLOR[s],
                        border: `1px solid ${STATUS_COLOR[s]}`,
                        opacity: !isActive && updatingStatus !== null ? 0.5 : 1,
                      }}
                    >
                      {isUpdating && <Spinner size="sm" className="inline mr-1" />}
                      {STATUS_LABEL[s]}
                    </button>
                  )
                })}
              </div>
            </section>

            {/* 최신 제출 정보 + 다운로드 */}
            {latest && (
              <section>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                  최신 제출 (시도 {latest.attempt_number}회)
                </div>
                <div
                  className="rounded-lg border p-3 text-sm"
                  style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {latest.file_name}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
                    {new Date(latest.submitted_at).toLocaleString('ko-KR')} · {relativeTime(latest.submitted_at)}
                  </div>
                  <button
                    onClick={() => downloadFile(latest.id)}
                    disabled={downloadingId === latest.id}
                    className="mt-3 text-xs inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold"
                    style={{ background: 'var(--blue-600)', color: '#fff', opacity: downloadingId === latest.id ? 0.6 : 1 }}
                  >
                    {downloadingId === latest.id ? <Spinner size="sm" /> : <Download className="h-3 w-3" />}
                    다운로드
                  </button>
                </div>
              </section>
            )}

            {/* 이전 시도 이력 */}
            {submissions.length > 1 && (
              <section>
                <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                  이전 시도 ({submissions.length - 1}개)
                </div>
                <div className="space-y-1.5">
                  {submissions.slice(1).map(sub => (
                    <div
                      key={sub.id}
                      className="rounded-md border px-3 py-2 text-xs flex items-center justify-between gap-2"
                      style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="truncate" style={{ color: 'var(--text-primary)' }}>
                          시도 {sub.attempt_number}회 · {sub.file_name}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-disabled)' }}>
                          {new Date(sub.submitted_at).toLocaleString('ko-KR')}
                          <span className="ml-2" style={{ color: STATUS_COLOR[sub.status] }}>
                            · {STATUS_LABEL[sub.status]}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => downloadFile(sub.id)}
                        disabled={downloadingId === sub.id}
                        className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded"
                        style={{ color: 'var(--blue-600)' }}
                        aria-label="다운로드"
                      >
                        {downloadingId === sub.id ? <Spinner size="sm" /> : <Download className="h-3 w-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 코멘트 */}
            <section>
              <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
                코멘트 ({comments.length})
              </div>
              <div className="space-y-2 mb-3">
                {comments.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--text-disabled)' }}>
                    아직 코멘트가 없습니다.
                  </p>
                ) : (
                  comments.map(c => (
                    <div
                      key={c.id}
                      className="rounded-md border p-2.5 text-xs"
                      style={{
                        background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-primary)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex justify-between mb-1">
                        <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                          {c.author_role === 'admin' ? '관리자' : '챔피언'}
                        </span>
                        <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                      </div>
                      <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                        {c.body}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    postComment()
                  }
                }}
                placeholder="코멘트 작성 (Cmd/Ctrl+Enter로 등록)"
                rows={3}
                className="w-full text-xs rounded-md border p-2 resize-none"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={postComment}
                disabled={posting || !newComment.trim()}
                className="mt-2 text-xs inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}
              >
                {posting ? <Spinner size="sm" /> : <Send className="h-3 w-3" />}
                코멘트 등록
              </button>
            </section>

            {/* 전체 리뷰 페이지로 이동 */}
            <section className="pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <a
                href={fullReviewLink}
                className="text-xs inline-flex items-center gap-1 font-semibold"
                style={{ color: 'var(--blue-600)' }}
              >
                <ExternalLink className="h-3 w-3" />
                전체 리뷰 페이지로 이동
              </a>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
