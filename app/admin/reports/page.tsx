'use client'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { ReportChampion } from '@/app/api/admin/reports/overview/route'
import type { MilestoneStatus } from '@/lib/types'

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작',
  in_progress: '진행 중',
  completed: '완료',
  delayed: '지연',
}

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  delayed: '#ef4444',
}

const STATUS_BG: Record<MilestoneStatus, string> = {
  not_started: 'rgba(148,163,184,0.12)',
  in_progress: 'rgba(59,130,246,0.12)',
  completed: 'rgba(34,197,94,0.12)',
  delayed: 'rgba(239,68,68,0.12)',
}

const STATUS_ORDER: MilestoneStatus[] = ['delayed', 'in_progress', 'not_started', 'completed']

// Returns the Sunday of the week containing the given date, offset by `offset` weeks
function getWeekRange(offset: number): { start: Date; end: Date } {
  const now = new Date()
  const sunday = new Date(now)
  sunday.setDate(now.getDate() - now.getDay() + offset * 7)
  sunday.setHours(0, 0, 0, 0)
  const saturday = new Date(sunday)
  saturday.setDate(sunday.getDate() + 6)
  saturday.setHours(23, 59, 59, 999)
  return { start: sunday, end: saturday }
}

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ProgressChips({ milestones }: { milestones: ReportChampion['milestones'] }) {
  if (milestones.length === 0) {
    return <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
  }

  const counts = milestones.reduce<Partial<Record<MilestoneStatus, number>>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {STATUS_ORDER.filter(s => counts[s]).map(s => (
        <span
          key={s}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 7px',
            borderRadius: 20,
            background: STATUS_BG[s],
            fontSize: 11,
            fontWeight: 600,
            color: STATUS_COLOR[s],
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: STATUS_COLOR[s],
            flexShrink: 0,
          }} />
          {STATUS_LABEL[s]} {counts[s]}
        </span>
      ))}
    </div>
  )
}

export default function AdminReportsPage() {
  const [data, setData] = useState<ReportChampion[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiFetch<ReportChampion[]>('/api/admin/reports/overview')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const { start: weekStart, end: weekEnd } = getWeekRange(weekOffset)
  const weekLabel = `${fmt(weekStart)} ~ ${fmt(weekEnd)}`

  const dataWithWeekFilter = data?.map(c => ({
    ...c,
    milestones: c.milestones.filter(m => {
      if (!m.due_date) return false
      const due = new Date(m.due_date)
      return due >= weekStart && due <= weekEnd
    }),
  })) ?? null

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-printable, #report-printable * { visibility: visible; }
          #report-printable { position: fixed; top: 0; left: 0; width: 100%; }
          .print-hidden { display: none !important; }
          @page { margin: 16mm; size: A4; }
        }
      `}</style>

      <div>
        {/* Controls */}
        <div className="flex items-center justify-between mb-6 print-hidden">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>프로젝트 현황 리포트</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>전체 챔피언 · due_date 기준</p>
          </div>
          {dataWithWeekFilter && (
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                background: '#0f172a', color: '#fff',
                fontSize: 13, fontWeight: 600,
                border: 'none', cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              인쇄 / PDF
            </button>
          )}
        </div>

        {loading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 w-full rounded-lg animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
            ))}
          </div>
        )}

        {dataWithWeekFilter && (
          <div id="report-printable" ref={reportRef}>
            {/* Report header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 20, paddingBottom: 14,
              borderBottom: '2px solid #0f172a',
            }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>
                  AX Program
                </p>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>
                  챔피언 프로젝트 현황 리포트
                </h2>
              </div>

              {/* Week navigator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="print-hidden"
                  onClick={() => setWeekOffset(w => w - 1)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: '1px solid #e2e8f0', background: '#fff',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#64748b',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', minWidth: 180, textAlign: 'center' }}>
                  {weekLabel}
                </span>

                <button
                  type="button"
                  className="print-hidden"
                  onClick={() => setWeekOffset(w => w + 1)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    border: '1px solid #e2e8f0', background: '#fff',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#64748b',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Summary bar */}
            <div style={{
              display: 'flex', gap: 20, marginBottom: 20,
              padding: '10px 16px',
              borderRadius: 8,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}>
              {[
                { label: '전체 챔피언', value: dataWithWeekFilter.length, color: '#0f172a' },
                { label: '이번 주 마일스톤', value: dataWithWeekFilter.filter(c => c.milestones.length > 0).length, color: '#3b82f6' },
                {
                  label: '지연 발생',
                  value: dataWithWeekFilter.filter(c => c.milestones.some(m => m.status === 'delayed')).length,
                  color: '#ef4444',
                },
                {
                  label: '병목 보고',
                  value: dataWithWeekFilter.filter(c => c.milestones.some(m => m.hasBottleneck)).length,
                  color: '#d97706',
                },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</span>
                  <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['부서', '이름', '과제명', '이번 주 마일스톤 현황', '병목'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: '9px 12px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: '#64748b',
                        borderBottom: '1px solid #cbd5e1',
                        width: i === 0 ? 72 : i === 1 ? 80 : i === 4 ? 64 : 'auto',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataWithWeekFilter.map((c, idx) => {
                  const hasDelay = c.milestones.some(m => m.status === 'delayed')
                  const hasBottleneck = c.milestones.some(m => m.hasBottleneck)

                  return (
                    <tr key={c.userId} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: 11, borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {c.department || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {c.name}
                        {hasDelay && <span style={{ marginLeft: 4, fontSize: 9, color: '#ef4444' }}>▲</span>}
                      </td>
                      <td style={{ padding: '10px 12px', color: c.projectName ? '#0f172a' : '#94a3b8', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                        {c.projectName ?? '미제출'}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                        <ProgressChips milestones={c.milestones} />
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle', textAlign: 'center' }}>
                        {hasBottleneck ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 7px', borderRadius: 20,
                            background: 'rgba(217,119,6,0.1)',
                            color: '#d97706',
                            fontSize: 10, fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}>
                            ⚠ 있음
                          </span>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Footer */}
            <div style={{
              marginTop: 24, paddingTop: 12,
              borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', gap: 16 }}>
                {(Object.entries(STATUS_LABEL) as [MilestoneStatus, string][]).map(([s, label]) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[s], display: 'inline-block' }} />
                    <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>AX Program · 내부용</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
