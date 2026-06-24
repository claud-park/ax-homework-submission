'use client'
import { useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { CheckUpSession, Milestone } from '@/lib/types'
import DatePicker from '@/components/DatePicker'
import { SessionMiniGantt } from '@/components/SessionMiniGantt'

const STATUS_LABEL: Record<string, string> = {
  idle: '미처리',
  uploading: '업로드 중',
  transcribing: '전사 중',
  summarizing: '요약 중',
  done: '완료',
  error: '오류',
}
const STATUS_COLOR: Record<string, string> = {
  idle: 'var(--text-disabled)',
  uploading: 'var(--blue-600)',
  transcribing: 'var(--blue-600)',
  summarizing: 'var(--blue-600)',
  done: 'var(--success)',
  error: 'var(--error)',
}

interface Props {
  championUserId: string
  sessions: CheckUpSession[]
  milestones: Milestone[]
  onSelect: (session: CheckUpSession) => void
  onRefresh: () => void
}

export function AdminSessionList({ championUserId, sessions, milestones, onSelect, onRefresh }: Props) {
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [showForm, setShowForm] = useState(false)

  async function createSession() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const session = await apiFetch<CheckUpSession>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          champion_user_id: championUserId,
          session_date: newDate,
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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>체크업 세션</h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Plus className="h-3 w-3" />
          새 세션
        </button>
      </div>

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
          <DatePicker
            value={newDate}
            onChange={setNewDate}
            style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '13px' }}
          />
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

      {sessions.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-disabled)' }}>아직 세션이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => onSelect(s)}
              className="rounded-xl border p-3"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', cursor: 'pointer' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.session_date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ color: STATUS_COLOR[s.processing_status], background: `${STATUS_COLOR[s.processing_status]}18`, fontWeight: 600 }}
                  >
                    {STATUS_LABEL[s.processing_status]}
                  </span>
                  <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-disabled)' }} />
                </div>
              </div>
              <SessionMiniGantt milestones={milestones} sessionDate={s.session_date} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
