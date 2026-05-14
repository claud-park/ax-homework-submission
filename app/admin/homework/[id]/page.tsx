'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Submission, User } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

export default function AdminHomeworkSubmissionsPage() {
  const { id } = useParams<{ id: string }>()
  const [submissions, setSubmissions] = useState<(Submission & { user: User })[]>([])

  useEffect(() => {
    apiFetch<(Submission & { user: User })[]>(`/api/admin/homeworks/${id}/submissions`).then(setSubmissions)
  }, [id])

  // Group by user — show latest attempt per user
  const byUser = submissions.reduce<Record<string, (Submission & { user: User })[]>>((acc, s) => {
    if (!acc[s.user_id]) acc[s.user_id] = []
    acc[s.user_id].push(s)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 대시보드</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>과제 #{String(id).padStart(2, '0')} 제출 현황</h1>
      </div>
      <div className="flex flex-col gap-3">
        {Object.values(byUser).map(userSubs => {
          const latest = userSubs.sort((a, b) => b.attempt_number - a.attempt_number)[0]
          return (
            <a
              key={latest.user_id}
              href={`/admin/homework/${id}/${latest.user_id}`}
              className="flex items-center justify-between p-4 rounded-xl border hover:border-blue-500 transition-colors"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-3">
                {latest.user.avatar_url && <img src={latest.user.avatar_url} className="w-7 h-7 rounded-full" alt="" />}
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{latest.user.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{userSubs.length}회 시도</p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: STATUS_COLOR[latest.status], background: `${STATUS_COLOR[latest.status]}20` }}>
                {STATUS_LABEL[latest.status]}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
