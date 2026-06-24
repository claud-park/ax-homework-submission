'use client'
import { useState } from 'react'
import { Plus, Calendar } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { CheckUpSession, Milestone } from '@/lib/types'
import { SessionMiniGantt, ganttWindowLabel } from '@/components/SessionMiniGantt'

const STATUS_LABEL: Record<string, string> = {
  idle: '미처리',
  uploading: '업로드 중',
  transcribing: '전사 중',
  summarizing: '요약 중',
  done: '완료',
  error: '오류',
}

interface Props {
  championUserId: string
  sessions: CheckUpSession[]
  milestones: Milestone[]
  charterId?: string | null
  onSelect: (session: CheckUpSession) => void
  onRefresh: () => void
}

export function AdminSessionList({ championUserId, sessions, milestones, charterId, onSelect, onRefresh }: Props) {
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  async function createSession() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      // 날짜·시각은 [생성] 클릭 시점(관리자 로컬 타임존) 기준으로 자동 기록
      const session_date = today
      const session_time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
      const session = await apiFetch<CheckUpSession>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          champion_user_id: championUserId,
          session_date,
          session_time,
          title: newTitle.trim(),
        }),
      })
      toast.success('세션이 생성되었습니다.')
      setShowForm(false)
      setNewTitle('')
      onRefresh()
      onSelect(session)
    } catch {
      toast.error('세션 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      {/* 헤더: 제목 + [과제정의서 보기] + [새 세션] */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>1-on-1 세션</h3>
        <div className="flex items-center gap-2">
          {charterId && (
            <button
              onClick={() => window.open(`/charter-popup/${charterId}`, 'charter-popup', 'width=900,height=700,scrollbars=yes')}
              className="text-xs font-semibold"
              style={{ background: 'transparent', border: '1px solid var(--blue-600)', color: 'var(--blue-600)', cursor: 'pointer', padding: '5px 12px', borderRadius: 6 }}
            >
              과제정의서 보기
            </button>
          )}
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <Plus className="h-3 w-3" />
            새 세션
          </button>
        </div>
      </div>

      {/* 마일스톤 현황 (현재) — 목록 상단 1개 */}
      {milestones.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>마일스톤 현황 ({ganttWindowLabel(today)})</p>
          <SessionMiniGantt milestones={milestones} sessionDate={today} hideHeader />
        </div>
      )}

      {showForm && (
        <div
          className="rounded-xl border p-3 mb-4 flex flex-col gap-2"
          style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
        >
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="세션 제목 (예: 6월 3주차 체크업)"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            날짜·시간은 [생성] 클릭 시점으로 자동 기록됩니다.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs px-4 py-2 rounded-lg font-medium"
              style={{ background: '#fff', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              취소
            </button>
            <button
              onClick={createSession}
              disabled={creating || !newTitle.trim()}
              className="text-xs px-4 py-2 rounded-lg font-semibold disabled:opacity-40"
              style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {creating ? '생성 중...' : '생성'}
            </button>
          </div>
        </div>
      )}

      {/* 세션 목록 — champion 뷰와 동일한 컴팩트 행(per-item Gantt 없음) */}
      {sessions.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-disabled)' }}>아직 세션이 없습니다.</p>
      ) : (
        <div className="flex flex-col">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => onSelect(s)}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                background: hovered === s.id ? 'var(--surface-hover, rgba(0,0,0,0.04))' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <Calendar className="h-4 w-4" style={{ flexShrink: 0, opacity: 0.45 }} />
              <span style={{ fontSize: 14, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title || '제목없음'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {s.session_date}{s.session_time ? ` ${s.session_time.slice(0, 5)}` : ''} · {STATUS_LABEL[s.processing_status] ?? s.processing_status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
