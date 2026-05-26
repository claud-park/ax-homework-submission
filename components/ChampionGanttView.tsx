'use client'
import { useEffect, useMemo, useState } from 'react'
import { Gantt, ViewMode } from 'gantt-task-react'
import type { Task } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { apiFetch } from '@/lib/api-client'
import type { GanttChampion } from '@/app/api/champions/gantt/route'
import type { MilestoneStatus } from '@/lib/types'

// Column widths for the custom task list (px)
const W = { name: 130, dept: 72, project: 130, charter: 56 }
const LIST_WIDTH = W.name + W.dept + W.project + W.charter

const STATUS_PROGRESS: Record<MilestoneStatus, number> = {
  not_started: 0, in_progress: 50, delayed: 25, completed: 100,
}
const STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: '#94a3b8', in_progress: '#3b82f6', delayed: '#ef4444', completed: '#22c55e',
}
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작', in_progress: '진행 중', delayed: '지연', completed: '완료',
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

// Shared cell style
function cell(width: number, extra?: React.CSSProperties): React.CSSProperties {
  return {
    width,
    minWidth: width,
    maxWidth: width,
    display: 'flex',
    alignItems: 'center',
    padding: '0 6px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    borderRight: '1px solid #e2e8f0',
    ...extra,
  }
}

function makeTaskListComponents(
  champMap: Map<string, GanttChampion>,
  charterLinkBase: string
) {
  function TaskListHeader({ headerHeight, fontFamily, fontSize }: {
    headerHeight: number; rowWidth: string; fontFamily: string; fontSize: string
  }) {
    return (
      <div
        style={{
          display: 'flex',
          height: headerHeight,
          width: LIST_WIDTH,
          fontFamily,
          fontSize,
          fontWeight: 600,
          color: '#64748b',
          borderBottom: '2px solid #e2e8f0',
          background: '#fff',
        }}
      >
        <div style={cell(W.name)}>이름</div>
        <div style={cell(W.dept)}>부서</div>
        <div style={cell(W.project)}>과제명</div>
        <div style={{ ...cell(W.charter), borderRight: 'none' }}>정의서</div>
      </div>
    )
  }

  function TaskListTable({ tasks, rowHeight, onExpanderClick, selectedTaskId, setSelectedTask, fontFamily, fontSize }: {
    rowHeight: number; rowWidth: string; fontFamily: string; fontSize: string; locale: string
    tasks: Task[]; selectedTaskId: string; setSelectedTask: (id: string) => void; onExpanderClick: (t: Task) => void
  }) {
    return (
      <div style={{ fontFamily, fontSize, width: LIST_WIDTH }}>
        {tasks.map(t => {
          const isProject = t.type === 'project'
          const champ = isProject ? champMap.get(t.id) : champMap.get(t.project ?? '')
          const isSelected = t.id === selectedTaskId

          return (
            <div
              key={t.id}
              onClick={() => setSelectedTask(t.id)}
              style={{
                display: 'flex',
                height: rowHeight,
                alignItems: 'center',
                background: isSelected ? '#eff6ff' : '#fff',
                borderBottom: '1px solid #f1f5f9',
                cursor: 'pointer',
              }}
            >
              {/* 이름 */}
              <div style={cell(W.name)}>
                {isProject ? (
                  <button
                    onClick={e => { e.stopPropagation(); onExpanderClick(t) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      marginRight: 4, padding: 0, fontSize: 9, color: '#64748b', flexShrink: 0,
                    }}
                  >
                    {t.hideChildren ? '▶' : '▼'}
                  </button>
                ) : (
                  <span style={{ width: 17, flexShrink: 0 }} />
                )}
                <span
                  style={{
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    fontWeight: isProject ? 600 : 400,
                    color: isProject ? '#0f172a' : '#475569',
                  }}
                >
                  {isProject ? champ?.name ?? t.name : t.name}
                </span>
              </div>

              {/* 부서 */}
              <div style={cell(W.dept, { color: '#64748b', fontSize: 11 })}>
                {isProject ? (champ?.department || '—') : ''}
              </div>

              {/* 과제명 */}
              <div style={cell(W.project, { color: '#334155' })}>
                {isProject ? (champ?.projectName || '—') : ''}
              </div>

              {/* 정의서 */}
              <div style={{ ...cell(W.charter), borderRight: 'none', justifyContent: 'center' }}>
                {isProject && champ?.charterSubmissionId ? (
                  <a
                    href={`${charterLinkBase}/${t.id}#charter`}
                    onClick={e => e.stopPropagation()}
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(37,99,235,0.1)',
                      color: '#2563eb',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    보기
                  </a>
                ) : isProject ? (
                  <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return { TaskListHeader, TaskListTable }
}

interface Props {
  charterLinkBase?: string
}

export function ChampionGanttView({ charterLinkBase = '/champions' }: Props) {
  const [champions, setChampions] = useState<GanttChampion[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)

  useEffect(() => {
    apiFetch<GanttChampion[]>('/api/champions/gantt')
      .then(data => {
        setChampions(data)
        setTasks(toTasks(data))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const champMap = useMemo(() => {
    const m = new Map<string, GanttChampion>()
    for (const c of champions) m.set(c.userId, c)
    return m
  }, [champions])

  const { TaskListHeader, TaskListTable } = useMemo(
    () => makeTaskListComponents(champMap, charterLinkBase),
    [champMap, charterLinkBase]
  )

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
          listCellWidth={`${LIST_WIDTH}px`}
          columnWidth={viewMode === ViewMode.Day ? 40 : viewMode === ViewMode.Week ? 120 : 200}
          rowHeight={36}
          barCornerRadius={4}
          locale="ko-KR"
          todayColor="rgba(37,99,235,0.08)"
          TaskListHeader={TaskListHeader}
          TaskListTable={TaskListTable}
        />
      </div>

      <div className="flex gap-4 mt-3">
        {(Object.entries(STATUS_COLOR) as [MilestoneStatus, string][]).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {STATUS_LABEL[status as MilestoneStatus]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
