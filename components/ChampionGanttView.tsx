'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Gantt, ViewMode } from 'gantt-task-react'
import type { Task } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { ChevronRight, ChevronDown, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import type { GanttChampion } from '@/app/api/champions/gantt/route'
import type { ChampionProject, MilestoneStatus } from '@/lib/types'
import { NudgePopover, type NudgeType } from '@/components/NudgePopover'
import type { GanttMilestone } from '@/app/api/champions/gantt/route'

interface NudgeState {
  userId: string
  name: string
  nudgeType: NudgeType
  milestoneTitle?: string
  anchorX: number
  anchorY: number
}

// Fixed column widths for the custom task list (px); project column is resizable via state
const W = { name: 130, dept: 72, charter: 56 }
const PROJECT_W_DEFAULT = 130
const PROJECT_W_MIN = 60
const PROJECT_W_MAX = 400

const STATUS_PROGRESS: Record<MilestoneStatus, number> = {
  not_started: 0, in_progress: 50, delayed: 25, completed: 100,
}
const STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: '#94a3b8', in_progress: '#3b82f6', delayed: '#ef4444', completed: '#22c55e',
}
const STATUS_BG: Record<MilestoneStatus, string> = {
  not_started: 'rgba(148,163,184,0.2)',
  in_progress: 'rgba(59,130,246,0.18)',
  delayed: 'rgba(239,68,68,0.18)',
  completed: 'rgba(34,197,94,0.18)',
}
const STATUS_BG_SELECTED: Record<MilestoneStatus, string> = {
  not_started: 'rgba(148,163,184,0.35)',
  in_progress: 'rgba(59,130,246,0.32)',
  delayed: 'rgba(239,68,68,0.32)',
  completed: 'rgba(34,197,94,0.32)',
}
const FUTURE_BG = 'rgba(203,213,225,0.2)'
const FUTURE_BG_SELECTED = 'rgba(203,213,225,0.35)'
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작', in_progress: '진행 중', delayed: '지연', completed: '완료',
}

const CHARTER_SECTIONS = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem' },
  { key: 'user', label: '02. User' },
  { key: 'goal', label: '03. Goal' },
  { key: 'solution', label: '04. Solution' },
  { key: 'build', label: '05. Build' },
  { key: 'timeline', label: '06. Timeline' },
] as const

function GanttTooltip({ task }: { task: Task; fontSize: string; fontFamily: string }) {
  if (task.type === 'milestone') return null
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return (
    <div style={{
      padding: '6px 10px', borderRadius: 6,
      background: 'var(--surface-primary)',
      border: '1px solid var(--border-subtle)',
      fontSize: 12, color: 'var(--text-primary)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      whiteSpace: 'nowrap',
    }}>
      {fmt(task.start)} ~ {fmt(task.end)}
    </div>
  )
}

// Row hierarchy:
//   champion row  : id='champ-{userId}',  type='project', no project
//   group row     : id='group-{msId}',    type='project', project='champ-{userId}'
//   task row      : id=msId,              type='task',    project='champ-{userId}' or 'group-{msId}'
function toTasks(champions: GanttChampion[]): Task[] {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const tasks: Task[] = []

  for (const c of champions) {
    if (c.milestones.length === 0) continue

    const depth0 = c.milestones.filter(m => !m.parent_milestone_id)
    const depth1 = c.milestones.filter(m => !!m.parent_milestone_id)

    // Compute champion row date range from all milestones that have dates
    const allDated = c.milestones.filter(m => m.start_date && m.due_date)
    if (allDated.length === 0) continue

    const champStart = allDated.reduce(
      (min, m) => (m.start_date! < min ? m.start_date! : min), allDated[0].start_date!
    )
    const champEnd = allDated.reduce(
      (max, m) => (m.due_date! > max ? m.due_date! : max), allDated[0].due_date!
    )

    const champId = `champ-${c.userId}`

    // Champion umbrella row — shows name/dept/과제명/charter in task list
    tasks.push({
      id: champId,
      type: 'project',
      name: c.name,
      start: new Date(champStart),
      end: new Date(champEnd),
      progress: 0,
      hideChildren: false,
      displayOrder: tasks.length + 1,
      styles: {
        backgroundColor: 'rgba(63,63,255,0.25)',
        backgroundSelectedColor: 'rgba(63,63,255,0.4)',
        progressColor: '#3f3fff',
        progressSelectedColor: '#5868ff',
      },
    })

    for (const g of depth0) {
      const children = depth1.filter(m => m.parent_milestone_id === g.id)
      const hasChildren = children.length > 0

      // Resolve group date range (fallback to children when depth-0 has no dates)
      const gStart = g.start_date ?? children.find(m => m.start_date)?.start_date ?? null
      const gEnd = g.due_date ?? [...children].reverse().find(m => m.due_date)?.due_date ?? null
      if (!gStart || !gEnd) continue

      const start0 = new Date(gStart)
      let end0 = new Date(gEnd)
      if (end0 <= start0) end0 = new Date(start0.getTime() + 86400000)

      const isFuture0 = gStart > todayStr

      if (hasChildren) {
        // depth-0 with children → full-height task bar (collapse handled manually)
        tasks.push({
          id: `group-${g.id}`,
          name: g.title,
          type: 'task',
          project: champId,
          start: start0,
          end: end0,
          progress: STATUS_PROGRESS[g.status],
          styles: {
            backgroundColor: isFuture0 ? FUTURE_BG : STATUS_BG[g.status],
            backgroundSelectedColor: isFuture0 ? FUTURE_BG_SELECTED : STATUS_BG_SELECTED[g.status],
            progressColor: isFuture0 ? '#cbd5e1' : STATUS_COLOR[g.status],
            progressSelectedColor: isFuture0 ? '#94a3b8' : STATUS_COLOR[g.status],
          },
          displayOrder: tasks.length + 1,
        })

        for (const m of children) {
          if (!m.start_date || !m.due_date) continue
          const isFuture = m.start_date > todayStr
          const start = new Date(m.start_date)
          let end = new Date(m.due_date)
          if (end <= start) end = new Date(start.getTime() + 86400000)
          tasks.push({
            id: m.id,
            name: m.title,
            type: 'task',
            project: `group-${g.id}`,
            start,
            end,
            progress: STATUS_PROGRESS[m.status],
            styles: {
              backgroundColor: isFuture ? FUTURE_BG : STATUS_BG[m.status],
              backgroundSelectedColor: isFuture ? FUTURE_BG_SELECTED : STATUS_BG_SELECTED[m.status],
              progressColor: isFuture ? '#cbd5e1' : STATUS_COLOR[m.status],
              progressSelectedColor: isFuture ? '#94a3b8' : STATUS_COLOR[m.status],
            },
            displayOrder: tasks.length + 1,
          })
        }
      } else {
        // depth-0 with no children → task row directly under champion
        tasks.push({
          id: g.id,
          name: g.title,
          type: 'task',
          project: champId,
          start: start0,
          end: end0,
          progress: STATUS_PROGRESS[g.status],
          styles: {
            backgroundColor: isFuture0 ? FUTURE_BG : STATUS_BG[g.status],
            backgroundSelectedColor: isFuture0 ? FUTURE_BG_SELECTED : STATUS_BG_SELECTED[g.status],
            progressColor: isFuture0 ? '#cbd5e1' : STATUS_COLOR[g.status],
            progressSelectedColor: isFuture0 ? '#94a3b8' : STATUS_COLOR[g.status],
          },
          displayOrder: tasks.length + 1,
        })
      }
    }
  }

  return tasks
}

function cell(width: number, extra?: React.CSSProperties): React.CSSProperties {
  return {
    width, minWidth: width, maxWidth: width,
    display: 'flex', alignItems: 'center',
    padding: '0 6px', overflow: 'hidden', whiteSpace: 'nowrap',
    borderRight: '1px solid var(--border)',
    ...extra,
  }
}

function makeTaskListHeader(projectW: number, listWidth: number, onResizeStart: (e: React.MouseEvent) => void) {
  function TaskListHeader({ headerHeight, fontFamily, fontSize }: {
    headerHeight: number; rowWidth: string; fontFamily: string; fontSize: string
  }) {
    return (
      <div style={{
        display: 'flex', height: headerHeight, width: listWidth,
        fontFamily, fontSize, fontWeight: 600, color: 'var(--text-secondary)',
        borderBottom: '1px solid var(--border)', background: 'var(--background)',
      }}>
        <div style={cell(W.name)}>이름</div>
        <div style={cell(W.dept)}>부서</div>
        <div style={{ ...cell(projectW), position: 'relative' }}>
          과제명
          {/* drag handle — right edge of project column */}
          <div
            onMouseDown={onResizeStart}
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 4,
              cursor: 'col-resize', zIndex: 1,
              background: 'transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          />
        </div>
        <div style={{ ...cell(W.charter), borderRight: 'none' }}>정의서</div>
      </div>
    )
  }
  return TaskListHeader
}

function makeTaskListTable(
  champMap: Map<string, GanttChampion>,
  onCharterClick: (userId: string) => void,
  panelUserId: string | null,
  projectW: number,
  listWidth: number,
  collapsedIds: Set<string>,
  onExpand: (t: Task) => void,
) {
  function TaskListTable({ tasks, rowHeight, onExpanderClick, selectedTaskId, setSelectedTask, fontFamily, fontSize }: {
    rowHeight: number; rowWidth: string; fontFamily: string; fontSize: string; locale: string
    tasks: Task[]; selectedTaskId: string; setSelectedTask: (id: string) => void; onExpanderClick: (t: Task) => void
  }) {
    return (
      <div style={{ fontFamily, fontSize, width: listWidth }}>
        {tasks.map(t => {
          const isChampRow = t.id.startsWith('champ-')
          const isGroupRow = t.id.startsWith('group-')
          const isSelected = t.id === selectedTaskId

          const userId = isChampRow ? t.id.slice(6) : null
          const champ = userId ? champMap.get(userId) : null
          const isPanelOpen = isChampRow && userId === panelUserId

          return (
            <div
              key={t.id}
              role="row"
              tabIndex={0}
              onClick={() => setSelectedTask(t.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTask(t.id) } }}
              style={{
                display: 'flex', height: rowHeight, alignItems: 'center',
                background: isSelected ? 'rgba(37,99,235,0.06)' : 'var(--background)',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              {isChampRow ? (
                // Champion row: 4 full columns
                <>
                  <div style={cell(W.name)}>
                    <button
                      onClick={e => { e.stopPropagation(); onExpanderClick(t) }}
                      aria-label={collapsedIds.has(t.id) ? '펼치기' : '접기'}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        marginRight: 4, padding: 0, color: 'var(--text-secondary)',
                        flexShrink: 0, display: 'flex', alignItems: 'center',
                      }}
                    >
                      {collapsedIds.has(t.id)
                        ? <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
                    </button>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {champ?.name ?? t.name}
                    </span>
                  </div>
                  <div style={cell(W.dept, { color: 'var(--text-secondary)', fontSize: 11 })}>
                    {champ?.department || '—'}
                  </div>
                  <div style={cell(projectW, { color: 'var(--text-secondary)' })}>
                    {champ?.projectName || '—'}
                  </div>
                  <div style={{ ...cell(W.charter), borderRight: 'none', justifyContent: 'center' }}>
                    {champ?.charterSubmissionId ? (
                      <button
                        onClick={e => { e.stopPropagation(); if (userId) onCharterClick(userId) }}
                        aria-pressed={isPanelOpen}
                        style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          background: isPanelOpen ? 'rgba(37,99,235,0.2)' : 'rgba(37,99,235,0.1)',
                          color: 'var(--blue-600)', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        보기
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-disabled)', fontSize: 11 }}>—</span>
                    )}
                  </div>
                </>
              ) : (
                // Milestone row (group or task): single-width name cell with indent
                <div style={{
                  width: listWidth, display: 'flex', alignItems: 'center',
                  padding: `0 6px 0 ${isGroupRow ? 16 : t.project?.startsWith('group-') ? 36 : 28}px`,
                  overflow: 'hidden', whiteSpace: 'nowrap',
                }}>
                  {isGroupRow && (
                    <button
                      onClick={e => { e.stopPropagation(); onExpand(t) }}
                      aria-label={collapsedIds.has(t.id) ? '펼치기' : '접기'}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        marginRight: 4, padding: 0, color: 'var(--text-secondary)',
                        flexShrink: 0, display: 'flex', alignItems: 'center',
                      }}
                    >
                      {collapsedIds.has(t.id)
                        ? <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
                    </button>
                  )}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }}>
                    {t.name}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  return TaskListTable
}

function CharterDetailPanel({ userId, champMap, onClose }: {
  userId: string
  champMap: Map<string, GanttChampion>
  onClose: () => void
}) {
  const [project, setProject] = useState<ChampionProject | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setProject(null)
    apiFetch<ChampionProject>(`/api/champions/${userId}`)
      .then(setProject)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [userId])

  const champ = champMap.get(userId)
  const charter = project?.charter
  const content = charter?.content

  return (
    <div style={{
      width: 320, flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--background)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {champ?.name} · 과제정의서
          </div>
          {charter?.project_name && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {charter.project_name}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="패널 닫기"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', padding: '2px 6px', flexShrink: 0, marginLeft: 8, display: 'flex', alignItems: 'center' }}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', fontSize: 12 }}>
        {loading ? (
          <div style={{ color: 'var(--text-disabled)' }}>불러오는 중...</div>
        ) : !charter ? (
          <div style={{ color: 'var(--text-disabled)' }}>과제정의서가 없습니다</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {CHARTER_SECTIONS.map(s => {
              const html = content?.[s.key] ?? ''
              if (!html.replace(/<[^>]*>/g, '').trim()) return null
              return (
                <div key={s.key}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-disabled)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {s.label}
                  </div>
                  <div
                    className="prose prose-sm max-w-none"
                    style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function ChampionGanttView({ isAdmin = false }: { isAdmin?: boolean }) {
  const [champions, setChampions] = useState<GanttChampion[]>([])
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [selectedChampions, setSelectedChampions] = useState<Set<string>>(new Set())
  const [alertCollapsed, setAlertCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)
  const [panelUserId, setPanelUserId] = useState<string | null>(null)
  const [projectW, setProjectW] = useState(PROJECT_W_DEFAULT)
  const resizeDragRef = useRef<{ startX: number; startW: number } | null>(null)
  const [nudgeState, setNudgeState] = useState<NudgeState | null>(null)
  const lastMousePos = useRef({ x: 0, y: 0 })

  const listWidth = W.name + W.dept + projectW + W.charter

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizeDragRef.current = { startX: e.clientX, startW: projectW }
    const onMove = (ev: MouseEvent) => {
      if (!resizeDragRef.current) return
      const delta = ev.clientX - resizeDragRef.current.startX
      setProjectW(Math.max(PROJECT_W_MIN, Math.min(PROJECT_W_MAX, resizeDragRef.current.startW + delta)))
    }
    const onUp = () => {
      resizeDragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [projectW])

  useEffect(() => {
    apiFetch<GanttChampion[]>('/api/champions/gantt')
      .then(data => {
        setChampions(data)
        setSelectedChampions(new Set(data.filter(c => c.milestones.length > 0).map(c => c.userId)))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // userId → champion (for charter panel and task list table)
  const champMap = useMemo(() => {
    const m = new Map<string, GanttChampion>()
    for (const c of champions) m.set(c.userId, c)
    return m
  }, [champions])

  const milestoneMap = useMemo(() => {
    const m = new Map<string, { milestone: GanttMilestone; userId: string; championName: string }>()
    for (const c of champions) {
      for (const ms of c.milestones) {
        m.set(ms.id, { milestone: ms, userId: c.userId, championName: c.name })
      }
    }
    return m
  }, [champions])

  const noCharter = useMemo(
    () => champions.filter(c => !c.charterSubmissionId),
    [champions],
  )
  const noMilestone = useMemo(
    () => champions.filter(c => !!c.charterSubmissionId && c.milestones.length === 0),
    [champions],
  )
  const championsWithMilestones = useMemo(
    () => champions.filter(c => c.milestones.length > 0),
    [champions],
  )

  const filteredChampions = useMemo(
    () => championsWithMilestones.filter(c => selectedChampions.has(c.userId)),
    [championsWithMilestones, selectedChampions],
  )

  const rawTasks = useMemo(() => toTasks(filteredChampions), [filteredChampions])

  const tasks = useMemo(() => {
    const collapsedChamps = new Set<string>()
    const collapsedGroups = new Set<string>()
    for (const id of collapsedIds) {
      if (id.startsWith('champ-')) collapsedChamps.add(id)
      else if (id.startsWith('group-')) collapsedGroups.add(id)
    }

    // Build a lookup: groupId → champId for grandchild filtering
    const groupParent = new Map<string, string>()
    for (const t of rawTasks) {
      if (t.id.startsWith('group-') && t.project) groupParent.set(t.id, t.project)
    }

    return rawTasks
      .map(t => t.type === 'project' ? { ...t, hideChildren: false } : t)
      .filter(t => {
        if (!t.project) return true
        if (t.id.startsWith('group-')) return !collapsedChamps.has(t.project)
        if (t.project.startsWith('group-')) {
          if (collapsedGroups.has(t.project)) return false
          const champId = groupParent.get(t.project)
          return !champId || !collapsedChamps.has(champId)
        }
        return !collapsedChamps.has(t.project)
      })
  }, [rawTasks, collapsedIds])

  const handleCharterClick = useCallback((userId: string) => {
    setPanelUserId(prev => prev === userId ? null : userId)
  }, [])

  const handleChipNudge = useCallback((
    c: GanttChampion,
    nudgeType: 'no_charter' | 'no_milestone',
    e: React.MouseEvent<HTMLElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setNudgeState({ userId: c.userId, name: c.name, nudgeType, anchorX: rect.left, anchorY: rect.bottom + 8 })
  }, [])

  const handleGanttMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    lastMousePos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleGanttClick = useCallback((task: Task) => {
    if (!isAdmin) return
    if (task.id.startsWith('champ-')) return
    const msId = task.id.startsWith('group-') ? task.id.slice(6) : task.id
    const entry = milestoneMap.get(msId)
    if (!entry || entry.milestone.status !== 'delayed') return
    setNudgeState({
      userId: entry.userId,
      name: entry.championName,
      nudgeType: 'delayed_milestone',
      milestoneTitle: entry.milestone.title,
      anchorX: lastMousePos.current.x,
      anchorY: lastMousePos.current.y + 12,
    })
  }, [isAdmin, milestoneMap])

  const TaskListHeader = useMemo(
    () => makeTaskListHeader(projectW, listWidth, handleResizeStart),
    [projectW, listWidth, handleResizeStart],
  )

  const TaskListTable = useMemo(
    () => makeTaskListTable(champMap, handleCharterClick, panelUserId, projectW, listWidth, collapsedIds, handleExpandChange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [champMap, handleCharterClick, panelUserId, projectW, listWidth, collapsedIds],
  )

  function handleExpandChange(task: Task) {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(task.id)) next.delete(task.id)
      else next.add(task.id)
      return next
    })
  }

  function toggleChampion(userId: string) {
    setSelectedChampions(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
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

  if (champions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>게시된 마일스톤이 없습니다</p>
        <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>챔피언이 마일스톤을 게시하면 간트 차트가 표시됩니다</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {(noCharter.length > 0 || noMilestone.length > 0) && (
          <div style={{
            marginBottom: 16,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid rgba(217,119,6,0.3)',
            background: 'rgba(217,119,6,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: alertCollapsed ? 0 : 10,
          }}>
            <button
              onClick={() => setAlertCollapsed(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                alignSelf: 'flex-start',
              }}
            >
              <ChevronRight
                className="h-3 w-3"
                style={{
                  color: 'var(--amber)',
                  transform: alertCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                  transition: 'transform 0.15s',
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)' }}>
                확인 요함 · {noCharter.length + noMilestone.length}명
              </span>
            </button>
            {!alertCollapsed && [
              { label: '과제정의서 미제출', nudgeType: 'no_charter' as const, list: noCharter },
              { label: '마일스톤 미등록', nudgeType: 'no_milestone' as const, list: noMilestone },
            ].filter(g => g.list.length > 0).map(g => (
              <div key={g.label}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {g.label} · {g.list.length}명
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {g.list.map(c => (
                    <span
                      key={c.userId}
                      role={isAdmin ? 'button' : undefined}
                      tabIndex={isAdmin ? 0 : undefined}
                      onClick={isAdmin ? (e) => handleChipNudge(c, g.nudgeType, e as React.MouseEvent<HTMLElement>) : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '3px 8px 3px 4px',
                        borderRadius: 20,
                        border: '1px solid rgba(217,119,6,0.3)',
                        background: 'rgba(217,119,6,0.08)',
                        fontSize: 12,
                        color: 'rgba(180,83,9,1)',
                        cursor: isAdmin ? 'pointer' : 'default',
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        background: 'rgba(217,119,6,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 700,
                      }}>
                        {c.name[0]}
                      </span>
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Champion filter chips */}
        <div
          className="chip-scroll"
          style={{
            display: 'flex', gap: '6px', flexWrap: 'nowrap',
            overflowX: 'auto', marginBottom: '12px', paddingBottom: '4px',
            scrollbarWidth: 'none',
          }}
        >
          {championsWithMilestones.map(c => {
            const active = selectedChampions.has(c.userId)
            return (
              <button
                key={c.userId}
                type="button"
                onClick={() => toggleChampion(c.userId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '4px 10px', borderRadius: '20px',
                  border: `1px solid ${active ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
                  background: active ? 'rgba(37,99,235,0.1)' : 'var(--surface-primary)',
                  color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
                  fontSize: '12px', fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  background: active ? 'rgba(37,99,235,0.2)' : 'rgba(148,163,184,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: 700,
                  color: active ? 'var(--blue-600)' : 'var(--text-disabled)',
                }}>
                  {c.name[0]}
                </span>
                {c.name}
              </button>
            )
          })}
        </div>

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>선택된 챔피언이 없습니다</p>
            <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>위에서 챔피언을 선택하면 간트 차트가 표시됩니다</p>
          </div>
        )}

        <div className="flex gap-1 mb-3" style={{ display: tasks.length === 0 ? 'none' : 'flex' }}>
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

        {tasks.length > 0 && (
          <>
            <div style={{ fontSize: 12 }} onMouseMove={handleGanttMouseMove}>
              <Gantt
                tasks={tasks}
                viewMode={viewMode}
                onExpanderClick={handleExpandChange}
                listCellWidth={`${listWidth}px`}
                columnWidth={viewMode === ViewMode.Day ? 40 : viewMode === ViewMode.Week ? 120 : 200}
                rowHeight={36}
                barCornerRadius={4}
                locale="ko-KR"
                todayColor="rgba(37,99,235,0.08)"
                TaskListHeader={TaskListHeader}
                TaskListTable={TaskListTable}
                TooltipContent={GanttTooltip}
                onClick={handleGanttClick}
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
          </>
        )}
      </div>

      {panelUserId && (
        <CharterDetailPanel
          key={panelUserId}
          userId={panelUserId}
          champMap={champMap}
          onClose={() => setPanelUserId(null)}
        />
      )}

      {nudgeState && (
        <NudgePopover
          userId={nudgeState.userId}
          name={nudgeState.name}
          nudgeType={nudgeState.nudgeType}
          milestoneTitle={nudgeState.milestoneTitle}
          anchorX={nudgeState.anchorX}
          anchorY={nudgeState.anchorY}
          onClose={() => setNudgeState(null)}
        />
      )}
    </div>
  )
}
