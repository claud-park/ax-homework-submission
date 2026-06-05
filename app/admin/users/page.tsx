'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { UserGroup, UserManagementEntry } from '@/lib/types'

const GROUP_LABEL: Record<UserGroup, string> = {
  champion: 'CHAMPION',
  partner: 'PARTNER',
  admin: 'ADMIN',
}

const GROUP_COLOR: Record<UserGroup, { bg: string; color: string }> = {
  champion: { bg: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' },
  partner:  { bg: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' },
  admin:    { bg: 'rgba(124,58,237,0.1)', color: '#7c3aed' },
}

function GroupBadge({ group }: { group: UserGroup }) {
  const style = GROUP_COLOR[group]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: style.bg, color: style.color, letterSpacing: '0.04em',
    }}>
      {GROUP_LABEL[group]}
    </span>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserManagementEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<UserManagementEntry[]>('/api/admin/users')
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleGroupChange(userId: string, newGroup: 'champion' | 'partner') {
    setChanging(userId)
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ userGroup: newGroup }),
      })
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, userGroup: newGroup } : u
      ))
    } catch (e) {
      console.error(e)
    } finally {
      setChanging(null)
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
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>유저 권한 관리</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Champion view에 가입한 전체 사용자. champion 그룹만 과제 추적 대상입니다.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : (
        <div style={{
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          background: 'var(--surface-primary)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-secondary)' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>부서</th>
                <th style={thStyle}>이메일</th>
                <th style={thStyle}>가입일</th>
                <th style={thStyle}>권한</th>
                <th style={thStyle}>변경</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isAdmin = u.userGroup === 'admin'
                const isChanging = changing === u.id
                return (
                  <tr key={u.id} style={{ background: 'var(--background)' }}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{u.displayName}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>{u.department || '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>{u.email}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>
                      {new Date(u.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </td>
                    <td style={tdStyle}><GroupBadge group={u.userGroup} /></td>
                    <td style={tdStyle}>
                      {isAdmin ? (
                        <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>변경 불가</span>
                      ) : (
                        <select
                          value={u.userGroup}
                          disabled={isChanging}
                          onChange={e => handleGroupChange(u.id, e.target.value as 'champion' | 'partner')}
                          style={{
                            fontSize: 12, padding: '3px 6px', borderRadius: 4,
                            border: '1px solid var(--border)', background: 'var(--surface-primary)',
                            color: 'var(--text-primary)', cursor: isChanging ? 'not-allowed' : 'pointer',
                            opacity: isChanging ? 0.5 : 1,
                          }}
                        >
                          <option value="champion">champion</option>
                          <option value="partner">partner</option>
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: '32px' }}>
                    사용자가 없습니다
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
