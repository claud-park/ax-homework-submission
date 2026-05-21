'use client'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { HomeworkWithCount, PublishStatus } from '@/lib/types'
import { DraftBadge } from '@/components/DraftBadge'
import { PublishStatusFilter, type PublishFilterValue } from '@/components/PublishStatusFilter'

type AdminHomework = HomeworkWithCount & { publish_status: PublishStatus }

export default function AdminDashboard() {
  const [homeworks, setHomeworks] = useState<AdminHomework[]>([])
  const [filter, setFilter] = useState<PublishFilterValue>(() => {
    if (typeof window === 'undefined') return 'all'
    const q = new URLSearchParams(window.location.search).get('status') as PublishFilterValue | null
    return q && ['all','published','draft'].includes(q) ? q : 'all'
  })

  useEffect(() => {
    apiFetch<AdminHomework[]>('/api/admin/homeworks').then(setHomeworks)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (filter === 'all') url.searchParams.delete('status')
    else url.searchParams.set('status', filter)
    window.history.replaceState({}, '', url.toString())
  }, [filter])

  const filtered = useMemo(() => {
    if (filter === 'all') return homeworks
    return homeworks.filter(hw => hw.publish_status === filter)
  }, [homeworks, filter])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>대시보드</h1>
        <a href="/admin/homework/new">
          <button className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>
            + 과제 만들기
          </button>
        </a>
      </div>
      <div className="mb-4">
        <PublishStatusFilter value={filter} onChange={setFilter} />
      </div>
      <div className="flex flex-col gap-3">
        {filtered.map(hw => {
          const isDraft = hw.publish_status === 'draft'
          const href = isDraft ? `/admin/homework/${hw.id}/edit` : `/admin/homework/${hw.id}`
          return (
            <a
              key={hw.id}
              href={href}
              className="flex items-center justify-between p-4 rounded-xl border hover:border-blue-500 transition-colors"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <span className="text-xs font-bold mr-2" style={{ color: 'var(--text-secondary)' }}>#{String(hw.id).padStart(2, '0')}</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{hw.title || '(제목 없음)'}</span>
                {isDraft && <span className="ml-2"><DraftBadge /></span>}
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>마감: {hw.due_date ?? '미정'}</p>
              </div>
              {isDraft ? (
                <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>편집 →</span>
              ) : (
                <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                  {hw.submission_count} / {hw.user_count} 제출
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
