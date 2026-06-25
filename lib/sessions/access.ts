import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionRole } from './permissions'

type AuthUser = { id: string; user_metadata?: { is_admin?: boolean } }

/**
 * 세션에 대한 호출자의 역할을 판정한다.
 * - admin(user_metadata.is_admin) → 'admin'
 * - 세션의 champion 본인 → 'owner'
 * - 그 외 → null (라우트에서 403 처리)
 */
export async function resolveSessionRole(
  supabase: SupabaseClient,
  sessionId: string,
  user: AuthUser,
): Promise<SessionRole | null> {
  if (user.user_metadata?.is_admin) return 'admin'

  const { data } = await supabase
    .from('check_up_sessions')
    .select('champion_user_id')
    .eq('id', sessionId)
    .single()

  if (data && (data as { champion_user_id: string }).champion_user_id === user.id) return 'owner'
  return null
}
