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

export function CharterListClient({ initialCharters }: { initialCharters: CharterSubmission[] }) {
  const router = useRouter()
  const charters = initialCharters
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showModal, setShowModal] = useState(false)

  async function handleCreate() {
    if (!newTitle.trim()) {
      toast.error('Charter 제목을 입력해주세요.')
      return
    }
    setCreating(true)
    try {
      const data = await apiFetch<CharterSubmission>('/api/charter/submissions', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim(), publish_status: 'draft', content: {} }),
      })
      setShowModal(false)
      setNewTitle('')
      router.push(`/my-project/charter/${data.id}`)
    } catch {
      toast.error('Charter 생성에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>내 과제정의서</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          + 새로 만들기
        </button>
      </div>

      {charters.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
          <p>아직 작성된 과제정의서가 없습니다.</p>
          <p style={{ marginTop: 8, fontSize: 14 }}>"새로 만들기"를 눌러 첫 번째 Charter를 시작하세요.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {charters.map(charter => (
            <div
              key={charter.id}
              onClick={() => router.push(`/my-project/charter/${charter.id}`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderRadius: 12, background: 'var(--surface-primary)',
                border: '1.5px solid var(--border-subtle)', cursor: 'pointer',
                boxShadow: 'var(--shadow-s)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                  {charter.title ?? charter.project_name ?? 'Untitled Charter'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {STATUS_LABEL[charter.publish_status] ?? charter.publish_status}
                  {charter.admin_approved_at ? ' · 승인됨' : ''}
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>편집 →</span>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface-primary)', borderRadius: 16, padding: 32, width: 400, maxWidth: '90vw',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
              새 Charter 만들기
            </h2>
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Charter 제목 (예: AI 헬스케어)"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 15,
                border: '1.5px solid var(--border-subtle)', outline: 'none', marginBottom: 20,
                background: 'var(--surface-secondary)', color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowModal(false); setNewTitle('') }}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 14, border: '1.5px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none', cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}
              >
                {creating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
