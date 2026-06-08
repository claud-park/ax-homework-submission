'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { CharterSubmission } from '@/lib/types'
import { parseName } from '@/lib/utils'

type CharterWithUser = CharterSubmission & {
  users: { name: string; email: string } | null
}

const CHARTER_SECTIONS: { key: keyof CharterSubmission['content']; label: string }[] = [
  { key: 'summary',  label: '00. 30-Second Summary' },
  { key: 'problem',  label: '01. Problem' },
  { key: 'user',     label: '02. User' },
  { key: 'goal',     label: '03. Goal' },
  { key: 'solution', label: '04. Solution' },
  { key: 'build',    label: '05. Build' },
  { key: 'timeline', label: '06. Timeline' },
  { key: 'closing', label: '07. Closing' },
]

export default function AdminMobileChartersPage() {
  const [charters, setCharters] = useState<CharterWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'approved'>('pending')
  const [selected, setSelected] = useState<CharterWithUser | null>(null)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    apiFetch<CharterWithUser[]>('/api/admin/charters')
      .then(setCharters)
      .catch((e: Error) => toast.error('로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  const pending  = charters.filter(c => !c.admin_approved_at)
  const approved = charters.filter(c => !!c.admin_approved_at)
  const list = tab === 'pending' ? pending : approved

  async function handleApprove(charter: CharterWithUser) {
    setApproving(true)
    try {
      const updated = await apiFetch<CharterSubmission>(`/api/admin/charters/${charter.id}/approve`, { method: 'POST' })
      setCharters(prev => prev.map(c => c.id === charter.id ? { ...c, admin_approved_at: updated.admin_approved_at } : c))
      setSelected(prev => prev ? { ...prev, admin_approved_at: updated.admin_approved_at } : null)
      toast.success('과제정의서가 승인되었습니다.')
    } catch (e) {
      toast.error('승인 실패: ' + (e as Error).message)
    } finally {
      setApproving(false)
    }
  }

  // 상세 뷰
  if (selected) {
    const { displayName, department } = parseName(selected.users?.name ?? '')
    return (
      <div className="flex flex-col min-h-full">
        {/* 뒤로가기 헤더 */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-xs"
            style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            목록
          </button>
          <div>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
            <span className="text-xs ml-2" style={{ color: 'var(--text-disabled)' }}>{department}</span>
          </div>
        </div>

        {/* 과제명 */}
        {selected.project_name && (
          <p className="text-sm font-semibold mb-4" style={{ color: 'var(--blue-600)' }}>
            {selected.project_name}
          </p>
        )}

        {/* 섹션 내용 */}
        <div className="flex flex-col gap-4 flex-1 pb-24">
          {CHARTER_SECTIONS.map(({ key, label }) => {
            const text = selected.content?.[key]
            if (!text) return null
            return (
              <div key={key}>
                <p className="text-xs font-bold mb-1.5" style={{ color: 'var(--text-disabled)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                  {label}
                </p>
                <p
                  className="text-xs leading-relaxed p-3 rounded-lg"
                  style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}
                >
                  {text}
                </p>
              </div>
            )
          })}
        </div>

        {/* 하단 고정 승인 버튼 */}
        <div
          className="fixed bottom-20 left-0 right-0 px-4 py-3 border-t z-50"
          style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
        >
          {selected.admin_approved_at ? (
            <p className="text-xs text-center font-semibold" style={{ color: 'var(--success)' }}>
              ✓ 승인됨 · {new Date(selected.admin_approved_at).toLocaleDateString('ko-KR')}
            </p>
          ) : (
            <button
              onClick={() => handleApprove(selected)}
              disabled={approving}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: approving ? '#86efac' : '#16a34a', border: 'none', cursor: approving ? 'not-allowed' : 'pointer' }}
            >
              {approving ? '처리 중...' : '✓ 과제정의서 승인'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // 리스트 뷰
  return (
    <div className="flex flex-col">
      <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>과제정의서 검토</h1>

      {/* 내부 탭 */}
      <div className="flex gap-1 border-b mb-4" style={{ borderColor: 'var(--border-subtle)' }}>
        {(['pending', 'approved'] as const).map(t => {
          const count = t === 'pending' ? pending.length : approved.length
          const active = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 font-medium"
              style={{
                color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
                borderBottom: active ? '2px solid var(--blue-600)' : '2px solid transparent',
                marginBottom: -1,
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {t === 'pending' ? '승인 대기' : '승인 완료'}
              {count > 0 && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: t === 'pending' ? 'rgba(248,113,113,0.15)' : 'color-mix(in srgb, var(--success) 12%, transparent)',
                    color: t === 'pending' ? 'var(--error)' : 'var(--success)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
          {tab === 'pending' ? '승인 대기 중인 과제정의서가 없습니다.' : '승인 완료된 과제정의서가 없습니다.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map(charter => {
            const { displayName, department } = parseName(charter.users?.name ?? '')
            return (
              <button
                key={charter.id}
                onClick={() => setSelected(charter)}
                className="flex items-center gap-3 p-3 rounded-xl text-left w-full"
                style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)' }}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center rounded-full text-sm font-bold"
                  style={{ width: 34, height: 34, background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
                >
                  {displayName[0] ?? '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
                    <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>{department}</span>
                  </div>
                  <p className="text-xs truncate" style={{ color: charter.project_name ? 'var(--text-secondary)' : 'var(--text-disabled)' }}>
                    {charter.project_name ?? '과제명 미입력'}
                  </p>
                  {charter.admin_approved_at && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--success)' }}>
                      ✓ 승인됨 · {new Date(charter.admin_approved_at).toLocaleDateString('ko-KR')}
                    </p>
                  )}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--border-subtle)" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
