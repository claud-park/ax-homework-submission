'use client'
import { ChampionGanttView } from '@/components/ChampionGanttView'

export default function SummaryPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 mb-4">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>전체 현황</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>챔피언 프로젝트 진행 현황</p>
      </div>
      <ChampionGanttView />
    </div>
  )
}
