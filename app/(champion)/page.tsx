'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Homework, Submission, SubmissionStatus } from '@/lib/types'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Inbox } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}
const BOARD_COLS: { key: SubmissionStatus | 'none'; label: string }[] = [
  { key: 'none', label: '미제출' },
  { key: 'pending', label: '검토 중' },
  { key: 'accepted', label: '합격' },
  { key: 'declined', label: '불합격' },
]

export default function HomeworkListPage() {
  const [homeworks, setHomeworks] = useState<Homework[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'board'>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('hw-view') as 'list' | 'board' ?? 'list') : 'list'
  )

  useEffect(() => {
    Promise.all([
      apiFetch<Homework[]>('/api/homeworks').catch((e: Error) => { toast.error('과제 목록 로드 실패: ' + e.message); return [] }),
      apiFetch<Submission[]>('/api/submissions/mine').catch((e: Error) => { toast.error('제출 현황 로드 실패: ' + e.message); return [] }),
    ]).then(([hw, subs]) => {
      setHomeworks(hw)
      setSubmissions(subs)
    }).finally(() => setLoading(false))
  }, [])

  function setViewMode(v: 'list' | 'board') {
    setView(v)
    localStorage.setItem('hw-view', v)
  }

  function latestSubmission(hwId: number) {
    return submissions.filter(s => s.homework_id === hwId).sort((a, b) =>
      b.attempt_number - a.attempt_number
    )[0]
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>과제 목록</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{homeworks.length}개 과제</p>
        </div>
        <div className="flex gap-2">
          {(['list', 'board'] as const).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{
                background: view === v ? 'var(--blue-600)' : 'var(--surface-primary)',
                color: view === v ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {v === 'list' ? '☰ 목록' : '⊞ 보드'}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <div className="flex flex-col gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))
          ) : homeworks.length === 0 ? (
            <EmptyState icon={Inbox} title="과제가 없습니다" description="등록된 과제가 없습니다." />
          ) : (
            homeworks.map(hw => {
              const sub = latestSubmission(hw.id)
              return (
                <a
                  key={hw.id}
                  href={`/homework/${hw.id}`}
                  className="flex items-center justify-between p-4 rounded-xl border transition-colors hover:border-blue-500"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                >
                  <div>
                    <span className="text-xs font-semibold mr-3" style={{ color: 'var(--text-secondary)' }}>
                      # {String(hw.id).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{hw.title}</span>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>마감: {hw.due_date}</p>
                  </div>
                  {sub ? (
                    <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}>
                      {STATUS_LABEL[sub.status]}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ color: 'var(--text-disabled)', background: 'rgba(85,85,85,0.2)' }}>미제출</span>
                  )}
                </a>
              )
            })
          )}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))
          ) : (
            BOARD_COLS.map(col => (
              <div key={col.key}>
                <h3 className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{col.label}</h3>
                <div className="flex flex-col gap-2">
                  {homeworks
                    .filter(hw => {
                      const sub = latestSubmission(hw.id)
                      if (col.key === 'none') return !sub
                      return sub?.status === col.key
                    })
                    .map(hw => {
                      const sub = latestSubmission(hw.id)
                      return (
                        <div
                          key={hw.id}
                          className="p-3 rounded-xl border"
                          style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                        >
                          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>#{String(hw.id).padStart(2, '0')}</p>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{hw.title}</p>
                          {sub?.status === 'declined' && (
                            <a href={`/homework/${hw.id}`} className="text-xs mt-2 inline-block" style={{ color: 'var(--blue-600)' }}>재제출 →</a>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
