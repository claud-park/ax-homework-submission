# Entity Relationship Diagram — v8

> ax-homework-submission · Supabase PostgreSQL · Updated 2026-09-22

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
| user_group | text | `champion`(default) \| `partner` — CHECK constraint. `admin` 여부는 `auth.users.app_metadata.is_admin`에서 런타임 파생 |

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
| 🔗 user_id | uuid FK | → users.id (UNIQUE constraint dropped in `20260617100002_project_charters_charter_fk.sql` to allow multiple charters per user; uniqueness is intended to be per-season, i.e. one charter per user per season — not currently DB-enforced, follow-up) |
| project_name | text | |
| content | jsonb | structured sections: problem, goal, scope, outcomes, risks |
| updated_at | timestamptz | |
| created_at | timestamptz | |

> **v8 주의**: 이 테이블은 실제 운영 DB에 존재하지 않는 것으로 확인됐다(2026-09-22) — `app/api/charter/route.ts`만 참조하는 죽은 라우트이며 프론트엔드에서 호출하는 곳이 없다. 위 스키마는 `001_initial_schema.sql`에 기록된 대로만 문서화한 것이며, `season_id`/`previous_charter_id`는 이 테이블이 아니라 실제로 쓰이는 `charter_submissions`에 추가됐다 (아래 참고). 이 테이블/라우트를 완전히 제거할지, 복구할지는 별도 결정 필요.

### `charter_submissions`
Each champion's submitted/saved 과제정의서 versions. Mutable — champion can edit and resubmit any entry.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 user_id | uuid FK | → users.id |
| 🔗 homework_id | int FK | → homeworks.id (nullable; one per user+homework) |
| project_name | text | |
| content | jsonb | same shape as project_charters.content |
| 🔗 season_id | uuid FK NOT NULL | → seasons.id (v8, backfilled) |
| 🔗 previous_charter_id | uuid FK nullable | → charter_submissions.id (v8) — 시즌을 이어가는 챔피언의 새 차터가 직전 시즌 차터를 참조용으로 연결 |
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
| source | text | `manual` \| `ai` \| `template` — 생성 출처. default `manual` (migration 023). "smart" 입력 채택률 분석용 |
| 🔗 season_id | uuid FK NOT NULL | → seasons.id (v8, backfilled) |
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

## 1-on-1 Session Tables

> Added v7 (2026-06-24). Admin identity note: `admin_user_id` and `author_id` columns now reference individual admin accounts (`admin_alex@`, `admin_claud@`, `admin_jennifer@dreamus.io`) stored in `auth.users` with `app_metadata.is_admin = true`. The former shared `admin@dreamus.io` account has been deactivated (banned, not deleted — FK integrity preserved).

### `check_up_sessions`
Audio-recorded 1-on-1 check-up sessions between an admin and a champion. Notes are stored as markdown (manual notes + AI summary separated by a `---` divider).

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | `gen_random_uuid()` |
| 🔗 champion_user_id | uuid NOT NULL | → users.id ON DELETE CASCADE |
| 🔗 admin_user_id | uuid | → auth.users(id) ON DELETE SET NULL; individual admin account for attribution |
| session_date | date NOT NULL | auto-set to admin local date (KST) at creation time |
| session_time | time | nullable; HH:mm, auto-set to admin local time at creation time |
| title | text NOT NULL | |
| notes | text | markdown: `[수기 노트]` + `---` + `🤖 AI 요약` sections |
| audio_file_path | text | Storage path: `sessions/{id}/audio.{ext}` |
| recording_duration_sec | int | |
| processing_status | text NOT NULL | default `idle`; CHECK in (`idle`, `uploading`, `transcribing`, `summarizing`, `done`, `error`) |
| raw_transcript | text | Whisper STT output |
| 🔗 season_id | uuid FK NOT NULL | → seasons.id (v8, backfilled) |
| created_at | timestamptz | |
| updated_at | timestamptz | updated on every PATCH; used for optimistic concurrency (`expectedUpdatedAt`) |

INDEX: `(champion_user_id, session_date DESC)`. RLS: champion SELECT own rows only; admin ALL.

### `session_action_items`
Action items generated (or manually added) per session. Champions can toggle completion; admins can edit body text, reorder, add, or delete.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 session_id | uuid NOT NULL | → check_up_sessions(id) ON DELETE CASCADE |
| body | text NOT NULL | action item text; admin-editable inline |
| is_completed | boolean | default `false` |
| completed_at | timestamptz | set when `is_completed` toggled to true |
| display_order | int | default `0`; ordering within session |
| 🔗 season_id | uuid FK NOT NULL | → seasons.id (v8, backfilled) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

INDEX: `(session_id, display_order)`. RLS: champion SELECT + `is_completed` toggle on own session rows; admin ALL.

### `session_comments`
Threaded comments on a session by either admin or champion. Admin `author_id` resolves to individual admin account (not `public.users`); display falls back to `author_role`-based label ("관리자" / "챔피언") to avoid JOIN failures.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 session_id | uuid NOT NULL | → check_up_sessions(id) ON DELETE CASCADE |
| body | text NOT NULL | |
| 🔗 author_id | uuid NOT NULL | → auth.users(id) ON DELETE CASCADE; individual admin or champion UUID |
| author_role | text NOT NULL | CHECK (`admin` \| `champion`) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

INDEX: `(session_id, created_at)`. RLS applied.

### Storage — `check-up-sessions` bucket
```
bucket: check-up-sessions   (private)
  path: sessions/{session_id}/audio.{ext}
  notes: Client uploads directly via signed upload URL (createSignedUploadUrl → uploadToSignedUrl).
         Bypasses Vercel function body limit (4.5 MB). Server receives only the Storage path.
         Admin RLS (ALL). Signed URLs generated server-side.
```

---

## Champion Weekly Sync Tables

> Added 2026-08-24 (`20260824000000_champion_weekly_sync.sql`); not previously documented here — added now alongside the v8 `season_id` column below.

### `champion_weekly_sessions`
Admin-only weekly sync meeting record (distinct from `check_up_sessions`, which is 1-on-1). One row per weekly meeting.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | `gen_random_uuid()` |
| session_date | date NOT NULL | |
| session_time | time | nullable |
| title | text NOT NULL | |
| notes | text | markdown, overall meeting summary |
| 🔗 admin_user_id | uuid FK | → auth.users(id) ON DELETE SET NULL |
| 🔗 season_id | uuid FK NOT NULL | → seasons.id (v8, backfilled) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

INDEX: `(session_date DESC)`. RLS: admin ALL only (no champion access).

### `weekly_champion_updates`
Per-champion update entry attached to a weekly sync session.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 weekly_session_id | uuid FK NOT NULL | → champion_weekly_sessions.id ON DELETE CASCADE |
| 🔗 champion_user_id | uuid FK NOT NULL | → users.id ON DELETE CASCADE |
| project_label | text | |
| summary | text NOT NULL | |
| display_order | int | default `0` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

INDEX: `(weekly_session_id, display_order)`, `(champion_user_id, created_at DESC)`. RLS: admin ALL only. No `season_id` — scoped indirectly via its parent `champion_weekly_sessions.season_id`.

---

## Season Tables

> Added v8 (2026-09-22). Introduces the "기수(cohort)" concept: which champions/partners are active in which season, decoupled from the static `users.user_group`.

### `seasons`
Season (기수) metadata. `status` tracks the season's own lifecycle; `is_current` marks "the season the app shows by default" — the two are independent (e.g. season 1 can be `closed` while still `is_current = true` if season 2 doesn't exist yet).

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | `gen_random_uuid()` |
| name | text NOT NULL | e.g. "시즌 1" |
| status | text NOT NULL | default `recruiting` — CHECK IN (`recruiting`, `active`, `closed`, `archived`) |
| is_current | boolean NOT NULL | default `false` |
| start_date | date | nullable |
| end_date | date | nullable |
| created_at | timestamptz | |

Partial unique index `seasons_single_current_idx` on `(is_current)` WHERE `is_current = true` — only one season can be current at a time.

### `season_enrollments`
Person × season × role. `users` owns "who this person is"; this table owns "is this person a champion/partner in this season" — a fact that changes over time.

| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | |
| 🔗 season_id | uuid FK NOT NULL | → seasons.id |
| 🔗 user_id | uuid FK NOT NULL | → users.id |
| role_in_season | text NOT NULL | CHECK IN (`champion`, `partner`) |
| status | text NOT NULL | default `active` — CHECK IN (`active`, `completed`, `dropped`) |
| 🔗 continued_from_enrollment_id | uuid FK nullable | → season_enrollments.id — links to the person's enrollment in a prior season when they continue across seasons |
| created_at | timestamptz | |

Unique constraint: `(season_id, user_id)`. INDEX: `(season_id, role_in_season)`.

`admin` is out of scope for this table — admin is a season-independent global permission derived from `auth.users.app_metadata.is_admin` (unchanged).

### Backfill (1기)
`20260922000003_backfill_season_one.sql` inserts a single "시즌 1" row (`status='closed'`, `is_current=true`, `start_date` = earliest `users.created_at`), enrolls every existing `user_group IN ('champion','partner')` user as `status='completed'`, backfills `season_id` on all six season-scoped tables above, then sets `season_id NOT NULL` and adds composite indexes on each.

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

users             1 ──< N  check_up_sessions (via champion_user_id)
auth.users        1 ──< N  check_up_sessions (via admin_user_id; individual admin account)
check_up_sessions 1 ──< N  session_action_items
check_up_sessions 1 ──< N  session_comments
auth.users        1 ──< N  session_comments (via author_id; admin OR champion)

auth.users        1 ──< N  champion_weekly_sessions (via admin_user_id)
champion_weekly_sessions 1 ──< N  weekly_champion_updates
users             1 ──< N  weekly_champion_updates (via champion_user_id)

seasons           1 ──< N  season_enrollments
users             1 ──< N  season_enrollments
season_enrollments 1 ──< N  season_enrollments (via continued_from_enrollment_id, self-referential, nullable)
seasons           1 ──< N  charter_submissions
charter_submissions 1 ──< 1  charter_submissions (via previous_charter_id, self-referential, nullable)
seasons           1 ──< N  milestones
seasons           1 ──< N  check_up_sessions
seasons           1 ──< N  champion_weekly_sessions
seasons           1 ──< N  session_action_items
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

bucket: check-up-sessions        (private)
  path: sessions/{session_id}/audio.{ext}
  notes: Client uploads directly via signed upload URL (bypasses Vercel 4.5 MB body limit).
         Admin RLS (ALL). Signed URLs generated server-side.
```

All buckets: RLS DENY ALL by default. Signed URLs generated server-side (60s TTL unless noted above).

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
