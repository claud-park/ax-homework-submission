# Entity Relationship Diagram — v5

> ax-homework-submission · Supabase PostgreSQL · Updated 2026-06-08

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
| user_group | text | `champion`(default) \| `partner` — CHECK constraint. `admin` 여부는 `auth.users.user_metadata.is_admin`에서 런타임 파생 |

### `homeworks`
| Column | Type | Notes |
|---|---|---|
| 🔑 id | serial PK | auto-increment = homework number |
| title | text NOT NULL | |
| description | text | HTML from TipTap WYSIWYG |
| due_date | date NOT NULL | |
| publish_status | enum | `draft` \| `published` — default `published` |
| 🔗 created_by | uuid FK | → users.id (nullable for legacy rows; required for new) |
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
| publish_status | enum | `draft` \| `published` — default `published` |

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
| 🔗 author_id | uuid FK | → auth.users(id) nullable; set by both admin and champion |
| is_resolved | boolean | true = admin marked as resolved; top-level only |
| 🔗 resolved_by | uuid FK | → auth.users(id) nullable |
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
| 🔗 parent_milestone_id | uuid FK nullable | → milestones.id — depth-1 항목은 depth-0 그룹을 가리킴; null이면 depth-0 그룹 |
| week_number | int | 1-based week index; defaults to homework_id when created from homework context |
| title | text NOT NULL | |
| description | text | optional |
| start_date | date nullable | |
| due_date | date nullable | |
| status | enum | `not_started` \| `in_progress` \| `completed` \| `delayed` |
| is_manual_progress | boolean | true = user manually set to in_progress |
| is_manual_completed | boolean | true = champion declared done without file upload (default false) |
| bottleneck_type | text nullable | check: `technical` \| `resource` \| `external` \| `other` — 지연 신고 유형 |
| bottleneck_note | text nullable | 지연 신고 설명 (optional) |
| bottleneck_admin_comment | text nullable | 관리자 답변 텍스트 (null = 미검토 또는 빈 답변) |
| bottleneck_reviewed_at | timestamptz nullable | 관리자가 지연 신고를 확인한 시각 |
| display_order | int | ordering within same week |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| publish_status | enum | `draft` \| `published` — default `published` |

**Status logic (computed server-side, priority order):**

| 우선순위 | 조건 | 결과 상태 |
|---|---|---|
| 1 | `hasDeliverable OR is_manual_completed = true` | `completed` |
| 2 | `bottleneck_type IS NOT NULL` | `delayed` |
| 3 | `is_manual_progress = true` | `in_progress` |
| 4 | `due_date < today` | `delayed` |
| 5 | 나머지 | `not_started` |

**관리자 검토중 판정:**
- 지연 신고 검토중: `bottleneck_type IS NOT NULL AND bottleneck_reviewed_at IS NULL`
- 기한 연장 검토중: 해당 milestone의 `deadline_change_requests` 중 `status = 'pending'` 존재

### `milestone_deliverables`

> **DEPRECATED (v2.0)**: milestone_deliverables 테이블은 v2.0에서 제거됨. 마일스톤 완료는 `is_manual_completed` 플래그로 처리.

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

### `hotline_messages`
Champion-admin direct messaging. One thread per champion (keyed by champion_user_id).

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 champion_user_id | uuid FK | → users.id — 이 스레드의 챔피언 |
| 🔗 sender_id | uuid FK | → users.id — 발신자 (챔피언 또는 어드민) |
| sender_role | text | `champion` \| `admin` (check constraint) |
| body | text NOT NULL | HTML (Tiptap 출력) |
| read_by_champion | boolean | default false |
| read_by_admin | boolean | default false |
| created_at | timestamptz | |

### `hotline_attachments`
File attachments linked to a hotline message.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 message_id | uuid FK | → hotline_messages.id ON DELETE CASCADE |
| file_name | text NOT NULL | original filename |
| file_path | text NOT NULL | Supabase Storage path (`hotline` bucket) |
| file_size | int | bytes |
| mime_type | text | |
| created_at | timestamptz | |

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
auth.users        1 ──< N  charter_comments (via author_id; admin OR champion)
users             1 ──< N  milestones
homeworks         1 ──< N  milestones (per user; one 과제 has one or more milestones)
milestones        1 ──< N  milestone_deliverables
milestones        1 ──< N  deadline_change_requests
users             1 ──< N  hotline_messages (via champion_user_id)
users             1 ──< N  hotline_messages (via sender_id)
hotline_messages  1 ──< N  hotline_attachments
```

---

## Storage Buckets

```
bucket: submissions              (private)
  path: {user_id}/{homework_id}/{attempt_number}/{filename}

bucket: milestone-deliverables   (private)
  path: {user_id}/{milestone_id}/{filename}

bucket: hotline                  (private)
  path: {user_id}/{uuid}/{filename}
  notes: Signed URLs — images: 1-year TTL; documents: 60s TTL
```

Both buckets: RLS DENY ALL. Signed URLs generated server-side (60s TTL).

---

## Security

- RLS: **DENY ALL** on all tables and both storage buckets
- All reads/writes via Next.js API routes using **service key** (server-side only)
- Browser never holds service key — only Supabase Auth JWT

---

## Drafting partial indexes

```sql
homeworks_drafts_by_author          -- on homeworks(created_by)         where publish_status = 'draft'
charter_submissions_drafts_by_user  -- on charter_submissions(user_id)  where publish_status = 'draft'
milestones_drafts_by_user           -- on milestones(user_id)            where publish_status = 'draft'
```

Workload is published-heavy; partial indexes scoped to drafts stay small and serve the "my drafts" hot query without bloating published-row indexes.
