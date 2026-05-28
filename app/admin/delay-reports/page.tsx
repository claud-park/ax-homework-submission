'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'

interface BottleneckReport {
  id: string
  week_number: number
  title: string
  bottleneck_type: string
  bottleneck_note: string | null
  bottleneck_admin_comment: string | null
  bottleneck_reviewed_at: string | null
  due_date: string
  users: { name: string; email: string; avatar_url: string | null } | null
}

const BOTTLENECK_LABEL: Record<string, string> = {
  technical: '기술적 문제',
  resource: '리소스 부족',
  external: '외부 의존성',
  other: '기타',
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

type Tab = 'pending' | 'reviewed'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: '답변 대기중' },
  { id: 'reviewed', label: '확인 완료' },
]

function ReportCard({
  report,
  reviewed,
  comment,
  submitting,
  onCommentChange,
  onReview,
}: {
  report: BottleneckReport
  reviewed: boolean
  comment?: string
  submitting?: boolean
  onCommentChange?: (value: string) => void
  onReview?: () => void
}) {
  return (
    <div
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
          {reviewed && report.bottleneck_reviewed_at && (
            <span className="text-xs ml-auto" style={{ color: 'var(--text-disabled)' }}>
              {new Date(report.bottleneck_reviewed_at).toLocaleDateString('ko-KR')} 확인
            </span>
          )}
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
            {BOTTLENECK_LABEL[report.bottleneck_type] ?? report.bottleneck_type}
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

      {reviewed ? (
        report.bottleneck_admin_comment && (
          <p
            className="text-xs px-3 py-2 rounded-lg"
            style={{ background: 'color-mix(in srgb, var(--success) 8%, transparent)', color: 'var(--text-secondary)', borderLeft: '2px solid var(--success)' }}
          >
            {report.bottleneck_admin_comment}
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>답변</label>
          <textarea
            rows={3}
            value={comment ?? ''}
            onChange={e => onCommentChange?.(e.target.value)}
            placeholder="답변을 입력하세요 (선택)"
            style={INPUT_STYLE}
          />
          <div className="flex justify-end">
            <button
              onClick={onReview}
              disabled={submitting}
              className="text-xs px-4 py-2 rounded-lg font-semibold"
              style={{
                background: submitting ? 'var(--surface-secondary)' : 'rgba(37,99,235,0.15)',
                color: submitting ? 'var(--text-disabled)' : 'var(--blue-600)',
                border: '1px solid var(--blue-600)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? '처리 중...' : '확인 완료'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminDelayReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [pending, setPending] = useState<BottleneckReport[]>([])
  const [reviewed, setReviewed] = useState<BottleneckReport[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch<BottleneckReport[]>('/api/admin/milestones/bottleneck-pending').then(setPending),
      apiFetch<BottleneckReport[]>('/api/admin/milestones/bottleneck-reviewed').then(setReviewed),
    ])
      .catch((e: Error) => toast.error('지연 신고 목록 로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleReview(id: string) {
    setSubmitting(id)
    try {
      const result = await apiFetch<BottleneckReport>(`/api/admin/milestones/${id}/bottleneck-review`, {
        method: 'PATCH',
        body: JSON.stringify({ admin_comment: comments[id] ?? '' }),
      })
      setPending(prev => prev.filter(r => r.id !== id))
      setReviewed(prev => [result, ...prev])
      setComments(prev => { const next = { ...prev }; delete next[id]; return next })
      toast.success('확인 완료 처리되었습니다.')
    } catch (e) {
      toast.error('처리 실패: ' + (e as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="flex flex-col gap-0">
      {/* 페이지 타이틀 */}
      <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>지연 신고</h1>

      {/* 탭 */}
      <div className="flex gap-1 border-b mb-6" style={{ borderColor: 'var(--border-subtle)' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id
          const badge = tab.id === 'pending' ? pending.length : reviewed.length
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 font-medium transition-colors"
              style={{
                color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
                borderBottom: active ? '2px solid var(--blue-600)' : '2px solid transparent',
                marginBottom: -1,
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {tab.label}
              {badge > 0 && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: tab.id === 'pending' ? 'rgba(248,113,113,0.15)' : 'color-mix(in srgb, var(--success) 12%, transparent)',
                    color: tab.id === 'pending' ? 'var(--error)' : 'var(--success)',
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 탭 콘텐츠 */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : activeTab === 'pending' && (
        pending.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>답변 대기중인 신고가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                reviewed={false}
                comment={comments[report.id]}
                submitting={submitting === report.id}
                onCommentChange={v => setComments(prev => ({ ...prev, [report.id]: v }))}
                onReview={() => handleReview(report.id)}
              />
            ))}
          </div>
        )
      )}

      {!loading && activeTab === 'reviewed' && (
        reviewed.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>확인 완료된 신고가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {reviewed.map(report => (
              <ReportCard key={report.id} report={report} reviewed={true} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
