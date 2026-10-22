import { createServiceClient } from '@/lib/supabase/server'
import { fetchOneOnOneOverview } from '@/lib/data/one-on-one-admin'
import { listSeasons } from '@/lib/data/seasons-admin'
import { OneOnOneOverviewClient } from './OneOnOneOverviewClient'

export default async function AdminOneOnOnePage({
  searchParams,
}: {
  searchParams: { season?: string }
}) {
  const { season: seasonParam } = searchParams
  const supabase = createServiceClient()
  const [overview, seasons] = await Promise.all([
    fetchOneOnOneOverview(supabase, seasonParam || undefined),
    listSeasons(supabase),
  ])

  return (
    <OneOnOneOverviewClient
      seasons={seasons}
      season={overview.season}
      rows={overview.rows}
      startDateMissing={overview.startDateMissing}
    />
  )
}
