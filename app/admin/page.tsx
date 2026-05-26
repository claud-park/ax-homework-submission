'use client'
import { useRouter } from 'next/navigation'
import { ChampionSummaryTable } from '@/components/ChampionSummaryTable'

export default function AdminDashboard() {
  const router = useRouter()
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>대시보드</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>전체 챔피언 현황</p>
      </div>
      <ChampionSummaryTable
        onChampionClick={(userId) => router.push(`/admin/champions/${userId}`)}
        onCharterClick={(userId) => router.push(`/admin/champions/${userId}#charter`)}
      />
    </div>
  )
}
