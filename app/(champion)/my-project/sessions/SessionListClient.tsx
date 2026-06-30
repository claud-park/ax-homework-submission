'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Calendar } from 'lucide-react'
import type { CheckUpSession } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  idle: '미처리', uploading: '업로드 중', transcribing: '전사 중',
  summarizing: '요약 중', done: '완료', error: '오류', low_quality: '품질 낮음',
}

export function SessionListClient({ sessions }: { sessions: CheckUpSession[] }) {
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
            <Link
              key={s.id}
              href={`/my-project/sessions/${s.id}`}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                textDecoration: 'none', color: 'inherit',
                background: hovered === s.id ? 'var(--surface-hover, rgba(0,0,0,0.04))' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <Calendar className="h-4 w-4" style={{ flexShrink: 0, opacity: 0.45 }} />
              <span style={{ fontSize: 14, color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title || '제목없음'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                {s.session_date ? `${s.session_date} · ` : ''}{STATUS_LABEL[s.processing_status] ?? s.processing_status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
