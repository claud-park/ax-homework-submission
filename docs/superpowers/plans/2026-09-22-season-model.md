# 시즌 데이터 모델 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AX Champion 시스템에 시즌(기수) 개념을 도입한다 — `seasons`/`season_enrollments` 테이블을 신설하고, 1기 데이터를 백필하고, champion 판별 로직을 `users.user_group` 필터에서 "현재 시즌 enrollment" 기준으로 전환한다.

**Architecture:** DB에 `seasons`(시즌 메타데이터)와 `season_enrollments`(사람×시즌×역할)를 신설하고 기존 시즌 스코프 테이블(charter_submissions, project_charters, milestones, check_up_sessions, champion_weekly_sessions, session_action_items)에 `season_id`를 추가한다. 애플리케이션 레벨에서는 `lib/data/season.ts`의 헬퍼 함수로 "현재 시즌의 champion/partner user id 목록"을 조회하고, 기존에 `.eq('user_group', 'champion')`로 필터링하던 7개 파일(8개 호출부)을 이 헬퍼 기반으로 교체한다. 쓰기 API를 위한 `requireCurrentEnrollment` 가드도 추가한다.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + supabase-js), TypeScript, Bun, vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-season-model-design.md`

## Global Constraints

- **이 세션에서 마이그레이션을 실제 DB에 적용하지 않는다** — SQL 파일만 생성한다. 적용은 사용자가 Supabase 대시보드/CLI로 직접 실행한다 (기존 `2026-07-03-admin-app-metadata-migration.md` 플랜과 동일한 "prod 무조작" 원칙).
- **배포 순서**: ①마이그레이션 4개를 파일명 순서대로(`20260922000000` → `...003`) 적용 → ②애플리케이션 코드 배포. 순서를 어기면 `season_id NOT NULL` 제약과 코드가 어긋난다.
- **`submissions`/`homeworks` 테이블은 이번 플랜 범위 밖**이다 (사용자 결정 — 제출 포맷 표준화가 별도 스펙으로 미확정 상태).
- **`users.user_group` 컬럼과 값은 삭제하지 않는다** — 하위호환용으로 유지, 신규 코드는 `season_enrollments`를 진실 소스로 사용한다.
- 신규 테스트는 `test/` 디렉토리에 `lib/` 구조를 미러링해 작성한다 (예: `lib/data/season.ts` → `test/lib/data/season.test.ts`). `bun run test -- <패턴>`으로 필터 실행.
- 기존 마이그레이션 파일은 절대 편집하지 않는다 — 이미 적용됐을 수 있으므로 항상 새 마이그레이션으로 변경한다.

---

### Task 1: Migration — `seasons` 테이블 생성

**Files:**
- Create: `supabase/migrations/20260922000000_create_seasons.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260922000000_create_seasons.sql
-- 시즌(기수) 메타데이터. status는 시즌 자체의 진행 단계,
-- is_current는 "앱이 기본으로 보여주는 시즌"을 나타내며 서로 독립적이다.
-- 예: 시즌1이 closed여도 시즌2가 아직 없으면 is_current=true로 남는다.

CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recruiting'
    CHECK (status IN ('recruiting', 'active', 'closed', 'archived')),
  is_current BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동시에 하나의 시즌만 "현재 시즌"일 수 있다
CREATE UNIQUE INDEX seasons_single_current_idx
  ON seasons ((is_current)) WHERE is_current = true;

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service key가 RLS를 우회 (기존 sub_tasks/session_action_items 등과 동일한 패턴)
```

- [ ] **Step 2: SQL 문법 검토** — `psql`이나 Supabase SQL 편집기에 붙여넣지 말고, 파일 내용을 다시 읽어 세미콜론/괄호 짝을 눈으로 확인한다 (이 세션에서는 실제 DB에 적용하지 않음).
- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260922000000_create_seasons.sql
git commit -m "feat(db): seasons 테이블 마이그레이션 추가"
```

---

### Task 2: Migration — `season_enrollments` 테이블 생성

**Files:**
- Create: `supabase/migrations/20260922000001_create_season_enrollments.sql`

**Interfaces:**
- Consumes: Task 1의 `seasons` 테이블
- Produces: `season_enrollments(id, season_id, user_id, role_in_season, status, continued_from_enrollment_id, created_at)` — 이후 모든 태스크가 이 스키마를 전제로 한다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260922000001_create_season_enrollments.sql
-- 사람×시즌×역할. users 테이블은 "이 사람이 누구인가"만 담당하고,
-- "이번 시즌에 champion/partner로 참여 중인가"는 이 테이블이 진실 소스가 된다.

CREATE TABLE season_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role_in_season TEXT NOT NULL CHECK (role_in_season IN ('champion', 'partner')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'dropped')),
  continued_from_enrollment_id UUID REFERENCES season_enrollments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);

CREATE INDEX season_enrollments_season_role_idx
  ON season_enrollments (season_id, role_in_season);

ALTER TABLE season_enrollments ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service key가 RLS를 우회
```

- [ ] **Step 2: 파일 재검토** (Task 1과 동일한 방식 — 실제 DB 적용은 하지 않음)
- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260922000001_create_season_enrollments.sql
git commit -m "feat(db): season_enrollments 테이블 마이그레이션 추가"
```

---

### Task 3: Migration — `season_id` 컬럼 및 `previous_charter_id` 추가 (nullable)

**Files:**
- Create: `supabase/migrations/20260922000002_add_season_id_columns.sql`

**Interfaces:**
- Consumes: Task 1의 `seasons` 테이블
- Produces: `charter_submissions.season_id`, `project_charters.season_id`, `project_charters.previous_charter_id`, `milestones.season_id`, `check_up_sessions.season_id`, `champion_weekly_sessions.season_id`, `session_action_items.season_id` (전부 nullable — Task 4에서 백필 후 NOT NULL로 전환)

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260922000002_add_season_id_columns.sql
-- 시즌 스코프 테이블에 season_id를 nullable로 추가한다.
-- NOT NULL 전환과 인덱스 생성은 백필 이후 20260922000003에서 수행한다.

ALTER TABLE charter_submissions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE project_charters ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE milestones ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE check_up_sessions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE champion_weekly_sessions ADD COLUMN season_id UUID REFERENCES seasons(id);
ALTER TABLE session_action_items ADD COLUMN season_id UUID REFERENCES seasons(id);

-- 시즌을 이어가는 챔피언의 새 차터가 직전 시즌 차터를 참조용으로 연결
ALTER TABLE project_charters ADD COLUMN previous_charter_id UUID REFERENCES project_charters(id);
```

- [ ] **Step 2: 파일 재검토** (실제 DB 적용은 하지 않음)
- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260922000002_add_season_id_columns.sql
git commit -m "feat(db): 시즌 스코프 테이블에 season_id 컬럼 추가"
```

---

### Task 4: Migration — 1기 백필 + NOT NULL/인덱스 확정

**Files:**
- Create: `supabase/migrations/20260922000003_backfill_season_one.sql`

**Interfaces:**
- Consumes: Task 1-3의 테이블/컬럼
- Produces: "시즌 1" row (`status='closed'`, `is_current=true`), 기존 champion/partner 사용자의 `season_enrollments`(`status='completed'`), 모든 시즌 스코프 테이블의 `season_id NOT NULL`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260922000003_backfill_season_one.sql
-- 1기는 이미 마무리된 상태이므로 status='closed'로 백필한다.
-- 시즌2가 아직 없으므로 is_current=true로 남겨 기존 화면 동작을 보존한다.
-- 이탈/중도포기를 나타내는 기존 필드가 없으므로 전원 completed로 간주한다.

DO $$
DECLARE
  v_season_id UUID;
BEGIN
  INSERT INTO seasons (name, status, is_current, start_date)
  VALUES ('시즌 1', 'closed', true, (SELECT MIN(created_at)::date FROM users))
  RETURNING id INTO v_season_id;

  INSERT INTO season_enrollments (season_id, user_id, role_in_season, status)
  SELECT v_season_id, id, user_group, 'completed'
  FROM users
  WHERE user_group IN ('champion', 'partner');

  UPDATE charter_submissions SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE project_charters SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE milestones SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE check_up_sessions SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE champion_weekly_sessions SET season_id = v_season_id WHERE season_id IS NULL;
  UPDATE session_action_items SET season_id = v_season_id WHERE season_id IS NULL;
END $$;

ALTER TABLE charter_submissions ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE project_charters ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE milestones ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE check_up_sessions ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE champion_weekly_sessions ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE session_action_items ALTER COLUMN season_id SET NOT NULL;

CREATE INDEX charter_submissions_season_user_idx ON charter_submissions(season_id, user_id);
CREATE INDEX project_charters_season_user_idx ON project_charters(season_id, user_id);
CREATE INDEX milestones_season_user_idx ON milestones(season_id, user_id);
CREATE INDEX check_up_sessions_season_champion_idx ON check_up_sessions(season_id, champion_user_id);
CREATE INDEX champion_weekly_sessions_season_idx ON champion_weekly_sessions(season_id);
CREATE INDEX session_action_items_season_idx ON session_action_items(season_id);
```

- [ ] **Step 2: 검증 쿼리 초안 작성** (실제 실행은 사용자가 적용 후 수행 — 이 스텝은 Task 15의 런북에 포함될 SQL을 미리 작성해두는 것)

```sql
-- 적용 후 사용자가 Supabase SQL 편집기에서 실행해 확인:
SELECT count(*) FROM seasons WHERE is_current = true;  -- 1이어야 함
SELECT count(*) FROM season_enrollments;                -- users.user_group IN ('champion','partner') 행 수와 같아야 함
SELECT count(*) FROM charter_submissions WHERE season_id IS NULL;  -- 0이어야 함
```

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260922000003_backfill_season_one.sql
git commit -m "feat(db): 1기 시즌 백필 및 season_id NOT NULL 확정"
```

---

### Task 5: `lib/types.ts` — Season/SeasonEnrollment 타입 추가

**Files:**
- Modify: `lib/types.ts:43-62` (`CharterSubmission`)
- Modify: `lib/types.ts:64-72` (`ProjectCharter`)
- Modify: `lib/types.ts:74-98` (`Milestone`)
- Modify: `lib/types.ts:236-257` (`CheckUpSession`)
- Modify: `lib/types.ts:259-268` (`SessionActionItem`)
- Modify: `lib/types.ts:299-311` (`ChampionWeeklySession`)
- Modify: `lib/types.ts` (신규 `Season`/`SeasonEnrollment` 타입 추가 — `UserGroup` 정의 근처, line 218 앞)

**Interfaces:**
- Produces: `Season`, `SeasonEnrollment` 타입. 기존 타입에 `season_id: string` 필드 추가(`ProjectCharter`엔 `previous_charter_id: string | null`도 추가).

- [ ] **Step 1: 신규 타입 추가** — `lib/types.ts`의 `UserGroup` 선언 바로 앞에 삽입:

```typescript
// ─── Season ──────────────────────────────────────────────────────────────

export type SeasonStatus = 'recruiting' | 'active' | 'closed' | 'archived'
export type SeasonRole = 'champion' | 'partner'
export type EnrollmentStatus = 'active' | 'completed' | 'dropped'

export interface Season {
  id: string
  name: string
  status: SeasonStatus
  is_current: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
}

export interface SeasonEnrollment {
  id: string
  season_id: string
  user_id: string
  role_in_season: SeasonRole
  status: EnrollmentStatus
  continued_from_enrollment_id: string | null
  created_at: string
}
```

- [ ] **Step 2: `CharterSubmission`에 `season_id` 추가** — 기존:

```typescript
export interface CharterSubmission {
  id: string
  user_id: string
  title: string | null
  project_name: string | null
```

다음으로 교체:

```typescript
export interface CharterSubmission {
  id: string
  user_id: string
  season_id: string
  title: string | null
  project_name: string | null
```

- [ ] **Step 3: `ProjectCharter`에 `season_id`/`previous_charter_id` 추가** — 기존:

```typescript
export interface ProjectCharter {
  id: string
  user_id: string
  charter_submission_id: string | null
  project_name: string | null
```

다음으로 교체:

```typescript
export interface ProjectCharter {
  id: string
  user_id: string
  season_id: string
  charter_submission_id: string | null
  previous_charter_id: string | null
  project_name: string | null
```

- [ ] **Step 4: `Milestone`에 `season_id` 추가** — 기존:

```typescript
export interface Milestone {
  id: string
  user_id: string
  charter_submission_id: string | null
```

다음으로 교체:

```typescript
export interface Milestone {
  id: string
  user_id: string
  season_id: string
  charter_submission_id: string | null
```

- [ ] **Step 5: `CheckUpSession`에 `season_id` 추가** — 기존:

```typescript
export interface CheckUpSession {
  id: string
  champion_user_id: string
  admin_user_id: string | null
```

다음으로 교체:

```typescript
export interface CheckUpSession {
  id: string
  champion_user_id: string
  season_id: string
  admin_user_id: string | null
```

- [ ] **Step 6: `SessionActionItem`에 `season_id` 추가** — 기존:

```typescript
export interface SessionActionItem {
  id: string
  session_id: string
  body: string
```

다음으로 교체:

```typescript
export interface SessionActionItem {
  id: string
  session_id: string
  season_id: string
  body: string
```

- [ ] **Step 7: `ChampionWeeklySession`에 `season_id` 추가** — 기존:

```typescript
export interface ChampionWeeklySession {
  id: string
  session_date: string
  session_time: string | null
```

다음으로 교체:

```typescript
export interface ChampionWeeklySession {
  id: string
  session_date: string
  season_id: string
  session_time: string | null
```

- [ ] **Step 8: 타입체크 통과 확인**

Run: `bun run typecheck`
Expected: 새로 추가된 필드로 인한 에러 없음 (필드 추가만으로는 기존 코드가 깨지지 않음 — 이 필드들을 실제로 세팅/사용하는 코드는 이후 태스크에서 다룸)

- [ ] **Step 9: 커밋**

```bash
git add lib/types.ts
git commit -m "feat(types): Season/SeasonEnrollment 타입 및 season_id 필드 추가"
```

---

### Task 6: `lib/data/season.ts` — 현재 시즌 조회 헬퍼 (TDD)

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/data/season.ts`
- Create: `test/lib/data/season.test.ts`

**Interfaces:**
- Produces:
  - `getCurrentSeasonId(supabase: SupabaseClient): Promise<string | null>`
  - `getCurrentSeasonUserIds(supabase: SupabaseClient, role: 'champion' | 'partner'): Promise<string[]>`
  - `isEnrolledInCurrentSeason(supabase: SupabaseClient, userId: string, role: 'champion' | 'partner'): Promise<boolean>`
- Consumes: Task 1-2의 `seasons`/`season_enrollments` 스키마 (컬럼명 기준으로 쿼리 작성)

- [ ] **Step 1: vitest 설정 파일 작성** (이 저장소에 아직 vitest 설정이 없음 — devDependency만 존재)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 2: 실패하는 테스트 작성** — `test/lib/data/season.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentSeasonId, getCurrentSeasonUserIds, isEnrolledInCurrentSeason } from '@/lib/data/season'

function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => void) => resolve(result),
  }
  return builder
}

function createSupabaseMock(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: vi.fn((table: string) => createQueryBuilder(responses[table])),
  } as unknown as SupabaseClient
}

describe('getCurrentSeasonId', () => {
  it('returns the current season id when one exists', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
    })
    expect(await getCurrentSeasonId(supabase)).toBe('season-2')
  })

  it('returns null when no season is marked current', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: null, error: null },
    })
    expect(await getCurrentSeasonId(supabase)).toBeNull()
  })
})

describe('getCurrentSeasonUserIds', () => {
  it('returns user ids enrolled in the current season with the given role', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
      season_enrollments: { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null },
    })
    expect(await getCurrentSeasonUserIds(supabase, 'champion')).toEqual(['u1', 'u2'])
  })

  it('returns an empty array when there is no current season', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: null, error: null },
      season_enrollments: { data: null, error: null },
    })
    expect(await getCurrentSeasonUserIds(supabase, 'champion')).toEqual([])
  })
})

describe('isEnrolledInCurrentSeason', () => {
  it('returns true when the user has an active enrollment for the role', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
      season_enrollments: { data: { id: 'enrollment-1' }, error: null },
    })
    expect(await isEnrolledInCurrentSeason(supabase, 'u1', 'champion')).toBe(true)
  })

  it('returns false when the user has no matching enrollment', async () => {
    const supabase = createSupabaseMock({
      seasons: { data: { id: 'season-2' }, error: null },
      season_enrollments: { data: null, error: null },
    })
    expect(await isEnrolledInCurrentSeason(supabase, 'u1', 'champion')).toBe(false)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `bun run test -- season`
Expected: FAIL — `Cannot find module '@/lib/data/season'` (파일이 아직 없음)

- [ ] **Step 4: 구현 작성** — `lib/data/season.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCurrentSeasonId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string }).id
}

export async function getCurrentSeasonUserIds(
  supabase: SupabaseClient,
  role: 'champion' | 'partner',
): Promise<string[]> {
  const seasonId = await getCurrentSeasonId(supabase)
  if (!seasonId) return []
  const { data, error } = await supabase
    .from('season_enrollments')
    .select('user_id')
    .eq('season_id', seasonId)
    .eq('role_in_season', role)
  if (error || !data) return []
  return (data as { user_id: string }[]).map((row) => row.user_id)
}

export async function isEnrolledInCurrentSeason(
  supabase: SupabaseClient,
  userId: string,
  role: 'champion' | 'partner',
): Promise<boolean> {
  const seasonId = await getCurrentSeasonId(supabase)
  if (!seasonId) return false
  const { data, error } = await supabase
    .from('season_enrollments')
    .select('id')
    .eq('season_id', seasonId)
    .eq('user_id', userId)
    .eq('role_in_season', role)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !data) return false
  return true
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `bun run test -- season`
Expected: PASS (6개 테스트 전부)

- [ ] **Step 6: `package.json`에 vitest devDependency 확인** — `vitest`, `@vitejs/plugin-react`가 이미 devDependencies에 있으므로 추가 설치 불필요. `vitest.config.ts`가 `@vitejs/plugin-react`를 쓰지 않으므로(순수 Node 로직만 테스트) 별도 조치 없음.

- [ ] **Step 7: 커밋**

```bash
git add vitest.config.ts lib/data/season.ts test/lib/data/season.test.ts
git commit -m "feat(season): 현재 시즌 조회 헬퍼 추가"
```

---

### Task 7: `lib/api/guard.ts` — `requireCurrentEnrollment` 가드 (TDD)

**Files:**
- Modify: `lib/api/guard.ts`
- Create: `test/lib/api/guard.test.ts`

**Interfaces:**
- Consumes: Task 6의 `isEnrolledInCurrentSeason(supabase, userId, role)`
- Produces: `requireCurrentEnrollment(req: NextRequest, role: 'champion' | 'partner'): Promise<User | NextResponse>`

- [ ] **Step 1: 실패하는 테스트 작성** — `test/lib/api/guard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentEnrollment } from '@/lib/api/guard'
import { verifyJWT } from '@/lib/auth'
import { isEnrolledInCurrentSeason } from '@/lib/data/season'

vi.mock('@/lib/auth', () => ({ verifyJWT: vi.fn(), verifyAdmin: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn(() => ({})) }))
vi.mock('@/lib/data/season', () => ({ isEnrolledInCurrentSeason: vi.fn() }))

const mockedVerifyJWT = vi.mocked(verifyJWT)
const mockedIsEnrolled = vi.mocked(isEnrolledInCurrentSeason)

function fakeRequest() {
  return new NextRequest('http://localhost/api/test')
}

describe('requireCurrentEnrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when there is no authenticated user', async () => {
    mockedVerifyJWT.mockResolvedValue(null)
    const result = await requireCurrentEnrollment(fakeRequest(), 'champion')
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(401)
  })

  it('returns 403 when the user has no active enrollment for the role', async () => {
    mockedVerifyJWT.mockResolvedValue({ id: 'u1' } as never)
    mockedIsEnrolled.mockResolvedValue(false)
    const result = await requireCurrentEnrollment(fakeRequest(), 'champion')
    expect(result).toBeInstanceOf(NextResponse)
    expect((result as NextResponse).status).toBe(403)
  })

  it('returns the user when enrolled with the requested role', async () => {
    const user = { id: 'u1' } as never
    mockedVerifyJWT.mockResolvedValue(user)
    mockedIsEnrolled.mockResolvedValue(true)
    const result = await requireCurrentEnrollment(fakeRequest(), 'champion')
    expect(result).toBe(user)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test -- guard`
Expected: FAIL — `requireCurrentEnrollment` is not exported from `@/lib/api/guard`

- [ ] **Step 3: 구현 추가** — `lib/api/guard.ts` 상단 import를 다음으로 교체:

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { verifyJWT, verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { isEnrolledInCurrentSeason } from '@/lib/data/season'
```

파일 끝에 추가:

```typescript
/**
 * 현재 시즌에 지정된 role로 활성 enrollment가 있는 사용자를 반환하거나,
 * 미인증 시 401, enrollment 없음 시 403 NextResponse를 반환한다.
 */
export async function requireCurrentEnrollment(
  req: NextRequest,
  role: 'champion' | 'partner',
): Promise<User | NextResponse> {
  const user = await verifyJWT(req)
  if (!user) return unauthorized()

  const supabase = createServiceClient()
  const enrolled = await isEnrolledInCurrentSeason(supabase, user.id, role)
  if (!enrolled) return forbidden()

  return user
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test -- guard`
Expected: PASS (3개 테스트 전부)

- [ ] **Step 5: 타입체크 통과 확인**

Run: `bun run typecheck`
Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add lib/api/guard.ts test/lib/api/guard.test.ts
git commit -m "feat(guard): requireCurrentEnrollment 가드 추가"
```

---

### Task 8: `lib/data/champions.ts` — champion 필터를 시즌 기준으로 전환

**Files:**
- Modify: `lib/data/champions.ts`

**Interfaces:**
- Consumes: Task 6의 `getCurrentSeasonUserIds(supabase, 'champion')`

- [ ] **Step 1: import 추가** — 파일 상단에 추가:

```typescript
import { getCurrentSeasonUserIds } from '@/lib/data/season'
```

- [ ] **Step 2: `fetchGanttData` 수정** — 기존:

```typescript
export async function fetchGanttData(): Promise<GanttChampion[]> {
  const supabase = createServiceClient()
  const [
    { data: users },
    { data: charters },
    { data: milestones },
  ] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
```

다음으로 교체:

```typescript
export async function fetchGanttData(): Promise<GanttChampion[]> {
  const supabase = createServiceClient()
  const championIds = await getCurrentSeasonUserIds(supabase, 'champion')
  const [
    { data: users },
    { data: charters },
    { data: milestones },
  ] = await Promise.all([
    supabase.from('users').select('id, name').in('id', championIds),
```

- [ ] **Step 3: `fetchSummaryData` 수정** — 기존:

```typescript
export async function fetchSummaryData(): Promise<ChampionSummary[]> {
  const supabase = createServiceClient()
  const [{ data: users }, { data: charters }, { data: milestones }] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
```

다음으로 교체:

```typescript
export async function fetchSummaryData(): Promise<ChampionSummary[]> {
  const supabase = createServiceClient()
  const championIds = await getCurrentSeasonUserIds(supabase, 'champion')
  const [{ data: users }, { data: charters }, { data: milestones }] = await Promise.all([
    supabase.from('users').select('id, name').in('id', championIds),
```

- [ ] **Step 4: 타입체크 통과 확인**

Run: `bun run typecheck`
Expected: 에러 없음

- [ ] **Step 5: 수동 검증** (마이그레이션이 사용자에 의해 적용된 이후에만 유효 — Task 15 런북 참고)

`bun run dev` 실행 후 관리자로 로그인해 `/admin`(Gantt)과 `/admin/champions`(요약 테이블)을 열어, 마이그레이션 적용 전과 동일한 챔피언 목록이 보이는지 확인한다 (시즌1 백필이 기존 `user_group='champion'` 사용자를 그대로 enrollment로 옮겼으므로 결과가 같아야 함).

- [ ] **Step 6: 커밋**

```bash
git add lib/data/champions.ts
git commit -m "refactor(champions): user_group 필터를 현재 시즌 enrollment 기준으로 전환"
```

---

### Task 9: `app/api/champions/route.ts` — champion 필터 전환

**Files:**
- Modify: `app/api/champions/route.ts`

- [ ] **Step 1: import 추가**

```typescript
import { getCurrentSeasonUserIds } from '@/lib/data/season'
```

- [ ] **Step 2: 쿼리 수정** — 기존:

```typescript
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
```

다음으로 교체:

```typescript
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const championIds = await getCurrentSeasonUserIds(supabase, 'champion')

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name').in('id', championIds),
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add app/api/champions/route.ts
git commit -m "refactor(api): /api/champions 시즌 기준 필터 전환"
```

---

### Task 10: `app/api/champions/gantt/route.ts` — champion 필터 전환

**Files:**
- Modify: `app/api/champions/gantt/route.ts`

- [ ] **Step 1: import 추가**

```typescript
import { getCurrentSeasonUserIds } from '@/lib/data/season'
```

- [ ] **Step 2: 쿼리 수정** — 기존:

```typescript
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
```

다음으로 교체:

```typescript
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const championIds = await getCurrentSeasonUserIds(supabase, 'champion')

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name').in('id', championIds),
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add app/api/champions/gantt/route.ts
git commit -m "refactor(api): /api/champions/gantt 시즌 기준 필터 전환"
```

---

### Task 11: `app/api/admin/reports/overview/route.ts` — champion 필터 전환

**Files:**
- Modify: `app/api/admin/reports/overview/route.ts`

- [ ] **Step 1: import 추가**

```typescript
import { getCurrentSeasonUserIds } from '@/lib/data/season'
```

- [ ] **Step 2: 쿼리 수정** — 기존:

```typescript
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
```

다음으로 교체:

```typescript
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const supabase = createServiceClient()
  const championIds = await getCurrentSeasonUserIds(supabase, 'champion')

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name').in('id', championIds),
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/reports/overview/route.ts
git commit -m "refactor(api): 리포트 개요 API 시즌 기준 필터 전환"
```

---

### Task 12: `app/api/cron/daily-nudge/route.ts` — champion 필터 전환

**Files:**
- Modify: `app/api/cron/daily-nudge/route.ts`

- [ ] **Step 1: import 추가**

```typescript
import { getCurrentSeasonUserIds } from '@/lib/data/season'
```

- [ ] **Step 2: 쿼리 수정** — 기존:

```typescript
  const supabase = createServiceClient()

  // user_group = 'champion' 인 유저만 조회
  const { data: champions, error: usersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('user_group', 'champion')
```

다음으로 교체:

```typescript
  const supabase = createServiceClient()

  // 현재 시즌에 champion으로 참여 중인 유저만 조회
  const championIds = await getCurrentSeasonUserIds(supabase, 'champion')
  const { data: champions, error: usersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .in('id', championIds)
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add app/api/cron/daily-nudge/route.ts
git commit -m "refactor(cron): daily-nudge 시즌 기준 필터 전환"
```

---

### Task 13: `app/api/cron/weekly-overdue-nudge/route.ts` — champion 필터 전환

**Files:**
- Modify: `app/api/cron/weekly-overdue-nudge/route.ts`

- [ ] **Step 1: import 추가**

```typescript
import { getCurrentSeasonUserIds } from '@/lib/data/season'
```

- [ ] **Step 2: 쿼리 수정** — 기존:

```typescript
  const supabase = createServiceClient()
  const todayStr = kstTodayStr()

  const { data: champions, error: usersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('user_group', 'champion')
```

다음으로 교체:

```typescript
  const supabase = createServiceClient()
  const todayStr = kstTodayStr()

  const championIds = await getCurrentSeasonUserIds(supabase, 'champion')
  const { data: champions, error: usersErr } = await supabase
    .from('users')
    .select('id, email, name')
    .in('id', championIds)
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add app/api/cron/weekly-overdue-nudge/route.ts
git commit -m "refactor(cron): weekly-overdue-nudge 시즌 기준 필터 전환"
```

---

### Task 14: `app/api/mcp/route.ts` — `list_champions` 필터 전환

**Files:**
- Modify: `app/api/mcp/route.ts`

- [ ] **Step 1: import 추가**

```typescript
import { getCurrentSeasonUserIds } from '@/lib/data/season'
```

- [ ] **Step 2: 쿼리 수정** — 기존:

```typescript
      const supabase = createServiceClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('user_group', 'champion')
        .order('name', { ascending: true })
```

다음으로 교체:

```typescript
      const supabase = createServiceClient()
      const championIds = await getCurrentSeasonUserIds(supabase, 'champion')
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .in('id', championIds)
        .order('name', { ascending: true })
```

- [ ] **Step 3: 타입체크 통과 확인**

Run: `bun run typecheck`

- [ ] **Step 4: 커밋**

```bash
git add app/api/mcp/route.ts
git commit -m "refactor(mcp): list_champions 시즌 기준 필터 전환"
```

---

### Task 15: 최종 검증 + 배포 런북

**Files:** 없음 (검증 및 문서화 전용)

- [ ] **Step 1: 전체 검증**

Run: `bun run typecheck && bun run lint && bun run test && bun run build`
Expected: 전부 통과

- [ ] **Step 2: PR 본문에 배포 런북 작성** — 다음 순서를 명시:
  1. `supabase/migrations/20260922000000_create_seasons.sql`부터 `...000003_backfill_season_one.sql`까지 파일명 순서대로 Supabase에 적용
  2. Task 4의 검증 쿼리 3개를 Supabase SQL 편집기에서 실행해 백필 결과 확인
  3. 애플리케이션 코드 배포
  4. 배포 후 스모크 테스트: `/admin`(Gantt), `/admin/champions`(요약 테이블), `/admin/reports`(주간 리포트)를 열어 챔피언 목록이 마이그레이션 이전과 동일한지 확인. cron 엔드포인트(`/api/cron/daily-nudge`, `/api/cron/weekly-overdue-nudge`)는 다음 예정 실행 시각까지 기다리거나 `CRON_SECRET`으로 수동 curl 호출해 확인.
- [ ] **Step 3: `docs/ERD.md` 업데이트** — `seasons`, `season_enrollments` 테이블과 관계, 기존 테이블들의 `season_id`/`previous_charter_id` 컬럼 추가를 반영.
- [ ] **Step 4: `docs/PRD-KO.md` 업데이트** — 시즌(기수) 개념 섹션 추가, champion 판별 기준이 `user_group`에서 "현재 시즌 enrollment"로 바뀌었음을 명시.

---

## 후속 플랜 (이 플랜 범위 밖)

- **시즌 관리 Admin UI** (`/admin/seasons`, 참여자 배정 화면, 전환 확정 액션), **챔피언 화면의 시즌 아카이브 모드**, **Admin 화면들의 시즌 선택 드롭다운** — 이 플랜이 만든 `season_enrollments`/`requireCurrentEnrollment`를 전제로 별도 플랜(`2026-09-22-season-admin-ux.md` 예정)에서 다룬다.
- 일반 사원 뷰어(viewer) 권한 — `docs/superpowers/specs/2026-09-22-viewer-role-design.md`, 이 플랜 완료 후 별도 플랜으로 진행.
