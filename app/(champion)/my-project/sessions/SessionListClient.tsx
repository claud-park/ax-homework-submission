'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CheckUpSession } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  idle: '미처리', uploading: '업로드 중', transcribing: '전사 중',
  summarizing: '요약 중', done: '완료', error: '오류',
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.45 }}>
      <rect x="5.5" y="1" width="5" height="8" rx="2.5" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3 7.5a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M8 12.5V15M6 15h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function SessionListClient({ sessions }: { sessions: CheckUpSession[] }) {
  const router = useRouter()
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>1-on-1 세션</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>진행한 1-on-1 세션 기록을 확인할 수 있습니다.</p>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-disabled)' }}>
          아직 1-on-1 세션이 없습니다.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => router.push(`/my-project/sessions/${s.id}`)}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                background: hovered === s.id ? 'var(--surface-hover, rgba(0,0,0,0.04))' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <MicIcon />
              <span style={{ fontSize: 14, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title || '제목없음'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {s.session_date ? `${s.session_date} · ` : ''}{STATUS_LABEL[s.processing_status] ?? s.processing_status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
