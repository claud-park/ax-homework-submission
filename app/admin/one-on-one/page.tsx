import { createServiceClient } from '@/lib/supabase/server'
import { fetchOneOnOneOverview } from '@/lib/data/one-on-one-admin'
import { listSeasons } from '@/lib/data/seasons-admin'
import { parseName } from '@/lib/utils'
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

  // 확정 어드민 이름 (다음 미팅 칸에 표시)
  const adminIds = Array.from(
    new Set(
      overview.rows
        .map((r) => r.nextBooking?.confirmed_by)
        .filter((id): id is string => !!id),
    ),
  )
  const adminNames: Record<string, string> = {}
  if (adminIds.length > 0) {
    const { data } = await supabase.from('users').select('id, name').in('id', adminIds)
    for (const u of (data ?? []) as { id: string; name: string }[]) {
      adminNames[u.id] = parseName(u.name).displayName
    }
  }

  return (
    <OneOnOneOverviewClient
      seasons={seasons}
      season={overview.season}
      rows={overview.rows}
      startDateMissing={overview.startDateMissing}
      adminNames={adminNames}
    />
  )
}
