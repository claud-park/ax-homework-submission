'use client'

import { useRouter } from 'next/navigation'
import { ChampionSummaryTable } from '@/components/ChampionSummaryTable'
import { DesktopOnlyNotice } from '@/components/DesktopOnlyNotice'

export default function AdminChampionsPage() {
  const router = useRouter()

  return (
    <div>
      <DesktopOnlyNotice />
      <div className="hidden md:block">
        <div className="mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>챔피언 리스트</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>챔피언을 선택하면 상세 페이지로 이동합니다.</p>
        </div>
        <ChampionSummaryTable
          onChampionClick={(userId) => router.push(`/admin/champions/${userId}`)}
          onCharterClick={(userId) => router.push(`/admin/champions/${userId}`)}
        />
      </div>
    </div>
  )
}
