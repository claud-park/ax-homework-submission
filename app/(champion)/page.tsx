'use client'
import { useRouter } from 'next/navigation'
import { ChampionSummaryTable } from '@/components/ChampionSummaryTable'

export default function SummaryPage() {
  const router = useRouter()
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>전체 현황</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>챔피언 프로젝트 진행 현황</p>
      </div>
      <ChampionSummaryTable
        onChampionClick={(userId) => router.push(`/champions/${userId}`)}
        onCharterClick={(userId) => router.push(`/champions/${userId}#charter`)}
      />
    </div>
  )
}
