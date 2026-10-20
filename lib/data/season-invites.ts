import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeasonInvite, SeasonRole } from '@/lib/types'
import { getCurrentSeasonId } from '@/lib/data/season'

/**
 * 관리자가 붙여넣은 원문을 이메일 배열로 정규화한다.
 * 줄바꿈/쉼표/세미콜론/공백으로 분리, trim, 소문자화, 순서 유지 중복 제거.
 */
export function normalizeInviteEmails(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of raw.split(/[\s,;]+/)) {
    const email = token.trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * 형식이 맞고(allowedDomain이 있으면) 허용 도메인으로 끝나는 이메일만 valid로 분류한다.
 * 허용 도메인 밖 이메일은 로그인 자체가 막혀 영원히 소비되지 않으므로 등록 전에 걸러낸다.
 */
export function partitionInviteEmails(
  emails: string[],
  allowedDomain: string | undefined,
): { valid: string[]; invalid: string[] } {
  const suffix = allowedDomain ? `@${allowedDomain.toLowerCase()}` : null
  const valid: string[] = []
  const invalid: string[] = []
  for (const email of emails) {
    const ok = EMAIL_SHAPE.test(email) && (suffix === null || email.toLowerCase().endsWith(suffix))
    ;(ok ? valid : invalid).push(email)
  }
  return { valid, invalid }
}

export async function listSeasonInvites(supabase: SupabaseClient, seasonId: string): Promise<SeasonInvite[]> {
  const { data, error } = await supabase
    .from('season_invites')
    .select('*')
    .eq('season_id', seasonId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[season-invites] listSeasonInvites failed:', error.message)
    return []
  }
  return (data ?? []) as SeasonInvite[]
}

type PendingInvite = Pick<SeasonInvite, 'id' | 'season_id' | 'role_in_season'>

/**
 * 현재 user_group과 시즌 역할들로 승격 결과를 정한다. 변경이 필요 없으면 null.
 * champion 역할이 있으면 champion. partner만 있으면 viewer일 때만 partner(champion→partner 강등 없음).
 */
export function resolvePromotedGroup(current: string | undefined, roles: SeasonRole[]): SeasonRole | null {
  const next: SeasonRole | null = roles.includes('champion') ? 'champion' : current === 'viewer' && roles.includes('partner') ? 'partner' : null
  return next && next !== current ? next : null
}

/**
 * 이메일에 걸린 미소비 초대를 모두 enrollment로 변환하고 user_group을 올린 뒤 초대를 소비 처리한다.
 * auth callback(첫 로그인)과 createSeasonInvites(이미 가입한 사용자)에서 호출된다.
 *
 * - enrollment는 없을 때만 만든다(ignoreDuplicates). 이미 배정된 시즌의 역할/상태는 덮어쓰지 않는다.
 * - user_group 승격은 초대된 시즌이 **현재 시즌(is_current)** 일 때만 한다. 아직 활성화 전인 시즌의
 *   초대로 로그인하면 enrollment만 생기고 viewer로 남는다 — 권한 판단(middleware, requireNonViewer)은
 *   user_group만 보므로, 미리 올리면 닫힌 직전 시즌에 차터를 쓰는 등 잘못된 시즌에 데이터가 쌓인다.
 *   시즌 활성화 시점에 promoteEnrolledViewers(seasons-admin)가 일괄 승격한다.
 * - 역할 규칙: champion 초대가 있으면 champion. partner 초대만 있으면 현재 viewer일 때만 partner(강등 없음).
 */
export async function applyPendingInvitesForUser(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<{ applied: number }> {
  const { data: invites, error } = await supabase
    .from('season_invites')
    .select('id, season_id, role_in_season')
    .eq('email', email.toLowerCase())
    .is('consumed_at', null)
  if (error) throw new Error(error.message)
  const pending = (invites ?? []) as PendingInvite[]
  if (pending.length === 0) return { applied: 0 }

  const { error: enrollErr } = await supabase
    .from('season_enrollments')
    .upsert(
      pending.map((i) => ({ season_id: i.season_id, user_id: userId, role_in_season: i.role_in_season, status: 'active' })),
      { onConflict: 'season_id,user_id', ignoreDuplicates: true },
    )
  if (enrollErr) throw new Error(enrollErr.message)

  const currentSeasonId = await getCurrentSeasonId(supabase)
  const currentSeasonInvites = pending.filter((i) => i.season_id === currentSeasonId)
  if (currentSeasonInvites.length > 0) {
    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .select('user_group')
      .eq('id', userId)
      .maybeSingle()
    if (profileErr) throw new Error(profileErr.message)
    const current = (profile as { user_group?: string } | null)?.user_group
    const next = resolvePromotedGroup(current, currentSeasonInvites.map((i) => i.role_in_season))
    if (next) {
      const { error: updateErr } = await supabase.from('users').update({ user_group: next }).eq('id', userId)
      if (updateErr) throw new Error(updateErr.message)
    }
  }

  const { error: consumeErr } = await supabase
    .from('season_invites')
    .update({ consumed_at: new Date().toISOString(), consumed_user_id: userId })
    .in('id', pending.map((i) => i.id))
  if (consumeErr) throw new Error(consumeErr.message)

  return { applied: pending.length }
}

export interface CreateSeasonInvitesResult {
  created: number
  appliedNow: number
  skippedConsumed: string[]
  /** 초대는 저장됐지만 즉시 적용에 실패한 가입자 이메일. 다음 로그인 때 다시 시도된다. */
  failed: string[]
}

/**
 * 시즌에 이메일들을 초대한다. 이미 소비된(적용된) 초대는 건드리지 않고 skippedConsumed로 돌려준다.
 * 이미 가입한 이메일은 로그인을 기다리지 않고 즉시 적용한다(appliedNow). 한 명의 적용 실패가
 * 나머지를 막지 않도록 사용자별로 격리하고 failed로 돌려준다(초대 자체는 남아 있어 멱등 재시도 가능).
 */
export async function createSeasonInvites(
  supabase: SupabaseClient,
  seasonId: string,
  emails: string[],
  role: SeasonRole,
): Promise<CreateSeasonInvitesResult> {
  const { data: existing, error: existingErr } = await supabase
    .from('season_invites')
    .select('email, consumed_at')
    .eq('season_id', seasonId)
    .in('email', emails)
  if (existingErr) throw new Error(existingErr.message)
  const consumed = new Set(
    ((existing ?? []) as { email: string; consumed_at: string | null }[])
      .filter((e) => e.consumed_at)
      .map((e) => e.email),
  )
  const skippedConsumed = emails.filter((e) => consumed.has(e))
  const toInvite = emails.filter((e) => !consumed.has(e))
  if (toInvite.length === 0) return { created: 0, appliedNow: 0, skippedConsumed, failed: [] }

  const { error: upsertErr } = await supabase
    .from('season_invites')
    .upsert(
      toInvite.map((email) => ({ season_id: seasonId, email, role_in_season: role })),
      { onConflict: 'season_id,email' },
    )
  if (upsertErr) throw new Error(upsertErr.message)

  // users.email은 Google이 준 표기 그대로 저장돼 있을 수 있어 소문자로 비교한다(테이블이 작아 전체 조회).
  const { data: users, error: usersErr } = await supabase.from('users').select('id, email')
  if (usersErr) throw new Error(usersErr.message)
  const inviteSet = new Set(toInvite)
  let appliedNow = 0
  const failed: string[] = []
  for (const u of (users ?? []) as { id: string; email: string | null }[]) {
    const email = u.email?.toLowerCase()
    if (!email || !inviteSet.has(email)) continue
    try {
      const { applied } = await applyPendingInvitesForUser(supabase, u.id, email)
      if (applied > 0) appliedNow += 1
    } catch (e) {
      console.error('[season-invites] immediate apply failed for', email, (e as Error).message)
      failed.push(email)
    }
  }

  return { created: toInvite.length, appliedNow, skippedConsumed, failed }
}

/** 미소비 초대만 삭제한다. 이미 적용된 초대는 이력 보존을 위해 남긴다. */
export async function deleteSeasonInvite(supabase: SupabaseClient, seasonId: string, inviteId: string): Promise<void> {
  const { data, error } = await supabase
    .from('season_invites')
    .delete()
    .eq('id', inviteId)
    .eq('season_id', seasonId)
    .is('consumed_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || (data as unknown[]).length === 0) throw new Error('이미 적용된 초대는 삭제할 수 없습니다')
}
