'use client'
import type { PublishStatus } from '@/lib/types'

export function SaveOrPublishButtons({
  status,
  saving,
  onSaveDraft,
  onPublish,
  size = 'md',
}: {
  status: PublishStatus | undefined  // undefined = new entity, treat as draft
  saving: boolean
  onSaveDraft: () => void
  onPublish: () => void
  size?: 'sm' | 'md'
}) {
  const isPublished = status === 'published'
  const pad = size === 'sm' ? '6px 12px' : '8px 16px'
  const fontSize = size === 'sm' ? '11px' : '12px'

  if (isPublished) {
    return (
      <button
        type="button"
        onClick={onPublish}
        disabled={saving}
        style={{
          padding: pad,
          borderRadius: '8px',
          fontSize,
          fontWeight: 700,
          background: 'var(--blue-600)',
          color: '#fff',
          border: 'none',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? '저장 중...' : '저장'}
      </button>
    )
  }

  return (
    <div style={{ display: 'inline-flex', gap: '8px' }}>
      <button
        type="button"
        onClick={onSaveDraft}
        disabled={saving}
        style={{
          padding: pad,
          borderRadius: '8px',
          fontSize,
          fontWeight: 700,
          background: 'var(--surface-secondary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        임시저장
      </button>
      <button
        type="button"
        onClick={onPublish}
        disabled={saving}
        style={{
          padding: pad,
          borderRadius: '8px',
          fontSize,
          fontWeight: 700,
          background: 'var(--blue-600)',
          color: '#fff',
          border: 'none',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? '저장 중...' : '게시하기'}
      </button>
    </div>
  )
}
