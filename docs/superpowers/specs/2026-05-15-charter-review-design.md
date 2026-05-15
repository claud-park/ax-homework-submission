# Charter Review & Threaded Feedback Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Admin can review each user's 과제정의서 and leave threaded feedback; users can see and reply to admin comments — all inside the existing homework user-detail page.

**Architecture:** Extend `admin/homework/[id]/[userId]` with two new tabs (과제정의서, 마일스톤). Add a new `charter_comments` table for 2-level threaded comments with a resolved/unresolved state. Champion's homework charter tab gains a matching comment section.

**Tech Stack:** Next.js 14 App Router · Supabase PostgreSQL · `apiFetch` client · TipTap (existing, read-only render via `dangerouslySetInnerHTML` + DOMPurify)

---

## 1. Database

### New Table: `charter_comments`

```sql
create table charter_comments (
  id                    uuid primary key default gen_random_uuid(),
  charter_submission_id uuid not null references charter_submissions(id) on delete cascade,
  parent_id             uuid references charter_comments(id) on delete cascade,
  body                  text not null,
  author_role           text not null check (author_role in ('admin', 'user')),
  author_id             uuid references users(id) on delete set null,
  is_resolved           boolean not null default false,
  resolved_by           uuid references users(id) on delete set null,
  resolved_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
```

**Constraints & invariants:**
- `parent_id IS NULL` → top-level comment (admin or user)
- `parent_id IS NOT NULL` → reply; `is_resolved`, `resolved_by`, `resolved_at` are ignored for replies
- Only admin may set `is_resolved = true` (enforced in API route, not DB)
- No depth > 2: API rejects a reply to a reply (parent must have `parent_id IS NULL`)

**Migration file:** `supabase/migrations/006_charter_comments.sql`

---

## 2. TypeScript Types (`lib/types.ts`)

```ts
export interface CharterComment {
  id: string
  charter_submission_id: string
  parent_id: string | null
  body: string
  author_role: 'admin' | 'user'
  author_id: string | null
  is_resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  replies?: CharterComment[]   // populated client-side after fetch
  author?: User                // joined on fetch
}
```

---

## 3. API Routes

### `GET /api/charter/submissions/[id]/comments`
- Auth: `verifyJWT` (user or admin)
- Returns flat list of comments for the charter, ordered by `created_at ASC`
- Client assembles the tree: top-level (`parent_id IS NULL`) + their replies
- Joins `users` for `author_id` to get name/avatar

### `POST /api/charter/submissions/[id]/comments`
- Auth: `verifyJWT`
- Body: `{ body: string }`
- Creates top-level comment with `author_role` derived from JWT (`is_admin` meta → `'admin'`, else `'user'`)
- Returns created comment

### `POST /api/charter/submissions/[id]/comments/[commentId]/replies`
- Auth: `verifyJWT`
- Body: `{ body: string }`
- Validates `commentId` exists and has `parent_id IS NULL` (no reply-to-reply)
- Creates reply with `parent_id = commentId`
- Returns created reply

### `PATCH /api/charter/comments/[commentId]`
- Auth: `verifyJWT`
- Body: `{ body: string }`
- Only allows edit if `author_id = user.id` (own comment)
- Updates `body` and `updated_at`
- Returns updated comment

### `PATCH /api/charter/comments/[commentId]/resolve`
- Auth: `verifyAdmin`
- Body: `{ is_resolved: boolean }`
- Updates `is_resolved`, `resolved_by`, `resolved_at` (null when un-resolving)
- Returns updated comment

---

## 4. Admin UI — `app/admin/homework/[id]/[userId]/page.tsx`

### Tab bar (new)
Add tabs above the existing content:
```
[제출물]  [과제정의서]  [마일스톤 (WBS)]
```
Active tab: blue underline (`var(--blue-600)`). Default: `'submission'` (preserves current behaviour).

### 과제정의서 Tab — `CharterReviewTab`

**Layout:** horizontal split
- **Left panel (flex-1):** Charter content read-only
  - Project name header
  - Each `CHARTER_SECTIONS` key rendered as a card with `dangerouslySetInnerHTML` + `DOMPurify.sanitize`
  - Last modified timestamp
- **Right panel (300px fixed):** Feedback panel
  - Header: "피드백" + filter buttons [미해결 N] [전체]
  - Comment list (filtered by active filter):
    - **Top-level comment card:** left border `var(--blue-600)` for unresolved, `var(--border-subtle)` for resolved
    - Author badge (admin = blue, user = green), name, relative time
    - Body text
    - [✓ 해결] button (admin only) → calls PATCH resolve
    - Resolved state: card opacity 50%, body strikethrough, badge "✓ 해결됨"
    - Reply thread: indented with left border, shows existing replies
    - Inline reply input beneath replies (submit on Enter or button)
    - Admin can edit own comments (inline edit mode on click)
  - Bottom: new top-level comment textarea + [작성] button

**State:**
```ts
const [charter, setCharter] = useState<CharterSubmission | null>(null)
const [comments, setComments] = useState<CharterComment[]>([])
const [filter, setFilter] = useState<'unresolved' | 'all'>('unresolved')
```

### 마일스톤 Tab — `MilestonesAdminTab`

Read-only table showing user's milestones linked to this homework:
- Columns: 마일스톤명 | 기간 | 상태 | 산출물
- Fetches `GET /api/milestones?homework_id={homeworkId}&user_id={userId}`
- Needs new `user_id` query param support in the milestones route (admin path)

> **Note:** Milestone editing stays out of scope — admin view only.

---

## 5. Champion UI — `app/(champion)/homework/[id]/page.tsx`

### Charter Tab — comment section

Below the `CharterEditor` component, add a `CharterCommentSection`:
- Fetches comments for the charter after charter is loaded
- Shows threaded list (same visual structure as admin panel, but without [✓ 해결] button)
- Champion can:
  - Create new top-level comment
  - Reply to any top-level comment
  - Edit own comments (inline)
- Admin comments shown with blue "관리자" badge, champion comments with green "챔피언" badge
- Resolved comments shown dimmed with "✓ 해결됨" badge

---

## 6. ERD Changes

```
charter_submissions  1 ──< N  charter_comments (via charter_submission_id)
charter_comments     1 ──< N  charter_comments (via parent_id, max depth 2)
users                1 ──< N  charter_comments (via author_id)
users                1 ──< N  charter_comments (via resolved_by)
```

---

## 7. Files Changed / Created

| Action | Path |
|--------|------|
| Create | `supabase/migrations/006_charter_comments.sql` |
| Modify | `lib/types.ts` — add `CharterComment` |
| Create | `app/api/charter/submissions/[id]/comments/route.ts` |
| Create | `app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts` |
| Create | `app/api/charter/comments/[commentId]/route.ts` |
| Create | `app/api/charter/comments/[commentId]/resolve/route.ts` |
| Modify | `app/api/milestones/route.ts` — support `user_id` param for admin |
| Modify | `app/admin/homework/[id]/[userId]/page.tsx` — tabs + CharterReviewTab + MilestonesAdminTab |
| Modify | `app/(champion)/homework/[id]/page.tsx` — CharterCommentSection |
| Modify | `docs/ERD.md` — add charter_comments table + relationships |

---

## 8. Out of Scope

- Admin editing charter content (read-only for admin)
- Admin editing milestones
- Push notifications for new comments
- Rich text in comments (plain text only)
- Comment pagination (assume < 50 comments per charter)
