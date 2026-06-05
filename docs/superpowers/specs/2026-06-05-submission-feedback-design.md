# Submission Feedback Design

**Date:** 2026-06-05
**Status:** Approved

---

## Overview

Admin이 champion의 각 submission에 단방향 피드백을 남길 수 있는 기능을 추가한다. 피드백은 status 변경(accepted/declined) 시점에 작성하며, champion view의 my-project/submission 페이지에서 읽기 전용으로 노출된다.

---

## Schema

### `submissions` 테이블에 컬럼 추가

```sql
ALTER TABLE submissions
  ADD COLUMN feedback text,
  ADD COLUMN feedback_updated_at timestamptz;
```

- `feedback`: 관리자가 작성한 피드백 텍스트. nullable (선택 사항).
- `feedback_updated_at`: 피드백 마지막 수정 시각.

### ERD 업데이트

기존 `submissions` 테이블에 두 컬럼만 추가. 별도 테이블 없음.

```
submissions
├── id uuid PK
├── user_id uuid FK → auth.users
├── homework_id int (nullable)
├── file_path text (nullable)
├── file_name text (nullable)
├── link_url text (nullable)
├── status submission_status
├── attempt_number int
├── submitted_at timestamptz
├── feedback text          ← NEW
└── feedback_updated_at timestamptz ← NEW
```

---

## TypeScript Types

`lib/types.ts`의 `Submission` 인터페이스에 추가:

```ts
export interface Submission {
  // ... existing fields
  feedback: string | null        // NEW
  feedback_updated_at: string | null  // NEW
}
```

---

## API Changes

### `PATCH /api/admin/submissions/[id]`

기존 status 변경 endpoint에 `feedback` 필드를 선택적으로 수신한다.

**Request body:**
```json
{
  "status": "accepted" | "declined",
  "feedback": "string (optional)"
}
```

**동작:**
- `feedback`이 전달되면 `feedback`, `feedback_updated_at = now()` 를 함께 업데이트
- `feedback`이 없으면 기존 feedback 유지 (덮어쓰지 않음)
- `feedback`이 빈 문자열(`""`)이면 `null`로 저장

**Response:** 기존과 동일 (`Submission` 객체 반환), `feedback` 필드 포함

### `GET /api/submissions/mine`

반환하는 submission 객체에 `feedback`, `feedback_updated_at` 포함 (SELECT * 이므로 자동 포함).

---

## Admin UI

### SubmissionDetailPanel 변경

**변경 위치:** status를 `accepted` 또는 `declined`로 변경하는 버튼 클릭 시 나타나는 확인 영역(confirm section). `reviewing` 등 중간 상태 변경 시에는 feedback 입력 없음.

**추가 UI:**
- accepted/declined 버튼을 클릭했을 때 인라인으로 펼쳐지는 confirm 블록에 textarea 추가
- 레이블: "피드백 (선택)"
- placeholder: "이번 제출에 대한 피드백을 남겨주세요"
- textarea style: 기존 input style과 동일
- 기존 피드백이 있으면 textarea에 pre-fill
- 확인 버튼 클릭 시 `{ status, feedback }` 함께 PATCH

---

## Champion UI

### my-project/submission SubmissionClient 변경

**노출 위치:** submission 목록의 각 행(row) 또는 카드에서, `feedback`이 존재할 때 하단에 표시

**UI 스펙:**
- 말풍선/인용 블록 스타일
- 레이블: "관리자 피드백" (text-xs, `var(--text-disabled)`)
- 본문: feedback 텍스트 (text-sm, `var(--text-secondary)`)
- 좌측 border accent: `var(--blue-600)` (charter comment 스타일과 동일)
- `feedback_updated_at` 표시 (시간 포맷: `toLocaleString('ko-KR')`)

---

## Migration

새 migration 파일 생성:

```
supabase/migrations/021_submission_feedback.sql
```

---

## Scope

- **In scope:** feedback 작성(status 변경 시), champion view 표시, types 업데이트, migration
- **Out of scope:** champion이 feedback에 답글 달기, feedback 단독 수정(status 변경 없이), 알림(notification)
