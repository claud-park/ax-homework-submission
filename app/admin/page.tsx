'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { HomeworkWithCount } from '@/lib/types'

export default function AdminDashboard() {
  const [homeworks, setHomeworks] = useState<HomeworkWithCount[]>([])

  useEffect(() => {
    apiFetch<HomeworkWithCount[]>('/api/admin/homeworks').then(setHomeworks)
  }, [])

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
      <div className="flex flex-col gap-3">
        {homeworks.map(hw => (
          <a
            key={hw.id}
            href={`/admin/homework/${hw.id}`}
            className="flex items-center justify-between p-4 rounded-xl border hover:border-blue-500 transition-colors"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
          >
            <div>
              <span className="text-xs font-bold mr-2" style={{ color: 'var(--text-secondary)' }}>#{String(hw.id).padStart(2, '0')}</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{hw.title}</span>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>마감: {hw.due_date}</p>
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
              {hw.submission_count} / {hw.user_count} 제출
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
