import { createServiceClient } from './supabase/server'
import { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

export async function verifyJWT(req: NextRequest): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
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
