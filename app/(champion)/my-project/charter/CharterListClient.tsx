// app/(champion)/my-project/charter/CharterListClient.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
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

function charterDisplayTitle(charter: CharterSubmission) {
  const base = charter.title?.trim() || charter.project_name?.trim() || '제목없음'
  return charter.publish_status === 'draft' ? `(임시저장) ${base}` : base
}

type ContextMenuState = { x: number; y: number; charterId: string } | null

export function CharterListClient({ initialCharters }: { initialCharters: CharterSubmission[] }) {
  const router = useRouter()
  const [charters, setCharters] = useState(initialCharters)
  const [creating, setCreating] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    try {
      const data = await apiFetch<CharterSubmission>('/api/charter/submissions', {
        method: 'POST',
        body: JSON.stringify({ title: '', publish_status: 'draft', content: {} }),
      })
      router.push(`/my-project/charter/${data.id}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('Charter 생성 실패: ' + msg)
      setCreating(false)
    }
  }

  function handleContextMenu(e: React.MouseEvent, charterId: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, charterId })
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiFetch(`/api/charter/submissions/${deleteTarget}`, { method: 'DELETE' })
      setCharters(prev => prev.filter(c => c.id !== deleteTarget))
      toast.success('과제정의서가 삭제되었습니다.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('삭제 실패: ' + msg)
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
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
            onContextMenu={e => handleContextMenu(e, charter.id)}
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
              {charterDisplayTitle(charter)}
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

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
            background: 'var(--surface-elevated, #fff)',
            border: '1px solid var(--border-default, rgba(0,0,0,0.1))',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '4px 0',
            minWidth: 140,
          }}
        >
          <button
            onClick={() => {
              setDeleteTarget(contextMenu.charterId)
              setContextMenu(null)
            }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 14px', fontSize: 14,
              color: '#e53e3e', background: 'none', border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(229,62,62,0.07)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            삭제
          </button>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null) }}
        >
          <div style={{
            background: 'var(--surface-elevated, #fff)',
            borderRadius: 12,
            padding: '24px 24px 20px',
            width: 360,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
              과제정의서를 삭제하시겠습니까?
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              삭제된 과제정의서는 복구할 수 없습니다.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  padding: '7px 16px', borderRadius: 7, fontSize: 13,
                  border: '1px solid var(--border-default, rgba(0,0,0,0.12))',
                  background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
              >
                취소
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  padding: '7px 16px', borderRadius: 7, fontSize: 13,
                  background: '#e53e3e', color: '#fff',
                  border: 'none', cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
