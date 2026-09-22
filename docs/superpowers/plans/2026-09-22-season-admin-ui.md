# 시즌 관리 Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 새 시즌을 생성하고, 직전 시즌 참여자를 이어하기/종료로 배정하거나 신규 참여자를 추가하고, 배정이 끝나면 "현재 시즌"으로 전환할 수 있는 `/admin/seasons` 화면을 만든다.

**Architecture:** `lib/data/seasons-admin.ts`에 시즌/enrollment CRUD 헬퍼를 신설하고, 시즌 전환(현재 시즌 플래그 원자적 전환)은 기존 코드베이스의 RPC 패턴(`claim_pairing_token`, `claim_session_for_processing`)을 따라 Postgres 함수 `activate_season`으로 구현한다. `app/api/admin/seasons/*` 라우트가 이 헬퍼들을 감싸고, `app/admin/seasons/*` 화면이 `app/admin/users/page.tsx`와 동일한 스타일(인라인 style + CSS 변수 + 네이티브 테이블/select)로 이를 소비한다.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + supabase-js), TypeScript, Bun, vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-season-model-design.md` (§ 시즌 전환 운영 워크플로, § 구현 범위 요약 항목 6)

## Global Constraints

- **이 세션에서 마이그레이션을 실제 DB에 적용하지 않는다** — SQL 파일만 생성한다.
- **범위**: 이 플랜은 스펙의 구현 범위 요약 6번(시즌 관리 Admin UI)만 다룬다. 7번(기존 admin 화면들의 시즌 선택 드롭다운), 8번(챔피언 화면 읽기전용 아카이브), 9번(이전 시즌 차터 링크)은 별도 후속 플랜에서 다룬다 — 이 플랜에서 손대지 않는다.
- **"신규 참여자 추가"는 기존 계정만 대상으로 한다** — 이메일 초대로 새 Supabase Auth 계정을 만드는 플로우는 이 플랜 범위 밖이다. `users` 테이블에 이미 존재하지만 해당 시즌에 enrollment가 없는 사용자 중에서 고른다.
- **"직전 시즌"의 정의**: 새 시즌을 만드는 시점에 `is_current=true`인 시즌을 "직전 시즌"으로 간주한다(스펙과 동일).
- **이어하기 시 차터 참조 연결(`previous_charter_id`)은 이 플랜 범위 밖**이다 — 후속 플랜(9번)에서 다룬다. 이 플랜은 `season_enrollments`만 다룬다.
- 신규 테스트는 `test/` 디렉토리에 `lib/` 구조를 미러링해 작성한다. `bun run test -- <패턴>`으로 필터 실행.
- 기존 마이그레이션 파일은 절대 편집하지 않는다 — 새 마이그레이션으로만 변경한다.
- UI는 이 저장소의 기존 관례(네이티브 `<select>`/`<table>` + 인라인 `style={{ ... }}` + CSS 변수)를 따른다 — Radix select 등 새 UI 라이브러리를 설치하지 않는다.

---

### Task 1: Migration — `activate_season` RPC 함수

**Files:**
- Create: `supabase/migrations/20260922000005_activate_season_rpc.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260922000005_activate_season_rpc.sql
-- 시즌 전환(현재 시즌 플래그 이동)을 원자적으로 수행하는 RPC.
-- 기존 claim_pairing_token/claim_session_for_processing과 동일하게,
-- "여러 UPDATE를 하나의 원자적 동작으로 위임"하는 패턴을 따른다.
--
-- 순서가 중요하다: 기존 is_current 시즌을 먼저 내린 뒤 새 시즌을 올려야
-- seasons_single_current_idx(부분 유니크 인덱스)를 위반하지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION activate_season(p_new_season_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE seasons
  SET is_current = false, status = 'archived'
  WHERE is_current = true AND id != p_new_season_id;

  UPDATE seasons
  SET is_current = true, status = 'active'
  WHERE id = p_new_season_id;
END;
$$;

COMMIT;
```

- [ ] **Step 2: 파일 재검토** (실제 DB 적용은 하지 않음)
- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260922000005_activate_season_rpc.sql
git commit -m "[AX-1] feat(db): activate_season RPC 함수 추가"
```

---

### Task 2: `lib/data/seasons-admin.ts` — 시즌 조회/생성 (TDD)

**Files:**
- Create: `lib/data/seasons-admin.ts`
- Create: `test/lib/data/seasons-admin.test.ts`

**Interfaces:**
- Produces:
  - `listSeasons(supabase: SupabaseClient): Promise<Season[]>`
  - `createSeason(supabase: SupabaseClient, input: { name: string; startDate: string | null }): Promise<Season>`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/lib/data/seasons-admin.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listSeasons, createSeason } from '@/lib/data/seasons-admin'

function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => void) => resolve(result),
  }
  return builder
}

function createSupabaseMock(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: vi.fn((table: string) => createQueryBuilder(responses[table])),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  } as unknown as SupabaseClient
}

describe('listSeasons', () => {
  it('returns seasons ordered by created_at desc', async () => {
    const seasons = [{ id: 's2', name: '시즌 2' }, { id: 's1', name: '시즌 1' }]
    const supabase = createSupabaseMock({ seasons: { data: seasons, error: null } })
    expect(await listSeasons(supabase)).toEqual(seasons)
  })

  it('returns an empty array on error', async () => {
    const supabase = createSupabaseMock({ seasons: { data: null, error: { message: 'boom' } } })
    expect(await listSeasons(supabase)).toEqual([])
  })
})

describe('createSeason', () => {
  it('inserts a season with recruiting status and is_current false', async () => {
    const created = { id: 's2', name: '시즌 2', status: 'recruiting', is_current: false }
    const supabase = createSupabaseMock({ seasons: { data: created, error: null } })
    expect(await createSeason(supabase, { name: '시즌 2', startDate: null })).toEqual(created)
  })

  it('throws when the insert fails', async () => {
    const supabase = createSupabaseMock({ seasons: { data: null, error: { message: 'insert failed' } } })
    await expect(createSeason(supabase, { name: '시즌 2', startDate: null })).rejects.toThrow('insert failed')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test -- seasons-admin`
Expected: FAIL — `Cannot find module '@/lib/data/seasons-admin'`

- [ ] **Step 3: 구현 작성** — `lib/data/seasons-admin.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Season } from '@/lib/types'

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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test -- seasons-admin`
Expected: PASS (4개 테스트)

- [ ] **Step 5: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 6: 커밋**

```bash
git add lib/data/seasons-admin.ts test/lib/data/seasons-admin.test.ts
git commit -m "[AX-1] feat(seasons-admin): listSeasons/createSeason 헬퍼 추가"
```

---

### Task 3: `lib/data/seasons-admin.ts` — 참여자 명단 조회 (TDD)

**Files:**
- Modify: `lib/data/seasons-admin.ts`
- Modify: `test/lib/data/seasons-admin.test.ts`

**Interfaces:**
- Produces:
  - `interface SeasonRosterEntry { userId: string; name: string; roleInSeason: SeasonRole; enrollmentStatus: EnrollmentStatus; enrollmentId: string }`
  - `getPreviousSeasonRoster(supabase: SupabaseClient, previousSeasonId: string): Promise<SeasonRosterEntry[]>`
  - `interface CurrentSeasonEnrollmentEntry { userId: string; name: string; roleInSeason: SeasonRole }`
  - `getSeasonEnrollments(supabase: SupabaseClient, seasonId: string): Promise<CurrentSeasonEnrollmentEntry[]>`
  - `getUnassignedUsers(supabase: SupabaseClient, seasonId: string): Promise<{ userId: string; name: string }[]>`

- [ ] **Step 1: 실패하는 테스트 추가** — `test/lib/data/seasons-admin.test.ts`에 추가:

```typescript
import { getPreviousSeasonRoster, getSeasonEnrollments, getUnassignedUsers } from '@/lib/data/seasons-admin'

describe('getPreviousSeasonRoster', () => {
  it('joins season_enrollments with user names', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: {
        data: [{ id: 'e1', user_id: 'u1', role_in_season: 'champion', status: 'completed' }],
        error: null,
      },
      users: { data: [{ id: 'u1', name: '홍길동' }], error: null },
    })
    expect(await getPreviousSeasonRoster(supabase, 's1')).toEqual([
      { userId: 'u1', name: '홍길동', roleInSeason: 'champion', enrollmentStatus: 'completed', enrollmentId: 'e1' },
    ])
  })

  it('returns an empty array when there are no enrollments', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: [], error: null },
      users: { data: [], error: null },
    })
    expect(await getPreviousSeasonRoster(supabase, 's1')).toEqual([])
  })
})

describe('getSeasonEnrollments', () => {
  it('joins season_enrollments with user names for a given season', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: [{ user_id: 'u1', role_in_season: 'partner' }], error: null },
      users: { data: [{ id: 'u1', name: '김철수' }], error: null },
    })
    expect(await getSeasonEnrollments(supabase, 's2')).toEqual([
      { userId: 'u1', name: '김철수', roleInSeason: 'partner' },
    ])
  })
})

describe('getUnassignedUsers', () => {
  it('excludes users already enrolled in the season', async () => {
    const supabase = createSupabaseMock({
      users: { data: [{ id: 'u1', name: 'A' }, { id: 'u2', name: 'B' }], error: null },
      season_enrollments: { data: [{ user_id: 'u1' }], error: null },
    })
    expect(await getUnassignedUsers(supabase, 's2')).toEqual([{ userId: 'u2', name: 'B' }])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test -- seasons-admin`
Expected: FAIL — 새 함수들이 export되지 않음

- [ ] **Step 3: 구현 추가** — `lib/data/seasons-admin.ts` 끝에 추가:

```typescript
import type { SeasonRole, EnrollmentStatus } from '@/lib/types'

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
): Promise<{ userId: string; name: string }[]> {
  const [{ data: allUsers, error: usersErr }, { data: enrolled, error: enrollErr }] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('season_enrollments').select('user_id').eq('season_id', seasonId),
  ])
  if (usersErr) console.error('[seasons-admin] getUnassignedUsers users failed:', usersErr.message)
  if (enrollErr) console.error('[seasons-admin] getUnassignedUsers enrollments failed:', enrollErr.message)
  const enrolledIds = new Set((enrolled ?? []).map((e: { user_id: string }) => e.user_id))
  return (allUsers ?? [])
    .filter((u: { id: string }) => !enrolledIds.has(u.id))
    .map((u: { id: string; name: string }) => ({ userId: u.id, name: u.name }))
}
```

**주의**: `getUnassignedUsers`는 `Promise.all`로 두 개의 서로 다른 테이블(`users`, `season_enrollments`)을 동시에 조회한다 — 테스트의 mock builder는 테이블 이름별로 다른 응답을 반환하므로 `createSupabaseMock`에 두 테이블 모두의 응답을 전달해야 한다(위 테스트 코드 참고).

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test -- seasons-admin`
Expected: PASS (전체 8개 테스트)

- [ ] **Step 5: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 6: 커밋**

```bash
git add lib/data/seasons-admin.ts test/lib/data/seasons-admin.test.ts
git commit -m "[AX-1] feat(seasons-admin): 참여자 명단 조회 헬퍼 추가"
```

---

### Task 4: `lib/data/seasons-admin.ts` — 배정/전환 확정 (TDD)

**Files:**
- Modify: `lib/data/seasons-admin.ts`
- Modify: `test/lib/data/seasons-admin.test.ts`

**Interfaces:**
- Produces:
  - `interface EnrollmentAssignment { userId: string; roleInSeason: SeasonRole; continueFromEnrollmentId?: string }`
  - `assignEnrollments(supabase: SupabaseClient, seasonId: string, assignments: EnrollmentAssignment[]): Promise<void>`
  - `activateSeason(supabase: SupabaseClient, newSeasonId: string): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 추가**:

```typescript
import { assignEnrollments, activateSeason } from '@/lib/data/seasons-admin'

describe('assignEnrollments', () => {
  it('upserts one row per assignment', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: [{ id: 'e1' }], error: null },
    })
    await expect(
      assignEnrollments(supabase, 's2', [{ userId: 'u1', roleInSeason: 'champion', continueFromEnrollmentId: 'e0' }]),
    ).resolves.toBeUndefined()
  })

  it('throws when the upsert fails', async () => {
    const supabase = createSupabaseMock({
      season_enrollments: { data: null, error: { message: 'upsert failed' } },
    })
    await expect(
      assignEnrollments(supabase, 's2', [{ userId: 'u1', roleInSeason: 'champion' }]),
    ).rejects.toThrow('upsert failed')
  })
})

describe('activateSeason', () => {
  it('calls the activate_season RPC with the new season id', async () => {
    const supabase = createSupabaseMock({})
    await activateSeason(supabase, 's2')
    expect(supabase.rpc).toHaveBeenCalledWith('activate_season', { p_new_season_id: 's2' })
  })

  it('throws when the RPC fails', async () => {
    const supabase = {
      from: vi.fn(),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'rpc failed' } })),
    } as unknown as SupabaseClient
    await expect(activateSeason(supabase, 's2')).rejects.toThrow('rpc failed')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test -- seasons-admin`
Expected: FAIL

- [ ] **Step 3: 구현 추가** — `lib/data/seasons-admin.ts` 끝에 추가:

```typescript
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

export async function activateSeason(supabase: SupabaseClient, newSeasonId: string): Promise<void> {
  const { error } = await supabase.rpc('activate_season', { p_new_season_id: newSeasonId })
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test -- seasons-admin`
Expected: PASS (전체 12개 테스트)

- [ ] **Step 5: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 6: 커밋**

```bash
git add lib/data/seasons-admin.ts test/lib/data/seasons-admin.test.ts
git commit -m "[AX-1] feat(seasons-admin): assignEnrollments/activateSeason 헬퍼 추가"
```

---

### Task 5: `app/api/admin/seasons/route.ts` — 목록/생성 API

**Files:**
- Create: `app/api/admin/seasons/route.ts`

**Interfaces:**
- Consumes: Task 2의 `listSeasons`, `createSeason`

- [ ] **Step 1: 구현 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { listSeasons, createSeason } from '@/lib/data/seasons-admin'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const supabase = createServiceClient()
  const seasons = await listSeasons(supabase)
  return NextResponse.json(seasons)
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const { name, startDate } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: '시즌 이름은 필수입니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  try {
    const season = await createSeason(supabase, { name: name.trim(), startDate: startDate ?? null })
    return NextResponse.json(season, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/seasons/route.ts
git commit -m "[AX-1] feat(api): /api/admin/seasons 목록/생성 라우트 추가"
```

---

### Task 6: `app/api/admin/seasons/[seasonId]/route.ts` — 상세(배정 화면용) API

**Files:**
- Create: `app/api/admin/seasons/[seasonId]/route.ts`

**Interfaces:**
- Consumes: `getCurrentSeasonId` (`@/lib/data/season`), Task 3의 `getPreviousSeasonRoster`/`getSeasonEnrollments`/`getUnassignedUsers`

- [ ] **Step 1: 구현 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentSeasonId } from '@/lib/data/season'
import { getPreviousSeasonRoster, getSeasonEnrollments, getUnassignedUsers } from '@/lib/data/seasons-admin'

export async function GET(req: NextRequest, { params }: { params: { seasonId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  const { data: season, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('id', params.seasonId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 })

  const currentSeasonId = await getCurrentSeasonId(supabase)
  const [previousRoster, currentEnrollments, unassignedUsers] = await Promise.all([
    currentSeasonId && currentSeasonId !== params.seasonId
      ? getPreviousSeasonRoster(supabase, currentSeasonId)
      : Promise.resolve([]),
    getSeasonEnrollments(supabase, params.seasonId),
    getUnassignedUsers(supabase, params.seasonId),
  ])

  return NextResponse.json({ season, previousRoster, currentEnrollments, unassignedUsers })
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 3: 커밋**

```bash
git add "app/api/admin/seasons/[seasonId]/route.ts"
git commit -m "[AX-1] feat(api): 시즌 상세(배정 화면용) 라우트 추가"
```

---

### Task 7: `app/api/admin/seasons/[seasonId]/enrollments/route.ts` — 배정 저장 API

**Files:**
- Create: `app/api/admin/seasons/[seasonId]/enrollments/route.ts`

**Interfaces:**
- Consumes: Task 4의 `assignEnrollments`, `EnrollmentAssignment`

- [ ] **Step 1: 구현 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { assignEnrollments, type EnrollmentAssignment } from '@/lib/data/seasons-admin'

export async function POST(req: NextRequest, { params }: { params: { seasonId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const { assignments } = await req.json() as { assignments: EnrollmentAssignment[] }
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return NextResponse.json({ error: 'assignments가 비어 있습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  try {
    await assignEnrollments(supabase, params.seasonId, assignments)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 3: 커밋**

```bash
git add "app/api/admin/seasons/[seasonId]/enrollments/route.ts"
git commit -m "[AX-1] feat(api): 시즌 참여자 배정 저장 라우트 추가"
```

---

### Task 8: `app/api/admin/seasons/[seasonId]/activate/route.ts` — 전환 확정 API

**Files:**
- Create: `app/api/admin/seasons/[seasonId]/activate/route.ts`

**Interfaces:**
- Consumes: Task 4의 `activateSeason`

- [ ] **Step 1: 구현 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { activateSeason } from '@/lib/data/seasons-admin'

export async function POST(req: NextRequest, { params }: { params: { seasonId: string } }) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  try {
    await activateSeason(supabase, params.seasonId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 3: 커밋**

```bash
git add "app/api/admin/seasons/[seasonId]/activate/route.ts"
git commit -m "[AX-1] feat(api): 시즌 전환 확정 라우트 추가"
```

---

### Task 9: `app/admin/AdminSidebar.tsx` — 네비게이션 메뉴 추가

**Files:**
- Modify: `app/admin/AdminSidebar.tsx`

- [ ] **Step 1: import 수정** — 기존:

```typescript
import { LayoutDashboard, Layers, AlertTriangle, FileText, BarChart2, LogOut, Menu, X, Users, UserCog, MessageCircle, Smartphone } from 'lucide-react'
```

다음으로 교체:

```typescript
import { LayoutDashboard, Layers, AlertTriangle, FileText, BarChart2, LogOut, Menu, X, Users, UserCog, MessageCircle, Smartphone, Repeat } from 'lucide-react'
```

- [ ] **Step 2: `NAV` 배열 수정** — 기존:

```typescript
const NAV = [
  { icon: LayoutDashboard, label: '대시보드',     href: '/admin' },
  { icon: Users,           label: '챔피언 리스트', href: '/admin/champions' },
  { icon: Layers,          label: '제출 현황',     href: '/admin/kanban' },
  { icon: AlertTriangle,   label: '지연 신고',     href: '/admin/delay-reports' },
  { icon: FileText,        label: '주간 리포트',   href: '/admin/reports' },
  { icon: MessageCircle,   label: '핫라인',        href: '/admin/hotline' },
  { icon: UserCog,         label: '유저 권한 관리', href: '/admin/users' },
  { icon: Smartphone,      label: '연결된 기기',   href: '/admin/devices' },
]
```

다음으로 교체:

```typescript
const NAV = [
  { icon: LayoutDashboard, label: '대시보드',     href: '/admin' },
  { icon: Users,           label: '챔피언 리스트', href: '/admin/champions' },
  { icon: Repeat,          label: '시즌 관리',     href: '/admin/seasons' },
  { icon: Layers,          label: '제출 현황',     href: '/admin/kanban' },
  { icon: AlertTriangle,   label: '지연 신고',     href: '/admin/delay-reports' },
  { icon: FileText,        label: '주간 리포트',   href: '/admin/reports' },
  { icon: MessageCircle,   label: '핫라인',        href: '/admin/hotline' },
  { icon: UserCog,         label: '유저 권한 관리', href: '/admin/users' },
  { icon: Smartphone,      label: '연결된 기기',   href: '/admin/devices' },
]
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 수동 검증**

`bun run dev` 실행 후 관리자로 로그인해 사이드바에 "시즌 관리" 메뉴가 "챔피언 리스트" 바로 아래에 보이는지 확인 (클릭 시 아직 페이지가 없으므로 404가 나는 게 정상 — Task 10에서 페이지 생성).

- [ ] **Step 5: 커밋**

```bash
git add app/admin/AdminSidebar.tsx
git commit -m "[AX-1] feat(admin): 사이드바에 시즌 관리 메뉴 추가"
```

---

### Task 10: `/admin/seasons` — 목록 + 생성 화면

**Files:**
- Create: `app/admin/seasons/page.tsx`
- Create: `app/admin/seasons/SeasonsListClient.tsx`

**Interfaces:**
- Consumes: Task 5의 `GET/POST /api/admin/seasons`

- [ ] **Step 1: `app/admin/seasons/page.tsx` 작성**

```tsx
import { SeasonsListClient } from './SeasonsListClient'

export default function AdminSeasonsPage() {
  return <SeasonsListClient />
}
```

- [ ] **Step 2: `app/admin/seasons/SeasonsListClient.tsx` 작성**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Season, SeasonStatus } from '@/lib/types'

const STATUS_LABEL: Record<SeasonStatus, string> = {
  recruiting: '모집중',
  active: '진행중',
  closed: '종료',
  archived: '보관됨',
}

const STATUS_COLOR: Record<SeasonStatus, { bg: string; color: string }> = {
  recruiting: { bg: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' },
  active: { bg: 'rgba(22,163,74,0.1)', color: 'var(--success)' },
  closed: { bg: 'rgba(100,116,139,0.1)', color: 'var(--text-secondary)' },
  archived: { bg: 'rgba(100,116,139,0.08)', color: 'var(--text-disabled)' },
}

function StatusBadge({ status }: { status: SeasonStatus }) {
  const style = STATUS_COLOR[status]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: style.bg, color: style.color, letterSpacing: '0.04em',
    }}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function SeasonsListClient() {
  const router = useRouter()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStartDate, setNewStartDate] = useState('')

  useEffect(() => {
    apiFetch<Season[]>('/api/admin/seasons')
      .then(setSeasons)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const season = await apiFetch<Season>('/api/admin/seasons', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), startDate: newStartDate || null }),
      })
      setSeasons(prev => [season, ...prev])
      setNewName('')
      setNewStartDate('')
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', textAlign: 'left',
    borderBottom: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', fontSize: 13,
    borderBottom: '1px solid var(--border-faint)',
    color: 'var(--text-primary)',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>시즌 관리</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          시즌을 생성하고 참여자를 배정합니다.
        </p>
      </div>

      <div className="mb-6 flex items-end gap-2" style={{
        padding: 12, border: '1px solid var(--border-subtle)', borderRadius: 8,
        background: 'var(--surface-primary)',
      }}>
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>시즌 이름</label>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="예: 시즌 2"
            style={{
              fontSize: 13, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--background)',
              color: 'var(--text-primary)', minWidth: 160,
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>시작일 (선택)</label>
          <input
            type="date"
            value={newStartDate}
            onChange={e => setNewStartDate(e.target.value)}
            style={{
              fontSize: 13, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--background)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          style={{
            fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 6,
            background: 'var(--blue-600)', color: '#fff', border: 'none',
            cursor: creating || !newName.trim() ? 'not-allowed' : 'pointer',
            opacity: creating || !newName.trim() ? 0.5 : 1,
          }}
        >
          + 새 시즌 생성
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : (
        <div style={{
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          background: 'var(--surface-primary)', overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--surface-secondary)' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>현재 시즌</th>
                <th style={thStyle}>시작일</th>
                <th style={thStyle}>생성일</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map(s => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/admin/seasons/${s.id}`)}
                  style={{ background: 'var(--background)', cursor: 'pointer' }}
                >
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{s.name}</td>
                  <td style={tdStyle}><StatusBadge status={s.status} /></td>
                  <td style={tdStyle}>{s.is_current ? '✅' : ''}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>{s.start_date ?? '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>
                    {new Date(s.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  </td>
                </tr>
              ))}
              {seasons.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: '32px' }}>
                    시즌이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 수동 검증**

`bun run dev`로 `/admin/seasons` 접속 → 목록에 "시즌 1"이 보이는지(1기 백필로 이미 존재) 확인 → 이름/시작일 입력 후 "새 시즌 생성" 클릭 → 목록에 새 행이 추가되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add app/admin/seasons/page.tsx app/admin/seasons/SeasonsListClient.tsx
git commit -m "[AX-1] feat(admin): 시즌 목록/생성 화면 추가"
```

---

### Task 11: `/admin/seasons/[seasonId]` — 참여자 배정 + 전환 확정 화면

**Files:**
- Create: `app/admin/seasons/[seasonId]/page.tsx`
- Create: `app/admin/seasons/[seasonId]/SeasonDetailClient.tsx`

**Interfaces:**
- Consumes: Task 6의 `GET /api/admin/seasons/[seasonId]`, Task 7의 `POST .../enrollments`, Task 8의 `POST .../activate`

- [ ] **Step 1: `app/admin/seasons/[seasonId]/page.tsx` 작성**

```tsx
import { SeasonDetailClient } from './SeasonDetailClient'

export default function AdminSeasonDetailPage({ params }: { params: { seasonId: string } }) {
  return <SeasonDetailClient seasonId={params.seasonId} />
}
```

- [ ] **Step 2: `app/admin/seasons/[seasonId]/SeasonDetailClient.tsx` 작성**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { Season, SeasonRole } from '@/lib/types'

interface RosterEntry {
  userId: string
  name: string
  roleInSeason: SeasonRole
  enrollmentStatus: 'active' | 'completed' | 'dropped'
  enrollmentId: string
}

interface CurrentEnrollmentEntry {
  userId: string
  name: string
  roleInSeason: SeasonRole
}

interface UnassignedUser {
  userId: string
  name: string
}

interface SeasonDetailResponse {
  season: Season
  previousRoster: RosterEntry[]
  currentEnrollments: CurrentEnrollmentEntry[]
  unassignedUsers: UnassignedUser[]
}

const ROLE_LABEL: Record<SeasonRole, string> = { champion: 'Champion', partner: 'Partner' }

export function SeasonDetailClient({ seasonId }: { seasonId: string }) {
  const [data, setData] = useState<SeasonDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [continueRoles, setContinueRoles] = useState<Record<string, SeasonRole | ''>>({})
  const [newRoles, setNewRoles] = useState<Record<string, SeasonRole | ''>>({})
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)

  function load() {
    setLoading(true)
    apiFetch<SeasonDetailResponse>(`/api/admin/seasons/${seasonId}`)
      .then(res => {
        setData(res)
        const continuing: Record<string, SeasonRole | ''> = {}
        for (const entry of res.previousRoster) {
          const already = res.currentEnrollments.find(e => e.userId === entry.userId)
          continuing[entry.userId] = already ? already.roleInSeason : ''
        }
        setContinueRoles(continuing)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(load, [seasonId])

  async function handleSaveAssignments() {
    if (!data) return
    setSaving(true)
    const assignments = [
      ...data.previousRoster
        .filter(entry => continueRoles[entry.userId])
        .map(entry => ({
          userId: entry.userId,
          roleInSeason: continueRoles[entry.userId] as SeasonRole,
          continueFromEnrollmentId: entry.enrollmentId,
        })),
      ...data.unassignedUsers
        .filter(u => newRoles[u.userId])
        .map(u => ({ userId: u.userId, roleInSeason: newRoles[u.userId] as SeasonRole })),
    ]
    if (assignments.length === 0) {
      toast.error('배정할 참여자를 선택해주세요.')
      setSaving(false)
      return
    }
    try {
      await apiFetch(`/api/admin/seasons/${seasonId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify({ assignments }),
      })
      toast.success('참여자가 배정되었습니다.')
      setNewRoles({})
      load()
    } catch (e) {
      toast.error('배정 실패')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function handleActivate() {
    if (!confirm('이 시즌을 현재 시즌으로 전환하시겠습니까? 되돌릴 수 없습니다.')) return
    setActivating(true)
    try {
      await apiFetch(`/api/admin/seasons/${seasonId}/activate`, { method: 'POST' })
      toast.success('시즌이 전환되었습니다.')
      load()
    } catch (e) {
      toast.error('전환 실패')
      console.error(e)
    } finally {
      setActivating(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', textAlign: 'left',
    borderBottom: '1px solid var(--border-subtle)',
  }
  const tdStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 13,
    borderBottom: '1px solid var(--border-faint)',
    color: 'var(--text-primary)',
  }
  const selectStyle: React.CSSProperties = {
    fontSize: 12, padding: '3px 6px', borderRadius: 4,
    border: '1px solid var(--border)', background: 'var(--surface-primary)',
    color: 'var(--text-primary)', cursor: 'pointer',
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{data.season.name}</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            상태: {data.season.status} {data.season.is_current ? '· 현재 시즌' : ''}
          </p>
        </div>
        {!data.season.is_current && (
          <button
            onClick={handleActivate}
            disabled={activating}
            style={{
              fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 6,
              background: 'var(--success)', color: '#fff', border: 'none',
              cursor: activating ? 'not-allowed' : 'pointer', opacity: activating ? 0.5 : 1,
            }}
          >
            현재 시즌으로 전환
          </button>
        )}
      </div>

      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>직전 시즌 참여자 — 이어하기 배정</h2>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, marginBottom: 24, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>직전 시즌 역할</th>
              <th style={thStyle}>이번 시즌 배정</th>
            </tr>
          </thead>
          <tbody>
            {data.previousRoster.map(entry => (
              <tr key={entry.userId} style={{ background: 'var(--background)' }}>
                <td style={tdStyle}>{entry.name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{ROLE_LABEL[entry.roleInSeason]}</td>
                <td style={tdStyle}>
                  <select
                    value={continueRoles[entry.userId] ?? ''}
                    onChange={e => setContinueRoles(prev => ({ ...prev, [entry.userId]: e.target.value as SeasonRole | '' }))}
                    style={selectStyle}
                  >
                    <option value="">종료(미참여)</option>
                    <option value="champion">Champion으로 이어하기</option>
                    <option value="partner">Partner로 이어하기</option>
                  </select>
                </td>
              </tr>
            ))}
            {data.previousRoster.length === 0 && (
              <tr><td colSpan={3} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: 20 }}>직전 시즌 참여자가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>신규 참여자 추가</h2>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, marginBottom: 24, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>배정</th>
            </tr>
          </thead>
          <tbody>
            {data.unassignedUsers.map(u => (
              <tr key={u.userId} style={{ background: 'var(--background)' }}>
                <td style={tdStyle}>{u.name}</td>
                <td style={tdStyle}>
                  <select
                    value={newRoles[u.userId] ?? ''}
                    onChange={e => setNewRoles(prev => ({ ...prev, [u.userId]: e.target.value as SeasonRole | '' }))}
                    style={selectStyle}
                  >
                    <option value="">추가 안 함</option>
                    <option value="champion">Champion으로 추가</option>
                    <option value="partner">Partner로 추가</option>
                  </select>
                </td>
              </tr>
            ))}
            {data.unassignedUsers.length === 0 && (
              <tr><td colSpan={2} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: 20 }}>배정 가능한 사용자가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        onClick={handleSaveAssignments}
        disabled={saving}
        style={{
          fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 6,
          background: 'var(--blue-600)', color: '#fff', border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1,
          marginBottom: 24,
        }}
      >
        배정 저장
      </button>

      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>이번 시즌 확정 참여자 ({data.currentEnrollments.length}명)</h2>
      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              <th style={thStyle}>이름</th>
              <th style={thStyle}>역할</th>
            </tr>
          </thead>
          <tbody>
            {data.currentEnrollments.map(e => (
              <tr key={e.userId} style={{ background: 'var(--background)' }}>
                <td style={tdStyle}>{e.name}</td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{ROLE_LABEL[e.roleInSeason]}</td>
              </tr>
            ))}
            {data.currentEnrollments.length === 0 && (
              <tr><td colSpan={2} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: 20 }}>아직 배정된 참여자가 없습니다</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 수동 검증**

`bun run dev`로 시나리오 검증:
1. `/admin/seasons`에서 "시즌 2" 생성 → 목록에서 클릭해 상세 화면 진입.
2. "직전 시즌 참여자" 표에 시즌1의 champion/partner들이 보이는지 확인. 한두 명을 "Champion으로 이어하기"로 선택.
3. "신규 참여자 추가" 표에 아직 어느 시즌에도 없는 사용자가 보이는지 확인(있다면). 하나를 "Champion으로 추가" 선택.
4. "배정 저장" 클릭 → 성공 토스트 확인 → "이번 시즌 확정 참여자" 표에 방금 배정한 인원이 나타나는지 확인.
5. "현재 시즌으로 전환" 클릭 → 확인 다이얼로그 → 성공 후 `/admin/seasons` 목록에서 시즌1의 "현재 시즌" 체크가 사라지고 시즌2에 붙었는지 확인.
6. (선택) Supabase SQL 편집기에서 `SELECT name, status, is_current FROM seasons;`로 시즌1이 `archived`, 시즌2가 `active`/`is_current=true`인지 최종 확인.

- [ ] **Step 5: 커밋**

```bash
git add "app/admin/seasons/[seasonId]/page.tsx" "app/admin/seasons/[seasonId]/SeasonDetailClient.tsx"
git commit -m "[AX-1] feat(admin): 시즌 참여자 배정 + 전환 확정 화면 추가"
```

---

### Task 12: 최종 검증 + 문서 업데이트

**Files:**
- Modify: `docs/ERD.md`
- Modify: `docs/PRD-KO.md`

- [ ] **Step 1: 전체 검증**

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: 전부 통과 (`bun run build`는 로컬 `.env.local`이 없으면 무관한 사유로 실패할 수 있음 — Task 15 선례 참고, 이 플랜 자체의 실패가 아니라면 건너뛰어도 됨)

- [ ] **Step 2: `docs/ERD.md` 업데이트** — "Season Tables" 섹션에 `activate_season(p_new_season_id UUID) RETURNS VOID` RPC 함수를 문서화 (기존 `claim_pairing_token`/`claim_session_for_processing` RPC들이 문서화된 방식과 동일한 형식으로).

- [ ] **Step 3: `docs/PRD-KO.md` 업데이트** — §2.5(시즌 모델) 절에 "관리자가 `/admin/seasons`에서 시즌 생성·참여자 배정·전환 확정을 수행한다"는 한 줄과, 버전 이력 테이블에 v2.5 행 추가.

- [ ] **Step 4: 커밋**

```bash
git add docs/ERD.md docs/PRD-KO.md
git commit -m "[AX-1] docs: 시즌 관리 Admin UI ERD/PRD 반영"
```

---

## 후속 플랜 (이 플랜 범위 밖)

- **시즌 선택 드롭다운**: `/admin/champions`, `/admin`(간트), `/admin/reports`, `/admin/kanban`에 과거 시즌 조회 드롭다운 추가. 조사 결과 4개 화면의 현재 시즌 스코핑 상태가 서로 다르다는 것이 확인됐다 — 챔피언 리스트/간트/리포트 API는 `getCurrentSeasonUserIds`로 이미 스코핑되어 있지만, **리포트 페이지의 초기 SSR fetch는 시즌 필터가 아예 없는 기존 버그**가 있고, **칸반은 페이지·API 둘 다 시즌 필터가 전혀 없다**. 드롭다운을 추가할 때 이 불일치들을 함께 해소해야 한다.
- **챔피언 화면 읽기전용 아카이브**: `app/(champion)/layout.tsx`와 `/api/charter/submissions`(GET/POST) 등 챔피언 쓰기 라우트에 `requireCurrentEnrollment`를 실제로 연결하고, 현재 시즌 미enrollment 사용자에게 읽기전용 UI를 노출.
- **"이전 시즌 차터 보기" 링크**: `charter_submissions.previous_charter_id`는 타입 정의에만 존재하고 앱 어디에서도 읽거나 쓰지 않는다. 이 플랜의 "이어하기 배정" 흐름에 새 차터 자동 생성(+ `previous_charter_id` 연결) 로직을 추가하고, `CharterListClient.tsx`/`CharterClient.tsx`에 참조 링크 UI를 추가해야 한다.
- 일반 사원 뷰어(viewer) 권한 — `docs/superpowers/specs/2026-09-22-viewer-role-design.md`, 별도 플랜으로 진행.
