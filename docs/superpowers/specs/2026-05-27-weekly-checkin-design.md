# Weekly Check-in Design Spec

## Overview

Champions log in weekly and report progress on their current milestone(s). Four possible actions per milestone: 완료, 지연 신고, 기한 연장, 진행 중. Admin receives email for 지연 신고 and 기한 연장.

## Architecture

New tab (`주간 체크인`) added alongside the existing `WBS` tab on `/my-project/milestones`. Both tabs share the same data fetch, the same milestone list state, and the same right-side detail panel. Tab switching is instant (no new fetch). Cross-navigation from check-in → WBS pre-opens a specific milestone's detail panel via shared `selectedMilestoneId` state.

---

## Section 1: Data Model

### New columns on `milestones` table

| Column | Type | Default | Purpose |
|---|---|---|---|
| `bottleneck_type` | `text` nullable | `null` | Enum: `technical` / `resource` / `external` / `other` |
| `bottleneck_note` | `text` nullable | `null` | Optional description of the bottleneck |
| `is_manual_completed` | `boolean` | `false` | Champion declared milestone done without file upload |

### Updated `computeStatus()` logic (in `app/api/milestones/[id]/route.ts`)

Status is computed (never directly written) from these fields in priority order:

```
1. hasDeliverable || is_manual_completed  → 'completed'
2. bottleneck_type IS NOT NULL            → 'delayed'
3. is_manual_progress                     → 'in_progress'
4. due_date < today                       → 'delayed'
5. otherwise                              → 'not_started'
```

### TypeScript type additions (in `lib/types.ts`)

```ts
export type BottleneckType = 'technical' | 'resource' | 'external' | 'other'

// Add to Milestone interface:
bottleneck_type: BottleneckType | null
bottleneck_note: string | null
is_manual_completed: boolean
```

### Supabase migration (run in dashboard SQL editor)

```sql
ALTER TABLE milestones
  ADD COLUMN bottleneck_type  text    CHECK (bottleneck_type IN ('technical','resource','external','other')),
  ADD COLUMN bottleneck_note  text,
  ADD COLUMN is_manual_completed boolean NOT NULL DEFAULT false;
```

---

## Section 2: UI — Check-in Tab

### Location

`/my-project/milestones` page — tab toggle at the top of the page replaces the current standalone publish filter:

```
[ WBS ]  [ 주간 체크인 ]
```

When the check-in tab is active, the right-side panel and the publish filter are hidden. The tab state is local (`useState`) — no URL change needed.

### Milestone categorisation (client-side, from fetched milestones)

**이번 주** — milestones where `start_date <= today <= due_date` AND `status !== 'completed'`

**지연 / 미완료** — milestones where `due_date < today` AND `status !== 'completed'`

**완료됨** — milestones with `status === 'completed'` that fall in the above date ranges (shown greyed, collapsed by default, no actions)

Milestones with `due_date > today` (future weeks) are not shown in the check-in tab.

### Card layout (per milestone)

```
┌─────────────────────────────────────────────────────┐
│  W2 · 이비 밥주기                    ~2026-05-28    │
│  [●] in_progress                                    │
│                                                     │
│  [✅ 완료]  [⚠ 지연 신고]  [📅 기한 연장]  [▶ 진행 중]  │
│                                  자세히 보기 →      │
└─────────────────────────────────────────────────────┘
```

- Status badge uses existing `STATUS_COLOR` + `STATUS_LABEL` from the milestones page
- `자세히 보기 →` switches to `WBS` tab and sets `selectedMilestoneId` to pre-open the detail panel
- For `completed` milestones: show ✅ badge only, no action buttons, card is visually muted

### Empty state

If no milestones fall into "이번 주" or "지연/미완료": show a single centred message — "이번 주 체크인할 마일스톤이 없습니다. WBS 탭에서 마일스톤을 추가해보세요."

---

## Section 3: Action Modals

### 완료 (Confirm dialog)

```
제목: 마일스톤을 완료로 표시하시겠어요?
설명: 완료 후에도 WBS 탭에서 파일을 첨부할 수 있습니다.
버튼: [취소]  [완료로 표시]
```

**On confirm:** `PATCH /api/milestones/[id]` with `{ is_manual_completed: true, bottleneck_type: null, bottleneck_note: null }`

After success: fires `notifyMilestoneCompleted` (wired up in PATCH handler), toast "완료로 표시되었습니다."

### 지연 신고 (Structured form modal)

```
제목: 지연 신고
  
  지연 유형 *
  ┌──────────────────────────────┐
  │ 기술적 문제              ▾   │  ← dropdown
  └──────────────────────────────┘
  옵션: 기술적 문제 / 리소스 부족 / 외부 의존성 / 기타

  설명 (선택)
  ┌──────────────────────────────┐
  │                              │  ← textarea, 3 rows
  └──────────────────────────────┘
  
버튼: [취소]  [신고하기]
```

**On submit:** `PATCH /api/milestones/[id]` with `{ bottleneck_type, bottleneck_note, is_manual_completed: false, is_manual_progress: false }`

After success: fires `notifyBottleneck` (new function), toast "지연 신고가 완료되었습니다. 관리자에게 알림이 전송되었습니다."

### 기한 연장 (Reuse existing flow)

Reuses the existing deadline change request modal already present on the milestones page (date picker + reason textarea + POST to `/api/milestones/[id]/deadline-request`). No new modal needed — call `openDeadlineModal(milestoneId)` from the check-in card.

### 진행 중 (No modal)

One-click. `PATCH /api/milestones/[id]` with `{ is_manual_progress: true, bottleneck_type: null, bottleneck_note: null, is_manual_completed: false }`

Immediately shows toast "진행 중으로 표시되었습니다." No confirmation needed.

---

## Section 4: API Changes

### `PATCH /api/milestones/[id]` (modify `app/api/milestones/[id]/route.ts`)

1. Update `computeStatus()` to accept and honour the three new fields per the priority order in Section 1.
2. After a successful update, call notification functions based on what changed:
   - `is_manual_completed` became `true` → call `notifyMilestoneCompleted(user, updatedMilestone)`
   - `bottleneck_type` changed from null → call `notifyBottleneck(user, updatedMilestone, body.bottleneck_type, body.bottleneck_note)`
3. The three new fields are passed through in `body` and merged into `patch` (existing behaviour).

### New: `notifyBottleneck` (in `lib/notifications.ts`)

```ts
export async function notifyBottleneck(
  user: User,
  milestone: Milestone,
  type: BottleneckType,
  note: string | null
): Promise<void>
```

Email to admin(s) with:
- Subject: `[AX] 지연 신고 — {userName} · W{weekNumber} {milestoneTitle}`
- Body: champion name, department, milestone title, week number, due date, bottleneck type (Korean label), note (if provided)

Korean labels for bottleneck types:
- `technical` → 기술적 문제
- `resource` → 리소스 부족
- `external` → 외부 의존성
- `other` → 기타

### `notifyMilestoneCompleted` (already in `lib/notifications.ts`)

Already exists but unwired. Wire it up in the PATCH handler when `is_manual_completed` transitions to `true`.

---

## Section 5: File Structure

| File | Change |
|---|---|
| `app/(champion)/my-project/milestones/page.tsx` | Add tab toggle; add `CheckinTab` component (new section in same file); wire cross-navigation via shared `selectedMilestoneId` state |
| `app/api/milestones/[id]/route.ts` | Update `computeStatus()`; add notification triggers |
| `lib/types.ts` | Add `BottleneckType`, extend `Milestone` interface |
| `lib/notifications.ts` | Add `notifyBottleneck()` |
| Supabase dashboard | Run migration SQL (3 new columns) |

No new route files. No new component files beyond what's added inside the milestones page.

---

## Edge Cases

- **Milestone has no `start_date` or `due_date`**: excluded from check-in tab (can't determine "this week")
- **Milestone is draft**: excluded from check-in tab (only published milestones shown)
- **Champion clicks 진행 중 on an already-in_progress milestone**: still fires PATCH (idempotent), shows toast
- **지연 신고 with bottleneck_type already set**: overwrites the previous report; admin gets a new email
- **기한 연장 request already pending**: existing milestone page already shows request status — no change needed
