# Entity Relationship Diagram — v2

> ax-homework-submission · Supabase PostgreSQL · Updated 2026-05-15

---

## Original Tables

### `users`
| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | = Supabase auth.users.id |
| email | text | from Google OAuth |
| name | text | from Google OAuth |
| avatar_url | text | from Google OAuth |
| created_at | timestamptz | |

### `homeworks`
| Column | Type | Notes |
|---|---|---|
| 🔑 id | serial PK | auto-increment = homework number |
| title | text NOT NULL | |
| description | text | HTML from TipTap WYSIWYG |
| due_date | date NOT NULL | |
| created_at | timestamptz | |

### `submissions`
| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 user_id | uuid FK | → users.id |
| 🔗 homework_id | int FK | → homeworks.id |
| file_path | text | Supabase Storage path |
| file_name | text | original filename |
| status | enum | `pending` \| `accepted` \| `declined` |
| attempt_number | int | increments per (user_id, homework_id) |
| submitted_at | timestamptz | |

### `comments`
| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 submission_id | uuid FK | → submissions.id |
| body | text NOT NULL | |
| author_role | text | `admin` \| `user` (check constraint) |
| 🔗 author_id | uuid FK | → users.id (null for admin comments) |
| created_at | timestamptz | |
| updated_at | timestamptz | set on edit |

---

## NEW Tables (Project Management Layer)

### `project_charters`
One per champion. Auto-save scratch pad (legacy — UI now uses `charter_submissions` directly).

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 user_id | uuid FK UNIQUE | → users.id (one charter per user) |
| project_name | text | |
| content | jsonb | structured sections: problem, goal, scope, outcomes, risks |
| updated_at | timestamptz | |
| created_at | timestamptz | |

### `charter_submissions`
Each champion's submitted/saved 과제정의서 versions. Mutable — champion can edit and resubmit any entry.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 user_id | uuid FK | → users.id |
| 🔗 homework_id | int FK | → homeworks.id (nullable; one per user+homework) |
| project_name | text | |
| content | jsonb | same shape as project_charters.content |
| submitted_at | timestamptz | original submission time |
| updated_at | timestamptz | last resubmit time |

Unique constraint: `(user_id, homework_id) WHERE homework_id IS NOT NULL` — one 과제정의서 per homework per champion.

`content` jsonb shape:
```json
{
  "problem_definition": "<html>",
  "goal": "<html>",
  "scope_in": "<html>",
  "scope_out": "<html>",
  "expected_outcomes": "<html>",
  "risks": "<html>"
}
```

### `charter_comments`
Threaded feedback on a charter submission. Max depth 2 (top-level + replies).

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 charter_submission_id | uuid FK | → charter_submissions.id ON DELETE CASCADE |
| 🔗 parent_id | uuid FK | → charter_comments.id (null = top-level comment) |
| body | text NOT NULL | plain text |
| author_role | text | `admin` \| `user` (check constraint) |
| 🔗 author_id | uuid FK | → users.id (nullable) |
| is_resolved | boolean | true = admin marked as resolved; top-level only |
| 🔗 resolved_by | uuid FK | → users.id nullable |
| resolved_at | timestamptz | when resolved |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `milestones`
Champion-created weekly WBS items (self-serve).

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 user_id | uuid FK | → users.id |
| 🔗 homework_id | int FK | → homeworks.id (nullable; links milestone to a specific 과제) |
| week_number | int | 1-based week index; defaults to homework_id when created from homework context |
| title | text NOT NULL | |
| description | text | optional |
| start_date | date NOT NULL | |
| due_date | date NOT NULL | |
| status | enum | `not_started` \| `in_progress` \| `completed` \| `delayed` |
| is_manual_progress | boolean | true = user manually set to in_progress |
| display_order | int | ordering within same week |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Status logic (computed server-side, stored for query efficiency):**
- `completed` → has a deliverable uploaded
- `in_progress` → `is_manual_progress = true` (no deliverable yet, user asserts it's ongoing)
- `delayed` → `due_date < today`, no deliverable, `is_manual_progress = false`
- `not_started` → none of the above

### `milestone_deliverables`
File uploads that complete a milestone.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 milestone_id | uuid FK | → milestones.id |
| file_path | text | Supabase Storage path |
| file_name | text | original filename |
| uploaded_at | timestamptz | |

On insert → API route sets `milestones.status = 'completed'`.

### `deadline_change_requests`
Champion requests a due date extension; admin reviews.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 milestone_id | uuid FK | → milestones.id |
| 🔗 user_id | uuid FK | → users.id (requestor) |
| original_due_date | date NOT NULL | |
| requested_due_date | date NOT NULL | |
| reason | text NOT NULL | |
| status | enum | `pending` \| `approved` \| `rejected` |
| 🔗 reviewed_by | uuid FK | → users.id (admin, nullable) |
| 🔗 support_assignee | uuid FK | → users.id (optional AX Office support) |
| review_note | text | admin's response note |
| reviewed_at | timestamptz | |
| created_at | timestamptz | |

On approve → API route updates `milestones.due_date` to `requested_due_date`.

---

## Relationships

```
users             1 ──< N  submissions
homeworks         1 ──< N  submissions
submissions       1 ──< N  comments
users             1 ──< N  comments (via author_id, nullable)

users             1 ──< 1  project_charters
users             1 ──< N  charter_submissions
homeworks         1 ──< 1  charter_submissions (per user, via partial unique index)
charter_submissions 1 ──< N  charter_comments (via charter_submission_id)
charter_comments   1 ──< N  charter_comments (replies, via parent_id, max depth 2)
users             1 ──< N  charter_comments (via author_id)
users             1 ──< N  milestones
homeworks         1 ──< N  milestones (per user; one 과제 has one or more milestones)
milestones        1 ──< N  milestone_deliverables
milestones        1 ──< N  deadline_change_requests
```

---

## Storage Buckets

```
bucket: submissions              (private)
  path: {user_id}/{homework_id}/{attempt_number}/{filename}

bucket: milestone-deliverables   (private)
  path: {user_id}/{milestone_id}/{filename}
```

Both buckets: RLS DENY ALL. Signed URLs generated server-side (60s TTL).

---

## Security

- RLS: **DENY ALL** on all tables and both storage buckets
- All reads/writes via Next.js API routes using **service key** (server-side only)
- Browser never holds service key — only Supabase Auth JWT
