import { fetchSummaryData } from '@/lib/data/champions'
import { AdminChampionsClient } from './AdminChampionsClient'

export default async function AdminChampionsPage() {
  const data = await fetchSummaryData()
  return <AdminChampionsClient initialData={data} />
}
