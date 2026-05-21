'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone } from '@/lib/types'

type MilestoneWithHomework = Milestone & { homeworks: { id: number; title: string } | null }

const STATUS_COLOR: Record<string, string> = {
  not_started: '#f1f5f9',
  in_progress:  '#bfdbfe',
  completed:    '#bbf7d0',
  delayed:      '#fecaca',
}
const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function getWeekdays(start: Date, end: Date): Date[] {
  const days: Date[] = []
  const cur = new Date(start); cur.setHours(0, 0, 0, 0)
  const fin = new Date(end);   fin.setHours(23, 59, 59, 999)
  while (cur <= fin) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function inRange(day: Date, startStr: string, endStr: string) {
  const t = day.getTime()
  return t >= parseLocal(startStr).getTime() && t <= parseLocal(endStr).getTime()
}

const BORDER   = '1px solid #e2e8f0'
const HEADER_BG = '#f8fafc'
const GROUP_BG  = '#f1f5f9'
const LEFT_W = 240
const COL_W  = 44
const H0 = 28, H1 = 24, H2 = 24

export default function ProgressPage() {
  const [milestones, setMilestones] = useState<MilestoneWithHomework[]>([])

  useEffect(() => {
    apiFetch<MilestoneWithHomework[]>('/api/milestones').then(setMilestones)
  }, [])

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const todayStr = today.toISOString().split('T')[0]

  const published = useMemo(() => milestones.filter(m => m.publish_status === 'published'), [milestones])
  const tasks     = useMemo(() => published.filter(m => m.start_date && m.due_date), [published])
  const delayed   = useMemo(() => published.filter(m => m.status === 'delayed'),     [published])

  // Group tasks by homework, sorted: homework groups (asc id), then standalone (null) last
  const groups = useMemo(() => {
    const map = new Map<string, { hwId: number | null; hwTitle: string | null; milestones: MilestoneWithHomework[] }>()
    for (const m of tasks) {
      const key = m.homework_id !== null ? String(m.homework_id) : '__none__'
      if (!map.has(key)) map.set(key, { hwId: m.homework_id, hwTitle: m.homeworks?.title ?? null, milestones: [] })
      map.get(key)!.milestones.push(m)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === '__none__') return 1
        if (b === '__none__') return -1
        return Number(a) - Number(b)
      })
      .map(([, g]) => g)
  }, [tasks])

  const { days, monthGroups } = useMemo(() => {
    if (!tasks.length) return { days: [] as Date[], monthGroups: [] as { label: string; count: number }[] }
    const minMs = Math.min(...tasks.map(m => parseLocal(m.start_date).getTime()))
    const maxMs = Math.max(...tasks.map(m => parseLocal(m.due_date).getTime()))
    const s = new Date(minMs); s.setDate(s.getDate() - 5)
    const e = new Date(maxMs); e.setDate(e.getDate() + 5)
    const allDays = getWeekdays(s, e)
    const grps: { label: string; count: number }[] = []
    for (const d of allDays) {
      const label = `${d.getMonth() + 1}월`
      const last = grps[grps.length - 1]
      if (last?.label === label) last.count++
      else grps.push({ label, count: 1 })
    }
    return { days: allDays, monthGroups: grps }
  }, [tasks])

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>내 진척도</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>오늘: {todayStr}</p>
      </div>

      {delayed.length > 0 && (
        <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #dc2626' }}>
          <p className="text-xs font-bold mb-1" style={{ color: '#dc2626' }}>⚠️ 지연된 마일스톤</p>
          {delayed.map(m => (
            <p key={m.id} className="text-xs" style={{ color: '#64748b' }}>• {m.title} (마감: {m.due_date})</p>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: STATUS_COLOR[key], border: BORDER }} />
            <span className="text-xs" style={{ color: '#64748b' }}>{label}</span>
          </div>
        ))}
      </div>

      {!tasks.length ? (
        <p className="text-sm" style={{ color: '#94a3b8' }}>WBS에서 마일스톤을 추가하면 여기에 표시됩니다.</p>
      ) : (
        <div className="rounded-xl overflow-auto" style={{ border: BORDER, maxHeight: '70vh' }}>
          <table style={{
            borderCollapse: 'separate', borderSpacing: 0,
            tableLayout: 'fixed',
            minWidth: `${LEFT_W + days.length * COL_W}px`,
          }}>
            <colgroup>
              <col style={{ width: `${LEFT_W}px` }} />
              {days.map((_, i) => <col key={i} style={{ width: `${COL_W}px` }} />)}
            </colgroup>

            <thead>
              {/* Row 0: 업무 header (rowspan 3) + month labels */}
              <tr style={{ height: `${H0}px` }}>
                <th rowSpan={3} style={{
                  position: 'sticky', left: 0, top: 0, zIndex: 40,
                  background: HEADER_BG,
                  borderRight: BORDER, borderBottom: BORDER,
                  textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#334155',
                }}>
                  업무
                </th>
                {monthGroups.map((g, i) => (
                  <th key={i} colSpan={g.count} style={{
                    position: 'sticky', top: 0, zIndex: 30,
                    background: HEADER_BG,
                    borderRight: BORDER, borderBottom: BORDER,
                    textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#334155',
                    padding: '4px 0',
                  }}>
                    {g.label}
                  </th>
                ))}
              </tr>

              {/* Row 1: Day names */}
              <tr style={{ height: `${H1}px` }}>
                {days.map((d, i) => (
                  <th key={i} style={{
                    position: 'sticky', top: `${H0}px`, zIndex: 30,
                    background: isSameDay(d, today) ? '#dbeafe' : HEADER_BG,
                    borderRight: BORDER, borderBottom: BORDER,
                    textAlign: 'center', fontSize: '10px', fontWeight: 600,
                    color: isSameDay(d, today) ? '#1d4ed8' : '#94a3b8',
                  }}>
                    {DAY_KO[d.getDay()]}
                  </th>
                ))}
              </tr>

              {/* Row 2: Date numbers */}
              <tr style={{ height: `${H2}px` }}>
                {days.map((d, i) => (
                  <th key={i} style={{
                    position: 'sticky', top: `${H0 + H1}px`, zIndex: 30,
                    background: isSameDay(d, today) ? '#dbeafe' : HEADER_BG,
                    borderRight: BORDER, borderBottom: BORDER,
                    textAlign: 'center', fontSize: '11px', fontWeight: 700,
                    color: isSameDay(d, today) ? '#1d4ed8' : '#475569',
                  }}>
                    {d.getDate()}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {groups.map(({ hwId, hwTitle, milestones: gms }) => {
                const key = hwId !== null ? String(hwId) : '__none__'
                const collapsed = collapsedGroups.has(key)
                const groupLabel = hwId !== null
                  ? `과제 #${String(hwId).padStart(2, '0')}${hwTitle ? `  ${hwTitle}` : ''}`
                  : '독립 WBS'

                return (
                  <Fragment key={key}>
                    {/* Group header row — clickable to toggle */}
                    <tr
                      style={{ height: '28px', cursor: 'pointer' }}
                      onClick={() => setCollapsedGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(key)) next.delete(key)
                        else next.add(key)
                        return next
                      })}
                    >
                      <td style={{
                        position: 'sticky', left: 0, zIndex: 10,
                        background: GROUP_BG,
                        borderRight: BORDER, borderBottom: BORDER,
                        paddingLeft: '10px', paddingRight: '8px',
                        fontSize: '11px', fontWeight: 700, color: '#475569',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        letterSpacing: '0.02em',
                        userSelect: 'none',
                      }}>
                        <span style={{
                          display: 'inline-block',
                          marginRight: '6px',
                          fontSize: '9px',
                          color: '#94a3b8',
                          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.15s ease',
                        }}>
                          ▼
                        </span>
                        {groupLabel}
                      </td>
                      <td colSpan={days.length} style={{
                        background: GROUP_BG,
                        borderBottom: BORDER,
                        padding: 0,
                      }} />
                    </tr>

                    {/* Milestone rows — hidden when collapsed */}
                    {!collapsed && gms.map(m => (
                      <tr key={m.id} style={{ height: '40px' }}>
                        <td style={{
                          position: 'sticky', left: 0, zIndex: 10,
                          background: '#fff',
                          borderRight: BORDER, borderBottom: BORDER,
                          paddingLeft: '20px', paddingRight: '8px',
                          fontSize: '12px', color: '#0f172a',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {m.title}
                        </td>
                        {days.map((day, i) => {
                          const active = inRange(day, m.start_date, m.due_date)
                          return (
                            <td key={i} style={{
                              background: active ? STATUS_COLOR[m.status] : '#fff',
                              borderRight: BORDER,
                              borderBottom: BORDER,
                              padding: 0,
                            }} />
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
