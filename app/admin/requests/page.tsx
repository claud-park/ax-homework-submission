'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { DeadlineChangeRequest } from '@/lib/types'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Inbox } from 'lucide-react'

// Shape returned by GET /api/admin/milestones/bottleneck-pending
interface BottleneckReport {
  id: string
  week_number: number
  title: string
  bottleneck_type: string
  bottleneck_note: string | null
  due_date: string
  users: { name: string; email: string; avatar_url: string | null } | null
}

const BOTTLENECK_LABEL: Record<string, string> = {
  technical: '기술적 문제',
  resource: '리소스 부족',
  external: '외부 의존성',
  other: '기타',
}

const DEADLINE_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', approved: 'var(--success)', rejected: 'var(--error)',
}
const DEADLINE_STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', approved: '승인됨', rejected: '반려됨',
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--surface-secondary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: '13px',
  width: '100%',
  resize: 'none',
}

export default function AdminRequestsPage() {
  const [bottleneckReports, setBottleneckReports] = useState<BottleneckReport[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])

  useEffect(() => {
    apiFetch<BottleneckReport[]>('/api/admin/milestones/bottleneck-pending')
      .then(setBottleneckReports)
      .catch((e: Error) => toast.error('지연 신고 목록 로드 실패: ' + e.message))
    apiFetch<DeadlineChangeRequest[]>('/api/admin/deadline-requests')
      .then(setRequests)
      .catch((e: Error) => toast.error('기한 변경 요청 로드 실패: ' + e.message))
  }, [])

  async function handleBottleneckReview(id: string) {
    setSubmitting(id)
    try {
      await apiFetch(`/api/admin/milestones/${id}/bottleneck-review`, {
        method: 'PATCH',
        body: JSON.stringify({ admin_comment: comments[id] ?? '' }),
      })
      setBottleneckReports(prev => prev.filter(r => r.id !== id))
      toast.success('확인 완료 처리되었습니다.')
    } catch (e) {
      toast.error('처리 실패: ' + (e as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  async function handleDeadlineReview(id: string, status: 'approved' | 'rejected') {
    try {
      const updated = await apiFetch<DeadlineChangeRequest>(`/api/admin/deadline-requests/${id}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      })
      setRequests(prev => prev.map(r => r.id === id ? updated : r))
      toast.success(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.')
    } catch (e) {
      toast.error('승인/반려 처리 실패: ' + (e as Error).message)
    }
  }

  // Per milestone: all pending + most recent resolved
  const displayedDeadlines = (() => {
    const byMilestone = new Map<string, DeadlineChangeRequest[]>()
    for (const r of requests) {
      const list = byMilestone.get(r.milestone_id) ?? []
      list.push(r)
      byMilestone.set(r.milestone_id, list)
    }
    const result: DeadlineChangeRequest[] = []
    Array.from(byMilestone.values()).forEach(reqs => {
      reqs.filter(r => r.status === 'pending').forEach(r => result.push(r))
      const resolved = reqs.find(r => r.status === 'approved' || r.status === 'rejected')
      if (resolved) result.push(resolved)
    })
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })()

  return (
    <div className="flex flex-col gap-8">
      {/* ── 지연 신고 섹션 ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>지연 신고</h2>
          {bottleneckReports.length > 0 && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)' }}
            >
              {bottleneckReports.length}건 대기중
            </span>
          )}
        </div>
        {bottleneckReports.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>대기중인 지연 신고가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {bottleneckReports.map(report => (
              <div
                key={report.id}
                className="p-4 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    {report.users?.avatar_url && (
                      <img src={report.users.avatar_url} alt={report.users.name ?? ''} className="w-5 h-5 rounded-full" />
                    )}
                    <span className="text-xs font-semibold" style={{ color: 'var(--blue-600)' }}>
                      {report.users?.name ?? '알 수 없음'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}
                    >
                      {report.week_number}주차
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {report.title}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                      지연 유형: {BOTTLENECK_LABEL[report.bottleneck_type] ?? report.bottleneck_type}
                    </span>
                  </div>
                  {report.bottleneck_note && (
                    <p
                      className="text-xs px-3 py-2 rounded-lg mt-2"
                      style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontStyle: 'italic' }}
                    >
                      &quot;{report.bottleneck_note}&quot;
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>답변</label>
                  <textarea
                    rows={3}
                    value={comments[report.id] ?? ''}
                    onChange={e => setComments(prev => ({ ...prev, [report.id]: e.target.value }))}
                    placeholder="답변을 입력하세요 (선택)"
                    style={INPUT_STYLE}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleBottleneckReview(report.id)}
                      disabled={submitting === report.id}
                      className="text-xs px-4 py-2 rounded-lg font-semibold"
                      style={{
                        background: submitting === report.id ? 'var(--surface-secondary)' : 'rgba(37,99,235,0.15)',
                        color: submitting === report.id ? 'var(--text-disabled)' : 'var(--blue-600)',
                        border: '1px solid var(--blue-600)',
                        cursor: submitting === report.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {submitting === report.id ? '처리 중...' : '확인 완료'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 기한 변경 요청 섹션 ── */}
      <section>
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>기한 변경 요청</h2>
        <div className="flex flex-col gap-3">
          {displayedDeadlines.map(req => (
            <div key={req.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {req.user?.avatar_url && (
                      <img src={req.user.avatar_url} alt={req.user.name} className="w-5 h-5 rounded-full" />
                    )}
                    <span className="text-xs font-semibold" style={{ color: 'var(--blue-600)' }}>{req.user?.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {req.milestone?.week_number && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}>
                        {req.milestone.week_number}주차
                      </span>
                    )}
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{req.milestone?.title}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {req.original_due_date} → {req.requested_due_date}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>사유: {req.reason}</p>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={{ color: DEADLINE_STATUS_COLOR[req.status], background: `${DEADLINE_STATUS_COLOR[req.status]}20` }}
                >
                  {DEADLINE_STATUS_LABEL[req.status]}
                </span>
              </div>
              {req.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>
                        ✓ 승인
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>기한변경 요청 승인</AlertDialogTitle>
                        <AlertDialogDescription>마일스톤 마감일이 요청 날짜로 변경됩니다. 진행하시겠습니까?</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeadlineReview(req.id, 'approved')}>승인</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
                        ✗ 반려
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>기한변경 요청 반려</AlertDialogTitle>
                        <AlertDialogDescription>이 요청을 반려하시겠습니까?</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeadlineReview(req.id, 'rejected')}>반려</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
          {displayedDeadlines.length === 0 && <EmptyState icon={Inbox} title="대기 중인 요청이 없습니다" />}
        </div>
      </section>
    </div>
  )
}
