import { SeasonDetailClient } from './SeasonDetailClient'

export default function AdminSeasonDetailPage({ params }: { params: { seasonId: string } }) {
  return <SeasonDetailClient seasonId={params.seasonId} />
}
