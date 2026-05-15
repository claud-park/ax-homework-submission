'use client'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone } from '@/lib/types'
import 'gantt-task-react/dist/index.css'

const STATUS_COLOR: Record<string, string> = {
  not_started: '#444',
  in_progress: '#fbbf24',
  completed: '#4ade80',
  delayed: '#f87171',
}
const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}

export default function ProgressPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [GanttComponent, setGanttComponent] = useState<React.ComponentType<any> | null>(null)

  useEffect(() => {
    apiFetch<Milestone[]>('/api/milestones').then(setMilestones)
    import('gantt-task-react').then(m => setGanttComponent(() => m.Gantt as React.ComponentType<any>))
  }, [])

  const delayed = milestones.filter(m => m.status === 'delayed')
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const tasks = useMemo(() => milestones
    .filter(m => m.start_date && m.due_date)
    .map(m => {
      const start = new Date(m.start_date)
      let end = new Date(m.due_date)
      if (end <= start) end = new Date(start.getTime() + 86400000)
      return {
        id: m.id,
        name: m.title,
        start,
        end,
        type: 'task' as const,
        progress: m.status === 'completed' ? 100 : m.status === 'in_progress' ? 50 : 0,
        styles: {
          progressColor: STATUS_COLOR[m.status],
          progressSelectedColor: STATUS_COLOR[m.status],
          backgroundColor: STATUS_COLOR[m.status] + '40',
          backgroundSelectedColor: STATUS_COLOR[m.status] + '60',
        },
        isDisabled: true,
      }
    }), [milestones])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>내 진척도</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>오늘: {todayStr}</p>
      </div>

      {delayed.length > 0 && (
        <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--error)' }}>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--error)' }}>⚠️ 지연된 마일스톤</p>
          {delayed.map(m => (
            <p key={m.id} className="text-xs" style={{ color: 'var(--text-secondary)' }}>• {m.week_number}주차 · {m.title} (마감: {m.due_date})</p>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: STATUS_COLOR[key] }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      {GanttComponent && tasks.length > 0 ? (
        <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--border-subtle)', background: '#ffffff', colorScheme: 'light' }}>
          {GanttComponent && (
            <GanttComponent
              tasks={tasks}
              viewMode="Week"
              locale="ko"
              listCellWidth=""
              columnWidth={60}
              ganttHeight={300}
              todayColor="rgba(37,99,235,0.15)"
            />
          )}
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>
          {milestones.length === 0 ? 'WBS에서 마일스톤을 추가하면 여기에 표시됩니다.' : '차트를 불러오는 중...'}
        </p>
      )}
    </div>
  )
}
