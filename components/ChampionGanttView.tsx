'use client'
import { useEffect, useState } from 'react'
import { Gantt, ViewMode } from 'gantt-task-react'
import type { Task } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { apiFetch } from '@/lib/api-client'
import type { GanttChampion } from '@/app/api/champions/gantt/route'
import type { MilestoneStatus } from '@/lib/types'

const STATUS_PROGRESS: Record<MilestoneStatus, number> = {
  not_started: 0,
  in_progress: 50,
  delayed: 25,
  completed: 100,
}

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  delayed: '#ef4444',
  completed: '#22c55e',
}

function toTasks(champions: GanttChampion[]): Task[] {
  const tasks: Task[] = []
  for (const c of champions) {
    tasks.push({
      id: c.userId,
      type: 'project',
      name: c.name,
      start: new Date(c.milestones[0].start_date),
      end: new Date(c.milestones[c.milestones.length - 1].due_date),
      progress: 0,
      hideChildren: false,
    })
    for (const m of c.milestones) {
      const start = new Date(m.start_date)
      const end = new Date(m.due_date)
      if (end <= start) end.setDate(start.getDate() + 1)
      tasks.push({
        id: m.id,
        type: 'task',
        name: `W${m.week_number} ${m.title}`,
        start,
        end,
        progress: STATUS_PROGRESS[m.status],
        project: c.userId,
        styles: {
          backgroundColor: STATUS_COLOR[m.status],
          backgroundSelectedColor: STATUS_COLOR[m.status],
          progressColor: STATUS_COLOR[m.status],
          progressSelectedColor: STATUS_COLOR[m.status],
        },
      })
    }
  }
  return tasks
}

export function ChampionGanttView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)

  useEffect(() => {
    apiFetch<GanttChampion[]>('/api/champions/gantt')
      .then(data => {
        setTasks(toTasks(data))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function handleExpandChange(task: Task) {
    setTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, hideChildren: !t.hideChildren } : t))
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-full rounded animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>게시된 마일스톤이 없습니다</p>
        <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>챔피언이 마일스톤을 게시하면 간트 차트가 표시됩니다</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {([ViewMode.Day, ViewMode.Week, ViewMode.Month] as const).map(m => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className="text-xs px-3 py-1 rounded-md"
            style={{
              background: viewMode === m ? 'rgba(37,99,235,0.15)' : 'transparent',
              color: viewMode === m ? 'var(--blue-600)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            {m === ViewMode.Day ? '일' : m === ViewMode.Week ? '주' : '월'}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12 }}>
        <Gantt
          tasks={tasks}
          viewMode={viewMode}
          onExpanderClick={handleExpandChange}
          listCellWidth="180px"
          columnWidth={viewMode === ViewMode.Day ? 40 : viewMode === ViewMode.Week ? 120 : 200}
          rowHeight={36}
          barCornerRadius={4}
          locale="ko-KR"
          todayColor="rgba(37,99,235,0.08)"
        />
      </div>

      <div className="flex gap-4 mt-3">
        {(Object.entries(STATUS_COLOR) as [MilestoneStatus, string][]).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {status === 'not_started' ? '미시작'
                : status === 'in_progress' ? '진행 중'
                : status === 'delayed' ? '지연'
                : '완료'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
