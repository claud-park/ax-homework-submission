# Obsidian Session Sync MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a champion or (mostly) an admin, from their own local Claude Code/Desktop, sync 1-on-1 session notes and action items between their local Obsidian vault and this app's `check_up_sessions`/`session_action_items` tables via an MCP server, with a distinct admin-scoped access token since admins need to read/write other champions' sessions.

**Architecture:** A new MCP HTTP endpoint (`app/api/mcp/route.ts`, using the `mcp-handler` package) hosted inside this same Next.js app, reusing existing `lib/sessions/access.ts` (`resolveSessionRole`) and `lib/sessions/permissions.ts` (field whitelists) for authorization exactly as the existing REST session routes already do. Authentication reuses and extends the `personal_access_tokens`/`device_pairing_codes` pairing system from the `champion-milestone-sync` feature (PR #62) with a new `scope` column (`'champion' | 'admin'`) and a new `admt_`-prefixed token type that — unlike the existing `amst_` champion PAT, which is deliberately never admin — resolves to an authenticated identity with `is_admin: true`.

**Tech Stack:** Next.js 14 App Router API routes, `mcp-handler` (new dependency) + `zod` (already a dependency) for the MCP server, Supabase service-role client.

## Global Constraints

- Reuse `resolveSessionRole`/`allowedSessionUpdateFields`/`allowedActionItemUpdateFields` from `lib/sessions/access.ts`/`lib/sessions/permissions.ts` for every session/action-item read or write in the new MCP tools — do not reimplement this authorization logic.
- The champion PAT (`amst_`) must continue to NEVER resolve to `is_admin: true` — this task extends the auth system with a second, distinct token type, it does not loosen the first.
- `sync_action_items` never deletes an action item — items missing from an incoming batch are left untouched, not removed. Deletion stays a manual, website-only action.
- No automated test coverage exists for API routes in this repo (only pure `lib/` functions and select interactive components get tests — see `test/lib/pairing-tokens.test.ts` and `test/components/MilestoneActivityLogToggle.test.tsx` for the two conventions). Follow that: new pure-logic helpers get Vitest tests; route/MCP-tool handlers get typecheck + manual/hand-trace verification, documented explicitly per task.
- This worktree has no live Supabase project (no `.env.local`) — same constraint as every prior feature in this repo. Do not attempt to apply the migration or run a dev server against a real database; verify via typecheck/lint/hand-tracing and defer live verification to the human owner, documented explicitly at the end.
- Package manager is `bun`.

---

### Task 1: Migration + `lib/auth.ts` admin PAT support

**Files:**
- Create: `supabase/migrations/20260808000000_admin_pat_scope.sql`
- Modify: `lib/auth.ts`

**Interfaces:**
- Produces: `verifyJWT` now also resolves `admt_`-prefixed tokens to a `User` with `app_metadata.is_admin === true`. `isPatBearer` now recognizes both `amst_` and `admt_` prefixes. No signature changes — every existing caller keeps working unmodified.

- [ ] **Step 1: Write the migration**

```sql
-- 20260808000000_admin_pat_scope.sql
-- 어드민이 로컬에서 다른 챔피언의 1-on-1 세션 데이터를 읽고 쓸 수 있도록,
-- 기존 PAT(항상 non-admin)와 구분되는 관리자 스코프 PAT를 추가한다.

ALTER TABLE personal_access_tokens
  ADD COLUMN scope text NOT NULL DEFAULT 'champion' CHECK (scope IN ('champion', 'admin'));

ALTER TABLE device_pairing_codes
  ADD COLUMN scope text NOT NULL DEFAULT 'champion' CHECK (scope IN ('champion', 'admin'));

COMMENT ON COLUMN personal_access_tokens.scope IS '챔피언용(amst_, 절대 관리자 권한 없음) 또는 관리자용(admt_, is_admin=true로 해석됨)';
COMMENT ON COLUMN device_pairing_codes.scope IS '이 페어링 코드로 발급될 토큰의 scope — approve 시 admin이면 승인자가 실제 관리자인지 검증';
```

- [ ] **Step 2: Add an admin token generator to `lib/pairing-tokens.ts`**

Read the current file first. Add this new export alongside the existing `generatePersonalAccessToken`:

```typescript
export function generateAdminAccessToken(): string {
  return `admt_${randomBytes(32).toString('base64url')}`
}
```

- [ ] **Step 3: Extend `lib/auth.ts`**

Replace the full contents of `lib/auth.ts` with:

```typescript
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
```

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Read the final `lib/auth.ts` and confirm: (a) a champion PAT lookup now explicitly filters `.eq('scope', 'champion')`, so an admin-scope token can never accidentally satisfy the champion path (and vice versa) even if someone guessed a token's hash matched a row of the wrong scope — the scope filter is the second independent gate beyond the prefix check; (b) `verifyAdminAccessToken`'s returned object is the only place in the file that sets `app_metadata.is_admin: true`, and it's a brand new function, not a modification of `verifyPersonalAccessToken`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260808000000_admin_pat_scope.sql lib/auth.ts lib/pairing-tokens.ts
git commit -m "$(cat <<'EOF'
[AX-1] feat(auth): 관리자 스코프 개인 액세스 토큰(admt_) 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Admin-scoped pairing flow

**Files:**
- Modify: `app/api/pairing/request/route.ts`
- Modify: `app/api/pairing/approve/route.ts`
- Modify: `app/(champion)/pairing/page.tsx`

**Interfaces:**
- Consumes: `generateAdminAccessToken` (Task 1), `isAdminUser` (existing, `lib/auth.ts`).
- Produces: `POST /api/pairing/request` now accepts an optional `{scope: 'admin'}` JSON body (defaults to `'champion'` when no body or no `scope` field) and stores it on the created `device_pairing_codes` row. `POST /api/pairing/approve` mints an `admt_` token (instead of `amst_`) when the code's stored scope is `'admin'`, and requires the approving session to be an admin.

- [ ] **Step 1: Modify `app/api/pairing/request/route.ts` to accept and store `scope`**

Read the current file first. Replace the `POST` handler body with:

```typescript
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(`pairing-request:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const body = await req.json().catch(() => ({}))
  const scope = body?.scope === 'admin' ? 'admin' : 'champion'

  const supabase = createServiceClient()

  let code = generatePairingCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from('device_pairing_codes')
      .select('code')
      .eq('code', code)
      .eq('status', 'pending')
      .single()
    if (!existing) break
    code = generatePairingCode()
  }

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  const { error } = await supabase
    .from('device_pairing_codes')
    .insert({ code, status: 'pending', expires_at: expiresAt, scope })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ code, expires_at: expiresAt, scope })
}
```

(This is a request-body change, not a breaking one — existing callers that POST with no body or an empty body still get `scope: 'champion'`, identical to today's behavior.)

- [ ] **Step 2: Modify `app/api/pairing/approve/route.ts` to branch on scope**

Read the current file first. Add the import:

```typescript
import { generatePersonalAccessToken, generateAdminAccessToken, hashToken } from '@/lib/pairing-tokens'
import { isPatBearer, isAdminUser } from '@/lib/auth'
```

Replace the section from the pairing lookup through the token insert (keep the rate-limit check, the `code` parsing, and the final `device_pairing_codes` update exactly as they are) with:

```typescript
  const supabase = createServiceClient()
  const { data: pairing } = await supabase
    .from('device_pairing_codes')
    .select('*')
    .eq('code', code)
    .eq('status', 'pending')
    .single()
  if (!pairing) return NextResponse.json({ error: 'invalid_or_expired_code' }, { status: 404 })

  if (new Date(pairing.expires_at) < new Date()) {
    await supabase.from('device_pairing_codes').update({ status: 'expired' }).eq('code', code)
    return NextResponse.json({ error: 'invalid_or_expired_code' }, { status: 404 })
  }

  if (pairing.scope === 'admin' && !isAdminUser(user)) {
    return NextResponse.json({ error: 'admin_required' }, { status: 403 })
  }

  const token = pairing.scope === 'admin' ? generateAdminAccessToken() : generatePersonalAccessToken()
  const { error: insertError } = await supabase.from('personal_access_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(token),
    scope: pairing.scope,
    label: `Paired ${new Date().toISOString().slice(0, 10)}${pairing.scope === 'admin' ? ' (admin)' : ''}`,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
```

(Everything after this — the `device_pairing_codes` update to `status: 'approved'` and the final `NextResponse.json({ ok: true })` — stays exactly as it is.)

- [ ] **Step 3: Modify `app/(champion)/pairing/page.tsx` to show admin-scope copy**

Read the current file first. In `PairingPageInner`, read `scope` from the search params alongside `code`:

```typescript
  const code = searchParams.get('code') ?? ''
  const scope = searchParams.get('scope') === 'admin' ? 'admin' : 'champion'
```

Update `handleApprove`'s body to pass it through (the approve endpoint doesn't need it — it reads scope from the stored pairing row — but the page needs it for the confirmation copy below), and change the confirmation paragraph:

```typescript
        {code && state !== 'approved' && (
          <>
            <p className="text-flo-body2 mb-2" style={{ color: 'var(--text-secondary)' }}>
              {scope === 'admin'
                ? '내 컴퓨터를 관리자 권한으로 이 계정에 연결할까요?'
                : '내 컴퓨터의 Claude Code 스킬을 이 계정에 연결할까요?'}
            </p>
```

Leave everything else in the file (the code display, the button, the error/approved states) unchanged.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Read the final `approve/route.ts` and confirm: a non-admin champion approving a `scope: 'admin'` pairing code gets a 403 `admin_required` response BEFORE any token is minted or inserted — trace that the `isAdminUser(user)` check happens before the `generateAdminAccessToken()`/`personal_access_tokens.insert()` calls, not after.

- [ ] **Step 6: Commit**

```bash
git add app/api/pairing/request/route.ts app/api/pairing/approve/route.ts "app/(champion)/pairing/page.tsx"
git commit -m "$(cat <<'EOF'
[AX-1] feat(pairing): 페어링 코드 스코프(champion/admin) 분기 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: MCP server scaffold + auth resolution spike

**Files:**
- Create: `app/api/mcp/route.ts`
- Create: `lib/mcp/auth.ts`

**Interfaces:**
- Consumes: `hashToken` (`lib/pairing-tokens.ts`), `createServiceClient` (`lib/supabase/server.ts`).
- Produces: `lib/mcp/auth.ts` exports `type McpIdentity = { userId: string; isAdmin: boolean }` and `getAuthenticatedIdentity(extra: unknown): McpIdentity` — Task 4's tools import and call this to find out who's calling. The exact implementation of `getAuthenticatedIdentity` depends on confirming how `mcp-handler` exposes the verified auth context to a tool handler (see Step 3 below) — this task's job is to nail that down and produce a working, tested version of this one function so Task 4 never has to touch this uncertainty itself.

## Why this task is structured differently

Research into `mcp-handler` (Vercel's official Next.js adapter for MCP servers) turned up two different documented API shapes across sources (an older `server.tool(name, description, zodShape, handler)` form and a newer `server.registerTool(name, {...}, handler)` form) and genuine uncertainty about the exact property path a tool handler uses to read the `AuthInfo` that `withMcpAuth`'s `verifyToken` callback resolved. Rather than guess and risk Task 4 building four tools on a broken foundation, this task installs the real package, reads its actual installed docs/types, and proves the pattern works with one trivial tool before anyone builds on it.

- [ ] **Step 1: Install the dependency**

Run: `bun add mcp-handler`

(`zod` is already a dependency — no need to add it.)

- [ ] **Step 2: Read the installed package's own docs before writing any code**

Run: `cat node_modules/mcp-handler/package.json | grep '"version"'` to see the installed version, then read `node_modules/mcp-handler/README.md` (and `node_modules/mcp-handler/docs/AUTHORIZATION.md` if it exists) in full. Confirm from the installed source of truth (not memory, not a web search) which tool-registration API shape (`server.tool(...)` vs `server.registerTool(...)`) this version actually exposes, and how `withMcpAuth`'s `verifyToken` result reaches a tool handler.

- [ ] **Step 3: Write `lib/mcp/auth.ts`**

Start with this — the `verifyToken` callback logic is correct and final regardless of what Step 2 found (it only depends on the `Request`/`bearerToken` args, which are consistently documented everywhere):

```typescript
// lib/mcp/auth.ts
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
): Promise<{ token: string; clientId: string; scopes: string[]; extra: McpIdentity } | undefined> {
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
 * mcp-handler가 각 tool 핸들러에 전달하는 `extra` 인자에서 verifyMcpToken이
 * 실어보낸 McpIdentity를 꺼낸다. 정확한 접근 경로는 Task 3에서 실제 설치된
 * mcp-handler 버전의 문서/타입을 읽고 확정한다(불확실한 부분이라 자리표시자로
 * 두지 않고, 이 함수 하나에 그 판단을 가둬서 Task 4의 4개 tool이 전부 이 함수
 * 하나만 신뢰하면 되게 만든다).
 */
export function getAuthenticatedIdentity(extra: unknown): McpIdentity {
  // PLACEHOLDER TO REPLACE IN STEP 4 — read node_modules/mcp-handler's own docs/types
  // in Step 2 and implement the real accessor here. Do not leave this thrown error in
  // the final commit.
  throw new Error('getAuthenticatedIdentity: not yet implemented — see Task 3 Step 2/4')
}
```

- [ ] **Step 4: Implement `getAuthenticatedIdentity` for real, using what Step 2 found**

Replace the placeholder body. Base it on whatever `extra`'s actual shape is per the installed package's docs/types (likely something like `extra.authInfo?.extra` or `extra.authInfo?.extra as McpIdentity`, but confirm against the real source — check the type definitions in `node_modules/mcp-handler/dist/**/*.d.ts` if the README isn't conclusive, since TypeScript types are ground truth for what's actually exported). The function must:
- Return the `McpIdentity` when present.
- Throw a clear error (not return a bogus default) if the identity is missing — a missing identity on an authenticated MCP call means something is wrong with the plumbing, not a legitimate "no user" case, and every tool must fail loudly rather than silently act as an unauthenticated/wrong user.

- [ ] **Step 5: Write `app/api/mcp/route.ts` with one spike tool**

Use whichever tool-registration shape Step 2 confirmed. If it's the `server.tool(name, description, zodShape, handler)` form:

```typescript
// app/api/mcp/route.ts
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { verifyMcpToken, getAuthenticatedIdentity } from '@/lib/mcp/auth'

const handler = createMcpHandler((server) => {
  server.tool(
    'whoami',
    'Returns the identity of the authenticated caller (champion or admin) — use this to sanity-check pairing before calling any other tool.',
    {},
    async (_args, extra) => {
      const identity = getAuthenticatedIdentity(extra)
      return {
        content: [{ type: 'text', text: JSON.stringify(identity) }],
      }
    },
  )
})

const authHandler = withMcpAuth(handler, verifyMcpToken, { required: true })

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
```

If Step 2 found the newer `server.registerTool(name, {title, description, inputSchema}, handler)` shape instead, use that form with the equivalent arguments — same tool name, description, and handler body.

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: no new errors. If the installed `mcp-handler` types disagree with what Step 5 wrote (e.g. `withMcpAuth`'s options shape, or `createMcpHandler`'s third options argument), fix the call to match the actual types — the types are ground truth here, more reliable than any doc.

- [ ] **Step 7: Manual verification**

No live server in this worktree — verify by reading, not running: re-read the final `app/api/mcp/route.ts` and `lib/mcp/auth.ts` together and hand-trace the full path from an incoming `Authorization: Bearer admt_...` header to `getAuthenticatedIdentity` returning `{userId, isAdmin: true}` inside the `whoami` handler. Note in your report exactly which property path `getAuthenticatedIdentity` ended up using and why (cite the doc/type file that confirmed it) — Task 4's dispatch will need this confirmed interface.

- [ ] **Step 8: Commit**

```bash
git add app/api/mcp/route.ts lib/mcp/auth.ts package.json bun.lock
git commit -m "$(cat <<'EOF'
[AX-1] feat(mcp): MCP 서버 스캐폴드 + 인증 연동 (whoami 스파이크)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: The four real MCP tools

**Files:**
- Modify: `app/api/mcp/route.ts`

**Interfaces:**
- Consumes: `getAuthenticatedIdentity` (Task 3 — exact usage pattern will be given in this task's dispatch, copied from Task 3's report), `resolveSessionRole`/`SessionRole` (`lib/sessions/access.ts`, existing), `allowedSessionUpdateFields`/`allowedActionItemUpdateFields` (`lib/sessions/permissions.ts`, existing), `createServiceClient` (existing).
- Produces: four tools registered on the same `server` as `whoami` — `list_champions`, `get_session`, `upsert_session`, `sync_action_items`. Exact input/output shapes below.

- [ ] **Step 1: Add `list_champions` (admin-only)**

```typescript
server.tool(
  'list_champions',
  'Lists all champions (id + name) — admin-only. Used once per champion to resolve a name to a user_id, which should then be cached in the Obsidian note so this lookup is not repeated.',
  {},
  async (_args, extra) => {
    const identity = getAuthenticatedIdentity(extra)
    if (!identity.isAdmin) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'admin_required' }) }], isError: true }
    }
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('users')
      .select('id, name')
      .eq('user_group', 'champion')
      .order('name', { ascending: true })
    if (error) return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify(data) }] }
  },
)
```

- [ ] **Step 2: Add `get_session`**

```typescript
server.tool(
  'get_session',
  'Looks up a 1-on-1 session by date. Champions always get their own session; admins must pass champion_user_id (any champion). Returns null if no session exists yet for that date.',
  {
    date: z.string().describe('Session date, YYYY-MM-DD'),
    champion_user_id: z.string().optional().describe('Required for admin callers; ignored for champion callers, who always see their own sessions'),
  },
  async ({ date, champion_user_id }, extra) => {
    const identity = getAuthenticatedIdentity(extra)
    const effectiveChampionId = identity.isAdmin ? champion_user_id : identity.userId
    if (!effectiveChampionId) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'champion_user_id required for admin callers' }) }], isError: true }
    }

    const supabase = createServiceClient()
    const { data: session } = await supabase
      .from('check_up_sessions')
      .select('*')
      .eq('champion_user_id', effectiveChampionId)
      .eq('session_date', date)
      .maybeSingle()
    if (!session) return { content: [{ type: 'text', text: JSON.stringify(null) }] }

    const { data: actionItems } = await supabase
      .from('session_action_items')
      .select('*')
      .eq('session_id', session.id)
      .order('display_order', { ascending: true })

    return {
      content: [{ type: 'text', text: JSON.stringify({ ...session, action_items: actionItems ?? [] }) }],
    }
  },
)
```

- [ ] **Step 3: Add `upsert_session`**

```typescript
server.tool(
  'upsert_session',
  'Creates a session for a champion+date if none exists (admin PAT only — matches the existing site rule that only admins create sessions), or updates title/notes on an existing one (both champion and admin PATs, for their own/any session respectively).',
  {
    champion_user_id: z.string().describe('Required for admin callers; ignored (forced to caller) for champion callers'),
    date: z.string().describe('Session date, YYYY-MM-DD'),
    title: z.string().optional(),
    notes: z.string().optional().describe('Markdown meeting notes'),
  },
  async ({ champion_user_id, date, title, notes }, extra) => {
    const identity = getAuthenticatedIdentity(extra)
    const effectiveChampionId = identity.isAdmin ? champion_user_id : identity.userId
    if (!effectiveChampionId) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'champion_user_id required for admin callers' }) }], isError: true }
    }

    const supabase = createServiceClient()
    const { data: existing } = await supabase
      .from('check_up_sessions')
      .select('*')
      .eq('champion_user_id', effectiveChampionId)
      .eq('session_date', date)
      .maybeSingle()

    if (!existing) {
      if (!identity.isAdmin) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'only admins can create a new session' }) }], isError: true }
      }
      const { data: created, error } = await supabase
        .from('check_up_sessions')
        .insert({
          champion_user_id: effectiveChampionId,
          admin_user_id: identity.userId,
          session_date: date,
          title: title?.trim() || `${date} 1-on-1`,
          notes: notes ?? null,
        })
        .select()
        .single()
      if (error || !created) return { content: [{ type: 'text', text: JSON.stringify({ error: error?.message ?? 'create failed' }) }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(created) }] }
    }

    const role: 'admin' | 'owner' = identity.isAdmin ? 'admin' : 'owner'
    const allowed = allowedSessionUpdateFields(role)
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (allowed.includes('title') && title !== undefined) updates.title = title.trim()
    if (allowed.includes('notes') && notes !== undefined) updates.notes = notes

    const { data: updated, error } = await supabase
      .from('check_up_sessions')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single()
    if (error || !updated) return { content: [{ type: 'text', text: JSON.stringify({ error: error?.message ?? 'update failed' }) }], isError: true }
    return { content: [{ type: 'text', text: JSON.stringify(updated) }] }
  },
)
```

- [ ] **Step 4: Add `sync_action_items`**

```typescript
server.tool(
  'sync_action_items',
  'Batch create/update action items for a session. Items with an id are updated (body, is_completed); items without an id are created and their new id is returned so the caller can write it back into the Obsidian file. Never deletes — items missing from the batch are left untouched.',
  {
    session_id: z.string(),
    items: z.array(
      z.object({
        id: z.string().optional(),
        body: z.string(),
        is_completed: z.boolean(),
      }),
    ),
  },
  async ({ session_id, items }, extra) => {
    const identity = getAuthenticatedIdentity(extra)
    const supabase = createServiceClient()
    const role = await resolveSessionRole(supabase, session_id, { id: identity.userId, app_metadata: { is_admin: identity.isAdmin } })
    if (!role) return { content: [{ type: 'text', text: JSON.stringify({ error: 'forbidden' }) }], isError: true }

    const allowed = allowedActionItemUpdateFields(role)
    const results: Record<string, unknown>[] = []
    const now = new Date().toISOString()

    for (const item of items) {
      if (item.id) {
        const updates: Record<string, unknown> = { updated_at: now }
        if (allowed.includes('body')) updates.body = item.body.trim()
        if (allowed.includes('is_completed')) {
          updates.is_completed = item.is_completed
          updates.completed_at = item.is_completed ? now : null
        }
        const { data, error } = await supabase
          .from('session_action_items')
          .update(updates)
          .eq('id', item.id)
          .eq('session_id', session_id)
          .select()
          .single()
        if (!error && data) results.push(data)
      } else {
        const { data, error } = await supabase
          .from('session_action_items')
          .insert({
            session_id,
            body: item.body.trim(),
            is_completed: item.is_completed,
            completed_at: item.is_completed ? now : null,
            display_order: 0,
          })
          .select()
          .single()
        if (!error && data) results.push(data)
      }
    }

    return { content: [{ type: 'text', text: JSON.stringify(results) }] }
  },
)
```

Add the required imports at the top of `app/api/mcp/route.ts`:

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSessionRole } from '@/lib/sessions/access'
import { allowedSessionUpdateFields, allowedActionItemUpdateFields } from '@/lib/sessions/permissions'
```

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Read the final `app/api/mcp/route.ts` in full and hand-trace: (a) a champion-token call to `get_session`/`upsert_session` with a `champion_user_id` for someone else — confirm `effectiveChampionId` still resolves to `identity.userId` (the caller's own id), never the passed-in value, since `identity.isAdmin` is `false`; (b) a champion-token call to `upsert_session` for a date with no existing session — confirm it returns the `admin_required`-style error rather than silently creating one; (c) `sync_action_items` calling `resolveSessionRole` with a synthesized user object shaped exactly like what that function expects (`{id, app_metadata}`) — confirm the shape matches `lib/sessions/access.ts`'s `AuthUser` type.

- [ ] **Step 7: Commit**

```bash
git add app/api/mcp/route.ts
git commit -m "$(cat <<'EOF'
[AX-1] feat(mcp): list_champions/get_session/upsert_session/sync_action_items 도구 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Admin device management page

**Files:**
- Modify: `app/api/devices/route.ts`
- Create: `app/admin/devices/page.tsx`
- Modify: `app/admin/AdminSidebar.tsx`

**Interfaces:**
- Produces: `GET /api/devices` response now includes `scope` per device (`{devices: [{id, label, last_used_at, created_at, scope}]}`) — additive change, existing champion devices page (which doesn't read `scope`) is unaffected.

- [ ] **Step 1: Add `scope` to `GET /api/devices`'s select**

Read the current file first. Change the `.select(...)` call inside `GET`:

```typescript
    .select('id, label, last_used_at, created_at, scope')
```

(Everything else in the file — the `isPatBearer` guard, `DELETE`, the `user_id` scoping — stays exactly as it is.)

- [ ] **Step 2: Create `app/admin/devices/page.tsx`**

`/admin/*` is already blanket-protected by `middleware.ts` (any non-admin is redirected to `/admin/login`), so no middleware change is needed for this page.

```typescript
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

interface Device {
  id: string
  label: string | null
  last_used_at: string | null
  created_at: string
  scope: 'champion' | 'admin'
}

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { devices } = await apiFetch<{ devices: Device[] }>('/api/devices')
    setDevices(devices)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function revoke(id: string) {
    await apiFetch(`/api/devices?id=${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-flo-h400 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        연결된 기기
      </h1>
      <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
        MCP 도구/Claude Code 스킬이 연결된 기기 목록입니다. 특히 관리자 권한 기기는 다른 챔피언의
        데이터를 읽고 쓸 수 있으니, 더 이상 쓰지 않는 기기는 바로 연결을 해제하세요.
      </p>

      {loading && <p className="text-flo-body2" style={{ color: 'var(--text-secondary)' }}>불러오는 중...</p>}

      {!loading && devices.length === 0 && (
        <p className="text-flo-body2" style={{ color: 'var(--text-secondary)' }}>
          연결된 기기가 없습니다.
        </p>
      )}

      <ul className="space-y-3">
        {devices.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between p-4 rounded-xl border"
            style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-flo-body2 font-medium" style={{ color: 'var(--text-primary)' }}>
                  {d.label ?? '이름 없는 기기'}
                </p>
                {d.scope === 'admin' && (
                  <span
                    className="text-flo-caption1 font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(248,113,113,0.12)', color: 'var(--red-600, #dc2626)' }}
                  >
                    관리자 권한
                  </span>
                )}
              </div>
              <p className="text-flo-caption1" style={{ color: 'var(--text-secondary)' }}>
                마지막 사용: {d.last_used_at ? new Date(d.last_used_at).toLocaleString('ko-KR') : '사용 기록 없음'}
              </p>
            </div>
            <button
              onClick={() => revoke(d.id)}
              className="text-flo-caption1 font-semibold px-3 py-2 rounded-lg"
              style={{ color: 'var(--red-600, #dc2626)' }}
            >
              연결 해제
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Add a nav entry to `app/admin/AdminSidebar.tsx`**

Read the current file first. Add `Smartphone` to the existing `lucide-react` import line (alongside `LayoutDashboard, Layers, AlertTriangle, FileText, BarChart2, LogOut, Menu, X, Users, UserCog, MessageCircle`), and add this entry to the `NAV` array, after the `유저 권한 관리` entry:

```typescript
  { icon: Smartphone,      label: '연결된 기기',   href: '/admin/devices' },
```

- [ ] **Step 4: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 5: Manual verification**

Read the final `app/api/devices/route.ts` and confirm the `.eq('user_id', user.id)` scoping (from the existing `GET`/`DELETE`) is untouched — this task only adds a column to the select, it does not change who can see/revoke what.

- [ ] **Step 6: Commit**

```bash
git add app/api/devices/route.ts app/admin/devices app/admin/AdminSidebar.tsx
git commit -m "$(cat <<'EOF'
[AX-1] feat(admin): 관리자 기기 관리 페이지 추가 (관리자 권한 배지)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun run vitest run`
Expected: all existing tests still pass (this plan adds no new pure-function test surface — everything new here is either a route/MCP-tool handler, per Global Constraints, or a straightforward UI page mirroring an already-tested pattern).

- [ ] **Step 2: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean.

- [ ] **Step 3: Note the pending manual work**

This plan's migration has not been applied to any live database, and the MCP server has never been exercised against a real request — same constraint as every prior feature in this repo (no `.env.local`/live Supabase project in this worktree). Call out explicitly when reporting the branch as ready:
- Apply `supabase/migrations/20260808000000_admin_pat_scope.sql` manually via the Supabase SQL Editor.
- Once deployed, do one real admin pairing round-trip (`POST /api/pairing/request` with `{"scope":"admin"}`, approve as an actual admin account, confirm the resulting token starts with `admt_`) and one real MCP tool call (`whoami`, then `get_session`/`upsert_session` for a real champion) to confirm the whole chain works end-to-end — nothing in this plan could verify that without a live database.
- Document the local MCP client config a champion/admin needs (pointing their Claude Code `.mcp.json` at the deployed `/api/mcp` endpoint with their PAT in the `Authorization` header) — the exact config field names should be verified against current Claude Code MCP documentation at that time, since this plan's research found some uncertainty there too.
