# Project Pivot Design — Single-Project Champion Model

> ax-homework-submission · 2026-05-26

---

## Overview

The system is being pivoted from a multi-homework submission model (admin creates homework assignments, champions submit files) to a **single-project-per-champion** model. Each champion owns one project defined by a charter document, weekly milestones, and one file submission. Champions can also view a cross-cohort summary table showing all other champions' progress.

---

## 1. Data Model

### Removed Tables

| Table | Reason |
|---|---|
| `homeworks` | No longer needed — each champion owns their project directly |
| `project_charters` | Already marked as legacy in ERD; `charter_submissions` is the source of truth |

### Modified Tables

**`submissions`**
- Remove: `homework_id` FK
- Constraint: unique per `user_id` (latest attempt wins; `attempt_number` kept for resubmit history)

**`charter_submissions`**
- Remove: `homework_id` FK
- Constraint: unique per `user_id` (one charter per champion, always)
- Replace partial unique index `(user_id, homework_id) WHERE homework_id IS NOT NULL` → `UNIQUE (user_id)`

**`milestones`**
- Remove: `homework_id` FK
- All other fields unchanged (`week_number`, `status`, etc.)

### Unchanged Tables

`users`, `comments`, `charter_comments`, `milestone_deliverables`, `deadline_change_requests`

### Department Parsing (no DB change)

`users.name` from Google OAuth follows the format: `이름(Nickname)/부서명/회사명`  
Example: `박이비(Evie)/전략 담당/Dreamus`

Parsing logic (app layer only):

```ts
function parseName(rawName: string) {
  const parts = rawName.split('/')
  return {
    displayName: parts[0]?.trim() ?? rawName,
    department: parts[1]?.trim() ?? '',
  }
}
```

No DB column added. Computed at API response time.

### Final ERD

```
users
  ├─ charter_submissions (1:1, unique user_id)
  │    └─ charter_comments (1:N, threaded max depth 2)
  ├─ milestones (1:N, weekly WBS)
  │    ├─ milestone_deliverables (1:N)
  │    └─ deadline_change_requests (1:N)
  └─ submissions (1:N attempts, unique user_id for latest)
       └─ comments (1:N)
```

### DB Migration SQL

```sql
-- 1. Drop FK columns
ALTER TABLE submissions DROP COLUMN homework_id;
ALTER TABLE charter_submissions DROP COLUMN homework_id;
ALTER TABLE milestones DROP COLUMN homework_id;

-- 2. Update charter_submissions unique constraint
ALTER TABLE charter_submissions
  DROP CONSTRAINT IF EXISTS charter_submissions_user_id_homework_id_unique;
ALTER TABLE charter_submissions
  ADD CONSTRAINT charter_submissions_user_id_unique UNIQUE (user_id);

-- 3. Drop legacy tables
DROP TABLE IF EXISTS homeworks CASCADE;
DROP TABLE IF EXISTS project_charters CASCADE;

-- 4. Update partial indexes
DROP INDEX IF EXISTS charter_submissions_drafts_by_user;
DROP INDEX IF EXISTS milestones_drafts_by_user;
CREATE INDEX charter_submissions_drafts_by_user
  ON charter_submissions(user_id) WHERE publish_status = 'draft';
CREATE INDEX milestones_drafts_by_user
  ON milestones(user_id) WHERE publish_status = 'draft';
```

---

## 2. UI Route Structure

### Champion Routes

| Route | Page | Description |
|---|---|---|
| `/` | Summary Table | Read-only table of all champions. Primary landing page. |
| `/my-project` | My Project | Tabbed view: 과제정의서 · 주별 마일스톤 · 파일 제출 |
| `/champions/[userId]` | Champion Detail | Read-only view of another champion's full project |

**Removed routes:** `/homework/[id]`, `/charter` (standalone), `/milestones` (standalone), `/progress` (standalone)

### Admin Routes

| Route | Page | Description |
|---|---|---|
| `/admin` | Summary Table | Same as champion view with admin edit controls |
| `/admin/champions/[userId]` | Champion Management | Review submission, edit milestone status, charter comments |
| `/admin/kanban` | Kanban | Kept as-is (milestone WBS board) |
| `/admin/requests` | Deadline Requests | Kept as-is |
| `/admin/reports` | Reports | Kept as-is |

**Removed routes:** `/admin/homework/new`, `/admin/homework/[id]`, `/admin/homework/[id]/edit`

### Summary Table Layout

Columns: `부서 | 이름 | 과제명 | 과제정의서 | W1 | W2 | W3 | …`

| Column | Source | Behavior |
|---|---|---|
| 부서 | `users.name` split `/`[1] | Display only |
| 이름 | `users.name` split `/`[0] | Click → champion detail |
| 과제명 | `charter_submissions.project_name` | Click → charter |
| 과제정의서 | charter `publish_status` | `published` → link; `draft` → badge; null → `—` |
| W1, W2… | milestones `week_number` aggregate | 🟢🟡🔴⬜ or `—` if no milestones |

**Week column count:** Dynamic — render columns for all `week_number` values that exist across any champion's milestones. Columns appear in ascending order.

### Weekly Status Aggregate (per champion, per week)

Priority order for the week's milestone set:
1. Any `delayed` → 🔴
2. Any `in_progress` (no delayed) → 🟡
3. All `completed` → 🟢
4. All `not_started` → ⬜ (light gray)
5. No milestones for that week → `—` (dash)

---

## 3. API Layer

### New Endpoints

#### `GET /api/champions`
Returns all champions with summary data for the table.

**Response:**
```ts
interface ChampionSummary {
  userId: string
  name: string           // "오영하(Noah)" — raw first segment
  department: string     // "전략 담당" — parsed second segment
  projectName: string | null
  charterStatus: 'published' | 'draft' | null
  charterSubmissionId: string | null
  weeklyStatus: Record<number, 'completed' | 'in_progress' | 'delayed' | 'not_started'>
}
// returns ChampionSummary[]
```

**Query:** Single JOIN across `users`, `charter_submissions`, `milestones`. Aggregate weekly status in SQL or app layer.

**Access:** All authenticated users (champion + admin).

#### `GET /api/champions/[userId]`
Full project data for one champion (read-only).

**Response:**
```ts
interface ChampionProject {
  user: User
  charter: CharterSubmission & { comments: CharterComment[] } | null
  milestones: Milestone[]  // includes deliverables
  latestSubmission: Submission | null
}
```

**Access:** All authenticated users.

#### `GET /api/my-project`
Current user's full project — same shape as `ChampionProject`. Convenience wrapper over `/api/champions/[me]`.

**Access:** Authenticated champion (own data).

### Modified Endpoints

| Endpoint | Change |
|---|---|
| `POST /api/submissions` | Remove `homework_id` from request body |
| `POST /api/milestones` | Remove `homework_id` from request body |
| `POST /api/charter/submissions` | Remove `homework_id`; enforce one-per-user via unique constraint |
| `GET /api/submissions/mine` | Remove `homework_id` filter; return all of current user's submissions |

### Removed Endpoints

- `GET /api/homeworks`
- `GET /api/homeworks/[id]`
- `GET /api/admin/homeworks` (all variants)
- `GET /api/submissions/mine/[homeworkId]`

### Admin Endpoints (kept/updated)

- `GET /api/admin/kanban` — update query to not join `homeworks`
- `GET /api/admin/milestones` — update query
- `GET /api/admin/deadline-requests` — unchanged
- `GET /api/admin/reports/[weekNumber]` — update query

---

## 4. TypeScript Types

### Updated

```ts
// Remove homework_id from these interfaces
interface Submission {
  id: string
  user_id: string
  // homework_id removed
  file_path: string
  file_name: string
  status: SubmissionStatus
  attempt_number: number
  submitted_at: string
  comments?: Comment[]
  user?: User
}

interface CharterSubmission {
  id: string
  user_id: string
  // homework_id removed
  project_name: string | null
  content: ProjectCharter['content']
  submitted_at: string
  updated_at: string
  publish_status: PublishStatus
}

interface Milestone {
  id: string
  user_id: string
  // homework_id removed
  week_number: number
  title: string
  description: string | null
  start_date: string
  due_date: string
  status: MilestoneStatus
  is_manual_progress: boolean
  display_order: number
  created_at: string
  updated_at: string
  publish_status: PublishStatus
  deliverables?: MilestoneDeliverable[]
}
```

### New

```ts
interface ChampionSummary {
  userId: string
  name: string
  department: string
  projectName: string | null
  charterStatus: PublishStatus | null
  charterSubmissionId: string | null
  weeklyStatus: Record<number, MilestoneStatus>
}

interface ChampionProject {
  user: User
  charter: (CharterSubmission & { comments: CharterComment[] }) | null
  milestones: Milestone[]
  latestSubmission: Submission | null
}
```

### Updated (Kanban)

```ts
// KanbanCard: remove homework references, card is now per-champion
interface KanbanCard {
  userId: string
  // homeworkId, homeworkTitle removed
  user: User
  latestSubmission: {
    id: string
    status: SubmissionStatus
    attemptNumber: number
    fileName: string
    submittedAt: string
  } | null
  milestoneTotal: number
  milestoneCompleted: number
  hasCharter: boolean
  pendingDeadlineRequests: number
}

// KanbanColumn and KanbanDataV2 unchanged
```

### Removed

```ts
// Remove entirely:
interface Homework { ... }
interface HomeworkWithCount { ... }
```

---

## 5. Out of Scope

- Email notifications — existing logic unchanged
- Kanban board UX — columns/cards reworked to remove homework reference but feature kept
- Auth / middleware — unchanged
- Storage buckets — `submissions` bucket path changes from `{user_id}/{homework_id}/{attempt_number}/{filename}` → `{user_id}/{attempt_number}/{filename}`; `milestone-deliverables` path unchanged
- Comment system — unchanged (both `comments` and `charter_comments`)

---

## Implementation Order

1. DB migration (Supabase SQL)
2. Update `lib/types.ts`
3. New API routes (`/api/champions`, `/api/my-project`)
4. Update existing API routes (remove `homework_id`)
5. Remove deleted API routes
6. Champion UI: Summary Table page (`/`)
7. Champion UI: My Project page (`/my-project`)
8. Champion UI: Champion Detail page (`/champions/[userId]`)
9. Admin UI: Summary Table (`/admin`)
10. Admin UI: Champion management (`/admin/champions/[userId]`)
11. Remove deleted pages and routes
