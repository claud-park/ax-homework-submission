'use client'
import { useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone, User } from '@/lib/types'

type ReportMilestone = Milestone & { users: User }
interface ReportData { week_number: number; milestones: ReportMilestone[] }

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--amber)',
  completed: 'var(--success)', delayed: 'var(--error)',
}

export default function AdminReportsPage() {
  const [weekNumber, setWeekNumber] = useState('1')
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  async function generateReport() {
    setLoading(true)
    try {
      const data = await apiFetch<ReportData>(`/api/admin/reports/${weekNumber}`)
      setReport(data)
    } finally {
      setLoading(false)
    }
  }

  async function exportPdf() {
    if (!reportRef.current) return
    const { default: jsPDF } = await import('jspdf')
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(reportRef.current, { backgroundColor: '#ffffff', scale: 2 })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
    pdf.save(`주간리포트_${weekNumber}주차.pdf`)
  }

  const byUser = report
    ? Object.values(
        report.milestones.reduce<Record<string, { user: User; milestones: ReportMilestone[] }>>((acc, m) => {
          if (!acc[m.user_id]) acc[m.user_id] = { user: m.users, milestones: [] }
          acc[m.user_id].milestones.push(m)
          return acc
        }, {})
      )
    : []

  return (
    <div>
      <h1 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>주간 리포트</h1>
      <div className="flex items-center gap-3 mb-6">
        <input
          type="number"
          value={weekNumber}
          onChange={e => setWeekNumber(e.target.value)}
          min="1"
          placeholder="주차"
          className="w-24 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        />
        <button onClick={generateReport} disabled={loading} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>
          {loading ? '생성 중...' : '리포트 생성'}
        </button>
        {report && (
          <button onClick={exportPdf} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}>
            📕 PDF 다운로드
          </button>
        )}
      </div>

      {report && (
        <div ref={reportRef} className="rounded-xl border p-6" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <h2 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{report.week_number}주차 진척도 리포트</h2>
          <p className="text-xs mb-6" style={{ color: 'var(--text-secondary)' }}>생성일: {new Date().toLocaleDateString('ko-KR')}</p>
          <div className="flex flex-col gap-4">
            {byUser.map(({ user, milestones }) => (
              <div key={user.id} className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {['마일스톤', '기간', '상태'].map(h => (
                        <th key={h} className="text-left pb-2 font-semibold" style={{ color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map(m => (
                      <tr key={m.id}>
                        <td className="py-2" style={{ color: 'var(--text-primary)' }}>{m.title}</td>
                        <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{m.start_date ?? ''} – {m.due_date ?? ''}</td>
                        <td className="py-2 font-semibold" style={{ color: STATUS_COLOR[m.status] }}>
                          {STATUS_LABEL[m.status]}{m.status === 'delayed' ? ' ⚠️' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {byUser.length === 0 && <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>이 주차에 등록된 마일스톤이 없습니다.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
