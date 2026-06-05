import { fetchGanttData } from '@/lib/data/champions'
import { ChampionGanttView } from '@/components/ChampionGanttView'
import { DesktopOnlyNotice } from '@/components/DesktopOnlyNotice'

export default async function AdminDashboard() {
  const data = await fetchGanttData()

  return (
    <div>
      <DesktopOnlyNotice />
      <div className="hidden md:block">
        <div className="mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>대시보드</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>전체 챔피언 현황</p>
        </div>
        <ChampionGanttView isAdmin initialData={data} />
      </div>
    </div>
  )
}
