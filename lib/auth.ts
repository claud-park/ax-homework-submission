import { createServiceClient } from './supabase/server'
import { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { hashToken } from './pairing-tokens'

async function verifyPersonalAccessToken(token: string): Promise<User | null> {
  const supabase = createServiceClient()
  const { data: pat } = await supabase
    .from('personal_access_tokens')
    .select('id, user_id')
    .eq('token_hash', hashToken(token))
    .eq('scope', 'champion')
    .is('revoked_at', null)
    .single()
  if (!pat) return null

  await supabase
    .from('personal_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', pat.id)

  const { data: profile } = await supabase
    .from('users')
    .select('email, name, avatar_url, created_at')
    .eq('id', pat.user_id)
    .single()

  // PAT는 웹 로그인 세션이 아니므로 app_metadata가 없다 — isAdminUser()는
  // app_metadata.is_admin만 신뢰하므로 챔피언 PAT는 절대 관리자 권한을 얻지 않는다.
  // email/name/created_at은 users 테이블에서 채워, 스킬을 통한 완료 알림
  // (Slack/이메일)에 챔피언 이름이 비어 나가지 않게 한다.
  return {
    id: pat.user_id,
    aud: 'authenticated',
    email: profile?.email ?? '',
    app_metadata: {},
    user_metadata: { name: profile?.name ?? null, avatar_url: profile?.avatar_url ?? null },
    created_at: profile?.created_at ?? '',
  } as User
}

async function verifyAdminAccessToken(token: string): Promise<User | null> {
  const supabase = createServiceClient()
  const { data: pat } = await supabase
    .from('personal_access_tokens')
    .select('id, user_id')
    .eq('token_hash', hashToken(token))
    .eq('scope', 'admin')
    .is('revoked_at', null)
    .single()
  if (!pat) return null

  await supabase
    .from('personal_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', pat.id)

  const { data: profile } = await supabase
    .from('users')
    .select('email, name, avatar_url, created_at')
    .eq('id', pat.user_id)
    .single()

  // 관리자 스코프 PAT — 발급 시점(pairing approve)에 실제 관리자 세션인지 이미
  // 검증했으므로, 여기서는 app_metadata.is_admin을 true로 채워 isAdminUser()가
  // 이 토큰을 관리자로 인식하게 한다. 챔피언 PAT(verifyPersonalAccessToken)와는
  // 별도 함수로 분리해, 어느 한쪽을 고치다 다른 쪽의 권한 경계를 실수로 건드릴
  // 위험을 없앤다.
  return {
    id: pat.user_id,
    aud: 'authenticated',
    email: profile?.email ?? '',
    app_metadata: { is_admin: true },
    user_metadata: { name: profile?.name ?? null, avatar_url: profile?.avatar_url ?? null },
    created_at: profile?.created_at ?? '',
  } as User
}

export async function verifyJWT(req: NextRequest): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  if (token.startsWith('amst_')) return verifyPersonalAccessToken(token)
  if (token.startsWith('admt_')) return verifyAdminAccessToken(token)
  const supabase = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}

/**
 * 관리자 여부를 판정한다.
 *
 * app_metadata 만 신뢰한다. app_metadata 는 서비스 롤(Admin API)로만 수정 가능한 반면,
 * user_metadata 는 로그인한 사용자 본인이 클라이언트 SDK 로 직접 수정할 수 있어
 * 권한 상승(privilege escalation)에 악용될 수 있으므로 절대 신뢰하지 않는다.
 */
export function isAdminUser(
  user:
    | {
        app_metadata?: Record<string, unknown> | null
        user_metadata?: Record<string, unknown> | null
      }
    | null
    | undefined,
): boolean {
  return user?.app_metadata?.is_admin === true
}

export async function verifyAdmin(req: NextRequest): Promise<User | null> {
  const user = await verifyJWT(req)
  if (!isAdminUser(user)) return null
  return user
}

export const verifyUser = verifyJWT

/** Bearer 토큰이 개인 액세스 토큰(PAT, 챔피언용 또는 관리자용)인지 확인한다. 승인/
 *  기기관리처럼 실제 브라우저 세션만 허용해야 하는 라우트에서, requireUser를 부르기
 *  전에 PAT를 걸러내는 용도로 쓴다. */
export function isPatBearer(req: NextRequest): boolean {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  return token?.startsWith('amst_') || token?.startsWith('admt_') || false
}
