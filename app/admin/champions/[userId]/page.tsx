'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { ChampionProject, Submission, MilestoneStatus, CharterSubmission, Milestone, Comment, SubmissionStatus } from '@/lib/types'
import { parseName } from '@/lib/utils'
import { ArrowLeft, Download, ExternalLink, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'

function fmtMD(s: string): string {
  if (!s) return ''
  const [, m, d] = s.split('-').map(Number)
  return `${m}/${d}`
}

const MS_STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const MS_STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const SUB_STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const SUB_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
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
const CHARTER_SECTIONS = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
  { key: 'timeline', label: '06. Timeline · Milestones' },
]

type SubWithComments = Submission & { comments?: Comment[] }

export default function AdminChampionPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [data, setData] = useState<ChampionProject | null>(null)
  const [submissions, setSubmissions] = useState<SubWithComments[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  // feedback confirm flow
  const [confirmingSubId, setConfirmingSubId] = useState<string | null>(null)
  const [confirmingStatus, setConfirmingStatus] = useState<SubmissionStatus | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  // comment flow
  const [newComment, setNewComment] = useState<Record<string, string>>({})
  const [posting, setPosting] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  function loadSubs() {
    return apiFetch<SubWithComments[]>(`/api/admin/users/${userId}/submissions`).then(setSubmissions)
  }

  useEffect(() => {
    Promise.all([
      apiFetch<ChampionProject>(`/api/champions/${userId}`).then(setData),
      loadSubs(),
    ])
      .catch(() => toast.error('데이터 로드 실패'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function approveCharter(charterId: string) {
    setApproving(true)
    try {
      const updated = await apiFetch<CharterSubmission>(`/api/admin/charters/${charterId}/approve`, { method: 'POST' })
      setData(prev => prev ? { ...prev, charter: prev.charter ? { ...prev.charter, admin_approved_at: updated.admin_approved_at } : null } : null)
      toast.success('과제정의서가 승인되었습니다.')
    } catch {
      toast.error('승인 처리에 실패했습니다.')
    } finally {
      setApproving(false)
    }
  }

  function openConfirm(subId: string, status: SubmissionStatus, currentFeedback: string | null) {
    setConfirmingSubId(subId)
    setConfirmingStatus(status)
    setFeedbackText(currentFeedback ?? '')
  }

  function cancelConfirm() {
    setConfirmingSubId(null)
    setConfirmingStatus(null)
    setFeedbackText('')
  }

  async function confirmStatusChange() {
    if (!confirmingSubId || !confirmingStatus) return
    setUpdatingStatus(confirmingSubId)
    try {
      await apiFetch(`/api/admin/submissions/${confirmingSubId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: confirmingStatus, feedback: feedbackText }),
      })
      toast.success('상태가 변경되었습니다.')
      cancelConfirm()
      await loadSubs()
    } catch {
      toast.error('상태 변경 실패')
    } finally {
      setUpdatingStatus(null)
    }
  }

  async function postComment(subId: string) {
    const trimmed = (newComment[subId] ?? '').trim()
    if (!trimmed) return
    setPosting(subId)
    try {
      await apiFetch(`/api/admin/submissions/${subId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: trimmed }),
      })
      toast.success('코멘트가 작성되었습니다.')
      setNewComment(prev => ({ ...prev, [subId]: '' }))
      await loadSubs()
    } catch {
      toast.error('코멘트 작성 실패')
    } finally {
      setPosting(null)
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

  const allMilestones = useMemo(() => {
    if (!data) return []
    return [...(data.milestones ?? [])].sort((a, b) =>
      (a.start_date ?? '').localeCompare(b.start_date ?? '') || a.display_order - b.display_order
    )
  }, [data])

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }
  if (!data) return null

  const { displayName, department } = parseName(data.user.name)

  return (
    <div>
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-1 text-xs mb-6"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3 w-3" /> 대시보드로
      </button>

      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</h1>
        {department && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{department}</p>}
        {data.charter?.project_name && (
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{data.charter.project_name}</p>
        )}
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>과제 제출 이력</h2>
        {submissions.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>아직 제출 없음</p>
        ) : (
          <div className="flex flex-col gap-4">
            {submissions.map(sub => {
              const isConfirming = confirmingSubId === sub.id
              const isUpdating = updatingStatus === sub.id
              const comments = (sub.comments ?? []).slice().sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              )
              return (
                <div
                  key={sub.id}
                  className="rounded-xl border"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                >
                  {/* 헤더: 파일/링크 + 상태 */}
                  <div className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      {sub.link_url ? (
                        <a
                          href={sub.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate flex items-center gap-1"
                          style={{ color: 'var(--blue-600)' }}
                        >
                          <ExternalLink className="h-3 w-3 shrink-0" />
                          {sub.link_url}
                        </a>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
                          <button
                            onClick={() => downloadFile(sub.id)}
                            disabled={downloadingId === sub.id}
                            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded"
                            style={{ color: 'var(--blue-600)', background: 'rgba(37,99,235,0.08)', border: 'none', cursor: 'pointer' }}
                          >
                            {downloadingId === sub.id ? <Spinner size="sm" /> : <Download className="h-3 w-3" />}
                          </button>
                        </div>
                      )}
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')} · {relativeTime(sub.submitted_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs font-semibold px-2 py-1 rounded-md"
                        style={{ color: SUB_STATUS_COLOR[sub.status], background: `${SUB_STATUS_COLOR[sub.status]}20` }}
                      >
                        {SUB_STATUS_LABEL[sub.status]}
                      </span>
                      {(['accepted', 'declined'] as SubmissionStatus[]).map(s => (
                        <button
                          key={s}
                          onClick={() => isConfirming && confirmingStatus === s ? cancelConfirm() : openConfirm(sub.id, s, sub.feedback ?? null)}
                          disabled={isUpdating || (confirmingSubId !== null && confirmingSubId !== sub.id)}
                          className="text-xs px-2 py-1 rounded font-semibold"
                          style={{
                            background: sub.status === s
                              ? `${SUB_STATUS_COLOR[s]}20`
                              : isConfirming && confirmingStatus === s
                                ? SUB_STATUS_COLOR[s]
                                : 'transparent',
                            color: isConfirming && confirmingStatus === s ? '#fff' : SUB_STATUS_COLOR[s],
                            border: `1px solid ${SUB_STATUS_COLOR[s]}`,
                            cursor: 'pointer',
                            opacity: isUpdating ? 0.5 : 1,
                          }}
                        >
                          {s === 'accepted' ? '합격' : '불합격'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 기존 피드백 표시 */}
                  {sub.feedback && !isConfirming && (
                    <div className="px-3 pb-3">
                      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>피드백</p>
                      <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{sub.feedback}</p>
                    </div>
                  )}

                  {/* 상태 변경 확인 + 피드백 입력 */}
                  {isConfirming && (
                    <div
                      className="mx-3 mb-3 rounded-lg border p-3 flex flex-col gap-2"
                      style={{ borderColor: `${SUB_STATUS_COLOR[confirmingStatus!]}40`, background: `${SUB_STATUS_COLOR[confirmingStatus!]}06` }}
                    >
                      <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                        피드백 <span style={{ color: 'var(--text-disabled)', fontWeight: 400 }}>(선택)</span>
                      </label>
                      <textarea
                        value={feedbackText}
                        onChange={e => setFeedbackText(e.target.value)}
                        placeholder="이번 제출에 대한 피드백을 남겨주세요"
                        rows={3}
                        className="w-full text-xs rounded-md border p-2 resize-none"
                        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={cancelConfirm}
                          className="text-xs px-3 py-1.5 rounded-md font-semibold"
                          style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >취소</button>
                        <button
                          onClick={confirmStatusChange}
                          disabled={isUpdating}
                          className="text-xs px-3 py-1.5 rounded-md font-semibold disabled:opacity-50 flex items-center gap-1"
                          style={{ background: SUB_STATUS_COLOR[confirmingStatus!], color: '#fff', cursor: 'pointer' }}
                        >
                          {isUpdating && <Spinner size="sm" />}
                          {SUB_STATUS_LABEL[confirmingStatus!]}으로 변경
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 코멘트 */}
                  <div
                    className="px-3 pb-3 pt-2 flex flex-col gap-2"
                    style={{ borderTop: '1px solid var(--border-faint)' }}
                  >
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      코멘트 {comments.length > 0 ? `(${comments.length})` : ''}
                    </p>
                    {comments.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {comments.map(c => (
                          <div
                            key={c.id}
                            className="rounded-md border p-2 text-xs"
                            style={{
                              background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                              borderColor: 'var(--border-subtle)',
                            }}
                          >
                            <div className="flex justify-between mb-0.5">
                              <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                                {c.author_role === 'admin' ? '관리자' : '챔피언'}
                              </span>
                              <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <textarea
                        value={newComment[sub.id] ?? ''}
                        onChange={e => setNewComment(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault()
                            postComment(sub.id)
                          }
                        }}
                        placeholder="코멘트 작성 (Cmd+Enter)"
                        rows={2}
                        className="flex-1 text-xs rounded-md border p-2 resize-none"
                        style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                      />
                      <button
                        onClick={() => postComment(sub.id)}
                        disabled={posting === sub.id || !(newComment[sub.id] ?? '').trim()}
                        className="text-xs inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-semibold disabled:opacity-40 self-end"
                        style={{ background: 'var(--blue-600)', color: '#fff', cursor: 'pointer', border: 'none' }}
                      >
                        {posting === sub.id ? <Spinner size="sm" /> : <Send className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {data.charter && (
        <section id="charter" className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</h2>
            {data.charter.admin_approved_at ? (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--success)', border: '1px solid rgba(22,163,74,0.3)' }}
              >
                ✓ 승인됨 · {new Date(data.charter.admin_approved_at).toLocaleDateString('ko-KR')}
              </span>
            ) : (
              <button
                onClick={() => approveCharter(data.charter!.id)}
                disabled={approving}
                className="text-xs font-semibold px-3 py-1 rounded-full disabled:opacity-50"
                style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid rgba(37,99,235,0.3)', cursor: 'pointer' }}
              >
                {approving ? '처리 중…' : '✓ 승인'}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {CHARTER_SECTIONS.map(s => {
              const html = data.charter!.content?.[s.key as keyof CharterSubmission['content']]
              if (!html) return null
              return (
                <div
                  key={s.key}
                  className="p-4 rounded-xl border"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                >
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    style={{ color: 'var(--text-primary)' }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 마일스톤 그룹 (읽기 전용) */}
      {(() => {
        const depth0 = (data.milestones ?? []).filter((m: Milestone) => !m.parent_milestone_id)
        if (depth0.length === 0) return null
        return (
          <section className="mb-8">
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>마일스톤 그룹</h2>
            <div style={{ marginBottom: 16 }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>마일스톤 그룹</p>
              <div className="flex flex-col gap-2">
                {depth0.map((g: Milestone) => {
                  const children = (data.milestones ?? []).filter((m: Milestone) => m.parent_milestone_id === g.id)
                  return (
                    <div key={g.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-secondary)' }}>
                      <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{g.title}</p>
                      {g.start_date && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{g.start_date} ~ {g.due_date}</p>
                      )}
                      <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>하위 마일스톤 {children.length}개</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )
      })()}

      {allMilestones.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>WBS / 마일스톤</h2>
          <div className="flex flex-col gap-2">
            {allMilestones.map(m => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtMD(m.start_date ?? '')} – {fmtMD(m.due_date ?? '')}</p>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-md"
                  style={{ color: MS_STATUS_COLOR[m.status], background: `${MS_STATUS_COLOR[m.status]}20` }}
                >
                  {MS_STATUS_LABEL[m.status]}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
