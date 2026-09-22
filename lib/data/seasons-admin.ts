import type { SupabaseClient } from '@supabase/supabase-js'
import type { Season, SeasonRole, EnrollmentStatus } from '@/lib/types'

export async function listSeasons(supabase: SupabaseClient): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[seasons-admin] listSeasons failed:', error.message)
    return []
  }
  return (data ?? []) as Season[]
}

export async function createSeason(
  supabase: SupabaseClient,
  input: { name: string; startDate: string | null },
): Promise<Season> {
  const { data, error } = await supabase
    .from('seasons')
    .insert({ name: input.name, start_date: input.startDate, status: 'recruiting', is_current: false })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? '시즌 생성 실패')
  return data as Season
}

export interface SeasonRosterEntry {
  userId: string
  name: string
  roleInSeason: SeasonRole
  enrollmentStatus: EnrollmentStatus
  enrollmentId: string
}

export async function getPreviousSeasonRoster(
  supabase: SupabaseClient,
  previousSeasonId: string,
): Promise<SeasonRosterEntry[]> {
  const { data: enrollments, error } = await supabase
    .from('season_enrollments')
    .select('id, user_id, role_in_season, status')
    .eq('season_id', previousSeasonId)
  if (error) {
    console.error('[seasons-admin] getPreviousSeasonRoster failed:', error.message)
    return []
  }
  const userIds = (enrollments ?? []).map((e: { user_id: string }) => e.user_id)
  if (userIds.length === 0) return []
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, name')
    .in('id', userIds)
  if (usersErr) {
    console.error('[seasons-admin] getPreviousSeasonRoster users failed:', usersErr.message)
    return []
  }
  const nameMap = new Map((users ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))
  return (enrollments ?? []).map((e: { id: string; user_id: string; role_in_season: string; status: string }) => ({
    userId: e.user_id,
    name: nameMap.get(e.user_id) ?? '(알 수 없음)',
    roleInSeason: e.role_in_season as SeasonRole,
    enrollmentStatus: e.status as EnrollmentStatus,
    enrollmentId: e.id,
  }))
}

export interface CurrentSeasonEnrollmentEntry {
  userId: string
  name: string
  roleInSeason: SeasonRole
}

export async function getSeasonEnrollments(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<CurrentSeasonEnrollmentEntry[]> {
  const { data: enrollments, error } = await supabase
    .from('season_enrollments')
    .select('user_id, role_in_season')
    .eq('season_id', seasonId)
  if (error) {
    console.error('[seasons-admin] getSeasonEnrollments failed:', error.message)
    return []
  }
  const userIds = (enrollments ?? []).map((e: { user_id: string }) => e.user_id)
  if (userIds.length === 0) return []
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, name')
    .in('id', userIds)
  if (usersErr) {
    console.error('[seasons-admin] getSeasonEnrollments users failed:', usersErr.message)
    return []
  }
  const nameMap = new Map((users ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))
  return (enrollments ?? []).map((e: { user_id: string; role_in_season: string }) => ({
    userId: e.user_id,
    name: nameMap.get(e.user_id) ?? '(알 수 없음)',
    roleInSeason: e.role_in_season as SeasonRole,
  }))
}

export async function getUnassignedUsers(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<{ userId: string; name: string }[]> {
  const [{ data: allUsers, error: usersErr }, { data: enrolled, error: enrollErr }] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('season_enrollments').select('user_id').eq('season_id', seasonId),
  ])
  if (usersErr) console.error('[seasons-admin] getUnassignedUsers users failed:', usersErr.message)
  if (enrollErr) console.error('[seasons-admin] getUnassignedUsers enrollments failed:', enrollErr.message)
  const enrolledIds = new Set((enrolled ?? []).map((e: { user_id: string }) => e.user_id))
  return (allUsers ?? [])
    .filter((u: { id: string }) => !enrolledIds.has(u.id))
    .map((u: { id: string; name: string }) => ({ userId: u.id, name: u.name }))
}

export interface EnrollmentAssignment {
  userId: string
  roleInSeason: SeasonRole
  continueFromEnrollmentId?: string
}

export async function assignEnrollments(
  supabase: SupabaseClient,
  seasonId: string,
  assignments: EnrollmentAssignment[],
): Promise<void> {
  const rows = assignments.map((a) => ({
    season_id: seasonId,
    user_id: a.userId,
    role_in_season: a.roleInSeason,
    status: 'active' as const,
    continued_from_enrollment_id: a.continueFromEnrollmentId ?? null,
  }))
  const { error } = await supabase
    .from('season_enrollments')
    .upsert(rows, { onConflict: 'season_id,user_id' })
  if (error) throw new Error(error.message)
}

export async function activateSeason(supabase: SupabaseClient, newSeasonId: string): Promise<void> {
  const { error } = await supabase.rpc('activate_season', { p_new_season_id: newSeasonId })
  if (error) throw new Error(error.message)
}
