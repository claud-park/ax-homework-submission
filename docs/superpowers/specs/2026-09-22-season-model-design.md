# 시즌(기수) 모델 설계

> **버전** 1.0 · **작성일** 2026-09-22 · **작성자** yr.park@dreamus.io

---

## 배경 및 목표

AX Champion 프로그램을 기수제(시즌)로 운영한다. 현재 존재하는 champion, charter, milestone, check-up session 등 모든 데이터는 "시즌 1"이 된다. 이 문서는 시즌 개념을 도입하기 위한 데이터 모델, 1기 데이터 백필 마이그레이션, 시즌 전환 운영 워크플로, API/화면 스코핑 변경을 다룬다.

**범위 밖 (별도 스펙에서 다룸)**
- 일반 사원(비champion/partner)을 위한 열람 전용 뷰어 권한 — 이 스펙에서 만든 시즌 스코핑을 전제로 후속 설계.
- 기능/UX 로드맵 — 별도 문서로 정리.

---

## 현재 상태 요약

- `users.user_group`(`champion` | `partner`) 컬럼으로 역할 구분, `admin`은 Supabase Auth `app_metadata.is_admin`에서 파생 (`lib/auth.ts`).
- 시즌/기수/cohort 개념은 코드 어디에도 없음 — 모든 시간 관련 필드는 개별 날짜 단위(week_number, session_date 등)이며 기수 단위로 그룹핑하는 FK가 없음.
- `champion`만 걸러내는 쿼리 7곳: `app/api/champions/route.ts`, `lib/data/champions.ts`, `app/api/champions/gantt/route.ts`, `app/api/admin/reports/overview/route.ts`, `app/api/cron/daily-nudge/route.ts`, `app/api/cron/weekly-overdue-nudge/route.ts`, `app/api/mcp/route.ts` — 모두 `.eq('user_group', 'champion')` 패턴.
- 1기는 이미 종료(마무리)되었고, 이탈/중도포기를 나타내는 별도 필드는 없음 (전원 진행 완료로 간주).

---

## 데이터 모델

### 신규 테이블: `seasons`

```sql
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                          -- 예: "시즌 1", "시즌 2"
  status TEXT NOT NULL DEFAULT 'recruiting'
    CHECK (status IN ('recruiting', 'active', 'closed', 'archived')),
  is_current BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동시에 하나의 시즌만 "현재 시즌"일 수 있음
CREATE UNIQUE INDEX seasons_single_current_idx
  ON seasons ((is_current)) WHERE is_current = true;
```

- `status`와 `is_current`는 독립적인 축이다. `status`는 시즌 자체의 진행 단계, `is_current`는 "앱이 기본으로 보여주는 시즌이 어디인가"를 나타낸다. 예: 시즌 1이 `closed` 상태여도 시즌 2가 아직 없으면 `is_current=true`로 남아 기존 화면 동작이 깨지지 않는다.
- 상태 전이: `recruiting → active → closed → archived`. `archived`는 완전 읽기전용을 의미하며 강제하지는 않되(애플리케이션 레벨에서 쓰기 API 차단) 관례로 둔다.

### 신규 테이블: `season_enrollments`

```sql
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
```

- `users`는 "이 사람이 누구인가"만 담당하고, "이번 시즌에 champion/partner로 참여 중인가"는 시점에 따라 바뀌는 사실이므로 분리한다. 한 사람이 시즌1엔 champion, 시즌2엔 partner로 바뀌는 것도 이 구조로 자연스럽게 표현된다.
- `continued_from_enrollment_id`: 시즌을 걸쳐 이어가는 사람의 새 enrollment가 직전 시즌 enrollment를 참조. 신규 참여자는 `NULL`.
- `users.user_group`은 삭제하지 않고 하위호환용 기본값으로 유지한다. 신규 코드는 "현재 시즌의 `role_in_season`"을 유일한 진실 소스로 사용한다.
- `admin`은 이 테이블 대상이 아니다 — 시즌과 무관한 전역 운영 권한이므로 `app_metadata.is_admin` 판별을 그대로 유지한다.

### 기존 테이블 변경: `season_id` 추가

다음 테이블에 `season_id UUID NOT NULL REFERENCES seasons(id)` 추가 (백필 후 NOT NULL 적용):

- `charter_submissions`
- `milestones`
- `check_up_sessions` / `champion_weekly_sessions`
- `session_action_items`

`charter_submissions`에는 참조용 필드 추가:

```sql
ALTER TABLE charter_submissions
  ADD COLUMN previous_charter_id UUID REFERENCES charter_submissions(id);
```

- 시즌을 이어가는 챔피언은 시즌마다 **새 차터를 생성**하고 `previous_charter_id`로 직전 시즌 차터를 참조용으로 연결한다. 차터를 시즌 구분 없이 계속 수정하는 방식은 채택하지 않는다 — 시즌별 진도/리포트가 섞이는 것을 방지하기 위함.

> **정정 (2026-09-22, 구현 중 발견)**: 최초 설계 시 `project_charters`에 붙일 계획이었으나, 실제 운영 DB에는 `project_charters` 테이블이 존재하지 않는 것으로 확인됐다(`app/api/charter/route.ts`만 참조하던 죽은 코드 — 프론트엔드 호출 없음, 라우트와 타입 모두 제거됨). "과제 제출 관련 테이블"이라 뭉뚱그렸던 레거시 `submissions`/`homeworks` 테이블도 코드 조사 결과 이번 시즌 모델 범위에서 제외하기로 확정했다(사용자 결정, 매주 제출 포맷 표준화 로드맵과 함께 별도 처리). 실제 시즌 스코프 테이블은 5개(`charter_submissions`, `milestones`, `check_up_sessions`, `champion_weekly_sessions`, `session_action_items`)이며 전부 배포 완료됨.

---

## 1기 데이터 백필 마이그레이션

단일 트랜잭션으로 실행한다.

1. `seasons`에 "시즌 1" 삽입: `status='closed'` (이미 마무리됨), `is_current=true` (시즌2가 아직 없으므로 계속 현재 시즌으로 유지), `start_date`는 최초 데이터의 `created_at` 기준 역산.
2. `user_group IN ('champion','partner')`인 모든 사용자에 대해 `season_enrollments` 백필:
   - `role_in_season = user_group`
   - `status = 'completed'` (1기 전원 마무리, 이탈 플래그 없음)
   - `continued_from_enrollment_id = NULL` (시즌1은 시작점)
3. 위에 나열한 시즌 스코프 테이블 전체에 `season_id` 컬럼 추가 → 기존 행 전부 시즌1 id로 UPDATE → `NOT NULL` + FK 제약 적용.
4. 인덱스 추가 후 마이그레이션 완료.

**애플리케이션 코드 후속 작업** (이 스펙 범위, 구현은 별도 플랜에서 진행)

- 위에 나열한 `.eq('user_group', 'champion')` 7곳을 "현재 시즌의 `season_enrollments.role_in_season='champion'`" 조건으로 교체.
- 신규 쓰기 API(과제 제출, 차터 작성 등)에 `season_id`를 항상 현재 시즌 기준으로 채우도록 수정.

---

## 시즌 전환 운영 워크플로 (Admin UI)

Admin 화면에서 시즌 생성부터 참여자 배정, 전환 확정까지 전체를 지원한다.

1. **새 시즌 생성**: 이름/시작일 입력 → `recruiting` 또는 `active`로 생성 (아직 `is_current`는 아님).
2. **참여자 배정 화면**: 직전 시즌의 champion/partner 목록을 보여주고 각 인원마다 선택:
   - **이어하기**: 새 `season_enrollments` 생성 (`continued_from_enrollment_id` 연결) + 원하면 "이전 차터 참조 연결"도 함께 처리.
   - **종료(미참여)**: 별도 액션 없음 — 직전 시즌에서 이미 `completed`이므로 새 시즌엔 자연히 포함되지 않음.
   - **신규 챔피언 추가**: 계정이 없으면 초대 → 계정 생성 → 새 시즌 enrollment 신규 생성. 같은 화면에서 처리.
   - partner는 프로그램 전반을 지원하는 역할 특성상 기본값을 "이어하기"로 제안하되, 관리자가 개별적으로 제외할 수 있어야 한다.
3. **전환 확정**: 배정이 끝나면 "현재 시즌으로 전환" 액션 → 단일 트랜잭션으로 직전 시즌 `is_current=false` (+ 필요시 `status='archived'`), 새 시즌 `is_current=true`, `status='active'`.

---

## API/라우트 스코핑 및 화면 동작

**챔피언 화면 (`app/(champion)/*`)**

- 항상 로그인 사용자의 **현재 시즌 enrollment** 기준으로 데이터를 노출한다.
- 현재 시즌에 enrollment가 없는 사용자(직전 시즌에서 이어하지 않은 경우)는 새 제출/수정이 불가능하며, 가장 최근 시즌 기록을 **읽기전용 아카이브**로 본다. 세부 권한 경계는 후속 "일반 사원 뷰어 권한" 스펙에서 다룬다.
- 이어하기 챔피언의 차터 화면에는 "이전 시즌 차터 보기" 참조 링크 노출 (`charter_submissions.previous_charter_id` 기준).

**Admin 화면**

- 챔피언 요약 테이블/간트차트/리포트/칸반은 기본적으로 `is_current=true` 시즌으로 필터링하고, 시즌 선택 드롭다운(`?season=<id>` 쿼리 파라미터)으로 과거 시즌도 조회 가능.
- Cron 넛지(`daily-nudge`, `weekly-overdue-nudge`)와 MCP `list_champions`는 항상 현재 시즌의 champion enrollment만 대상으로 한다.

**API 가드**

- `lib/api/guard.ts`에 `requireCurrentEnrollment(role)` 헬퍼를 추가해, 쓰기 작업 API에서 "현재 시즌에 해당 role로 enrollment가 있는가"를 검증한다. 기존 `requireUser`/`requireAdmin`은 그대로 유지.

---

## 에러 처리

| 케이스 | 응답 |
|---|---|
| 현재 시즌 enrollment 없는 사용자가 쓰기 API 호출 | 403 `"현재 시즌에 참여 중이 아닙니다"` |
| 시즌 전환 중 `is_current` 유니크 제약 위반 | 트랜잭션 롤백, 500 |
| 존재하지 않는 시즌 id로 배정 시도 | 404 |
| `archived` 시즌에 대한 쓰기 시도 | 400 `"종료된 시즌은 수정할 수 없습니다"` |

---

## 구현 범위 요약

1. Supabase migration: `seasons`, `season_enrollments` 테이블 생성
2. Supabase migration: 시즌 스코프 테이블(charter_submissions, milestone, session, action item 등)에 `season_id` 추가 + 1기 백필
3. Supabase migration: `charter_submissions.previous_charter_id` 추가
4. `.eq('user_group', 'champion')` 7곳을 현재 시즌 enrollment 기준으로 교체
5. `lib/api/guard.ts`: `requireCurrentEnrollment` 헬퍼 추가
6. Admin: 시즌 관리 화면 신규 (`/admin/seasons` 등) — 생성/참여자 배정/전환 확정
7. Admin: 챔피언 요약/간트/리포트/칸반에 시즌 선택 드롭다운 추가
8. 챔피언 화면: 현재 시즌 미enrollment 사용자에 대한 읽기전용 아카이브 처리
9. 챔피언 화면: 이어하기 챔피언의 "이전 시즌 차터 보기" 링크
10. Cron/MCP: 현재 시즌 기준 필터링으로 교체
11. `docs/ERD.md`, `docs/PRD-KO.md` 업데이트
