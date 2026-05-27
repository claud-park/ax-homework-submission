# Check-in Status Workflow & Admin Response Design Spec

## Overview

Refines the weekly check-in tab to restrict available actions by milestone status, adds a [관리자 검토중] pending-review tag, and gives admin the ability to respond to delay reports (지연 신고) via a comment — displayed in the champion's check-in card using the charter comment visual style.

---

## Section 1: Data Model

### New columns on `milestones` table

| Column | Type | Default | Purpose |
|---|---|---|---|
| `bottleneck_admin_comment` | `text` nullable | `null` | Admin's response text to the delay report |
| `bottleneck_reviewed_at` | `timestamptz` nullable | `null` | When admin marked the delay report as reviewed |

### Reset on re-filing

When a champion submits a new delay report (`bottleneck_type` changes via `PATCH /api/milestones/[id]`), the PATCH handler resets both columns to `null`:
```ts
bottleneck_admin_comment: null,
bottleneck_reviewed_at: null,
```

This keeps the "관리자 검토중" cycle fresh for each new filing.

### 관리자 검토중 判定 logic

| 상황 | 조건 |
|---|---|
| 지연 신고 검토중 | `bottleneck_type IS NOT NULL AND bottleneck_reviewed_at IS NULL` |
| 기한 연장 검토중 | 해당 milestone의 `DeadlineChangeRequest` 중 `status === 'pending'` 존재 |

### Supabase migration

```sql
-- supabase/migrations/011_milestone_bottleneck_review.sql
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS bottleneck_admin_comment text,
  ADD COLUMN IF NOT EXISTS bottleneck_reviewed_at timestamptz;
```

### TypeScript additions (`lib/types.ts`)

```ts
// Add to Milestone interface:
bottleneck_admin_comment: string | null
bottleneck_reviewed_at: string | null
```

---

## Section 2: Champion CheckinTab UI

### Status-based button rules

| Milestone status | Available actions |
|---|---|
| `not_started` | 기한 연장 · 진행 중 |
| `in_progress` | 지연 신고 · 기한 연장 · 완료 |
| `delayed` | 지연 신고 · 기한 연장 · 완료 |
| `completed` | — (no buttons, card greyed out) |

### 관리자 검토중 tag

When an action has a pending admin review, **replace that button** with a disabled [관리자 검토중] pill:

- **기한 연장** → replaced when pending `DeadlineChangeRequest` exists (`status === 'pending'`)
- **지연 신고** → replaced when `bottleneck_type IS NOT NULL AND bottleneck_reviewed_at IS NULL`

Both conditions can be true simultaneously — both buttons replaced independently.

```
예: in_progress + 지연 신고 검토중
→ [관리자 검토중] · [기한 연장] · [완료]

예: in_progress + 둘 다 검토중
→ [관리자 검토중] · [관리자 검토중] · [완료]
```

Tag style: amber/warning pill, `cursor: default`, not clickable.

### Admin response display

When `bottleneck_reviewed_at IS NOT NULL`, show the admin comment inside the milestone card using **charter comment visual style**:

```
┌─────────────────────────────────────────┐
│ W2 · 이비 밥주기              ~2026-05-28│
│ [●] 지연                               │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ [관리자]  2026-05-27 14:30          │ │  ← blue admin badge + relative time
│ │ 확인했습니다. 다음 주까지 계속       │ │
│ │ 진행해주세요.                       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [지연 신고] [기한 연장] [완료]           │  ← 지연 신고 button reappears after review
└─────────────────────────────────────────┘
```

Comment box styling mirrors `CharterCommentPanel` existing patterns:
- Blue left border (`3px solid var(--blue-600)`)
- `[관리자]` badge: `background: rgba(37,99,235,0.08)`, `color: var(--blue-600)`
- Relative timestamp (same `timeAgo()` utility)
- `font-size: 12px`, `color: var(--text-secondary)`

---

## Section 3: Admin UI — Delay Report Review

### Location

`/admin/requests` page — new "**지연 신고**" section added **above** the existing "기한 변경 요청" section.

### Card layout (per pending delay report)

```
┌─────────────────────────────────────────────────────┐
│ 박챔피언 · 개발팀                                    │
│ W3 · API 연동 구현              지연 유형: 기술적 문제│
│ "외부 API 스펙이 바뀌어서 재작업 중입니다"            │
│                                                     │
│ 답변                                                │
│ ┌─────────────────────────────────────────────────┐ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                               [확인 완료]            │
└─────────────────────────────────────────────────────┘
```

- 답변 텍스트 없이도 [확인 완료] 클릭 가능 (빈 comment = 확인만)
- 완료 후 카드가 목록에서 즉시 사라짐
- Section title에 pending 건수 badge: "지연 신고 **2건 대기중**"
- 대기 건수 0이면 섹션 헤더만 보임 ("대기중인 지연 신고가 없습니다.")

### Admin actions on confirmation

`PATCH /api/admin/milestones/[id]/bottleneck-review` called with `{ admin_comment: string }`:
- Sets `bottleneck_admin_comment = body.admin_comment` (can be empty string)
- Sets `bottleneck_reviewed_at = NOW()`
- Does **not** change `bottleneck_type`, `bottleneck_note`, or `status`
- Returns updated milestone row

---

## Section 4: API

### New: `GET /api/admin/milestones/bottleneck-pending`

Admin-only. Returns milestones where:
```sql
bottleneck_type IS NOT NULL
AND bottleneck_reviewed_at IS NULL
AND publish_status = 'published'
```

Joined with `users` table for champion name and department. Response shape:
```ts
{
  id: string
  user_id: string
  week_number: number
  title: string
  bottleneck_type: BottleneckType
  bottleneck_note: string | null
  due_date: string
  user: { name: string; email: string }
}[]
```

### New: `PATCH /api/admin/milestones/[id]/bottleneck-review`

Admin-only (`verifyAdmin`). Body: `{ admin_comment: string }`.

Updates:
```ts
{
  bottleneck_admin_comment: body.admin_comment,
  bottleneck_reviewed_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}
```

Returns updated milestone row.

### Modified: `PATCH /api/milestones/[id]`

When `body.bottleneck_type` is non-null and differs from `existing.bottleneck_type`, reset the admin review columns in the patch object:
```ts
if (body.bottleneck_type != null) {
  patch.bottleneck_admin_comment = null
  patch.bottleneck_reviewed_at = null
}
```

---

## Section 5: File Structure

| File | Change |
|---|---|
| `lib/types.ts` | Add `bottleneck_admin_comment: string \| null`, `bottleneck_reviewed_at: string \| null` to `Milestone` |
| `app/(champion)/my-project/milestones/page.tsx` | Status-based button logic in `MilestoneCard`; 관리자 검토중 tag; admin comment display |
| `app/admin/requests/page.tsx` | New "지연 신고" section with pending cards and review form |
| `app/api/admin/milestones/bottleneck-pending/route.ts` | New — pending delay reports list |
| `app/api/admin/milestones/[id]/bottleneck-review/route.ts` | New — admin review submission |
| `app/api/milestones/[id]/route.ts` | Reset `bottleneck_admin_comment/reviewed_at` when new delay report filed |
| `supabase/migrations/011_milestone_bottleneck_review.sql` | 2 new columns |

---

## Edge Cases

- **Admin clicks 확인 완료 with empty comment**: allowed — `bottleneck_admin_comment = ''` is stored, `bottleneck_reviewed_at` is set. Champion sees no comment bubble (only show bubble when comment is non-empty).
- **Champion files new 지연 신고 after admin reviewed**: resets both admin columns → [관리자 검토중] tag reappears immediately, admin sees card again in their list.
- **Both 기한 연장 and 지연 신고 pending on same milestone**: both buttons independently replaced by [관리자 검토중] tags. Only [완료] button remains (for in_progress/delayed status).
- **`not_started` milestone with pending 기한 연장**: [관리자 검토중] · [진행 중] — one tag, one button.
