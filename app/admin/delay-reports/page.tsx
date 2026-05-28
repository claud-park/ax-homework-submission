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

export default function AdminDelayReportsPage() {
  const [bottleneckReports, setBottleneckReports] = useState<BottleneckReport[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<BottleneckReport[]>('/api/admin/milestones/bottleneck-pending')
      .then(setBottleneckReports)
      .catch((e: Error) => toast.error('지연 신고 목록 로드 실패: ' + e.message))
  }, [])

  async function handleBottleneckReview(id: string) {
    setSubmitting(id)
    try {
      await apiFetch(`/api/admin/milestones/${id}/bottleneck-review`, {
        method: 'PATCH',
        body: JSON.stringify({ admin_comment: comments[id] ?? '' }),
      })
      setBottleneckReports(prev => prev.filter(r => r.id !== id))
      setComments(prev => { const next = { ...prev }; delete next[id]; return next })
      toast.success('확인 완료 처리되었습니다.')
    } catch (e) {
      toast.error('처리 실패: ' + (e as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>지연 신고</h1>
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
    </div>
  )
}
