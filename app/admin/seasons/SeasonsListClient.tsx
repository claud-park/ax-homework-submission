'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Season, SeasonStatus } from '@/lib/types'

const STATUS_LABEL: Record<SeasonStatus, string> = {
  recruiting: '모집중',
  active: '진행중',
  closed: '종료',
  archived: '보관됨',
}

const STATUS_COLOR: Record<SeasonStatus, { bg: string; color: string }> = {
  recruiting: { bg: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' },
  active: { bg: 'rgba(22,163,74,0.1)', color: 'var(--success)' },
  closed: { bg: 'rgba(100,116,139,0.1)', color: 'var(--text-secondary)' },
  archived: { bg: 'rgba(100,116,139,0.08)', color: 'var(--text-disabled)' },
}

function StatusBadge({ status }: { status: SeasonStatus }) {
  const style = STATUS_COLOR[status]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: style.bg, color: style.color, letterSpacing: '0.04em',
    }}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function SeasonsListClient() {
  const router = useRouter()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartDate, setNewStartDate] = useState('')

  useEffect(() => {
    apiFetch<Season[]>('/api/admin/seasons')
      .then(setSeasons)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const season = await apiFetch<Season>('/api/admin/seasons', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), startDate: newStartDate || null }),
      })
      setSeasons(prev => [season, ...prev])
      setNewName('')
      setNewStartDate('')
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', textAlign: 'left',
    borderBottom: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', fontSize: 13,
    borderBottom: '1px solid var(--border-faint)',
    color: 'var(--text-primary)',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>시즌 관리</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          시즌을 생성하고 참여자를 배정합니다.
        </p>
      </div>

      <div className="mb-6 flex items-end gap-2" style={{
        padding: 12, border: '1px solid var(--border-subtle)', borderRadius: 8,
        background: 'var(--surface-primary)',
      }}>
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>시즌 이름</label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="예: 시즌 2"
            style={{
              fontSize: 13, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--background)',
              color: 'var(--text-primary)', minWidth: 160,
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>시작일 (선택)</label>
          <input
            type="date"
            value={newStartDate}
            onChange={e => setNewStartDate(e.target.value)}
            style={{
              fontSize: 13, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--background)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          style={{
            fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 6,
            background: 'var(--blue-600)', color: '#fff', border: 'none',
            cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
            opacity: creating || !newName.trim() ? 0.5 : 1,
          }}
        >
          + 새 시즌 생성
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : (
        <div style={{
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          background: 'var(--surface-primary)', overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--surface-secondary)' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>현재 시즌</th>
                <th style={thStyle}>시작일</th>
                <th style={thStyle}>생성일</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map(s => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/admin/seasons/${s.id}`)}
                  style={{ background: 'var(--background)', cursor: 'pointer' }}
                >
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{s.name}</td>
                  <td style={tdStyle}><StatusBadge status={s.status} /></td>
                  <td style={tdStyle}>{s.is_current ? '✅' : ''}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>{s.start_date ?? '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>
                    {new Date(s.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </td>
                </tr>
              ))}
              {seasons.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: '32px' }}>
                    시즌이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
