'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone, User } from '@/lib/types'

type MilestoneWithUser = Milestone & { users: User }

const STATUS_COLOR: Record<string, string> = {
  not_started: '#444', in_progress: '#fbbf24', completed: '#4ade80', delayed: '#f87171',
}

export default function AdminProgressPage() {
  const [milestones, setMilestones] = useState<MilestoneWithUser[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

  useEffect(() => {
    apiFetch<MilestoneWithUser[]>('/api/admin/milestones').then(data => {
      setMilestones(data)
      setSelectedUsers(new Set(data.map(m => m.user_id)))
    })
  }, [])

  const users = Array.from(new Map(milestones.map(m => [m.user_id, m.users])).values())
  const filtered = milestones.filter(m => selectedUsers.has(m.user_id))
  const byUser = users.filter(u => selectedUsers.has(u.id)).map(u => ({
    user: u,
    milestones: filtered.filter(m => m.user_id === u.id),
  }))

  function toggleUser(userId: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>챔피언 진척도 비교</h1>
      <div className="flex gap-2 flex-wrap mb-6">
        {users.map(u => (
          <label key={u.id} className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border text-xs" style={{ background: selectedUsers.has(u.id) ? 'rgba(37,99,235,0.15)' : 'var(--surface-primary)', borderColor: selectedUsers.has(u.id) ? 'var(--blue-600)' : 'var(--border-subtle)', color: selectedUsers.has(u.id) ? 'var(--blue-600)' : 'var(--text-secondary)' }}>
            <input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => toggleUser(u.id)} className="hidden" />
            {u.name}
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        {byUser.map(({ user, milestones: ums }) => {
          const delayed = ums.filter(m => m.status === 'delayed')
          return (
            <div key={user.id} className="rounded-xl border p-4" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2 mb-3">
                {user.avatar_url && <img src={user.avatar_url} className="w-6 h-6 rounded-full" alt="" />}
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                {delayed.length > 0 && <span className="text-xs" style={{ color: 'var(--error)' }}>⚠️ {delayed.length}개 지연</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {ums.map(m => (
                  <div key={m.id} className="flex-1 min-w-28 p-2 rounded-lg" style={{ background: STATUS_COLOR[m.status] + '20', border: `1px solid ${STATUS_COLOR[m.status]}40` }}>
                    <p className="text-xs font-semibold" style={{ color: STATUS_COLOR[m.status] }}>{m.week_number}주차</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>~{m.due_date}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
