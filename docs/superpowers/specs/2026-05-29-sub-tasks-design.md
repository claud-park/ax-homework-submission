# Sub-tasks (하위과제) Design Spec

> ax-homework-submission · 2026-05-29

---

## Overview

챔피언의 프로젝트(과제) 안에 **하위과제** 개념을 추가한다. 하위과제는 마일스톤을 그룹핑하는 컨테이너이며, 챔피언이 직접 생성·관리한다. 깊이는 `과제 → 하위과제 → 마일스톤` 2레벨로 제한한다.

```
챔피언 프로젝트(과제)
  ├─ 마일스톤 A        ← 하위과제 없이 직접
  ├─ 하위과제 1
  │    ├─ 마일스톤 B
  │    └─ 마일스톤 C
  └─ 하위과제 2
       └─ 마일스톤 D
```

---

## 1. 데이터 모델

### 새 테이블: `sub_tasks`

```sql
CREATE TABLE sub_tasks (
  id            uuid          primary key default uuid_generate_v4(),
  user_id       uuid          not null references users(id) on delete cascade,
  title         text          not null,
  description   text,
  display_order int           not null default 0,
  publish_status publish_status not null default 'draft',
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

ALTER TABLE sub_tasks ENABLE ROW LEVEL SECURITY;
-- No policies: all direct client access denied (service key bypasses RLS)
```

### 변경 테이블: `milestones`

```sql
ALTER TABLE milestones
  ADD COLUMN sub_task_id uuid references sub_tasks(id) on delete set null;
```

- `sub_task_id = null` → 하위과제 없이 프로젝트에 직접 속하는 마일스톤
- `sub_task_id IS NOT NULL` → 특정 하위과제에 속하는 마일스톤
- 하위과제 삭제 시 소속 마일스톤의 `sub_task_id`는 `null`로 (SET NULL, cascade delete 아님)

### ERD (변경 후)

```
users
  ├─ charter_submissions (1:1)
  │    └─ charter_comments
  ├─ sub_tasks (1:N)                     ← 신규
  │    └─ milestones (1:N, sub_task_id)
  ├─ milestones (1:N, sub_task_id=null)
  │    ├─ milestone_deliverables
  │    └─ deadline_change_requests
  └─ submissions (1:N)
       └─ comments
```

---

## 2. TypeScript 타입

### 새 타입

```ts
export interface SubTask {
  id: string
  user_id: string
  title: string
  description: string | null
  display_order: number
  publish_status: PublishStatus
  created_at: string
  updated_at: string
  milestones?: Milestone[]
}
```

### 변경 타입

```ts
// Milestone: sub_task_id 추가
export interface Milestone {
  // ... 기존 필드 유지
  sub_task_id: string | null
}

// ChampionProject: sub_tasks 배열 추가
export interface ChampionProject {
  user: User
  charter: (CharterSubmission & { comments: CharterComment[] }) | null
  sub_tasks: SubTask[]           // 신규
  milestones: Milestone[]        // sub_task_id=null인 마일스톤만 포함
  latestSubmission: Submission | null
}
```

---

## 3. API

### 새 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/sub-tasks` | 현재 유저의 하위과제 목록 (소속 milestones 포함) |
| `POST` | `/api/sub-tasks` | 하위과제 생성 (title 필수, description optional) |
| `PATCH` | `/api/sub-tasks/[id]` | 하위과제 수정 (title, description, publish_status, display_order) |
| `DELETE` | `/api/sub-tasks/[id]` | 하위과제 삭제 (소속 마일스톤 sub_task_id → null) |

**접근 제어:** 챔피언 본인만 자신의 sub_task CRUD 가능. 어드민은 챔피언 상세 조회 시 읽기 전용.

### 변경 엔드포인트

| Endpoint | 변경 내용 |
|---|---|
| `POST /api/milestones` | body에 `sub_task_id` 추가 (optional) |
| `PATCH /api/milestones/[id]` | body에 `sub_task_id` 추가 (optional, 재배치용) |
| `GET /api/champions/[userId]` | response에 `sub_tasks` 배열 추가 |
| `GET /api/champions/gantt` | sub_task 그룹핑 정보 포함 |

---

## 4. UI

### WBS 탭 (`/my-project` → 마일스톤 탭)

**구조:**
```
[하위과제 없는 마일스톤]
  • 마일스톤 A
  • 마일스톤 B

▼ [하위과제 1] ──────────────────── [수정] [삭제] [+ 마일스톤]
  • 마일스톤 C
  • 마일스톤 D

▶ [하위과제 2] ──────────────────── [수정] [삭제] [+ 마일스톤]
  (접힌 상태)

[+ 하위과제 추가]
```

**동작:**
- 하위과제 헤더 클릭 → 마일스톤 목록 fold/unfold
- 기본 상태: 모두 펼쳐진 상태 (unfold)
- 접힌 상태에서도 헤더 액션(수정/삭제/마일스톤 추가) 사용 가능
- 접힘 상태는 로컬 UI state (새로고침 시 초기화)
- 마일스톤 생성 시 어느 하위과제에 속할지 선택 가능 (없음 포함)
- 마일스톤을 다른 하위과제로 이동 가능 (sub_task_id 변경)

### 체크인 탭

- 동일하게 하위과제별 foldable 그룹화
- 체크인 기능(완료/지연/연장)은 마일스톤 단위로 그대로 유지

### Gantt 뷰

- 하위과제명을 행 그룹 레이블로 표시
- 기존 마일스톤 바 디자인 유지
- Gantt에서는 fold 미지원 (읽기 전용)

### 어드민 챔피언 상세

- 하위과제 구조 읽기 전용으로 표시
- 어드민이 직접 생성/수정/삭제 불가

---

## 5. 마이그레이션 전략

기존 마일스톤은 모두 `sub_task_id = null`로 유지 → 하위과제 없는 직접 마일스톤으로 취급. 데이터 이전 불필요.

---

## 6. Out of Scope

- 하위과제 간 마일스톤 drag & drop 재배치
- 하위과제 자체의 상태(status) 계산 (마일스톤 상태로부터 집계)
- 3레벨 이상 중첩 (명시적으로 제외)
- 어드민의 하위과제 생성/수정/삭제

---

## 구현 순서

1. DB 마이그레이션 (`sub_tasks` 테이블 생성, `milestones.sub_task_id` 추가)
2. `lib/types.ts` 업데이트 (`SubTask` 추가, `Milestone`·`ChampionProject` 수정)
3. `/api/sub-tasks` CRUD 엔드포인트 구현
4. `/api/milestones` POST·PATCH에 `sub_task_id` 지원 추가
5. `/api/champions/[userId]` 응답에 `sub_tasks` 포함
6. WBS 탭 UI — 하위과제 foldable 그룹 + 관리 기능
7. 체크인 탭 UI — 하위과제 foldable 그룹
8. Gantt 뷰 — 하위과제 행 그룹 레이블
9. 어드민 챔피언 상세 — 하위과제 읽기 전용 표시
