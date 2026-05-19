'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { Submission, User, CharterSubmission } from '@/lib/types'
import { FullPageSpinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Users } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

type CharterWithUser = CharterSubmission & { users: User }

interface UserRow {
  userId: string
  user: User
  latestSubmission: Submission | null
  submissionCount: number
  hasCharter: boolean
}

export default function AdminHomeworkSubmissionsPage() {
  const { id } = useParams<{ id: string }>()
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      apiFetch<(Submission & { user: User })[]>(`/api/admin/homeworks/${id}/submissions`),
      apiFetch<CharterWithUser[]>(`/api/charter/submissions?homework_id=${id}`),
    ])
      .then(([submissions, charters]) => {
        const map = new Map<string, UserRow>()

        submissions.forEach(s => {
          const existing = map.get(s.user_id)
          if (!existing) {
            map.set(s.user_id, { userId: s.user_id, user: s.user, latestSubmission: s, submissionCount: 1, hasCharter: false })
          } else {
            existing.submissionCount++
            if (s.attempt_number > (existing.latestSubmission?.attempt_number ?? 0)) {
              existing.latestSubmission = s
            }
          }
        })

        charters.forEach(c => {
          const existing = map.get(c.user_id)
          if (!existing) {
            map.set(c.user_id, { userId: c.user_id, user: c.users, latestSubmission: null, submissionCount: 0, hasCharter: true })
          } else {
            existing.hasCharter = true
          }
        })

        setRows(Array.from(map.values()))
        setLoading(false)
      })
      .catch((err: Error) => { toast.error('제출 현황 로드 실패: ' + err.message); setError(err.message); setLoading(false) })
  }, [id])

  if (loading) return <FullPageSpinner />
  if (error) return <p className="text-sm p-4" style={{ color: 'var(--error)' }}>오류: {error}</p>

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 대시보드</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>과제 #{String(id).padStart(2, '0')} 제출 현황</h1>
      </div>
      <div className="flex flex-col gap-3">
        {rows.length === 0 && (
          <EmptyState icon={Users} title="제출한 사용자가 없습니다" />
        )}
        {rows.map(row => (
          <a
            key={row.userId}
            href={`/admin/homework/${id}/${row.userId}`}
            className="flex items-center justify-between p-4 rounded-xl border hover:border-blue-500 transition-colors"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3">
              {row.user.avatar_url && <img src={row.user.avatar_url} className="w-7 h-7 rounded-full" alt="" />}
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{row.user.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {row.hasCharter && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', fontSize: '10px' }}>
                      과제정의서 ✓
                    </span>
                  )}
                  {row.submissionCount > 0 && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                      파일 {row.submissionCount}회
                    </span>
                  )}
                </div>
              </div>
            </div>
            {row.latestSubmission ? (
              <span className="text-xs font-semibold px-2 py-1 rounded shrink-0"
                style={{ color: STATUS_COLOR[row.latestSubmission.status], background: `${STATUS_COLOR[row.latestSubmission.status]}20` }}>
                {STATUS_LABEL[row.latestSubmission.status]}
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-1 rounded shrink-0"
                style={{ color: 'var(--text-disabled)', background: 'var(--surface-secondary)' }}>
                파일 미제출
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}
