# 시즌 이메일 사전 등록(season_invites) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 아직 로그인하지 않은 사람의 이메일을 시즌에 미리 등록해 두면, 그 사람이 처음 Google 로그인하는 순간 champion/partner 권한과 시즌 enrollment가 자동으로 붙게 한다.

**Architecture:** `season_invites`(시즌×이메일×역할) 테이블을 추가한다. 로그인 콜백(`app/auth/callback/route.ts`)이 `users` upsert 직후 이메일로 미소비 초대를 찾아 `season_enrollments`를 upsert하고 `users.user_group`을 올린 뒤 초대를 소비 처리한다. 관리자 시즌 상세 화면(`/admin/seasons/[seasonId]`)에 이메일 일괄 등록 섹션을 붙이고, 등록 시점에 이미 가입한 이메일이면 즉시 적용한다.

**Tech Stack:** Next.js App Router, Supabase (service client), vitest, bun.

**Spec:** 대화 중 합의된 설계(2026-10-20). 별도 스펙 문서 없음. 배경: `docs/superpowers/specs/2026-09-22-season-model-design.md`, `docs/superpowers/specs/2026-09-22-viewer-role-design.md`.

## Global Constraints

- 신규 가입 기본 `user_group`은 `viewer`(PR #73). 초대 적용은 viewer를 champion/partner로 올리는 유일한 자동 경로다.
- `users.id`는 `auth.users.id`와 같다. 로그인 전에는 `users` 행이 없으므로 초대는 이메일 키로만 저장한다.
- 이메일은 저장·비교 모두 소문자. `ALLOWED_EMAIL_DOMAIN`이 설정돼 있으면 그 도메인 외 이메일은 등록을 거부한다(로그인 자체가 막혀 영원히 소비되지 않으므로).
- 로그인 콜백에서 초대 적용 실패는 로그인 실패로 번지면 안 된다(try/catch + console.error).
- 초대 역할이 `champion`이면 `user_group`을 champion으로 올린다. `partner`면 현재 `viewer`일 때만 partner로 올린다(champion을 partner로 강등하지 않는다).
- 신규 dynamic route 폴더(`[inviteId]`)가 생기므로 최종 검증에 `bun run build`를 포함한다(`feedback_dynamic_route_naming`).
- 커밋 메시지 접두사 `[AX-1]`, Co-Authored-By 라인 필수.

## Review Focus

1. 같은 이메일을 두 시즌에 초대한 사람이 로그인하면 두 enrollment가 모두 생기고 두 초대가 모두 소비돼야 한다. → Task 2 `applyPendingInvitesForUser` 테스트.
2. 이미 champion인 사용자를 partner로 초대해도 `user_group`은 champion으로 남아야 한다. → Task 2 테스트.
3. 대문자·공백·쉼표 섞인 입력(`" A.B@Dreamus.io, c@dreamus.io\n"`)이 정규화·중복 제거돼야 한다. → Task 1 테스트.
4. 이미 가입해 viewer인 사람의 이메일을 등록하면 로그인 없이 즉시 enrollment와 권한이 붙어야 한다. → Task 2 `createSeasonInvites` 테스트.
5. 소비된 초대는 삭제되지 않아야 한다(이력 보존). → Task 2 `deleteSeasonInvite` 테스트.

---

### Task 1: 마이그레이션 + 타입 + 이메일 정규화 순수 함수

**Files:**
- Create: `supabase/migrations/20261020000000_create_season_invites.sql`
- Modify: `lib/types.ts` (SeasonRole 근처)
- Create: `lib/data/season-invites.ts`
- Test: `test/lib/data/season-invites.test.ts`

**Interfaces:**
- Produces: `interface SeasonInvite { id: string; season_id: string; email: string; role_in_season: SeasonRole; consumed_at: string | null; consumed_user_id: string | null; created_at: string }` in `lib/types.ts`
- Produces: `normalizeInviteEmails(raw: string): string[]` — 줄바꿈/쉼표/세미콜론/공백 구분, trim, lowercase, 순서 유지 dedupe, 빈 문자열 제거.
- Produces: `partitionInviteEmails(emails: string[], allowedDomain: string | undefined): { valid: string[]; invalid: string[] }` — `@` 포함·공백 없음 형식 검사, allowedDomain이 있으면 `@${domain}`(대소문자 무시)로 끝나야 valid.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- supabase/migrations/20261020000000_create_season_invites.sql
-- 시즌 이메일 사전 등록. 로그인 전 사용자는 users 행이 없으므로 이메일을 키로 보관하고,
-- 첫 로그인(auth callback) 시 enrollment/user_group으로 변환한 뒤 consumed_at을 찍는다.
CREATE TABLE season_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id),
  email TEXT NOT NULL CHECK (email = lower(email)),
  role_in_season TEXT NOT NULL CHECK (role_in_season IN ('champion', 'partner')),
  consumed_at TIMESTAMPTZ,
  consumed_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, email)
);
CREATE INDEX season_invites_pending_email_idx ON season_invites (email) WHERE consumed_at IS NULL;
ALTER TABLE season_invites ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service key가 RLS를 우회 (season_enrollments와 동일)
```

- [ ] **Step 2: 실패하는 테스트 작성** (`test/lib/data/season-invites.test.ts`)

```ts
describe('normalizeInviteEmails', () => {
  it('splits on newline/comma/semicolon/space, trims, lowercases, dedupes', () => {
    expect(normalizeInviteEmails(' A.B@Dreamus.io, c@dreamus.io\nC@DREAMUS.IO; d@dreamus.io  '))
      .toEqual(['a.b@dreamus.io', 'c@dreamus.io', 'd@dreamus.io'])
  })
  it('returns [] for blank input', () => { expect(normalizeInviteEmails('  \n ')).toEqual([]) })
})
describe('partitionInviteEmails', () => {
  it('rejects malformed and off-domain emails when a domain is set', () => {
    expect(partitionInviteEmails(['a@dreamus.io', 'nope', 'b@gmail.com'], 'dreamus.io'))
      .toEqual({ valid: ['a@dreamus.io'], invalid: ['nope', 'b@gmail.com'] })
  })
  it('accepts any domain when allowedDomain is undefined', () => {
    expect(partitionInviteEmails(['b@gmail.com'], undefined)).toEqual({ valid: ['b@gmail.com'], invalid: [] })
  })
})
```

- [ ] **Step 3: 실패 확인** — `bun run test test/lib/data/season-invites.test.ts` → import 실패
- [ ] **Step 4: `lib/types.ts`에 `SeasonInvite` 추가, `lib/data/season-invites.ts`에 두 함수 구현**
- [ ] **Step 5: 통과 확인** — 같은 명령, PASS
- [ ] **Step 6: Commit** — `[AX-1] feat(db): season_invites 테이블 + 이메일 정규화 헬퍼`

### Task 2: 초대 데이터 함수 (조회·생성·적용·삭제)

**Files:**
- Modify: `lib/data/season-invites.ts`
- Test: `test/lib/data/season-invites.test.ts` (Supabase mock은 `test/lib/data/seasons-admin.test.ts`의 `createSupabaseMock` 패턴을 복제하되, `from(table)` 호출마다 응답 큐를 꺼내는 형태로 확장)

**Interfaces:**
- Produces: `listSeasonInvites(supabase, seasonId): Promise<SeasonInvite[]>` — created_at asc, 에러 시 `[]` + console.error.
- Produces: `applyPendingInvitesForUser(supabase, userId: string, email: string): Promise<{ applied: number }>` — `season_invites`에서 `email = lower(email)` AND `consumed_at IS NULL` 조회 → 각 초대마다 `season_enrollments` upsert(`{season_id, user_id, role_in_season, status:'active'}`, onConflict `season_id,user_id`) → `users.user_group` 갱신 규칙(Global Constraints) → 초대들을 `consumed_at = now ISO, consumed_user_id = userId`로 update. 초대 0건이면 `{applied: 0}`에 DB 쓰기 없음.
- Produces: `createSeasonInvites(supabase, seasonId, emails: string[], role: SeasonRole): Promise<{ created: number; appliedNow: number; skippedConsumed: string[] }>` — 기존 초대 조회 → 소비된 이메일은 skip → 나머지 upsert(onConflict `season_id,email`, 역할 갱신) → `users`에서 `email in (...)`로 가입자 찾아 각자 `applyPendingInvitesForUser` 호출, 적용 수를 `appliedNow`로 반환.
- Produces: `deleteSeasonInvite(supabase, seasonId, inviteId): Promise<void>` — `consumed_at IS NULL` 조건 포함 delete. 삭제 0건이면 throw `Error('이미 적용된 초대는 삭제할 수 없습니다')`.

- [ ] **Step 1: 실패하는 테스트 작성** — 최소 다음 케이스
  - `applyPendingInvitesForUser`: 초대 2건(시즌 A champion, 시즌 B partner) → enrollment upsert 2회, `users.update({user_group:'champion'})`, invites update 1회(in ids), 반환 `{applied: 2}`
  - `applyPendingInvitesForUser`: 현재 user_group champion + partner 초대 → users.update 미호출
  - `applyPendingInvitesForUser`: 초대 없음 → 쓰기 0회, `{applied: 0}`
  - `createSeasonInvites`: 소비된 초대 1건 skip, 가입자 1명 즉시 적용 → `{created: 2, appliedNow: 1, skippedConsumed: ['x@dreamus.io']}`
  - `deleteSeasonInvite`: 삭제 0건 → throws
- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — `bun run test test/lib/data/season-invites.test.ts`
- [ ] **Step 5: Commit** — `[AX-1] feat(seasons): 시즌 초대 조회/생성/적용/삭제 데이터 함수`

### Task 3: 로그인 콜백 연결

**Files:**
- Modify: `app/auth/callback/route.ts:45-52` (users upsert 직후)

**Interfaces:**
- Consumes: `applyPendingInvitesForUser` (Task 2)

- [ ] **Step 1: upsert 직후 추가**

```ts
if (user.email) {
  try {
    await applyPendingInvitesForUser(serviceClient, user.id, user.email.toLowerCase())
  } catch (e) {
    console.error('[auth/callback] applyPendingInvitesForUser failed:', (e as Error).message)
  }
}
```

- [ ] **Step 2: `bun run typecheck` PASS**
- [ ] **Step 3: Commit** — `[AX-1] feat(auth): 로그인 시 시즌 초대 자동 적용`

### Task 4: 관리자 API

**Files:**
- Create: `app/api/admin/seasons/[seasonId]/invites/route.ts` (GET, POST)
- Create: `app/api/admin/seasons/[seasonId]/invites/[inviteId]/route.ts` (DELETE)
- Modify: `app/api/admin/seasons/[seasonId]/route.ts` — 응답에 `invites: SeasonInvite[]` 추가

**Interfaces:**
- POST body `{ emails: string; roleInSeason: SeasonRole }` (`emails`는 원문 텍스트). 처리: `normalizeInviteEmails` → `partitionInviteEmails(…, process.env.ALLOWED_EMAIL_DOMAIN)` → invalid가 있으면 400 `{ error, invalid }` → valid 0건이면 400 → `createSeasonInvites` → 200 `{ ok: true, created, appliedNow, skippedConsumed }`.
- DELETE → 200 `{ ok: true }`, 실패 시 400 `{ error }`.
- 모든 라우트 `requireAdmin` 사용(기존 enrollments 라우트와 동일 패턴).

- [ ] **Step 1: 세 파일 작성**
- [ ] **Step 2: `bun run typecheck && bun run lint` PASS**
- [ ] **Step 3: Commit** — `[AX-1] feat(api): 시즌 초대 관리 라우트`

### Task 5: 시즌 상세 화면 섹션

**Files:**
- Modify: `app/admin/seasons/[seasonId]/SeasonDetailClient.tsx`

**Interfaces:**
- Consumes: GET 응답의 `invites`, POST/DELETE 라우트 (Task 4)

- [ ] **Step 1: "배정 저장" 버튼 아래, "확정 참여자" 위에 섹션 추가**
  - 제목 `이메일로 사전 등록 (로그인 전 참여자)`
  - textarea(placeholder `한 줄에 하나씩, 또는 쉼표로 구분`), 역할 select(champion 기본), 버튼 `등록`
  - 성공 토스트: `${created}명 등록 (즉시 적용 ${appliedNow}명)`; `skippedConsumed`가 있으면 추가 토스트로 안내
  - 400 응답의 `invalid` 목록을 토스트로 표시
  - 표: 이메일 / 역할 / 상태(`대기` 또는 `적용됨 YYYY-MM-DD`) / 삭제 버튼(대기만)
  - 기존 `thStyle`/`tdStyle`/`selectStyle` 재사용
- [ ] **Step 2: `bun run typecheck && bun run lint` PASS**
- [ ] **Step 3: Commit** — `[AX-1] feat(admin): 시즌 상세에 이메일 사전 등록 섹션`

### Task 6: 전체 검증 + 배포 + 운영 적용

- [ ] **Step 1: `bun run test && bun run typecheck && bun run lint`** 전부 PASS
- [ ] **Step 2: placeholder env로 `bun run build`** PASS (dynamic route 충돌 확인)
- [ ] **Step 3: 운영 Supabase에 마이그레이션 적용** (SQL editor 또는 management API) 후 `season_invites` 존재 확인
- [ ] **Step 4: PR 생성 → main 머지 → Vercel production Ready 확인**
- [ ] **Step 5: 관리자 화면에서 2기 시즌에 8명 이메일을 champion으로 등록** (또는 동일 API 호출)
- [ ] **Step 6: Obsidian 미러 문서 작성**
