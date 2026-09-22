# 일반 사원 뷰어(viewer) 권한 설계

> **버전** 1.0 · **작성일** 2026-09-22 · **작성자** yr.park@dreamus.io

---

## 배경 및 목표

AX Champion이나 partner가 아닌 일반 사원도 프로그램을 열람할 수 있게 한다. 다만 열람 가능한 정보는 요약 수준으로 제한하고, 관리자가 공개를 명시적으로 승인한 항목만 노출한다. 이 설계는 [`2026-09-22-season-model-design.md`](./2026-09-22-season-model-design.md)에서 정의한 시즌/`season_enrollments` 모델을 전제로 한다.

이번 조사 과정에서 확인된 기존 문제도 함께 다룬다: 현재 회원가입은 이메일 도메인 제한 없이 임의의 Google 계정으로 가능하며, 신규 가입자는 DB `DEFAULT`에 의해 자동으로 `champion` 그룹이 된다 (`app/auth/callback/route.ts`, `supabase/migrations/20260605000000_add_user_group.sql`).

---

## 역할 계층

```
admin (전역, app_metadata.is_admin 파생 — user_group과 무관)
  > champion  — 시즌 참여 대상, 상세 열람 + 제출/쓰기
  > partner   — 상세 열람 (기존과 동일), 시즌 참여는 하지만 과제 제출 없음
  > viewer    — 요약만 열람, 시즌 참여 없음 (신규)
```

- `admin`은 지금처럼 `app_metadata.is_admin`에서 파생되며 `user_group`과 별개로 유지한다.
- `user_group`은 "이 계정이 지금까지 부여받은 적 있는 최상위 접근 등급"을 의미한다. 실제로 어느 시즌에 활성 참여 중인지는 시즌모델 스펙의 `season_enrollments`가 결정한다. 예: 시즌1에서 종료된 챔피언은 `user_group='champion'`을 유지한 채 본인 과거 기록을 읽기전용으로 계속 열람하고, 순수 viewer는 애초에 `season_enrollments` 레코드가 없다.
- `partner`/`champion`의 기존 접근 범위(상세 열람, `(champion)` 레이아웃)는 이번 변경으로 달라지지 않는다.

---

## DB 변경

### `users.user_group`에 `viewer` 추가 및 기본값 변경

```sql
ALTER TABLE users DROP CONSTRAINT users_user_group_check;  -- 실제 제약명은 마이그레이션 적용 시 확인
ALTER TABLE users ADD CONSTRAINT users_user_group_check
  CHECK (user_group IN ('champion', 'partner', 'viewer'));
ALTER TABLE users ALTER COLUMN user_group SET DEFAULT 'viewer';
```

- 기존 champion/partner 사용자 데이터는 그대로 유지된다. `DEFAULT` 변경은 이 마이그레이션 이후 신규 가입자에게만 적용된다.

### `charter_submissions`에 공개 플래그 추가

```sql
ALTER TABLE charter_submissions ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
```

- 기본값 `false` — 관리자가 차터 리뷰 화면에서 명시적으로 켜야 viewer에게 노출된다.
- **정정 (2026-09-22)**: 이 스펙 최초 작성 시 `project_charters`에 걸 계획이었으나, 시즌 모델 배포 중 `project_charters`가 실제 운영 DB에 존재하지 않는 죽은 테이블임이 확인되어(해당 라우트 `app/api/charter/route.ts`와 함께 제거됨 — `docs/superpowers/specs/2026-09-22-season-model-design.md` 참고) 실제로 쓰이는 `charter_submissions`로 대상을 변경했다.

---

## 가입 플로우 변경 (이메일 도메인 제한)

**현재 문제**: `app/auth/callback/route.ts`는 `exchangeCodeForSession` 성공 시 도메인 검증 없이 바로 `users` 테이블에 upsert한다. 임의의 Google 계정 소유자가 로그인만 하면 서비스에 들어올 수 있다.

**변경**

- `app/login/page.tsx`의 `signInWithOAuth({ provider: 'google' })` 호출에 `queryParams: { hd: 'dreamus.io' }`를 추가해 계정 선택 단계에서부터 사내 계정을 유도한다. (UX 힌트일 뿐 보안 통제 아님 — 사용자가 "다른 계정 사용"으로 우회 가능)
- `app/auth/callback/route.ts`에서 `exchangeCodeForSession` 이후, upsert 하기 전에 서버사이드로 이메일 도메인을 검증한다:

```ts
if (!user.email?.endsWith('@dreamus.io')) {
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login?error=domain_not_allowed', request.url))
}
```

이 서버사이드 체크가 실제 보안 경계이며, 기존 admin 로그인(`app/admin/login/page.tsx`)의 "로그인 후 조건 불충족 시 즉시 로그아웃" 패턴과 동일한 방식이다.

---

## 뷰어 화면

### 신규 라우트: `app/(viewer)/gallery`

- champion 레이아웃과 분리된 경량 레이아웃 (사이드바/탭 없이 갤러리 + 시즌 선택 드롭다운만).
- 시즌 선택 드롭다운은 admin 화면의 시즌 필터(`?season=<id>`)와 동일한 패턴을 재사용한다. 과거 시즌도 조회 가능.
- 카드에는 프로젝트명, 한 줄 소개, 진행상태 배지만 표시한다. 차터 상세 내용, 마일스톤, 1:1 세션 관련 정보는 화면에서 숨기는 게 아니라 **API 응답 자체에 포함하지 않는다**.

### 신규 API: `GET /api/viewer/charters?season=<id>`

- `requireUser`만 요구한다 (champion/partner/viewer 누구나 호출 가능 — 응답이 요약 필드뿐이라 champion/partner에게 노출돼도 문제 없다).
- `season_id = <요청 시즌>` AND `is_public = true`인 차터만 조회.
- 응답 shape:
```ts
{
  championName: string
  projectTitle: string
  oneLiner: string
  statusBadge: 'in_progress' | 'completed' | ...  // 기존 status 값 재사용
}[]
```
- 소스 필드 매핑: `championName`은 `users.name`(파싱 필요), `projectTitle`은 `charter_submissions.project_name`, `oneLiner`는 `charter_submissions.title` 또는 `content.summary` 중 구현 단계에서 더 짧고 사용자에게 노출하기 적합한 쪽을 선택, `statusBadge`는 `charter_submissions.publish_status`/`admin_approved_at` 조합으로 유도한다(정확한 배지 값 매핑은 구현 단계에서 결정).

### admin 차터 리뷰 화면 변경

- 차터 상세/리뷰 화면에 "일반사원에게 공개" 토글 추가 → `PATCH`로 `is_public` 값 변경.

### `/admin/users` 화면 변경

- 기존 champion/partner 2단 토글을 champion/partner/viewer 3단 토글로 확장.
- `admin` 그룹으로는 여전히 변경 불가 (기존 정책 유지, `app/api/admin/users/[userId]/route.ts`의 400 응답 그대로).

---

## 라우트 가드 변경

- `middleware.ts`: 로그인 사용자가 `user_group === 'viewer'`이면서 `(champion)` 라우트(`/`, `/my-project`, `/homework`, `/charter`, `/milestones`, `/progress`, `/pairing`)에 접근 시 → `/gallery`로 리다이렉트.
- `viewer`는 애초에 `season_enrollments`가 없으므로, 시즌모델 스펙의 `requireCurrentEnrollment` 가드에 의해 모든 쓰기 API에서 자동으로 403 처리된다 — 별도 viewer 전용 쓰기 차단 로직을 추가할 필요 없음.

---

## 승격 흐름 (viewer → champion/partner)

관리자가 신규 시즌에 사람을 참여시킬 때:

1. `/admin/users`에서 해당 사용자의 `user_group`을 `champion` 또는 `partner`로 변경.
2. 시즌모델 스펙의 "참여자 배정 화면"에서 해당 시즌 `season_enrollments` 레코드 생성.

두 액션은 API상 별개이지만, 신규 챔피언 온보딩 시나리오에서는 함께 수행되는 것이 일반적인 흐름이다. (하나의 "시즌에 참여자로 추가" 액션으로 UI에서 묶어 처리하는 것은 구현 단계에서 결정)

---

## 에러 처리

| 케이스 | 응답 |
|---|---|
| `@dreamus.io`가 아닌 이메일로 로그인 시도 | 세션 종료 + `/login?error=domain_not_allowed`로 리다이렉트 |
| viewer가 `(champion)` 라우트 직접 접근 | `/gallery`로 리다이렉트 |
| viewer가 쓰기 API 호출 | 403 (enrollment 없음, 시즌모델 스펙의 가드가 처리) |
| admin이 `user_group='admin'`으로 변경 시도 | 400 (기존 정책 유지) |
| 비공개(`is_public=false`) 차터 | `/api/viewer/charters` 응답에서 제외 (에러 아님) |

---

## 구현 범위 요약

1. Supabase migration: `users.user_group` CHECK에 `viewer` 추가 + `DEFAULT` 변경
2. Supabase migration: `charter_submissions.is_public` 컬럼 추가
3. `app/login/page.tsx`: OAuth 요청에 `hd=dreamus.io` 힌트 추가
4. `app/auth/callback/route.ts`: 이메일 도메인 서버사이드 검증 + 실패 시 로그아웃/리다이렉트
5. `middleware.ts`: viewer의 `(champion)` 라우트 접근 시 `/gallery` 리다이렉트 추가
6. 신규 라우트 `app/(viewer)/gallery/page.tsx` + 경량 레이아웃
7. 신규 API `GET /api/viewer/charters`
8. Admin 차터 리뷰 화면: "일반사원에게 공개" 토글 추가
9. `/admin/users` 화면: champion/partner/viewer 3단 토글로 확장
10. `docs/ERD.md`, `docs/PRD-KO.md` 업데이트

---

## 후속 로드맵 (이번 스펙 범위 밖)

- 시즌 배정 화면에서 "viewer → champion/partner 승격 + 시즌 배정"을 단일 액션으로 묶는 UX
- viewer 갤러리에 필터/검색 추가 (프로젝트 카테고리 등, 규모가 커질 경우)
