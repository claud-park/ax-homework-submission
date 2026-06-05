import { fetchGanttData, fetchSummaryData } from '@/lib/data/champions'
import { MobileChampionList } from '@/components/MobileChampionList'
import dynamic from 'next/dynamic'

const ChampionGanttView = dynamic(
  () => import('@/components/ChampionGanttView').then(m => ({ default: m.ChampionGanttView })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    ),
  }
)

export default async function SummaryPage() {
  const [ganttData, summaryData] = await Promise.all([fetchGanttData(), fetchSummaryData()])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 mb-4">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>전체 현황</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>챔피언 프로젝트 진행 현황</p>
      </div>
      <div className="md:hidden">
        <MobileChampionList initialData={summaryData} />
      </div>
      <div className="hidden md:flex flex-col flex-1">
        <ChampionGanttView initialData={ganttData} />
      </div>
    </div>
  )
}
