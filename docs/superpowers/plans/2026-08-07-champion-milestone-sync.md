# Champion Milestone Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a champion sync milestone progress + a dated work note to ax-homework-submission from a Claude Code skill running in their own (unrelated) project, authenticated via a short pairing code instead of any manual credential handling.

**Architecture:** A lightweight pairing-code flow issues a long-lived personal access token (PAT) bound to a champion's `user_id`; the existing Supabase-JWT auth guard (`lib/auth.ts` → `requireUser`) is extended to also accept these PATs, so all existing milestone routes work unchanged. A new `POST /api/milestones/[id]/log` endpoint appends a dated activity-log row and optionally flips the same `is_manual_progress`/`is_manual_completed` flags the website UI already uses. A standalone skill package (source lives in this repo, distributed later via the internal skill hub — out of scope here) drives the whole flow conversationally from inside the champion's own Claude Code session.

**Tech Stack:** Next.js App Router API routes, Supabase (Postgres + `service_role` client), Node `crypto` (no new npm dependencies), Vitest for pure-function unit tests, a dependency-free Node script (`fetch`/`crypto` only) as the skill's HTTP client.

## Global Constraints

- No new npm/pip dependencies — use Node built-ins (`crypto`, global `fetch`) everywhere, matching the rest of `lib/`.
- PATs are stored as `sha256` hash only; the plaintext token is returned to the client exactly once (pairing approval → poll response → local config file) and never persisted anywhere in plaintext.
- Every new route follows the existing `requireUser`/`createServiceClient` pattern from `lib/api/guard.ts` and `lib/supabase/server.ts` — no bespoke auth.
- This repo has no automated route-level tests today (only pure `lib/` functions are unit tested — see `test/lib/*`). Follow that convention: pure logic gets a Vitest test; DB-touching route handlers get a documented manual `curl` verification instead of new test infrastructure.
- Migrations in this repo are applied manually via the Supabase SQL Editor (no `supabase db push` automation exists) — write the migration file, do not attempt to apply it against any live database.
- The skill's API base URL is never hardcoded — it's read from `AX_MILESTONE_SYNC_API_URL`, and the skill fails with a clear message if it's unset. (The production domain isn't available in this codebase's source of truth; guessing one would silently ship a broken skill.)
- Registering the skill on the Dreamus internal skill hub is explicitly out of scope for this plan (see spec §7).

---

### Task 1: Migration — pairing + PAT + activity log tables

**Files:**
- Create: `supabase/migrations/20260807000000_champion_milestone_sync.sql`

**Interfaces:**
- Produces: tables `device_pairing_codes(code, user_id, status, issued_token, created_at, expires_at)`, `personal_access_tokens(id, user_id, token_hash, label, last_used_at, created_at, revoked_at)`, `milestone_activity_log(id, milestone_id, user_id, log_date, note, created_at)` — every later task's SQL references these exact column names.

- [ ] **Step 1: Write the migration file**

```sql
-- 20260807000000_champion_milestone_sync.sql
-- 챔피언 마일스톤 동기화 스킬: 페어링 코드 / 개인 액세스 토큰 / 마일스톤 작업 로그

CREATE TABLE device_pairing_codes (
  code text PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'expired')),
  issued_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE personal_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users,
  token_hash text NOT NULL UNIQUE,
  label text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX personal_access_tokens_user_id_idx ON personal_access_tokens(user_id) WHERE revoked_at IS NULL;

CREATE TABLE milestone_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES milestones ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX milestone_activity_log_milestone_id_idx ON milestone_activity_log(milestone_id);

COMMENT ON TABLE device_pairing_codes IS '로컬 Claude Code 스킬 페어링용 단명 코드 (TTL ~10분)';
COMMENT ON TABLE personal_access_tokens IS '챔피언별 장기 API 토큰 (해시만 저장, 평문은 발급 시 1회만 노출)';
COMMENT ON TABLE milestone_activity_log IS '챔피언 마일스톤 동기화 스킬이 남기는 날짜별 작업 로그';
```

- [ ] **Step 2: Verify SQL syntax**

Run: `supabase db lint --schema public 2>&1 | grep champion_milestone_sync || echo "no lint errors reported for this file"`
Expected: no fatal syntax errors reported for the new file. (This does not apply the migration — nothing is written to any live database.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260807000000_champion_milestone_sync.sql
git commit -m "$(cat <<'EOF'
[AX-1] feat(db): 챔피언 마일스톤 동기화용 페어링/토큰/로그 테이블 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

Note in the PR description (added later, in the final task) that this migration still needs to be run manually in the Supabase SQL Editor before the feature works end-to-end — same as every other migration in this repo.

---

### Task 2: `lib/pairing-tokens.ts` — code/token generation and hashing

**Files:**
- Create: `lib/pairing-tokens.ts`
- Test: `test/lib/pairing-tokens.test.ts`

**Interfaces:**
- Produces: `generatePairingCode(): string` (6 chars, uppercase, from a 33-char unambiguous alphabet), `generatePersonalAccessToken(): string` (starts with `amst_`), `hashToken(token: string): string` (hex sha256, deterministic) — Task 4 (auth.ts) and Task 6 (pairing routes) import all three.

- [ ] **Step 1: Write the failing tests**

```typescript
// test/lib/pairing-tokens.test.ts
import { describe, it, expect } from 'vitest'
import { generatePairingCode, generatePersonalAccessToken, hashToken } from '@/lib/pairing-tokens'

describe('generatePairingCode', () => {
  it('returns a 6-character uppercase code from the unambiguous alphabet', () => {
    const code = generatePairingCode()
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('does not contain ambiguous characters (0/O, 1/I/L)', () => {
    const code = generatePairingCode()
    expect(code).not.toMatch(/[01IOL]/)
  })

  it('generates different codes across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generatePairingCode()))
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('generatePersonalAccessToken', () => {
  it('starts with the amst_ prefix', () => {
    expect(generatePersonalAccessToken()).toMatch(/^amst_/)
  })

  it('generates a token with at least 32 characters after the prefix', () => {
    const token = generatePersonalAccessToken()
    expect(token.slice('amst_'.length).length).toBeGreaterThanOrEqual(32)
  })

  it('generates different tokens across calls', () => {
    expect(generatePersonalAccessToken()).not.toBe(generatePersonalAccessToken())
  })
})

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashToken('amst_abc')).toBe(hashToken('amst_abc'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashToken('amst_abc')).not.toBe(hashToken('amst_xyz'))
  })

  it('returns a 64-character hex string (sha256)', () => {
    expect(hashToken('amst_abc')).toMatch(/^[0-9a-f]{64}$/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run vitest run test/lib/pairing-tokens.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pairing-tokens'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/pairing-tokens.ts
import { randomBytes, createHash } from 'crypto'

// 0/O, 1/I/L 등 헷갈리는 문자를 뺀 33자 알파벳 — 챔피언이 화면에서 손으로 옮겨 적어도 오타가 잘 안 남
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function generatePairingCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join('')
}

export function generatePersonalAccessToken(): string {
  return `amst_${randomBytes(32).toString('base64url')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run vitest run test/lib/pairing-tokens.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/pairing-tokens.ts test/lib/pairing-tokens.test.ts
git commit -m "$(cat <<'EOF'
[AX-1] feat(auth): 페어링 코드/PAT 생성 및 해싱 유틸 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `lib/safe-redirect.ts` — open-redirect-safe `next` path sanitizer

**Files:**
- Create: `lib/safe-redirect.ts`
- Test: `test/lib/safe-redirect.test.ts`

**Interfaces:**
- Produces: `sanitizeRedirectPath(next: string | null | undefined): string` — always returns a same-origin relative path starting with a single `/`, defaulting to `/`. Task 5 (login/callback) imports this.

- [ ] **Step 1: Write the failing tests**

```typescript
// test/lib/safe-redirect.test.ts
import { describe, it, expect } from 'vitest'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

describe('sanitizeRedirectPath', () => {
  it('returns "/" for null', () => {
    expect(sanitizeRedirectPath(null)).toBe('/')
  })

  it('returns "/" for undefined', () => {
    expect(sanitizeRedirectPath(undefined)).toBe('/')
  })

  it('returns "/" for an empty string', () => {
    expect(sanitizeRedirectPath('')).toBe('/')
  })

  it('passes through a same-origin path with a query string', () => {
    expect(sanitizeRedirectPath('/pairing?code=7X4K9P')).toBe('/pairing?code=7X4K9P')
  })

  it('rejects protocol-relative URLs (open-redirect via //)', () => {
    expect(sanitizeRedirectPath('//evil.com')).toBe('/')
  })

  it('rejects absolute URLs to other hosts', () => {
    expect(sanitizeRedirectPath('https://evil.com')).toBe('/')
  })

  it('rejects paths not starting with /', () => {
    expect(sanitizeRedirectPath('javascript:alert(1)')).toBe('/')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run vitest run test/lib/safe-redirect.test.ts`
Expected: FAIL — `Cannot find module '@/lib/safe-redirect'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/safe-redirect.ts

/**
 * 로그인 전 `next` 쿼리 파라미터는 인증 전 사용자가 임의로 넣을 수 있으므로,
 * 같은 오리진의 상대 경로("/xxx")만 허용하고 그 외(//evil.com, https://evil.com,
 * javascript: 등)는 전부 "/"로 되돌려 open redirect를 막는다.
 */
export function sanitizeRedirectPath(next: string | null | undefined): string {
  if (!next) return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run vitest run test/lib/safe-redirect.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/safe-redirect.ts test/lib/safe-redirect.test.ts
git commit -m "$(cat <<'EOF'
[AX-1] feat(auth): 로그인 next 파라미터 open-redirect 방지 유틸 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Extend `lib/auth.ts` to accept personal access tokens

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- Consumes: `hashToken` from `lib/pairing-tokens.ts` (Task 2), `createServiceClient` from `lib/supabase/server.ts`, table `personal_access_tokens` from Task 1.
- Produces: `verifyJWT(req)` now also resolves PATs — no signature change, so every existing caller (`requireUser`, `requireAdmin`, every route using them) keeps working unmodified.

- [ ] **Step 1: Modify `verifyJWT` to fall back to PAT lookup**

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
    .is('revoked_at', null)
    .single()
  if (!pat) return null

  await supabase
    .from('personal_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', pat.id)

  // PAT는 웹 로그인 세션이 아니므로 app_metadata/user_metadata가 없다 —
  // isAdminUser()는 app_metadata.is_admin만 신뢰하므로 PAT는 절대 관리자 권한을 얻지 않는다.
  return { id: pat.user_id, app_metadata: {}, user_metadata: {} } as User
}

export async function verifyJWT(req: NextRequest): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  if (token.startsWith('amst_')) return verifyPersonalAccessToken(token)
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
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no new errors from `lib/auth.ts`

- [ ] **Step 3: Manual verification (this repo has no route-level test harness — see Global Constraints)**

This can't be fully exercised until Task 1's migration is applied and Task 6's pairing endpoints exist to mint a real PAT. Defer the actual `curl` check to the end of Task 6, Step 4 — note that dependency here so it isn't skipped.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts
git commit -m "$(cat <<'EOF'
[AX-1] feat(auth): verifyJWT 에 개인 액세스 토큰(PAT) 폴백 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `next`-redirect support in the login flow

**Why this is needed:** the pairing page (Task 7) must survive an unauthenticated champion being bounced through Google login and back — today `app/auth/callback/route.ts` always redirects to `/`, dropping the `?code=` the pairing page needs. This task adds optional `next` pass-through with no change to today's default behavior (no `next` param → same as now).

**Files:**
- Modify: `middleware.ts`
- Modify: `app/login/page.tsx`
- Modify: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `sanitizeRedirectPath` from `lib/safe-redirect.ts` (Task 3).

- [ ] **Step 1: Modify `middleware.ts` to attach `next` when bouncing to `/login`**

In `middleware.ts`, find:

```typescript
  const isChampionRoute = championRoutes.some(r => path === r || path.startsWith(r + '/'))
  if (isChampionRoute && !user)
    return NextResponse.redirect(new URL('/login', request.url))
```

Replace with:

```typescript
  const isChampionRoute = championRoutes.some(r => path === r || path.startsWith(r + '/'))
  if (isChampionRoute && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }
```

- [ ] **Step 2: Modify `app/login/page.tsx` to read and forward `next`**

Replace the top of the file:

```typescript
'use client'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient()

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }
```

with:

```typescript
'use client'
import { useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient()
  const searchParams = useSearchParams()

  async function handleGoogleLogin() {
    const next = searchParams.get('next') ?? '/'
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
  }
```

Leave the rest of the file (JSX) untouched.

- [ ] **Step 3: Modify `app/auth/callback/route.ts` to redirect to `next` instead of always `/`**

Add the import and read `next` near the top:

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { sanitizeRedirectPath } from '@/lib/safe-redirect'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const host = request.headers.get('host') ?? new URL(request.url).host
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`
  const code = searchParams.get('code')
  const next = sanitizeRedirectPath(searchParams.get('next'))
  if (!code) return NextResponse.redirect(`${origin}/login?error=no_code`)

  const response = NextResponse.redirect(`${origin}${next}`)
```

(Only the `response` line's redirect target changes, from `` `${origin}/` `` to `` `${origin}${next}` ``; everything else in the file — the cookie-writing Supabase client, the `exchangeCodeForSession` call, the `users` upsert — stays exactly as-is.)

- [ ] **Step 4: Typecheck and build**

Run: `bun run typecheck && bun run build`
Expected: both succeed with no new errors. (`useSearchParams` in a plain page component can require a `<Suspense>` boundary in some Next.js versions — if the build warns or fails about this, wrap the existing return value of `LoginPage` in `<Suspense fallback={null}>...</Suspense>` and re-run the build.)

- [ ] **Step 5: Manual verification**

Run: `bun run dev`, then in a browser, visit `http://localhost:3000/pairing?code=TEST12` while logged out (the `/pairing` route doesn't exist yet, but the redirect chain can already be checked against any champion route, e.g. `http://localhost:3000/my-project?foo=bar`).
Expected: redirected to `/login?next=%2Fmy-project%3Ffoo%3Dbar`; after completing Google login, land back on `/my-project?foo=bar` (not `/`).

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/login/page.tsx app/auth/callback/route.ts
git commit -m "$(cat <<'EOF'
[AX-1] feat(auth): 로그인 리다이렉트에 next 파라미터 지원 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Pairing API endpoints

**Files:**
- Create: `app/api/pairing/request/route.ts`
- Create: `app/api/pairing/approve/route.ts`
- Create: `app/api/pairing/poll/route.ts`

**Interfaces:**
- Consumes: `generatePairingCode`, `generatePersonalAccessToken`, `hashToken` (Task 2), `requireUser` (`lib/api/guard.ts`), `createServiceClient` (`lib/supabase/server.ts`), tables from Task 1.
- Produces: `POST /api/pairing/request` → `{code, expires_at}`; `POST /api/pairing/approve` (authenticated, body `{code}`) → `{ok: true}`; `GET /api/pairing/poll?code=` → `{status: 'pending'|'approved'|'expired', token?}`. Task 7 (pairing page) and Task 10 (skill script) both call these by exact path/shape.

- [ ] **Step 1: Write `app/api/pairing/request/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePairingCode } from '@/lib/pairing-tokens'

const TTL_MS = 10 * 60 * 1000

export async function POST(_req: NextRequest) {
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
    .insert({ code, status: 'pending', expires_at: expiresAt })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ code, expires_at: expiresAt })
}
```

- [ ] **Step 2: Write `app/api/pairing/approve/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePersonalAccessToken, hashToken } from '@/lib/pairing-tokens'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const body = await req.json()
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : ''
  if (!code) return NextResponse.json({ error: 'validation_failed' }, { status: 400 })

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

  const token = generatePersonalAccessToken()
  const { error: insertError } = await supabase.from('personal_access_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(token),
    label: `Paired ${new Date().toISOString().slice(0, 10)}`,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const { error: updateError } = await supabase
    .from('device_pairing_codes')
    .update({ status: 'approved', user_id: user.id, issued_token: token })
    .eq('code', code)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Write `app/api/pairing/poll/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'validation_failed' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: pairing } = await supabase
    .from('device_pairing_codes')
    .select('*')
    .eq('code', code)
    .single()
  if (!pairing) return NextResponse.json({ status: 'expired' })

  if (pairing.status === 'pending' && new Date(pairing.expires_at) < new Date()) {
    await supabase.from('device_pairing_codes').update({ status: 'expired' }).eq('code', code)
    return NextResponse.json({ status: 'expired' })
  }

  if (pairing.status !== 'approved') return NextResponse.json({ status: pairing.status })
  if (!pairing.issued_token) return NextResponse.json({ status: 'expired' })

  const token = pairing.issued_token
  await supabase.from('device_pairing_codes').update({ issued_token: null }).eq('code', code)
  return NextResponse.json({ status: 'approved', token })
}
```

- [ ] **Step 4: Typecheck, then apply Task 1's migration to the local dev database and verify the full round trip manually**

Run: `bun run typecheck`
Expected: no new errors.

Then (this is the first point where Task 1's migration must actually be applied — run its SQL in the Supabase SQL Editor for the dev project before continuing), run: `bun run dev`, and in another terminal:

```bash
# 1. Request a code
curl -s -X POST http://localhost:3000/api/pairing/request | tee /tmp/pairing.json
# Expected: {"code":"XXXXXX","expires_at":"..."}

# 2. Poll before approval
CODE=$(node -e "console.log(require('/tmp/pairing.json').code)")
curl -s "http://localhost:3000/api/pairing/poll?code=$CODE"
# Expected: {"status":"pending"}

# 3. Approve (replace <SUPABASE_JWT> with a real access token from a logged-in browser session's
#    localStorage sb-*-auth-token, obtained once for this manual check)
curl -s -X POST http://localhost:3000/api/pairing/approve \
  -H "Authorization: Bearer <SUPABASE_JWT>" -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE\"}"
# Expected: {"ok":true}

# 4. Poll again — should now return the PAT once
curl -s "http://localhost:3000/api/pairing/poll?code=$CODE"
# Expected: {"status":"approved","token":"amst_..."}

# 5. Poll a third time — token must not be replayable
curl -s "http://localhost:3000/api/pairing/poll?code=$CODE"
# Expected: {"status":"expired"}

# 6. Use the PAT from step 4 against an existing route to confirm Task 4's auth fallback works
curl -s http://localhost:3000/api/milestones -H "Authorization: Bearer amst_..."
# Expected: 200 with the same champion's milestones (not 401)
```

- [ ] **Step 5: Commit**

```bash
git add app/api/pairing
git commit -m "$(cat <<'EOF'
[AX-1] feat(pairing): 페어링 코드 발급/승인/폴링 API 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Pairing confirmation page

**Files:**
- Create: `app/(champion)/pairing/page.tsx`
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `apiFetch` from `lib/api-client.ts` (existing — attaches the logged-in champion's Supabase session Bearer token automatically), `POST /api/pairing/approve` (Task 6).

- [ ] **Step 1: Add `/pairing` to the protected champion routes in `middleware.ts`**

Find:

```typescript
  const championRoutes = ['/', '/my-project', '/homework', '/charter', '/milestones', '/progress']
```

Replace with:

```typescript
  const championRoutes = ['/', '/my-project', '/homework', '/charter', '/milestones', '/progress', '/pairing']
```

- [ ] **Step 2: Write the pairing page**

```typescript
// app/(champion)/pairing/page.tsx
'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'

type ApproveState = 'idle' | 'approving' | 'approved' | 'error'

export default function PairingPage() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code') ?? ''
  const [state, setState] = useState<ApproveState>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleApprove() {
    setState('approving')
    setMessage(null)
    try {
      await apiFetch('/api/pairing/approve', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setState('approved')
    } catch (err) {
      setState('error')
      setMessage(err instanceof Error ? err.message : 'API error')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'hsl(var(--background))' }}
    >
      <div
        className="w-full max-w-[360px] p-10 rounded-3xl border text-center"
        style={{
          background: 'var(--surface-primary)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-l)',
        }}
      >
        <h1 className="text-flo-h400 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          기기 연결
        </h1>

        {!code && (
          <p className="text-flo-body2 mt-4" style={{ color: 'var(--text-secondary)' }}>
            연결 코드가 없습니다. Claude Code 스킬이 알려준 링크로 다시 접속해주세요.
          </p>
        )}

        {code && state !== 'approved' && (
          <>
            <p className="text-flo-body2 mb-2" style={{ color: 'var(--text-secondary)' }}>
              내 컴퓨터의 Claude Code 스킬을 이 계정에 연결할까요?
            </p>
            <p
              className="text-flo-h300 font-mono font-semibold mb-6 tracking-widest"
              style={{ color: 'var(--accent)' }}
            >
              {code}
            </p>
            <button
              onClick={handleApprove}
              disabled={state === 'approving'}
              className="w-full flex items-center justify-center rounded-xl text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ height: 48, background: 'var(--accent)' }}
            >
              {state === 'approving' ? '연결 중...' : '이 기기 연결하기'}
            </button>
            {message && (
              <p className="text-flo-caption1 mt-4" style={{ color: 'var(--red-600, #dc2626)' }}>
                연결에 실패했습니다: {message}
              </p>
            )}
          </>
        )}

        {state === 'approved' && (
          <p className="text-flo-body2 mt-4" style={{ color: 'var(--text-secondary)' }}>
            연결되었습니다. 터미널로 돌아가주세요 — 곧 자동으로 이어집니다.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck and build**

Run: `bun run typecheck && bun run build`
Expected: both succeed. If the build complains about `useSearchParams` needing a `<Suspense>` boundary, wrap the returned JSX in `<Suspense fallback={null}>...</Suspense>` and re-run.

- [ ] **Step 4: Manual verification**

Run: `bun run dev`, request a code via `curl -s -X POST http://localhost:3000/api/pairing/request`, then visit `http://localhost:3000/pairing?code=<that code>` in a browser while logged in as a champion.
Expected: sees the code + "이 기기 연결하기" button; clicking it shows "연결되었습니다"; a subsequent `curl "http://localhost:3000/api/pairing/poll?code=<code>"` returns `{"status":"approved","token":"amst_..."}`.

- [ ] **Step 5: Commit**

```bash
git add "app/(champion)/pairing/page.tsx" middleware.ts
git commit -m "$(cat <<'EOF'
[AX-1] feat(pairing): 페어링 승인 페이지 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Milestone activity log endpoint

**Files:**
- Create: `app/api/milestones/[id]/log/route.ts`

**Interfaces:**
- Consumes: `requireUser` (`lib/api/guard.ts`), `createServiceClient` (`lib/supabase/server.ts`), `notifyMilestoneCompleted` (`lib/notifications.ts`), types `MilestoneStatus`/`User` (`lib/types.ts`), table `milestone_activity_log` (Task 1).
- Produces: `POST /api/milestones/[id]/log` with body `{note: string, log_date?: string, mark_in_progress?: boolean, mark_completed?: boolean}` → `{log, milestone}`. Task 10 (skill script) calls this exact shape.

- [ ] **Step 1: Write the route**

```typescript
// app/api/milestones/[id]/log/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyMilestoneCompleted } from '@/lib/notifications'
import type { MilestoneStatus, User } from '@/lib/types'

function computeStatus(milestone: {
  due_date: string | null
  is_manual_progress: boolean
  is_manual_completed: boolean
  bottleneck_type: string | null
}): MilestoneStatus {
  if (milestone.is_manual_completed) return 'completed'
  if (milestone.bottleneck_type) return 'delayed'
  if (milestone.is_manual_progress) return 'in_progress'
  if (milestone.due_date && new Date(milestone.due_date) < new Date()) return 'delayed'
  return 'not_started'
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const body = await req.json()
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  if (!note) {
    return NextResponse.json(
      { error: 'validation_failed', fields: [{ field: 'note', message: '필수 항목입니다.' }] },
      { status: 400 },
    )
  }
  const logDate = typeof body.log_date === 'string' ? body.log_date : new Date().toISOString().slice(0, 10)
  const markInProgress = body.mark_in_progress === true
  const markCompleted = body.mark_completed === true

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('milestones')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Charter approval guard — same rule as the website's PATCH /api/milestones/[id]
  if (markInProgress && !existing.is_manual_progress) {
    const { count } = await supabase
      .from('charter_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('admin_approved_at', 'is', null)
    if (!count || count === 0) {
      return NextResponse.json({ error: 'charter_not_approved' }, { status: 403 })
    }
  }

  const { data: logEntry, error: logError } = await supabase
    .from('milestone_activity_log')
    .insert({ milestone_id: params.id, user_id: user.id, log_date: logDate, note })
    .select()
    .single()
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 })

  if (!markInProgress && !markCompleted) {
    return NextResponse.json({ log: logEntry, milestone: existing })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (markInProgress) patch.is_manual_progress = true
  if (markCompleted) patch.is_manual_completed = true
  const merged = { ...existing, ...patch }
  patch.status = computeStatus(merged as Parameters<typeof computeStatus>[0])

  const { data: updated, error: updateError } = await supabase
    .from('milestones')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  if (markCompleted && !existing.is_manual_completed) {
    const notifUser: User = {
      id: user.id,
      email: user.email ?? '',
      name: user.user_metadata?.name ?? user.email ?? '',
      avatar_url: user.user_metadata?.avatar_url ?? null,
      created_at: user.created_at,
    }
    notifyMilestoneCompleted({ user: notifUser, milestone: updated }).catch(console.error)
  }

  return NextResponse.json({ log: logEntry, milestone: updated })
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Using a PAT obtained via Task 6/7's flow:

```bash
curl -s -X POST http://localhost:3000/api/milestones/<a real milestone id for that champion>/log \
  -H "Authorization: Bearer amst_..." -H "Content-Type: application/json" \
  -d '{"note":"ModuSign 연동 에러 핸들링 보완","mark_in_progress":true}'
# Expected: 200, {"log":{...,"note":"ModuSign 연동 에러 핸들링 보완"},"milestone":{...,"is_manual_progress":true,"status":"in_progress"}}
```

Confirm the same milestone's `status` also updates to `in_progress` when viewed at `http://localhost:3000/my-project/milestones` in the browser.

- [ ] **Step 4: Commit**

```bash
git add "app/api/milestones/[id]/log"
git commit -m "$(cat <<'EOF'
[AX-1] feat(milestones): 스킬용 작업 로그 기록 API 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Connected-devices list + revoke

**Files:**
- Create: `app/api/devices/route.ts`
- Create: `app/(champion)/my-project/devices/page.tsx`

**Interfaces:**
- Consumes: `requireUser`, `createServiceClient`, table `personal_access_tokens` (Task 1), `apiFetch` (`lib/api-client.ts`).
- Produces: `GET /api/devices` → `{devices: [{id, label, last_used_at, created_at}]}`; `DELETE /api/devices?id=` → `{ok: true}`.

- [ ] **Step 1: Write the API route**

```typescript
// app/api/devices/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .select('id, label, last_used_at, created_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ devices: data })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'validation_failed' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('personal_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write the settings page**

```typescript
// app/(champion)/my-project/devices/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

interface Device {
  id: string
  label: string | null
  last_used_at: string | null
  created_at: string
}

export default function DevicesPage() {
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
        Claude Code 마일스톤 동기화 스킬이 연결된 기기 목록입니다. 더 이상 쓰지 않는 기기는 연결을
        해제하세요.
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
              <p className="text-flo-body2 font-medium" style={{ color: 'var(--text-primary)' }}>
                {d.label ?? '이름 없는 기기'}
              </p>
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

- [ ] **Step 3: Typecheck and build**

Run: `bun run typecheck && bun run build`
Expected: both succeed.

- [ ] **Step 4: Manual verification**

With a champion paired via Task 6/7, visit `http://localhost:3000/my-project/devices`.
Expected: the paired device is listed with its label and "연결 해제" button; clicking it removes it from the list and a subsequent `curl` using that PAT against `/api/milestones` returns 401.

- [ ] **Step 5: Commit**

```bash
git add app/api/devices "app/(champion)/my-project/devices"
git commit -m "$(cat <<'EOF'
[AX-1] feat(devices): 연결된 기기 목록/해제 UI 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The `champion-milestone-sync` skill artifact

**Files:**
- Create: `skills/champion-milestone-sync/SKILL.md`
- Create: `skills/champion-milestone-sync/scripts/pairing-client.mjs`

**Interfaces:**
- Consumes: `POST /api/pairing/request`, `GET /api/pairing/poll`, `GET /api/milestones`, `POST /api/milestones/[id]/log` (Tasks 6 and 8).
- Produces: a CLI the SKILL.md instructs the agent to shell out to — `node pairing-client.mjs ensure-paired`, `node pairing-client.mjs list-milestones`, `node pairing-client.mjs log-milestone <id> <note> [--date=YYYY-MM-DD] [--in-progress] [--complete]`.

- [ ] **Step 1: Write the HTTP/pairing client script**

```javascript
#!/usr/bin/env node
// skills/champion-milestone-sync/scripts/pairing-client.mjs
//
// Dependency-free Node client for the ax-homework-submission pairing + milestone-log API.
// Requires Node 18+ (global fetch) and the AX_MILESTONE_SYNC_API_URL env var.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_DIR = join(homedir(), '.ax-milestone-sync')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')
const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

function apiUrl() {
  const url = process.env.AX_MILESTONE_SYNC_API_URL
  if (!url) {
    console.error(
      'AX_MILESTONE_SYNC_API_URL 환경변수가 설정되어 있지 않습니다. ax-homework-submission 배포 주소를 설정해주세요.',
    )
    process.exit(1)
  }
  return url.replace(/\/$/, '')
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
  } catch {
    return null
  }
}

function saveConfig(config) {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestPairingCode() {
  const res = await fetch(`${apiUrl()}/api/pairing/request`, { method: 'POST' })
  if (!res.ok) throw new Error(`pairing request failed: ${res.status}`)
  return res.json()
}

async function pollPairing(code, deadline) {
  while (Date.now() < deadline) {
    const res = await fetch(`${apiUrl()}/api/pairing/poll?code=${encodeURIComponent(code)}`)
    const body = await res.json()
    if (body.status === 'approved') return body.token
    if (body.status === 'expired') throw new Error('pairing code expired before approval')
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('pairing timed out waiting for approval')
}

async function ensurePaired() {
  const existing = loadConfig()
  if (existing?.token) {
    console.log(JSON.stringify({ paired: true, alreadyPaired: true }))
    return
  }

  const { code, expires_at } = await requestPairingCode()
  const pairingUrl = `${apiUrl()}/pairing?code=${code}`
  console.log(
    JSON.stringify({
      paired: false,
      code,
      pairingUrl,
      expiresAt: expires_at,
      instructions: `${pairingUrl} 를 열고 "이 기기 연결하기"를 눌러주세요. (코드: ${code}, 10분 내 만료)`,
    }),
  )

  const token = await pollPairing(code, Date.now() + POLL_TIMEOUT_MS)
  saveConfig({ token, apiUrl: apiUrl() })
  console.log(JSON.stringify({ paired: true, alreadyPaired: false }))
}

async function authedFetch(path, options = {}) {
  const config = loadConfig()
  if (!config?.token) throw new Error('not paired yet — run "ensure-paired" first')
  const res = await fetch(`${apiUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
      ...options.headers,
    },
  })
  if (res.status === 401) {
    // Token was revoked on the site — clear it so the next ensure-paired call re-pairs.
    saveConfig({})
    throw new Error('token no longer valid — run "ensure-paired" again')
  }
  if (!res.ok) throw new Error(`request failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function listMilestones() {
  // GET /api/milestones returns a bare array (not wrapped in an object) and, for a
  // non-admin caller, includes drafts too — filter to published here.
  const milestones = await authedFetch('/api/milestones')
  const published = (Array.isArray(milestones) ? milestones : []).filter(
    (m) => m.publish_status === 'published',
  )
  console.log(JSON.stringify(published))
}

async function logMilestone(id, note, opts) {
  const result = await authedFetch(`/api/milestones/${id}/log`, {
    method: 'POST',
    body: JSON.stringify({
      note,
      log_date: opts.date,
      mark_in_progress: opts.inProgress,
      mark_completed: opts.complete,
    }),
  })
  console.log(JSON.stringify(result))
}

function parseLogArgs(argv) {
  const [id, note, ...rest] = argv
  if (!id || !note) {
    console.error('usage: log-milestone <milestone_id> <note> [--date=YYYY-MM-DD] [--in-progress] [--complete]')
    process.exit(1)
  }
  const opts = { inProgress: false, complete: false, date: undefined }
  for (const arg of rest) {
    if (arg === '--in-progress') opts.inProgress = true
    else if (arg === '--complete') opts.complete = true
    else if (arg.startsWith('--date=')) opts.date = arg.slice('--date='.length)
  }
  return { id, note, opts }
}

async function main() {
  const [, , command, ...rest] = process.argv
  try {
    if (command === 'ensure-paired') await ensurePaired()
    else if (command === 'list-milestones') await listMilestones()
    else if (command === 'log-milestone') {
      const { id, note, opts } = parseLogArgs(rest)
      await logMilestone(id, note, opts)
    } else {
      console.error('usage: pairing-client.mjs <ensure-paired|list-milestones|log-milestone>')
      process.exit(1)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
```

- [ ] **Step 2: Write `SKILL.md`**

```markdown
---
name: champion-milestone-sync
description: Use when an AX champion finishes a coding session on their own project and wants to sync progress to the ax-homework-submission milestone tracker. Triggers on "마일스톤 업데이트", "마일스톤 동기화", "오늘 작업 기록해줘", "milestone sync", "sync my milestones".
---

# Champion Milestone Sync

Syncs what happened in the current Claude Code session to the champion's milestones on
ax-homework-submission — progress status and a dated activity note — without the champion
needing to open the website.

This skill has two parts: a small Node script (`scripts/pairing-client.mjs`) that handles
authentication and HTTP calls, and you, the agent, who handles everything that requires
judgment: summarizing the session, matching it to milestones, and confirming with the champion
before writing anything.

**Requires `AX_MILESTONE_SYNC_API_URL`** to be set in the environment to the deployed
ax-homework-submission URL. If it's missing, the script will say so — tell the champion to set
it (e.g. in their shell profile) and stop; do not guess a URL.

## Steps

1. **Ensure paired.** Run:
   ```
   node <skill_dir>/scripts/pairing-client.mjs ensure-paired
   ```
   - If the output has `"alreadyPaired": true`, continue to step 2 immediately.
   - Otherwise the output includes `pairingUrl`, `code`, and `instructions`. Show the champion the
     `instructions` text verbatim, and open `pairingUrl` in their browser if you're able to. The
     script blocks for up to 5 minutes polling for approval — while it's running, tell the
     champion you're waiting for them to click the confirm button. If it exits with a timeout or
     expiry error, relay that plainly and offer to retry from the top.

2. **Fetch milestones.** Run:
   ```
   node <skill_dir>/scripts/pairing-client.mjs list-milestones
   ```
   This returns a JSON array of the champion's published milestones (`id`, `title`,
   `description`, `status`, etc.). If the array is empty, tell the champion they don't have any
   milestones registered yet on the site and stop here — do not proceed to matching.

3. **Match.** Using your own understanding of what happened in this conversation (not the script),
   compare the actual work done against the milestone titles/descriptions. Select zero, one, or
   several milestones that the session's work genuinely relates to. If nothing matches, say so and
   stop — never force a match.

4. **Confirm.** Present all matched candidates together in one message, e.g.:
   > 오늘 세션에서 ModuSign 연동 API 에러 핸들링을 고쳤습니다. 이 작업을 [M4. 전자서명(ModuSign) 연동]에
   > 기록할까요?
   Wait for an explicit yes before writing anything. For any candidate whose work sounds fully
   finished (not just progressed), ask a **separate** explicit question — "이 마일스톤을 완료로
   표시할까요?" — never bundle a completion claim into the general progress confirmation.

5. **Write.** For each confirmed milestone, run:
   ```
   node <skill_dir>/scripts/pairing-client.mjs log-milestone <milestone_id> "<one-line summary of the work>" --in-progress [--complete]
   ```
   Add `--complete` only if the champion explicitly confirmed completion in step 4. Add
   `--date=YYYY-MM-DD` only if the work being logged happened on a date other than today.

6. **Report.** Summarize what was written, one line per milestone updated (e.g. "✅ M4 진행중으로
   갱신, 로그 남김"). If a call fails with `charter_not_approved`, tell the champion their charter
   isn't approved yet so progress can't be marked, but the log entry itself likely still succeeded
   — check the script's error output to confirm which happened.

## Notes

- Never write anything without the explicit confirmation from step 4.
- Never un-complete a milestone or edit `milestones.note` (the website's own manual note field) —
  this skill only ever adds activity-log entries and optionally moves a milestone from
  not-started/delayed to in-progress or completed.
- If any call fails with "token no longer valid", the script has already cleared the local config;
  just re-run step 1 to re-pair.
```

- [ ] **Step 3: Smoke-test the script standalone**

Run: `AX_MILESTONE_SYNC_API_URL=http://localhost:3000 node skills/champion-milestone-sync/scripts/pairing-client.mjs ensure-paired`
Expected: prints a JSON line with `pairingUrl`/`code`/`instructions` (assuming `bun run dev` is running and no config exists yet at `~/.ax-milestone-sync/config.json`). Approve it via the printed URL in a browser; the command should then print `{"paired":true,"alreadyPaired":false}` and exit 0.

Then run: `AX_MILESTONE_SYNC_API_URL=http://localhost:3000 node skills/champion-milestone-sync/scripts/pairing-client.mjs list-milestones`
Expected: a JSON array of that champion's published milestones.

- [ ] **Step 4: Commit**

```bash
git add skills/champion-milestone-sync
git commit -m "$(cat <<'EOF'
[AX-1] feat(skill): champion-milestone-sync Claude Code 스킬 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun run vitest run`
Expected: all tests pass, including the new `pairing-tokens.test.ts` and `safe-redirect.test.ts`.

- [ ] **Step 2: Run typecheck and build**

Run: `bun run typecheck && bun run build`
Expected: both succeed with no errors.

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: no new lint errors introduced by this feature's files.

- [ ] **Step 4: Re-confirm the end-to-end manual flow once more from a clean state**

Delete `~/.ax-milestone-sync/config.json` if present, then repeat Task 10 Step 3's smoke test in
full, followed by one `log-milestone` call, to confirm the entire pairing → match → log chain
works after all pieces are in place together.

- [ ] **Step 5: Note the pending manual migration application**

This plan's Task 1 migration has not been applied to any live (dev or prod) Supabase database —
that's a manual Supabase SQL Editor step for the user, consistent with how every other migration
in this repo is applied. Call this out explicitly when reporting the branch as ready.
