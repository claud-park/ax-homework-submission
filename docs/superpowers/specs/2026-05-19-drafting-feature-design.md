# Drafting feature for Homework / Charter / Milestone — Design

> ax-homework-submission · Created 2026-05-19 · Author: yr.park@dreamus.io

## Purpose

Add an explicit **Draft → Publish** lifecycle to the three core authoring flows: homework (admin), charter (champion), milestone (champion). Today these flows have no draft concept — anything saved is immediately live. Users want a safety net for work-in-progress that does not yet trigger notifications, does not appear to other roles, and does not enforce required-field validation until the user is ready to share it.

## Decisions captured during brainstorming

| Q | Decision |
|---|---|
| What does "Drafting" mean? | Explicit `draft` / `published` state on each entity. No autosave layer. |
| Role scope | Apply only where the flow already exists today (admin homework, champion charter, champion milestone). Add the missing admin **EDIT homework** page since the original request explicitly includes "EDIT homework". |
| Cardinality | Multiple drafts per user per entity allowed. |
| List surfacing | Inline with a 임시저장 badge + 3-position filter (전체 / 게시됨 / 임시저장). |
| Privacy | Author-only. Drafts invisible to other roles entirely. |
| Edit-after-publish | Stays published. Editing a published record updates it live. |
| Validation | Drafts skip validation. `published` enforces required fields. |
| Storage | Single `publish_status` enum column on each entity table (Approach A). |
| Badge copy | `임시저장` |
| Charter draft + comments | Hide comment panel entirely when viewing a draft. |
| Milestone draft + deliverable | Disable upload button on drafts with tooltip. |

## Out of scope

- Submissions table (`submissions`) — file submissions already have their own `pending/accepted/declined` lifecycle.
- `milestone_deliverables` — deliverables are uploaded to published milestones only.
- `deadline_change_requests` — only meaningful for published milestones.
- Autosave / per-keystroke persistence — only explicit save actions are supported.
- Optimistic locking / multi-tab conflict resolution — last-write-wins, matching today's behavior.
- Champion-side homework creation, admin-side charter/milestone creation, or any new role-flow combos beyond the missing admin EDIT homework page.

---

## Data model

### New enum

```sql
create type publish_status as enum ('draft', 'published');
```

### Migration `supabase/migrations/008_drafting.sql`

```sql
create type publish_status as enum ('draft', 'published');

alter table homeworks
  add column publish_status publish_status not null default 'published',
  add column created_by uuid references users(id);

alter table charter_submissions
  add column publish_status publish_status not null default 'published';

alter table milestones
  add column publish_status publish_status not null default 'published';

create index homeworks_drafts_by_author
  on homeworks(created_by) where publish_status = 'draft';
create index charter_submissions_drafts_by_user
  on charter_submissions(user_id) where publish_status = 'draft';
create index milestones_drafts_by_user
  on milestones(user_id) where publish_status = 'draft';

-- Rollback (manual):
--   alter table homeworks drop column publish_status, drop column created_by;
--   alter table charter_submissions drop column publish_status;
--   alter table milestones drop column publish_status;
--   drop type publish_status;
```

**Why default `'published'`:** all existing rows are treated as already published. The migration is non-destructive and zero-downtime — old API code reading the table works unchanged. New inserts via the API explicitly set the status.

**Why nullable `created_by` on homeworks:** historic homeworks have no recorded author. Nullable lets the migration succeed without a guess. New homeworks set it from `verifyAdmin(req).id`. Privacy rule: an admin can see only drafts where `created_by = self.id`; null-author drafts cannot exist going forward.

**Why partial indexes:** the workload is published-heavy; drafts are the minority. Indexes scoped to `where publish_status = 'draft'` stay small, and the two hot queries — "my drafts" and "all published" — are both fast.

### TypeScript types (`lib/types.ts`)

```ts
export type PublishStatus = 'draft' | 'published'

export interface Homework {
  // existing fields
  publish_status: PublishStatus
  created_by: string | null
}

export interface CharterSubmission {
  // existing fields
  publish_status: PublishStatus
}

export interface Milestone {
  // existing fields
  publish_status: PublishStatus
}
```

---

## API surface

**Common pattern:** every create/update request carries `publish_status: 'draft' | 'published'`. Server runs required-field validation only when `'published'`.

### Homework (admin)

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/admin/homeworks` | Body: `{ title?, description?, due_date?, publish_status }`. Sets `created_by = admin.id`. Validates `title + due_date` only on publish. |
| PATCH | `/api/admin/homeworks/[id]` | **NEW.** Body: any subset of `{ title, description, due_date, publish_status }`. Validates on publish or when current row is published. Once published, edits stay published. |
| DELETE | `/api/admin/homeworks/[id]` | **NEW.** Allowed only when `publish_status = 'draft'`. Returns 409 with `"게시된 과제는 삭제할 수 없습니다"` if attempted on a published row. |
| GET | `/api/admin/homeworks` | Returns rows where `publish_status = 'published'` **OR** (`publish_status = 'draft'` AND `created_by = admin.id`). |
| GET | `/api/homeworks` (champion-facing) | Returns only `publish_status = 'published'`. |

### Charter (champion)

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/charter/submissions` | Body adds `publish_status`. On publish, validate `project_name` and `content.problem_definition`, `content.goal`, `content.scope_in`, `content.scope_out` (non-empty after HTML strip). `expected_outcomes` and `risks` are optional. |
| PATCH | `/api/charter/submissions/[id]` | Authorize `user_id = caller.id`. Body adds `publish_status`. Validate on publish or when current row is published. Required fields match POST above. |
| GET | `/api/charter/submissions` (mine) | Returns caller's drafts + published. |
| GET | `/api/charter/submissions?homework_id=X` (admin viewer) | Returns only `publish_status = 'published'`. |
| GET | `/api/admin/charters` | Returns only `publish_status = 'published'`. |

### Milestone (champion)

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/milestones` | Body adds `publish_status`. Validate `title + start_date + due_date + week_number` only on publish. |
| PATCH | `/api/milestones/[id]` | Authorize `user_id = caller.id`. Body adds `publish_status`. Validate on publish or when current row is published. |
| GET | `/api/milestones` (mine) | Returns caller's drafts + published. |
| GET | `/api/admin/milestones` | Returns only `publish_status = 'published'`. |

### Downstream feature gating

| Surface | Change |
|---|---|
| `/api/admin/kanban` | `KanbanCard.hasCharter` and `milestoneTotal` / `milestoneCompleted` count published only. |
| `lib/notifications.ts` callers | Email helpers are unchanged. **Callers** (API route handlers for submission/comment/deliverable/deadline) must check `publish_status === 'published'` on the parent entity before invoking notification helpers. |
| Deadline change request | Hide the "기한 변경 요청" button in the champion milestone UI when row is a draft. |
| Charter comments | Implicitly safe — admin cannot see draft charters, so no comments can be created on them. No code change. |

### Status transition rules (server-side defense)

| Current row status | Body `publish_status` | Result |
|---|---|---|
| `draft` | `'draft'` | Save changes, stay draft. No validation. |
| `draft` | `'published'` | Validate required fields. On success, transition to published. On fail, 400, stay draft. |
| `draft` | omitted | Treat as `'draft'` (no transition). |
| `published` | `'published'` | Validate required fields. Save changes. (Editing a published row keeps it published per Q5.) |
| `published` | `'draft'` | **400** `{ error: 'invalid_transition', message: 'Cannot revert published item to draft' }`. UI's `<SaveOrPublishButtons>` never offers this, but server defends. |
| `published` | omitted | Treat as `'published'`. Validate and save. |

### Authorization failure modes

- PATCH from non-owner on a draft → **403**.
- GET single draft by non-owner → **404** (preserves existence privacy).
- Non-admin hitting `/api/admin/homeworks/[id]` → **403**.

### Validation failure response shape

```ts
// 400 response on publish with missing required fields
{ error: 'validation_failed', fields: [{ field: 'title', message: '필수 항목입니다.' }] }
```

Entity remains a draft. No partial state change.

---

## UI components & pages

### Shared primitives (new)

**`components/DraftBadge.tsx`** — small chip rendering `임시저장`, amber-tinted background, used in all list views.

**`components/PublishStatusFilter.tsx`** — 3-position segmented control: `전체 / 게시됨 / 임시저장`. Controlled component. Filter state lives in URL query param `?status=draft|published|all` for shareability and reload-persistence.

**`components/SaveOrPublishButtons.tsx`** — accepts the entity's current `publish_status` and two handlers `onSaveDraft()`, `onPublish()`. Decides which buttons to render:

- `'draft'` (or new entity): `[임시저장] [게시하기]`
- `'published'`: `[저장]` (single button; edit-after-publish stays published)

Single source of truth for the button-rule.

### Page changes — Homework (admin)

| Page | Change |
|---|---|
| `app/admin/homework/new/page.tsx` | Replace single submit button with `<SaveOrPublishButtons>`. Save Draft → POST `'draft'`; Publish → POST `'published'`. After Save Draft, redirect to the new edit page. |
| `app/admin/homework/[id]/edit/page.tsx` (NEW) | Edit form mirroring `new`, prefilled via GET. Button set driven by current `publish_status`. PATCH on submit. Delete button (alert dialog) visible only for drafts. |
| `app/admin/page.tsx` | Each homework card shows title + due_date + `<DraftBadge>` if draft + "편집" link → edit page. `<PublishStatusFilter>` at top. Draft cards have no "submissions" link (no submissions exist for an unpublished homework). |

### Page changes — Charter (champion)

| Page | Change |
|---|---|
| `app/(champion)/charter/page.tsx` | `<PublishStatusFilter>` above the grouped list. `<SubmissionCard>` shows `<DraftBadge>` when draft. `<CharterPanel>` save buttons replaced with `<SaveOrPublishButtons>` driven by `submission?.publish_status ?? 'draft'`. |
| `<CharterCommentPanel>` mounting | Conditionally rendered: hidden entirely when `submission.publish_status === 'draft'`. Editor panel takes full width in that case. |
| Grouping | Drafts mix into existing homework groups by `homework_id` (drafts without `homework_id` fall into "독립 과제정의서"). Filter applies before grouping. |

### Page changes — Milestone (champion)

| Page | Change |
|---|---|
| `app/(champion)/milestones/page.tsx` | `<PublishStatusFilter>` above the table. Each row shows `<DraftBadge>` next to title when draft. Inline add form uses `<SaveOrPublishButtons>`. Edit modal uses `<SaveOrPublishButtons>` driven by current row's status. |
| Deadline-request button | Conditionally rendered: `{m.publish_status === 'published' && (m.status === 'delayed' \|\| m.status === 'in_progress') && ...}`. |
| Deliverable upload button | Disabled for drafts. Tooltip: `"임시저장 마일스톤은 산출물을 업로드할 수 없습니다. 먼저 게시해주세요."` |

### Page changes — Admin views (downstream)

| Page | Change |
|---|---|
| `app/admin/kanban/page.tsx` | No code change — API filtering does the work. |
| `app/admin/progress/page.tsx` | No code change — API filtering does the work. |
| `app/(champion)/progress/page.tsx` | Filter to `publish_status = 'published'` only. Progress is a "what's done" metric; drafts are pre-work. |

### Unsaved-changes dialog (charter + milestone modal)

Existing charter dialog gets a third option. New milestone modal dialog mirrors it.

```
"저장하지 않은 변경사항이 있습니다."
  [계속 편집]   [임시저장 후 닫기]   [저장 안 함]
```

---

## Edge cases & error handling

- **Concurrent edits:** last-write-wins. No optimistic-lock column added. Matches today's behavior.
- **Publish validation fail:** 400 with `{ field, message }[]`; entity stays a draft; client renders inline errors and a toast `"게시 실패: 필수 항목을 확인해주세요"`.
- **Save-draft fail (network/500):** toast `"임시저장 실패"`; client state retained; no redirect.
- **Delete a published homework:** 409 with explanatory message.
- **List empty under filter:** existing `<EmptyState>` with title `"임시저장된 항목이 없습니다"`.
- **Filter persistence:** URL query param `?status=...`.

---

## Testing strategy

The repo has no test runner configured. Introducing one solely for this feature is out of scope per YAGNI. Verification plan:

### Manual test matrix (runs against `npm run dev` + local Supabase)

| # | Surface | Scenario | Expected |
|---|---|---|---|
| 1 | Admin create homework | "임시저장" with empty form | Saves draft, redirects to edit page, no validation |
| 2 | Admin create homework | "게시하기" with empty form | 400, inline errors on title + due_date |
| 3 | Admin dashboard | Filter = 임시저장 | Only admin's own drafts |
| 4 | Champion `/api/homeworks` | Admin has 1 draft + 2 published | Champion sees 2 |
| 5 | Admin edit homework | Edit published row, save | Updates immediately, no badge appears |
| 6 | Admin edit homework | Draft → publish with valid fields | Badge disappears, row visible to champions |
| 7 | Champion charter | Save draft with only project_name | Saved, badge appears in list |
| 8 | Champion charter | Publish draft with missing scope_in | 400, inline error |
| 9 | Champion charter | Admin views `/api/admin/charters` | Drafts NOT in response |
| 10 | Champion charter draft | Open panel | Comment panel hidden, editor full-width |
| 11 | Champion milestone | Save draft, no dates | Saves with badge |
| 12 | Champion milestone draft | "기한 변경 요청" button | Not rendered |
| 13 | Champion milestone draft | "📤 과제 업로드" button | Disabled, tooltip shown |
| 14 | Kanban | Champion has draft charter | `hasCharter = false` |
| 15 | Kanban | Champion has draft milestone | Not counted in milestoneTotal |
| 16 | Notifications | Publish a charter | Admin email fires |
| 17 | Notifications | Save a draft | No email fires |
| 18 | Unsaved-changes dialog | "임시저장 후 닫기" | Saves draft, closes panel |
| 19 | Delete | DELETE published homework | 409 |
| 20 | Delete | DELETE draft homework | 204 |
| 21 | Transition | PATCH published item with `publish_status: 'draft'` | 400 `invalid_transition` |

### Static checks

- `tsc --noEmit` (or `npm run build`) must pass with new `publish_status` field on all entity types and consumers.

---

## Rollout

Single PR, single deploy:

1. Run migration `008_drafting.sql` against Supabase.
2. Deploy app: new endpoints + filtered queries + UI changes.
3. Smoke-test the matrix above.
4. Verify email gating by saving a champion test draft and confirming no admin notification fires.

## Deliverables

- `supabase/migrations/008_drafting.sql`
- `docs/ERD.md` updated with new column, FK, and partial-index notes
- All new/edited files listed above
- This spec, committed alongside
- Obsidian planning entry at `/Users/claud_01/Documents/flo` (per documentation rule)
