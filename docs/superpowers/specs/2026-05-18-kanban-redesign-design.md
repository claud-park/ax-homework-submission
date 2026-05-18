# Kanban 재설계 Implementation Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 어드민 칸반을 파일 제출 단위에서 챔피언 × 과제 통합 진행 단계 보드로 전환한다.

**Architecture:** API가 챔피언 × 과제 조합마다 마일스톤·과제정의서·최신 제출을 집계해 `KanbanCard[]`를 반환하고, 프론트엔드는 5개 컬럼(미시작/진행중/검토중/합격/불합격)에 카드를 배치한다. 컬럼 이동 DnD는 검토중 → 합격/불합격 방향만 허용하며, 나머지 컬럼 이동은 실제 데이터 변경(제출, 마일스톤 추가)에 의해 자동 반영된다.

**Tech Stack:** Next.js 14 App Router, Supabase PostgreSQL, @dnd-kit/core, TypeScript

---

## 데이터 모델

### 새 타입: `KanbanCard`

```ts
// lib/types.ts에 추가
export interface KanbanCard {
  // 식별
  userId: string
  homeworkId: number
  homeworkTitle: string
  user: User

  // 제출
  latestSubmission: {
    id: string
    status: SubmissionStatus
    attemptNumber: number
    fileName: string
    submittedAt: string
  } | null

  // 마일스톤
  milestoneTotal: number
  milestoneCompleted: number   // status === 'completed'

  // 과제정의서
  hasCharter: boolean

  // 기한변경요청
  pendingDeadlineRequests: number
}

export type KanbanColumn = 'not_started' | 'in_progress' | 'reviewing' | 'accepted' | 'declined'

export interface KanbanDataV2 {
  not_started: KanbanCard[]
  in_progress: KanbanCard[]
  reviewing: KanbanCard[]
  accepted: KanbanCard[]
  declined: KanbanCard[]
}
```

### 컬럼 배치 로직 (서버에서 계산)

```
accepted   : latestSubmission.status === 'accepted'
reviewing  : latestSubmission.status === 'pending'
declined   : latestSubmission.status === 'declined'
in_progress: latestSubmission === null AND (milestoneTotal > 0 OR hasCharter)
not_started: latestSubmission === null AND milestoneTotal === 0 AND !hasCharter
```

`declined` 후 새 제출이 들어오면 → `reviewing`으로 자동 이동.

---

## API 변경

### `GET /api/admin/kanban`

**파라미터:** `?homework_id=N` (optional, 없으면 전체 과제)

**서버 집계 쿼리:**
1. `users` 전체 조회
2. `homeworks` 전체 조회 (homework_id 필터 적용 시 해당 과제만)
3. `submissions` — `user_id`, `homework_id` 기준 최신 1건씩 (`ROW_NUMBER` 또는 JS groupBy)
4. `milestones` — `(user_id, homework_id)` 별 `count(*)` + `count(*) WHERE status='completed'`
5. `charter_submissions` — `(user_id, homework_id)` EXISTS 여부
6. `deadline_change_requests` — `(user_id)` 기준 `status='pending'` count (milestone JOIN으로 homework 연결)

**응답 shape:** `KanbanDataV2`

---

## 프론트엔드 변경

### `app/admin/kanban/page.tsx` 전면 재작성

**컬럼 정의 (디자인 시스템 CSS 변수 기반):**

> globals.css 정의: `--text-disabled:#94a3b8` `--amber:#d97706` `--blue-600:#2563eb` `--success:#16a34a` `--error:#dc2626` `--border-subtle:#e2e8f0`

```ts
const COLS: { key: KanbanColumn; label: string; color: string; cardBorder: string; cardBg: string }[] = [
  { key: 'not_started', label: '미시작',  color: 'var(--text-disabled)', cardBorder: 'var(--border-subtle)',    cardBg: 'var(--surface-secondary)' },
  { key: 'in_progress', label: '진행 중', color: 'var(--amber)',          cardBorder: 'rgba(217,119,6,0.3)',    cardBg: 'rgba(217,119,6,0.04)'     },
  { key: 'reviewing',   label: '검토 중', color: 'var(--blue-600)',       cardBorder: 'rgba(37,99,235,0.3)',    cardBg: 'rgba(37,99,235,0.04)'     },
  { key: 'accepted',    label: '합격',    color: 'var(--success)',         cardBorder: 'rgba(22,163,74,0.3)',    cardBg: 'rgba(22,163,74,0.04)'     },
  { key: 'declined',    label: '불합격',  color: 'var(--error)',           cardBorder: 'rgba(220,38,38,0.3)',    cardBg: 'rgba(220,38,38,0.04)'     },
]
```

각 카드의 아바타 배경 tint, 마일스톤 바 색상, badge 색상도 동일 변수 기반으로 파생:
- 아바타 bg: `rgba(<해당 컬럼 RGB>,0.12)`
- 마일스톤 바 fill: 컬럼 `color` 변수 직접 사용
- 뱃지 (과제정의서): `rgba(37,99,235,0.1)` + `var(--blue-600)` 텍스트
- 뱃지 (기한변경요청): `rgba(220,38,38,0.1)` + `var(--error)` 텍스트

**카드 컴포넌트 (`KanbanCard`):**
- 챔피언 아바타(이니셜 fallback) + 이름
- 과제 번호 + 타이틀 (전체 과제 선택 시 표시)
- 마일스톤 진행 바: `milestoneCompleted / milestoneTotal` (total=0이면 숨김)
- 과제정의서 뱃지: `hasCharter` === true일 때만 표시
- 기한변경요청 경고: `pendingDeadlineRequests > 0`일 때 `⚠️ N건` 표시
- 제출 정보: `latestSubmission`이 있을 때 파일명 + 시도 횟수

**DnD 동작:**
- `useDraggable`: `reviewing` 컬럼 카드만 draggable
- `useDroppable`: `accepted`, `declined` 컬럼만 drop target
- drag end → `PATCH /api/admin/submissions/[submissionId]` `{ status }`
- optimistic update → 실패 시 롤백 + toast

**과제 필터:**
- 기존 `<select>` 유지, `?homework_id=N` 쿼리 파라미터
- `전체 과제` 선택 시: 모든 카드 표시 (카드에 과제 번호 표시)

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|---------|
| `lib/types.ts` | `KanbanCard`, `KanbanColumn`, `KanbanDataV2` 추가, `KanbanData` 유지(deprecated) |
| `app/api/admin/kanban/route.ts` | 전면 재작성 — 집계 로직 |
| `app/admin/kanban/page.tsx` | 전면 재작성 — 새 카드/컬럼 UI |

---

## 에러 처리

- API 집계 실패 → 500, 클라이언트에서 toast "데이터 로드 실패"
- DnD status 변경 실패 → optimistic rollback + toast "상태 변경 실패. 되돌립니다."
- `latestSubmission` 없는 카드를 drag → disabled (draggable 조건: `reviewing` 컬럼 only)
