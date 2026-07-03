import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { verifyJWT, verifyAdmin } from '@/lib/auth'

/**
 * API 라우트 인증 가드.
 *
 * 라우트마다 복붙되던 인증/권한 체크 + 401/403 응답 생성을 한 곳으로 모은다.
 * 기존 동작(401 { error: 'Unauthorized' } / 403 { error: 'Forbidden' })을 그대로 보존한다.
 *
 * 사용:
 *   const user = await requireUser(req)
 *   if (user instanceof NextResponse) return user
 *   // 이후 user 는 인증된 User 로 좁혀진다.
 */

/** 401 응답 (미인증). */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/** 403 응답 (권한 없음). */
export function forbidden(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** 인증된 사용자를 반환하거나, 미인증 시 401 NextResponse 를 반환한다. */
export async function requireUser(req: NextRequest): Promise<User | NextResponse> {
  const user = await verifyJWT(req)
  return user ?? unauthorized()
}

/** 관리자를 반환하거나, 비관리자/미인증 시 403 NextResponse 를 반환한다. */
export async function requireAdmin(req: NextRequest): Promise<User | NextResponse> {
  const admin = await verifyAdmin(req)
  return admin ?? forbidden()
}
