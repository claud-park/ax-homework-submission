'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { Season, SeasonRole } from '@/lib/types'

interface RosterEntry {
  userId: string
  name: string
  roleInSeason: SeasonRole
  enrollmentStatus: 'active' | 'completed' | 'dropped'
  enrollmentId: string
}

interface CurrentEnrollmentEntry {
  userId: string
  name: string
  roleInSeason: SeasonRole
}

interface UnassignedUser {
  userId: string
  name: string
}

interface SeasonDetailResponse {
  season: Season
  previousRoster: RosterEntry[]
  currentEnrollments: CurrentEnrollmentEntry[]
  unassignedUsers: UnassignedUser[]
}

const ROLE_LABEL: Record<SeasonRole, string> = { champion: 'Champion', partner: 'Partner' }

export function SeasonDetailClient({ seasonId }: { seasonId: string }) {
  const [data, setData] = useState<SeasonDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [continueRoles, setContinueRoles] = useState<Record<string, SeasonRole | ''>>({})
  const [newRoles, setNewRoles] = useState<Record<string, SeasonRole | ''>>({})
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)

  function load() {
    setLoading(true)
    apiFetch<SeasonDetailResponse>(`/api/admin/seasons/${seasonId}`)
      .then(res => {
        setData(res)
        const continuing: Record<string, SeasonRole | ''> = {}
        for (const entry of res.previousRoster) {
          const already = res.currentEnrollments.find(e => e.userId === entry.userId)
          continuing[entry.userId] = already ? already.roleInSeason : ''
        }
        setContinueRoles(continuing)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(load, [seasonId])

  async function handleSaveAssignments() {
    if (!data) return
    setSaving(true)
    const assignments = [
      ...data.previousRoster
        .filter(entry => continueRoles[entry.userId])
        .map(entry => ({
          userId: entry.userId,
          roleInSeason: continueRoles[entry.userId] as SeasonRole,
          continueFromEnrollmentId: entry.enrollmentId,
        })),
      ...data.unassignedUsers
        .filter(u => newRoles[u.userId])
        .map(u => ({ userId: u.userId, roleInSeason: newRoles[u.userId] as SeasonRole })),
    ]
    if (assignments.length === 0) {
      toast.error('배정할 참여자를 선택해주세요.')
      setSaving(false)
      return
    }
    try {
      await apiFetch(`/api/admin/seasons/${seasonId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      })
      toast.success('참여자가 배정되었습니다.')
      setNewRoles({})
      load()
    } catch (e) {
      toast.error('배정 실패')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleActivate() {
    if (!confirm('이 시즌을 현재 시즌으로 전환하시겠습니까? 되돌릴 수 없습니다.')) return
    setActivating(true)
    try {
      await apiFetch(`/api/admin/seasons/${seasonId}/activate`, { method: 'POST' })
      toast.success('시즌이 전환되었습니다.')
      load()
    } catch (e) {
      toast.error('전환 실패')
      console.error(e)
    } finally {
      setActivating(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', textAlign: 'left',
    borderBottom: '1px solid var(--border-subtle)',
  }
  const tdStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 13,
    borderBottom: '1px solid var(--border-faint)',
    color: 'var(--text-primary)',
  }
  const selectStyle: React.CSSProperties = {
    fontSize: 12, padding: '3px 6px', borderRadius: 4,
    border: '1px solid var(--border)', background: 'var(--surface-primary)',
    color: 'var(--text-primary)', cursor: 'pointer',
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{data.season.name}</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            상태: {data.season.status} {data.season.is_current ? '· 현재 시즌' : ''}
          </p>
        </div>
        {!data.season.is_current && (
          <button
            onClick={handleActivate}
            disabled={activating}
            style={{
              fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 6,
              background: 'var(--success)', color: '#fff', border: 'none',
              cursor: activating ? 'not-allowed' : 'pointer', opacity: activating ? 0.5 : 1,
            }}
          >
            현재 시즌으로 전환
          </button>
        )}
      </div>

      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>직전 시즌 참여자 — 이어하기 배정</h2>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, marginBottom: 24, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>직전 시즌 역할</th>
              <th style={thStyle}>이번 시즌 배정</th>
            </tr>
          </thead>
          <tbody>
            {data.previousRoster.map(entry => (
              <tr key={entry.userId} style={{ background: 'var(--background)' }}>
                <td style={tdStyle}>{entry.name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{ROLE_LABEL[entry.roleInSeason]}</td>
                <td style={tdStyle}>
                  <select
                    value={continueRoles[entry.userId] ?? ''}
                    onChange={e => setContinueRoles(prev => ({ ...prev, [entry.userId]: e.target.value as SeasonRole | '' }))}
                    style={selectStyle}
                  >
                    <option value="">종료(미참여)</option>
                    <option value="champion">Champion으로 이어하기</option>
                    <option value="partner">Partner로 이어하기</option>
                  </select>
                </td>
              </tr>
            ))}
            {data.previousRoster.length === 0 && (
              <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: 20 }}>직전 시즌 참여자가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>신규 참여자 추가</h2>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, marginBottom: 24, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>배정</th>
            </tr>
          </thead>
          <tbody>
            {data.unassignedUsers.map(u => (
              <tr key={u.userId} style={{ background: 'var(--background)' }}>
                <td style={tdStyle}>{u.name}</td>
                <td style={tdStyle}>
                  <select
                    value={newRoles[u.userId] ?? ''}
                    onChange={e => setNewRoles(prev => ({ ...prev, [u.userId]: e.target.value as SeasonRole | '' }))}
                    style={selectStyle}
                  >
                    <option value="">추가 안 함</option>
                    <option value="champion">Champion으로 추가</option>
                    <option value="partner">Partner로 추가</option>
                  </select>
                </td>
              </tr>
            ))}
            {data.unassignedUsers.length === 0 && (
              <tr><td colSpan={2} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: 20 }}>배정 가능한 사용자가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleSaveAssignments}
        disabled={saving}
        style={{
          fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 6,
          background: 'var(--blue-600)', color: '#fff', border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1,
          marginBottom: 24,
        }}
      >
        배정 저장
      </button>

      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>이번 시즌 확정 참여자 ({data.currentEnrollments.length}명)</h2>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>역할</th>
            </tr>
          </thead>
          <tbody>
            {data.currentEnrollments.map(e => (
              <tr key={e.userId} style={{ background: 'var(--background)' }}>
                <td style={tdStyle}>{e.name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{ROLE_LABEL[e.roleInSeason]}</td>
              </tr>
            ))}
            {data.currentEnrollments.length === 0 && (
              <tr><td colSpan={2} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: 20 }}>아직 배정된 참여자가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
