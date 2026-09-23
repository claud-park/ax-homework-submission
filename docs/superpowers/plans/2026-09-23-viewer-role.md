# 일반 사원 뷰어(viewer) 권한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** champion/partner가 아닌 일반 사원도 `@dreamus.io` 계정으로 로그인해 관리자가 "공개" 처리한 프로젝트 요약만 `/gallery`에서 열람할 수 있게 한다.

**Architecture:** `users.user_group`에 `'viewer'`를 추가하고 신규 가입 기본값을 `'viewer'`로 바꾼다. 로그인 콜백에 이메일 도메인 서버사이드 검증을 추가한다. `charter_submissions.is_public` 플래그를 관리자가 켜면 `lib/data/viewer.ts`의 헬퍼가 그 요약만 `/api/viewer/charters`로 노출하고, `/gallery` 화면이 이를 시즌 선택 드롭다운과 함께 렌더링한다. `middleware.ts`는 viewer가 champion 라우트에 접근하면 `/gallery`로 되돌린다.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + supabase-js), TypeScript, Bun, vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-viewer-role-design.md` (2026-09-22 수정본 — `project_charters` 대신 `charter_submissions` 기준으로 이미 정정됨)

## Global Constraints

- **이 세션에서 마이그레이션을 실제 DB에 적용하지 않는다** — SQL 파일만 생성한다.
- **도메인 검증은 fail-closed**: `ALLOWED_EMAIL_DOMAIN` 환경변수가 설정되지 않으면 모든 로그인을 거부한다(설정 누락으로 보안이 조용히 풀리는 것을 방지). 스펙 원문은 `@dreamus.io`를 코드에 하드코딩하는 예시를 들었지만, 이 저장소는 이메일 관련 설정값(`ADMIN_NOTIFICATION_EMAIL` 등)을 환경변수로 분리하는 관행이 있으므로 그 관행을 따른다.
- **`admin`은 이 플랜의 `user_group` 변경 대상이 아니다** — `app_metadata.is_admin`에서 파생되는 전역 권한을 그대로 유지한다.
- **UI는 기존 관례(네이티브 `<select>`/`<table>` + 인라인 style + CSS 변수)를 따른다** — 새 UI 라이브러리를 설치하지 않는다.
- **`middleware.ts`에서 `user_group`을 조회할 때는 반드시 `createServiceClient()`(RLS 우회)를 쓴다** — `public.users`는 RLS가 "전부 거부, service key만 우회" 정책이라 anon 키 기반 세션 클라이언트로는 항상 빈 결과가 온다.
- 신규 테스트는 `test/` 디렉토리에 `lib/` 구조를 미러링해 작성한다. `bun run test -- <패턴>`으로 필터 실행.
- 기존 마이그레이션 파일은 절대 편집하지 않는다.

---

### Task 1: Migration — `user_group`에 `viewer` 추가 + `charter_submissions.is_public` 추가

**Files:**
- Create: `supabase/migrations/20260923000000_add_viewer_role.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260923000000_add_viewer_role.sql
-- 일반 사원 뷰어 권한 도입.
-- 1) users.user_group에 'viewer' 추가, 신규 가입 기본값을 champion에서 viewer로 변경
--    (기존 champion/partner 사용자 데이터는 그대로 유지 — DEFAULT 변경은 이후 신규 가입자에게만 적용)
-- 2) charter_submissions에 공개 플래그 추가 (기본 false — 관리자가 명시적으로 켜야 노출)

BEGIN;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_user_group_check;
ALTER TABLE public.users ADD CONSTRAINT users_user_group_check
  CHECK (user_group IN ('champion', 'partner', 'viewer'));
ALTER TABLE public.users ALTER COLUMN user_group SET DEFAULT 'viewer';

ALTER TABLE charter_submissions ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

COMMIT;
```

- [ ] **Step 2: 파일 재검토** (실제 DB 적용은 하지 않음 — 제약명 `users_user_group_check`는 Postgres 기본 명명 규칙 추정치이며, 이 저장소의 다른 마이그레이션들(`nudge_log_nudge_type_check` 등)이 동일한 추정 방식을 실제로 쓰고 있어 `DROP CONSTRAINT IF EXISTS`로 안전하게 처리됨 — 이름이 틀려도 `IF EXISTS`가 에러를 막고, 이어지는 `ADD CONSTRAINT`가 올바른 이름으로 다시 건다)
- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260923000000_add_viewer_role.sql
git commit -m "[AX-1] feat(db): user_group에 viewer 추가 + charter_submissions.is_public 추가"
```

---

### Task 2: `lib/types.ts` — 타입 업데이트

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: `UserGroup`에 `'viewer'` 추가** — 기존:

```typescript
export type UserGroup = 'champion' | 'partner' | 'admin'
```

다음으로 교체:

```typescript
export type UserGroup = 'champion' | 'partner' | 'viewer' | 'admin'
```

- [ ] **Step 2: `CharterSubmission`에 `is_public` 추가** — 기존:

```typescript
export interface CharterSubmission {
  id: string
  user_id: string
  season_id: string
  previous_charter_id: string | null
  title: string | null
  project_name: string | null
```

다음으로 교체:

```typescript
export interface CharterSubmission {
  id: string
  user_id: string
  season_id: string
  previous_charter_id: string | null
  is_public: boolean
  title: string | null
  project_name: string | null
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add lib/types.ts
git commit -m "[AX-1] feat(types): UserGroup에 viewer, CharterSubmission에 is_public 추가"
```

---

### Task 3: `lib/data/viewer.ts` — 공개 차터 요약 조회 (TDD)

**Files:**
- Create: `lib/data/viewer.ts`
- Create: `test/lib/data/viewer.test.ts`

**Interfaces:**
- Produces:
  - `interface PublicCharterEntry { championName: string; projectTitle: string; oneLiner: string; statusBadge: 'draft' | 'in_review' | 'approved' }`
  - `getPublicCharters(supabase: SupabaseClient, seasonId: string): Promise<PublicCharterEntry[]>`
- Consumes: `charter_submissions.is_public`/`season_id` (Task 1), `parseName` (`@/lib/utils`, 기존)

- [ ] **Step 1: 실패하는 테스트 작성** — `test/lib/data/viewer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublicCharters } from '@/lib/data/viewer'

function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    then: (resolve: (value: unknown) => void) => resolve(result),
  }
  return builder
}

function createSupabaseMock(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: vi.fn((table: string) => createQueryBuilder(responses[table])),
  } as unknown as SupabaseClient
}

describe('getPublicCharters', () => {
  it('returns only public charters with champion name, title, and a derived status badge', async () => {
    const supabase = createSupabaseMock({
      charter_submissions: {
        data: [
          { user_id: 'u1', project_name: '프로젝트A', title: '한줄소개A', content: {}, publish_status: 'published', admin_approved_at: '2026-09-01T00:00:00Z' },
          { user_id: 'u2', project_name: '프로젝트B', title: null, content: { summary: '요약B' }, publish_status: 'draft', admin_approved_at: null },
        ],
        error: null,
      },
      users: { data: [{ id: 'u1', name: '홍길동/개발팀' }, { id: 'u2', name: '김철수/기획팀' }], error: null },
    })
    const result = await getPublicCharters(supabase, 's2')
    expect(result).toEqual([
      { championName: '홍길동', projectTitle: '프로젝트A', oneLiner: '한줄소개A', statusBadge: 'approved' },
      { championName: '김철수', projectTitle: '프로젝트B', oneLiner: '요약B', statusBadge: 'draft' },
    ])
  })

  it('returns an empty array when there are no public charters', async () => {
    const supabase = createSupabaseMock({
      charter_submissions: { data: [], error: null },
      users: { data: [], error: null },
    })
    expect(await getPublicCharters(supabase, 's2')).toEqual([])
  })

  it('returns an empty array on a query error', async () => {
    const supabase = createSupabaseMock({
      charter_submissions: { data: null, error: { message: 'boom' } },
      users: { data: null, error: null },
    })
    expect(await getPublicCharters(supabase, 's2')).toEqual([])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test -- viewer`
Expected: FAIL — `Cannot find module '@/lib/data/viewer'`

- [ ] **Step 3: 구현 작성** — `lib/data/viewer.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseName } from '@/lib/utils'

export interface PublicCharterEntry {
  championName: string
  projectTitle: string
  oneLiner: string
  statusBadge: 'draft' | 'in_review' | 'approved'
}

interface PublicCharterRow {
  user_id: string
  project_name: string | null
  title: string | null
  content: { summary?: string } | null
  publish_status: 'draft' | 'published'
  admin_approved_at: string | null
}

function deriveStatusBadge(row: PublicCharterRow): PublicCharterEntry['statusBadge'] {
  if (row.admin_approved_at) return 'approved'
  if (row.publish_status === 'published') return 'in_review'
  return 'draft'
}

export async function getPublicCharters(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<PublicCharterEntry[]> {
  const { data: charters, error } = await supabase
    .from('charter_submissions')
    .select('user_id, project_name, title, content, publish_status, admin_approved_at')
    .eq('season_id', seasonId)
    .eq('is_public', true)
  if (error) {
    console.error('[viewer] getPublicCharters charters failed:', error.message)
    return []
  }
  const rows = (charters ?? []) as PublicCharterRow[]
  if (rows.length === 0) return []

  const userIds = rows.map((r) => r.user_id)
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, name')
    .in('id', userIds)
  if (usersErr) {
    console.error('[viewer] getPublicCharters users failed:', usersErr.message)
  }
  const nameMap = new Map((users ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))

  return rows.map((row) => ({
    championName: parseName(nameMap.get(row.user_id) ?? '').displayName,
    projectTitle: row.project_name?.trim() || '제목없음',
    oneLiner: row.title?.trim() || row.content?.summary?.trim() || '',
    statusBadge: deriveStatusBadge(row),
  }))
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test -- viewer`
Expected: PASS (3개 테스트)

- [ ] **Step 5: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 6: 커밋**

```bash
git add lib/data/viewer.ts test/lib/data/viewer.test.ts
git commit -m "[AX-1] feat(viewer): getPublicCharters 헬퍼 추가"
```

---

### Task 4: `/api/viewer/charters`, `/api/viewer/seasons` — 뷰어 조회 API

**Files:**
- Create: `app/api/viewer/charters/route.ts`
- Create: `app/api/viewer/seasons/route.ts`

**Interfaces:**
- Consumes: Task 3의 `getPublicCharters`, 기존 `listSeasons`(`@/lib/data/seasons-admin`)

- [ ] **Step 1: `app/api/viewer/charters/route.ts` 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { getPublicCharters } from '@/lib/data/viewer'
import { getCurrentSeasonId } from '@/lib/data/season'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const requestedSeasonId = req.nextUrl.searchParams.get('season')
  const seasonId = requestedSeasonId || (await getCurrentSeasonId(supabase))
  if (!seasonId) return NextResponse.json([])

  const charters = await getPublicCharters(supabase, seasonId)
  return NextResponse.json(charters)
}
```

- [ ] **Step 2: `app/api/viewer/seasons/route.ts` 작성**

champion/partner/viewer 누구나 시즌 드롭다운을 채우기 위해 시즌 목록을 조회할 수 있어야 한다 (기존 `/api/admin/seasons`는 `requireAdmin`이라 viewer가 못 씀). `listSeasons`는 이미 관리 목적과 무관한 순수 조회 헬퍼이므로 그대로 재사용한다.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { listSeasons } from '@/lib/data/seasons-admin'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const seasons = await listSeasons(supabase)
  return NextResponse.json(seasons)
}
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add app/api/viewer/charters/route.ts app/api/viewer/seasons/route.ts
git commit -m "[AX-1] feat(api): /api/viewer/charters, /api/viewer/seasons 라우트 추가"
```

---

### Task 5: 이메일 도메인 제한 (로그인 + 콜백)

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/auth/callback/route.ts`
- Modify: `.env.example`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: `ALLOWED_EMAIL_DOMAIN` 환경변수 (서버 전용, 값 없으면 fail-closed로 모든 로그인 거부)

- [ ] **Step 1: `.env.example`에 항목 추가** — 파일 끝에 추가:

```
# --- 로그인 허용 이메일 도메인 (fail-closed: 미설정 시 모든 로그인 거부) ---
ALLOWED_EMAIL_DOMAIN=dreamus.io
```

- [ ] **Step 2: `.env.local.example`에도 동일하게 추가** — 파일 끝에 추가:

```
# 로그인 허용 이메일 도메인 (fail-closed: 미설정 시 모든 로그인 거부)
ALLOWED_EMAIL_DOMAIN=dreamus.io
```

- [ ] **Step 3: `app/login/page.tsx` 수정** — `handleGoogleLogin` 함수 내부, 기존:

```typescript
  async function handleGoogleLogin() {
    const next = searchParams.get('next') ?? '/'
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    })
  }
```

다음으로 교체:

```typescript
  async function handleGoogleLogin() {
    const next = searchParams.get('next') ?? '/'
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { hd: 'dreamus.io' },
      },
    })
  }
```

이 `hd` 힌트는 Google 계정 선택 화면에서 사내 계정을 유도할 뿐 보안 경계가 아니다 — 사용자가 "다른 계정 사용"으로 우회 가능하므로 실제 검증은 Step 4의 서버사이드 체크가 담당한다.

- [ ] **Step 4: `app/login/page.tsx`에 도메인 거부 에러 안내 추가** — `LoginPageInner` 함수 상단, `const searchParams = useSearchParams()` 바로 아래에 추가:

```typescript
  const loginError = searchParams.get('error')
```

`&lt;button onClick={handleGoogleLogin}&gt;` 바로 위에 추가:

```tsx
        {loginError === 'domain_not_allowed' && (
          <p
            className="text-center mb-4 text-flo-caption1"
            style={{ color: 'var(--error)' }}
          >
            사내(@dreamus.io) 계정으로만 로그인할 수 있습니다.
          </p>
        )}
```

- [ ] **Step 5: `app/auth/callback/route.ts` 수정** — `exchangeCodeForSession` 호출 직후, 기존:

```typescript
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  // Upsert user record via service key (bypasses RLS)
  const serviceClient = createServiceClient()
  const user = data.user
  await serviceClient.from('users').upsert({
```

다음으로 교체:

```typescript
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN
  if (!allowedDomain || !data.user.email?.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=domain_not_allowed`)
  }

  // Upsert user record via service key (bypasses RLS)
  const serviceClient = createServiceClient()
  const user = data.user
  await serviceClient.from('users').upsert({
```

`allowedDomain`이 설정되지 않았으면(운영 실수로 env var 누락) 모든 로그인을 거부한다 — 보안 통제가 조용히 풀리는 fail-open을 피하기 위해서다.

- [ ] **Step 6: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 7: 수동 검증**

`bun run dev` 실행 후, 로컬 `.env.local`에 `ALLOWED_EMAIL_DOMAIN=dreamus.io`(또는 실제 테스트용 도메인)를 설정하고 로그인 시도 — 허용 도메인 계정은 정상 로그인, 허용 안 된 도메인 계정은 `/login?error=domain_not_allowed`로 리다이렉트되며 에러 문구가 뜨는지 확인. `ALLOWED_EMAIL_DOMAIN`을 지웠을 때 모든 로그인이 거부되는지도 확인.

- [ ] **Step 8: 커밋**

```bash
git add app/login/page.tsx app/auth/callback/route.ts .env.example .env.local.example
git commit -m "[AX-1] feat(auth): 이메일 도메인 제한 (ALLOWED_EMAIL_DOMAIN, fail-closed)"
```

---

### Task 6: `middleware.ts` — viewer의 champion 라우트 접근 시 `/gallery` 리다이렉트 + `/gallery` 로그인 보호

**Files:**
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `createServiceClient` (`@/lib/supabase/server`, 기존)

- [ ] **Step 1: 전체 파일 교체** — 현재 `middleware.ts` 전체를 다음으로 교체:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Already-authenticated redirects for login pages
  if (path === '/login' && user && user.app_metadata?.is_admin !== true)
    return NextResponse.redirect(new URL('/', request.url))
  if (path === '/admin/login' && user?.app_metadata?.is_admin === true)
    return NextResponse.redirect(new URL('/admin', request.url))

  // Protect champion routes
  const championRoutes = ['/', '/my-project', '/homework', '/charter', '/milestones', '/progress', '/pairing']
  const isChampionRoute = championRoutes.some(r => path === r || path.startsWith(r + '/'))
  if (isChampionRoute && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  // viewer는 champion 라우트 접근 시 /gallery로 리다이렉트
  // (public.users는 RLS가 "전부 거부, service key만 우회"이므로 anon 키 기반
  //  세션 클라이언트로는 user_group을 읽을 수 없다 — 반드시 service client 사용)
  if (isChampionRoute && user && user.app_metadata?.is_admin !== true) {
    const serviceClient = createServiceClient()
    const { data: profile } = await serviceClient
      .from('users')
      .select('user_group')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.user_group === 'viewer') {
      return NextResponse.redirect(new URL('/gallery', request.url))
    }
  }

  // Protect gallery route (로그인만 필요 — champion/partner/viewer 누구나 열람 가능)
  if (path === '/gallery' && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  // Protect admin routes
  if (path.startsWith('/admin') && !path.startsWith('/admin/login')) {
    if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))
    if (user.app_metadata?.is_admin !== true)
      return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  supabaseResponse.headers.set('x-pathname', path)
  return supabaseResponse
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 3: 수동 검증**

`bun run dev` 실행 후: (a) `/admin/users`에서 임의 테스트 계정을 `viewer`로 변경 → 그 계정으로 로그인해 `/`, `/my-project` 등 champion 라우트 접근 시 `/gallery`로 튕기는지 확인. (b) 로그아웃 상태에서 `/gallery` 직접 접근 시 `/login`으로 리다이렉트되는지 확인. (c) 기존 champion/partner/admin 계정의 로그인·라우팅 동작이 그대로인지 회귀 확인.

- [ ] **Step 4: 커밋**

```bash
git add middleware.ts
git commit -m "[AX-1] feat(auth): viewer 라우트 가드 + /gallery 로그인 보호 추가"
```

---

### Task 7: `/api/admin/charters/[charterId]/visibility` — 공개 토글 API

**Files:**
- Create: `app/api/admin/charters/[charterId]/visibility/route.ts`

- [ ] **Step 1: 구현 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { charterId: string } },
) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const { isPublic } = await req.json() as { isPublic: boolean }
  if (typeof isPublic !== 'boolean') {
    return NextResponse.json({ error: 'isPublic은 boolean이어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .update({ is_public: isPublic })
    .eq('id', params.charterId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Charter not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 3: 커밋**

```bash
git add "app/api/admin/charters/[charterId]/visibility/route.ts"
git commit -m "[AX-1] feat(api): 차터 공개 토글 라우트 추가"
```

---

### Task 8: `/admin/users` — viewer 옵션 추가 (3단 드롭다운)

**Files:**
- Modify: `app/admin/users/page.tsx`
- Modify: `app/api/admin/users/[userId]/route.ts`

**Interfaces:**
- Consumes: Task 2의 `UserGroup`

- [ ] **Step 1: `app/api/admin/users/[userId]/route.ts` 수정** — 기존:

```typescript
  if (!['champion', 'partner'].includes(userGroup)) {
    return NextResponse.json(
      { error: 'admin 그룹은 이 API로 변경할 수 없습니다' },
      { status: 400 },
    )
  }
```

다음으로 교체:

```typescript
  if (!['champion', 'partner', 'viewer'].includes(userGroup)) {
    return NextResponse.json(
      { error: 'admin 그룹은 이 API로 변경할 수 없습니다' },
      { status: 400 },
    )
  }
```

- [ ] **Step 2: `app/admin/users/page.tsx` 수정** — `GROUP_LABEL` 기존:

```typescript
const GROUP_LABEL: Record<UserGroup, string> = {
  champion: 'CHAMPION',
  partner: 'PARTNER',
  admin: 'ADMIN',
}
```

다음으로 교체:

```typescript
const GROUP_LABEL: Record<UserGroup, string> = {
  champion: 'CHAMPION',
  partner: 'PARTNER',
  viewer: 'VIEWER',
  admin: 'ADMIN',
}
```

`GROUP_COLOR` 기존:

```typescript
const GROUP_COLOR: Record<UserGroup, { bg: string; color: string }> = {
  champion: { bg: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' },
  partner:  { bg: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' },
  admin:    { bg: 'rgba(124,58,237,0.1)', color: '#7c3aed' },
}
```

다음으로 교체:

```typescript
const GROUP_COLOR: Record<UserGroup, { bg: string; color: string }> = {
  champion: { bg: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' },
  partner:  { bg: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' },
  viewer:   { bg: 'rgba(100,116,139,0.08)', color: 'var(--text-disabled)' },
  admin:    { bg: 'rgba(124,58,237,0.1)', color: '#7c3aed' },
}
```

`handleGroupChange` 함수 시그니처 기존:

```typescript
  async function handleGroupChange(userId: string, newGroup: 'champion' | 'partner') {
```

다음으로 교체:

```typescript
  async function handleGroupChange(userId: string, newGroup: 'champion' | 'partner' | 'viewer') {
```

`<select>` 안의 `onChange` 및 옵션 목록 기존:

```tsx
                        <select
                          value={u.userGroup}
                          disabled={isChanging}
                          onChange={e => handleGroupChange(u.id, e.target.value as 'champion' | 'partner')}
                          style={{
                            fontSize: 12, padding: '3px 6px', borderRadius: 4,
                            border: '1px solid var(--border)', background: 'var(--surface-primary)',
                            color: 'var(--text-primary)', cursor: isChanging ? 'not-allowed' : 'pointer',
                            opacity: isChanging ? 0.5 : 1,
                          }}
                        >
                          <option value="champion">champion</option>
                          <option value="partner">partner</option>
                        </select>
```

다음으로 교체:

```tsx
                        <select
                          value={u.userGroup}
                          disabled={isChanging}
                          onChange={e => handleGroupChange(u.id, e.target.value as 'champion' | 'partner' | 'viewer')}
                          style={{
                            fontSize: 12, padding: '3px 6px', borderRadius: 4,
                            border: '1px solid var(--border)', background: 'var(--surface-primary)',
                            color: 'var(--text-primary)', cursor: isChanging ? 'not-allowed' : 'pointer',
                            opacity: isChanging ? 0.5 : 1,
                          }}
                        >
                          <option value="champion">champion</option>
                          <option value="partner">partner</option>
                          <option value="viewer">viewer</option>
                        </select>
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add app/admin/users/page.tsx "app/api/admin/users/[userId]/route.ts"
git commit -m "[AX-1] feat(admin): 유저 권한 관리에 viewer 옵션 추가"
```

---

### Task 9: `app/admin/champions/[userId]/page.tsx` — 차터 공개 토글 UI

**Files:**
- Modify: `app/admin/champions/[userId]/page.tsx`

**Interfaces:**
- Consumes: Task 7의 `PATCH /api/admin/charters/[charterId]/visibility`

- [ ] **Step 1: 공개 토글 핸들러 추가** — `approveCharter` 함수 바로 아래에 추가:

```tsx
  async function toggleCharterVisibility(charterId: string, nextIsPublic: boolean) {
    try {
      const updated = await apiFetch<CharterSubmission>(`/api/admin/charters/${charterId}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublic: nextIsPublic }),
      })
      setData(prev => {
        if (!prev) return null
        return {
          ...prev,
          charters: prev.charters.map(c =>
            c.id === charterId ? { ...c, is_public: updated.is_public } : c
          ),
        }
      })
      toast.success(nextIsPublic ? '일반사원에게 공개했습니다.' : '공개를 해제했습니다.')
    } catch {
      toast.error('공개 설정 변경에 실패했습니다.')
    }
  }
```

- [ ] **Step 2: 공개 토글 버튼 UI 추가** — 승인 배지/버튼을 감싼 `<div>`를 찾아, 기존:

```tsx
{/* 오른쪽: 승인 배지 또는 승인 버튼 */}
<div>
  {activeCharter?.admin_approved_at ? (
```

바로 앞에 추가 (같은 flex 컨테이너 안, 승인 배지 왼쪽에 위치):

```tsx
{activeCharter && (
  <button
    onClick={() => toggleCharterVisibility(activeCharter.id, !activeCharter.is_public)}
    className="text-xs font-semibold px-2.5 py-1 rounded-full mr-2"
    style={{
      background: activeCharter.is_public ? 'rgba(37,99,235,0.1)' : 'rgba(100,116,139,0.08)',
      color: activeCharter.is_public ? 'var(--blue-600)' : 'var(--text-disabled)',
      border: `1px solid ${activeCharter.is_public ? 'rgba(37,99,235,0.3)' : 'var(--border-subtle)'}`,
      cursor: 'pointer',
    }}
  >
    {activeCharter.is_public ? '👁 공개됨' : '🔒 비공개'}
  </button>
)}
```

(정확한 삽입 지점은 692~742줄 부근의 섹션 헤더 우측 flex 컨테이너 — 파일을 열어 "승인" 배지/버튼을 렌더링하는 `<div>`를 찾아 그 형제 요소로 넣는다. `toast`는 이 파일에 이미 import되어 있다.)

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 수동 검증**

`bun run dev`로 `/admin/champions/[임의userId]` 접속 → 차터 탭에서 "🔒 비공개" 버튼 클릭 → "👁 공개됨"으로 바뀌는지, 토스트가 뜨는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add "app/admin/champions/[userId]/page.tsx"
git commit -m "[AX-1] feat(admin): 챔피언 상세 화면에 차터 공개 토글 추가"
```

---

### Task 10: `/gallery` — 뷰어 요약 갤러리 화면

**Files:**
- Create: `app/(viewer)/gallery/page.tsx`
- Create: `app/(viewer)/gallery/GalleryClient.tsx`

**Interfaces:**
- Consumes: Task 4의 `GET /api/viewer/charters`, `GET /api/viewer/seasons`

- [ ] **Step 1: `app/(viewer)/gallery/page.tsx` 작성**

```tsx
import { GalleryClient } from './GalleryClient'

export default function GalleryPage() {
  return <GalleryClient />
}
```

- [ ] **Step 2: `app/(viewer)/gallery/GalleryClient.tsx` 작성**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Season } from '@/lib/types'
import type { PublicCharterEntry } from '@/lib/data/viewer'

const STATUS_LABEL: Record<PublicCharterEntry['statusBadge'], string> = {
  draft: '작성중',
  in_review: '검토중',
  approved: '승인됨',
}

const STATUS_COLOR: Record<PublicCharterEntry['statusBadge'], { bg: string; color: string }> = {
  draft: { bg: 'rgba(100,116,139,0.08)', color: 'var(--text-disabled)' },
  in_review: { bg: 'rgba(217,119,6,0.1)', color: 'var(--amber)' },
  approved: { bg: 'rgba(22,163,74,0.1)', color: 'var(--success)' },
}

export function GalleryClient() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [charters, setCharters] = useState<PublicCharterEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<Season[]>('/api/viewer/seasons')
      .then(list => {
        setSeasons(list)
        const current = list.find(s => s.is_current) ?? list[0]
        if (current) setSelectedSeasonId(current.id)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedSeasonId) return
    setLoading(true)
    apiFetch<PublicCharterEntry[]>(`/api/viewer/charters?season=${selectedSeasonId}`)
      .then(setCharters)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [selectedSeasonId])

  return (
    <div className="min-h-screen px-6 py-8" style={{ background: 'hsl(var(--background))' }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>AX Champion 프로젝트 갤러리</h1>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              공개된 프로젝트 요약만 볼 수 있습니다.
            </p>
          </div>
          {seasons.length > 0 && (
            <select
              value={selectedSeasonId}
              onChange={e => setSelectedSeasonId(e.target.value)}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 14,
                border: '1.5px solid var(--border-subtle)', background: 'var(--surface-secondary)',
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {charters.map((c, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{c.projectTitle}</span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: STATUS_COLOR[c.statusBadge].bg, color: STATUS_COLOR[c.statusBadge].color }}
                  >
                    {STATUS_LABEL[c.statusBadge]}
                  </span>
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>{c.oneLiner || '—'}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-disabled)' }}>{c.championName}</p>
              </div>
            ))}
            {charters.length === 0 && (
              <p className="text-sm col-span-full text-center py-12" style={{ color: 'var(--text-disabled)' }}>
                공개된 프로젝트가 없습니다.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 수동 검증**

`bun run dev`로 viewer 계정으로 로그인 → `/gallery` 접속 → 시즌 드롭다운 전환 시 카드 목록이 바뀌는지, 관리자가 공개 처리한 차터만 보이는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add "app/(viewer)/gallery/page.tsx" "app/(viewer)/gallery/GalleryClient.tsx"
git commit -m "[AX-1] feat(viewer): /gallery 요약 화면 추가"
```

---

### Task 11: 최종 검증 + 문서 업데이트

**Files:**
- Modify: `docs/ERD.md`
- Modify: `docs/PRD-KO.md`

- [ ] **Step 1: 전체 검증**

Run: `bun run typecheck && bun run lint && bun run test`
Expected: 전부 통과 (`bun run build`는 이 저장소의 무관한 기존 이슈—`SCHEDULER_SUPABASE_URL` 등 로컬 미설정—로 실패할 수 있음, 이 플랜의 실패가 아니면 건너뛴다)

- [ ] **Step 2: `docs/ERD.md` 업데이트** — `users` 테이블 문서에 `user_group` CHECK 값에 `viewer` 추가 반영, `charter_submissions` 테이블 문서에 `is_public` 컬럼 행 추가.

- [ ] **Step 3: `docs/PRD-KO.md` 업데이트** — 권한 모델 섹션에 viewer 계층 설명 추가(로그인 시 `@dreamus.io` 도메인 제한 도입 포함), 버전 이력 테이블에 새 행 추가.

- [ ] **Step 4: 커밋**

```bash
git add docs/ERD.md docs/PRD-KO.md
git commit -m "[AX-1] docs: 뷰어 권한 ERD/PRD 반영"
```

---

## 후속 로드맵 (이 플랜 범위 밖)

- 관리자 화면(챔피언 리스트/간트/리포트/칸반) 시즌 선택 드롭다운
- 챔피언 화면 읽기전용 아카이브 모드 (현재 시즌 미enrollment 사용자용)
- "이전 시즌 차터 보기" 링크 (`charter_submissions.previous_charter_id`)
- viewer → champion/partner 승격을 "시즌 배정"과 한 번에 묶는 UX (현재는 `/admin/users`에서 그룹 변경 + `/admin/seasons/[id]`에서 시즌 배정, 두 액션을 따로 수행해야 함)
