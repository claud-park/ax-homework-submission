import type { SupabaseClient } from '@supabase/supabase-js'
import type { Season, SeasonRole, EnrollmentStatus } from '@/lib/types'
import { resolvePromotedGroup } from '@/lib/data/season-invites'

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
  excludeUserIds: string[] = [],
): Promise<{ userId: string; name: string }[]> {
  const [{ data: allUsers, error: usersErr }, { data: enrolled, error: enrollErr }] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('season_enrollments').select('user_id').eq('season_id', seasonId),
  ])
  if (usersErr) console.error('[seasons-admin] getUnassignedUsers users failed:', usersErr.message)
  if (enrollErr) console.error('[seasons-admin] getUnassignedUsers enrollments failed:', enrollErr.message)
  const excludedIds = new Set([
    ...(enrolled ?? []).map((e: { user_id: string }) => e.user_id),
    ...excludeUserIds,
  ])
  return (allUsers ?? [])
    .filter((u: { id: string }) => !excludedIds.has(u.id))
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

/**
 * 시즌의 active enrollment를 가진 viewer를 역할에 맞게 champion/partner로 올린다.
 * 사전 등록(season_invites)으로 활성화 전에 로그인한 사람은 viewer로 남아 있으므로,
 * 시즌 활성화 직후 호출해 권한을 맞춘다. 승격한 인원 수를 돌려준다.
 */
export async function promoteEnrolledViewers(supabase: SupabaseClient, seasonId: string): Promise<number> {
  const { data: enrollments, error } = await supabase
    .from('season_enrollments')
    .select('user_id, role_in_season')
    .eq('season_id', seasonId)
    .eq('status', 'active')
  if (error) throw new Error(error.message)
  const rows = (enrollments ?? []) as { user_id: string; role_in_season: SeasonRole }[]
  if (rows.length === 0) return 0

  const { data: viewers, error: viewersErr } = await supabase
    .from('users')
    .select('id')
    .in('id', rows.map((r) => r.user_id))
    .eq('user_group', 'viewer')
  if (viewersErr) throw new Error(viewersErr.message)
  const viewerIds = new Set(((viewers ?? []) as { id: string }[]).map((v) => v.id))

  const byGroup: Record<SeasonRole, string[]> = { champion: [], partner: [] }
  for (const r of rows) {
    if (!viewerIds.has(r.user_id)) continue
    const next = resolvePromotedGroup('viewer', [r.role_in_season])
    if (next) byGroup[next].push(r.user_id)
  }
  let promoted = 0
  for (const group of ['champion', 'partner'] as SeasonRole[]) {
    if (byGroup[group].length === 0) continue
    const { error: updateErr } = await supabase.from('users').update({ user_group: group }).in('id', byGroup[group])
    if (updateErr) throw new Error(updateErr.message)
    promoted += byGroup[group].length
  }
  return promoted
}

export async function activateSeason(supabase: SupabaseClient, newSeasonId: string): Promise<void> {
  const { error } = await supabase.rpc('activate_season', { p_new_season_id: newSeasonId })
  if (error) throw new Error(error.message)
  // 전환은 이미 커밋됐으므로 승격 실패가 전환 결과를 되돌리진 않는다. 관리자는 /admin/users에서 수동 보정 가능.
  try {
    await promoteEnrolledViewers(supabase, newSeasonId)
  } catch (e) {
    console.error('[seasons-admin] promoteEnrolledViewers failed:', (e as Error).message)
  }
}
