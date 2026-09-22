import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCurrentSeasonId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

export async function getCurrentSeasonUserIds(
  supabase: SupabaseClient,
  role: 'champion' | 'partner',
): Promise<string[]> {
  const seasonId = await getCurrentSeasonId(supabase)
  if (!seasonId) return []
  const { data, error } = await supabase
    .from('season_enrollments')
    .select('user_id')
    .eq('season_id', seasonId)
    .eq('role_in_season', role)
  if (error || !data) return []
  return (data as { user_id: string }[]).map((row) => row.user_id)
}

export async function isEnrolledInCurrentSeason(
  supabase: SupabaseClient,
  userId: string,
  role: 'champion' | 'partner',
): Promise<boolean> {
  const seasonId = await getCurrentSeasonId(supabase)
  if (!seasonId) return false
  const { data, error } = await supabase
    .from('season_enrollments')
    .select('id')
    .eq('season_id', seasonId)
    .eq('user_id', userId)
    .eq('role_in_season', role)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !data) return false
  return true
}
