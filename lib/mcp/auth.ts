import type { AuthInfo, ServerContext } from '@modelcontextprotocol/server'
import { createServiceClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/pairing-tokens'

export interface McpIdentity {
  userId: string
  isAdmin: boolean
}

/**
 * mcp-handler의 withMcpAuth verifyToken 콜백. bearerToken 하나만 받아서
 * personal_access_tokens에서 scope(champion/admin)까지 함께 조회해,
 * AuthInfo.extra에 실어 돌려준다 — 실제 신원 판정(McpIdentity)은 이 함수가
 * 전담하고, 이후 각 tool 핸들러는 이 결과를 그대로 신뢰한다(재조회 없음).
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined
  if (!bearerToken.startsWith('amst_') && !bearerToken.startsWith('admt_')) return undefined

  const scope = bearerToken.startsWith('admt_') ? 'admin' : 'champion'
  const supabase = createServiceClient()
  const { data: pat } = await supabase
    .from('personal_access_tokens')
    .select('id, user_id')
    .eq('token_hash', hashToken(bearerToken))
    .eq('scope', scope)
    .is('revoked_at', null)
    .single()
  if (!pat) return undefined

  await supabase
    .from('personal_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', pat.id)

  return {
    token: bearerToken,
    clientId: pat.user_id,
    scopes: [scope],
    extra: { userId: pat.user_id, isAdmin: scope === 'admin' },
  }
}

/**
 * mcp-handler가 각 tool 핸들러에 전달하는 ServerContext(`ctx`)에서
 * verifyMcpToken이 실어보낸 McpIdentity를 꺼낸다.
 *
 * 확인된 접근 경로: `ctx.http?.authInfo?.extra` — @modelcontextprotocol/server
 * (mcp-handler 2.1.0의 peer dependency, 실제 설치 버전 2.0.0) 타입 정의
 * (node_modules/@modelcontextprotocol/server/dist/createMcpHandler-CLhGwQTn.d.mts)의
 * `ServerContext`가 `BaseContext & { http?: { req?, closeSSE?, ... } }`이고
 * `BaseContext.http`가 `{ authInfo?: AuthInfo }`를 정의하므로, 교차 타입 결과
 * `ctx.http`는 `authInfo`와 `req` 등을 모두 갖는다. `AuthInfo.extra`는
 * `Record<string, unknown>` 타입이며, verifyMcpToken이 여기에 McpIdentity를
 * 실어 보낸다. withMcpAuth는 verifyToken이 반환한 AuthInfo를 `req.auth`에
 * 실어 내부 handler로 전달하고, mcp-handler/SDK가 이를 tool 호출 시
 * `ctx.http.authInfo`로 노출한다.
 *
 * 신원 정보가 없으면(플러밍이 깨진 것) 조용히 기본값을 반환하지 않고 즉시 던진다.
 */
export function getAuthenticatedIdentity(ctx: ServerContext): McpIdentity {
  const extra = ctx.http?.authInfo?.extra
  const userId = extra?.userId
  const isAdmin = extra?.isAdmin

  if (typeof userId !== 'string' || typeof isAdmin !== 'boolean') {
    throw new Error(
      'getAuthenticatedIdentity: no verified identity on ctx.http.authInfo.extra — ' +
        'withMcpAuth의 verifyToken이 실행되지 않았거나 플러밍이 깨진 상태입니다.',
    )
  }

  return { userId, isAdmin }
}
