// app/(champion)/my-project/charter/CharterListClient.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { CharterSubmission } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  published: '제출됨',
}

function DocIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
      <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h5.086a1.5 1.5 0 0 1 1.06.44l2.915 2.914A1.5 1.5 0 0 1 14 5.414V13.5A1.5 1.5 0 0 1 12.5 15h-8A1.5 1.5 0 0 1 3 13.5v-11Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M9.5 1v3.5a.5.5 0 0 0 .5.5H13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M5.5 8.5h5M5.5 11h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function CharterListClient({ initialCharters }: { initialCharters: CharterSubmission[] }) {
  const router = useRouter()
  const charters = initialCharters
  const [creating, setCreating] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      const data = await apiFetch<CharterSubmission>('/api/charter/submissions', {
        method: 'POST',
        body: JSON.stringify({ title: '', publish_status: 'draft', content: {} }),
      })
      router.push(`/my-project/charter/${data.id}`)
    } catch {
      toast.error('Charter 생성에 실패했습니다.')
      setCreating(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>내 과제정의서</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>작성한 과제정의서를 확인하고 새로 추가할 수 있습니다.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {charters.map(charter => (
          <div
            key={charter.id}
            onClick={() => router.push(`/my-project/charter/${charter.id}`)}
            onMouseEnter={() => setHovered(charter.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
              background: hovered === charter.id ? 'var(--surface-hover, rgba(0,0,0,0.04))' : 'transparent',
              transition: 'background 0.1s',
            }}
          >
            <DocIcon />
            <span style={{ fontSize: 14, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {charter.title ?? charter.project_name ?? 'Untitled'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
              {STATUS_LABEL[charter.publish_status] ?? charter.publish_status}
              {charter.admin_approved_at ? ' · 승인됨' : ''}
            </span>
          </div>
        ))}

        {/* Add button — always visible, styled as a list row */}
        <div
          onClick={handleCreate}
          onMouseEnter={() => setHovered('__add__')}
          onMouseLeave={() => setHovered(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', borderRadius: 6, cursor: 'pointer', marginTop: 2,
            background: hovered === '__add__' ? 'var(--surface-hover, rgba(0,0,0,0.04))' : 'transparent',
            transition: 'background 0.1s',
          }}
        >
          <span style={{ width: 16, textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)', opacity: 0.6, flexShrink: 0 }}>+</span>
          <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
            {creating ? '생성 중...' : charters.length === 0 ? '첫 번째 과제정의서 작성' : '과제정의서 추가'}
          </span>
        </div>
      </div>

    </div>
  )
}
