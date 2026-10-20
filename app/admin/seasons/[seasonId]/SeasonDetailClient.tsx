'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { Season, SeasonInvite, SeasonRole } from '@/lib/types'

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
  invites: SeasonInvite[]
}

interface CreateInvitesResponse {
  ok: true
  created: number
  appliedNow: number
  skippedConsumed: string[]
  failed: string[]
}

const ROLE_LABEL: Record<SeasonRole, string> = { champion: 'Champion', partner: 'Partner' }

export function SeasonDetailClient({ seasonId }: { seasonId: string }) {
  const [data, setData] = useState<SeasonDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [continueRoles, setContinueRoles] = useState<Record<string, SeasonRole | ''>>({})
  const [newRoles, setNewRoles] = useState<Record<string, SeasonRole | ''>>({})
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [inviteText, setInviteText] = useState('')
  const [inviteRole, setInviteRole] = useState<SeasonRole>('champion')
  const [inviting, setInviting] = useState(false)

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
    if (!confirm('이 시즌을 현재 시즌으로 전환하시겠습니까? 직전 시즌은 보관 처리됩니다.')) return
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

  async function handleCreateInvites() {
    if (!inviteText.trim()) {
      toast.error('등록할 이메일을 입력해주세요.')
      return
    }
    setInviting(true)
    try {
      const res = await apiFetch<CreateInvitesResponse>(`/api/admin/seasons/${seasonId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ emails: inviteText, roleInSeason: inviteRole }),
      })
      toast.success(`${res.created}명 등록 (이미 가입해 즉시 적용 ${res.appliedNow}명)`)
      if (res.skippedConsumed.length > 0) {
        toast.info(`이미 적용된 초대라 건너뜀: ${res.skippedConsumed.join(', ')}`)
      }
      if (res.failed.length > 0) {
        toast.error(`즉시 적용 실패 (다음 로그인 때 재시도됨): ${res.failed.join(', ')}`)
      }
      setInviteText('')
      load()
    } catch (e) {
      toast.error((e as Error).message || '등록 실패')
      console.error(e)
    } finally {
      setInviting(false)
    }
  }

  async function handleDeleteInvite(invite: SeasonInvite) {
    if (!confirm(`${invite.email} 초대를 삭제하시겠습니까?`)) return
    try {
      await apiFetch(`/api/admin/seasons/${seasonId}/invites/${invite.id}`, { method: 'DELETE' })
      toast.success('초대가 삭제되었습니다.')
      load()
    } catch (e) {
      toast.error((e as Error).message || '삭제 실패')
      console.error(e)
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

      <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>이메일로 사전 등록 (로그인 전 참여자)</h2>
      <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        아직 로그인하지 않은 사람은 위 목록에 나오지 않습니다. 이메일을 등록해 두면 첫 로그인 때 시즌 배정이 자동으로 붙고, 이 시즌이 현재 시즌이면 역할(champion/partner)도 바로 적용됩니다. 현재 시즌이 아니면 &quot;현재 시즌으로 전환&quot; 시점에 일괄 적용됩니다. 이미 가입한 이메일은 즉시 처리됩니다.
      </p>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <textarea
          value={inviteText}
          onChange={e => setInviteText(e.target.value)}
          placeholder="한 줄에 하나씩, 또는 쉼표로 구분"
          rows={4}
          style={{
            width: '100%', fontSize: 13, padding: 8, borderRadius: 6, resize: 'vertical',
            border: '1px solid var(--border)', background: 'var(--surface-primary)', color: 'var(--text-primary)',
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <select value={inviteRole} onChange={e => setInviteRole(e.target.value as SeasonRole)} style={selectStyle}>
            <option value="champion">Champion으로 등록</option>
            <option value="partner">Partner로 등록</option>
          </select>
          <button
            onClick={handleCreateInvites}
            disabled={inviting}
            style={{
              fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 6,
              background: 'var(--blue-600)', color: '#fff', border: 'none',
              cursor: inviting ? 'not-allowed' : 'pointer', opacity: inviting ? 0.5 : 1,
            }}
          >
            등록
          </button>
        </div>
      </div>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, marginBottom: 24, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              <th style={thStyle}>이메일</th>
              <th style={thStyle}>역할</th>
              <th style={thStyle}>상태</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {data.invites.map(invite => (
              <tr key={invite.id} style={{ background: 'var(--background)' }}>
                <td style={tdStyle}>{invite.email}</td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{ROLE_LABEL[invite.role_in_season]}</td>
                <td style={{ ...tdStyle, color: invite.consumed_at ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {invite.consumed_at ? `적용됨 ${new Date(invite.consumed_at).toLocaleDateString('ko-KR')}` : '대기 (로그인 전)'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {!invite.consumed_at && (
                    <button
                      onClick={() => handleDeleteInvite(invite)}
                      style={{ fontSize: 12, color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data.invites.length === 0 && (
              <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: 20 }}>사전 등록된 이메일이 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
