'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChampionSummaryTable } from '@/components/ChampionSummaryTable'
import { ChampionGanttView } from '@/components/ChampionGanttView'

type View = 'table' | 'gantt'

export default function AdminDashboard() {
  const router = useRouter()
  const [view, setView] = useState<View>('gantt')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>대시보드</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>전체 챔피언 현황</p>
        </div>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
          {(['table', 'gantt'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="text-xs px-3 py-1.5 rounded-md font-medium transition-colors"
              style={{
                background: view === v ? 'hsl(var(--background))' : 'transparent',
                color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {v === 'table' ? '📊 표' : '📅 간트'}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' ? (
        <ChampionSummaryTable
          onChampionClick={(userId) => router.push(`/admin/champions/${userId}`)}
          onCharterClick={(userId) => router.push(`/admin/champions/${userId}#charter`)}
        />
      ) : (
        <ChampionGanttView />
      )}
    </div>
  )
}
