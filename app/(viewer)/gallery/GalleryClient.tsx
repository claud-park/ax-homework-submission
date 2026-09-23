'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Season } from '@/lib/types'
import type { PublicCharterEntry } from '@/lib/data/viewer'

const STATUS_LABEL: Record<PublicCharterEntry['statusBadge'], string> = {
  draft: '작성중',
  in_review: '검토중',
  approved: '승인됨',
}

const STATUS_COLOR: Record<PublicCharterEntry['statusBadge'], { bg: string; color: string }> = {
  draft: { bg: 'rgba(100,116,139,0.08)', color: 'var(--text-disabled)' },
  in_review: { bg: 'rgba(217,119,6,0.1)', color: 'var(--amber)' },
  approved: { bg: 'rgba(22,163,74,0.1)', color: 'var(--success)' },
}

export function GalleryClient() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [charters, setCharters] = useState<PublicCharterEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<Season[]>('/api/viewer/seasons')
      .then(list => {
        setSeasons(list)
        const current = list.find(s => s.is_current) ?? list[0]
        if (current) setSelectedSeasonId(current.id)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedSeasonId) return
    setLoading(true)
    apiFetch<PublicCharterEntry[]>(`/api/viewer/charters?season=${selectedSeasonId}`)
      .then(setCharters)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedSeasonId])

  return (
    <div className="min-h-screen px-6 py-8" style={{ background: 'hsl(var(--background))' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AX Champion 프로젝트 갤러리</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              공개된 프로젝트 요약만 볼 수 있습니다.
            </p>
          </div>
          {seasons.length > 0 && (
            <select
              value={selectedSeasonId}
              onChange={e => setSelectedSeasonId(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 14,
                border: '1.5px solid var(--border-subtle)', background: 'var(--surface-secondary)',
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {charters.map((c, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{c.projectTitle}</span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: STATUS_COLOR[c.statusBadge].bg, color: STATUS_COLOR[c.statusBadge].color }}
                  >
                    {STATUS_LABEL[c.statusBadge]}
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{c.oneLiner || '—'}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>{c.championName}</p>
              </div>
            ))}
            {charters.length === 0 && (
              <p className="text-sm col-span-full text-center py-12" style={{ color: 'var(--text-disabled)' }}>
                공개된 프로젝트가 없습니다.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
