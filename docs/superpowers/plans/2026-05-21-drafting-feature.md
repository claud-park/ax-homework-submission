# Drafting Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit `draft` / `published` lifecycle to homework (admin), charter (champion), and milestone (champion) entities — drafts are private to the author, skip required-field validation, and do not trigger notifications.

**Architecture:** Single `publish_status` enum column added to `homeworks`, `charter_submissions`, `milestones`. All existing rows backfill to `'published'` via column default. API endpoints filter drafts out for non-authors and validate required fields only when status is `'published'`. UI surfaces three shared primitives (DraftBadge, PublishStatusFilter, SaveOrPublishButtons) reused across all three flows.

**Tech Stack:** Next.js 14 App Router · Supabase PostgreSQL · TipTap (existing) · TypeScript

**Reference spec:** `docs/superpowers/specs/2026-05-19-drafting-feature-design.md`

**Note on testing:** This repo has no test runner configured (no `npm test` script, no Jest/Vitest). Per spec, verification is **manual smoke testing** against `npm run dev` + local Supabase, plus `tsc --noEmit` and `npm run build` for type/compile safety. Tasks below give exact dev URLs and curl commands instead of unit tests.

---

## Task 1: Database migration + types

**Files:**
- Create: `supabase/migrations/008_drafting.sql`
- Modify: `lib/types.ts`
- Modify: `docs/ERD.md`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/008_drafting.sql`:

```sql
-- 008_drafting.sql — Add draft/published lifecycle to homeworks, charter_submissions, milestones
-- Spec: docs/superpowers/specs/2026-05-19-drafting-feature-design.md

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

- [ ] **Step 2: Run migration against local Supabase**

Open Supabase Studio SQL editor for your local instance, paste the contents of `008_drafting.sql`, and run. Expected: no errors, three tables now have `publish_status` column, `homeworks` has `created_by` column, enum `publish_status` exists.

Verify via SQL:
```sql
select column_name, data_type from information_schema.columns
  where table_name in ('homeworks','charter_submissions','milestones') and column_name = 'publish_status';
```
Expected: 3 rows, all `USER-DEFINED` (enum).

- [ ] **Step 3: Update TypeScript types**

Edit `lib/types.ts`. Add the new type at top of the file (after existing type aliases):

```ts
export type PublishStatus = 'draft' | 'published'
```

In the `Homework` interface, add two fields:

```ts
export interface Homework {
  id: number
  title: string
  description: string | null
  due_date: string
  created_at: string
  publish_status: PublishStatus
  created_by: string | null
}
```

In `CharterSubmission`:

```ts
export interface CharterSubmission {
  id: string
  user_id: string
  homework_id: number | null
  project_name: string | null
  content: ProjectCharter['content']
  submitted_at: string
  updated_at: string
  publish_status: PublishStatus
}
```

In `Milestone`:

```ts
export interface Milestone {
  id: string
  user_id: string
  homework_id: number | null
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

- [ ] **Step 4: Update ERD doc**

Edit `docs/ERD.md`. In each of the three table tables, add a row for `publish_status`. In the `homeworks` table, also add a row for `created_by`. Example for `homeworks`:

```markdown
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
```

Mirror the `publish_status` row addition for `charter_submissions` and `milestones`.

At the bottom of the file, add a "Drafting partial indexes" subsection:

```markdown
## Drafting partial indexes

```sql
homeworks_drafts_by_author          -- on homeworks(created_by)   where publish_status = 'draft'
charter_submissions_drafts_by_user  -- on charter_submissions(user_id) where publish_status = 'draft'
milestones_drafts_by_user           -- on milestones(user_id)     where publish_status = 'draft'
```
Workload is published-heavy; these partial indexes serve the "my drafts" query without bloating the published-row indexes.
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors related to `publish_status`. (Existing unrelated errors may remain — note them but don't fix.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/008_drafting.sql lib/types.ts docs/ERD.md
git commit -m "feat(drafting): add publish_status enum to homeworks/charters/milestones

Migration 008 adds publish_status ('draft'|'published') column with default
'published' to homeworks, charter_submissions, milestones. Also adds
created_by FK to homeworks. Three partial indexes scope the 'my drafts'
hot query. TypeScript types and ERD updated to match.

Spec: docs/superpowers/specs/2026-05-19-drafting-feature-design.md"
```

---

## Task 2: Shared UI primitives

**Files:**
- Create: `components/DraftBadge.tsx`
- Create: `components/PublishStatusFilter.tsx`
- Create: `components/SaveOrPublishButtons.tsx`

- [ ] **Step 1: Create `DraftBadge`**

Create `components/DraftBadge.tsx`:

```tsx
export function DraftBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        fontSize: '10px',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '4px',
        background: 'rgba(245,158,11,0.12)',
        color: 'var(--amber)',
        letterSpacing: '0.02em',
      }}
    >
      임시저장
    </span>
  )
}
```

- [ ] **Step 2: Create `PublishStatusFilter`**

Create `components/PublishStatusFilter.tsx`:

```tsx
'use client'

export type PublishFilterValue = 'all' | 'published' | 'draft'

const OPTIONS: { value: PublishFilterValue; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'published', label: '게시됨' },
  { value: 'draft', label: '임시저장' },
]

export function PublishStatusFilter({
  value,
  onChange,
}: {
  value: PublishFilterValue
  onChange: (v: PublishFilterValue) => void
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: 'var(--surface-secondary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '2px',
      }}
    >
      {OPTIONS.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '6px',
              background: active ? 'var(--surface-primary)' : 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create `SaveOrPublishButtons`**

Create `components/SaveOrPublishButtons.tsx`:

```tsx
'use client'
import type { PublishStatus } from '@/lib/types'

export function SaveOrPublishButtons({
  status,
  saving,
  onSaveDraft,
  onPublish,
  size = 'md',
}: {
  status: PublishStatus | undefined  // undefined = new entity, treat as draft
  saving: boolean
  onSaveDraft: () => void
  onPublish: () => void
  size?: 'sm' | 'md'
}) {
  const isPublished = status === 'published'
  const pad = size === 'sm' ? '6px 12px' : '8px 16px'
  const fontSize = size === 'sm' ? '11px' : '12px'

  if (isPublished) {
    return (
      <button
        type="button"
        onClick={onPublish}
        disabled={saving}
        style={{
          padding: pad,
          borderRadius: '8px',
          fontSize,
          fontWeight: 700,
          background: 'var(--blue-600)',
          color: '#fff',
          border: 'none',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? '저장 중...' : '저장'}
      </button>
    )
  }

  return (
    <div style={{ display: 'inline-flex', gap: '8px' }}>
      <button
        type="button"
        onClick={onSaveDraft}
        disabled={saving}
        style={{
          padding: pad,
          borderRadius: '8px',
          fontSize,
          fontWeight: 700,
          background: 'var(--surface-secondary)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        임시저장
      </button>
      <button
        type="button"
        onClick={onPublish}
        disabled={saving}
        style={{
          padding: pad,
          borderRadius: '8px',
          fontSize,
          fontWeight: 700,
          background: 'var(--blue-600)',
          color: '#fff',
          border: 'none',
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? '저장 중...' : '게시하기'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/DraftBadge.tsx components/PublishStatusFilter.tsx components/SaveOrPublishButtons.tsx
git commit -m "feat(drafting): add DraftBadge, PublishStatusFilter, SaveOrPublishButtons primitives

Three shared components used across homework/charter/milestone drafting
flows. SaveOrPublishButtons encodes the rule that published entities
only get a single '저장' button (no revert-to-draft path)."
```

---

## Task 3: Homework API — new endpoints and draft filtering

**Files:**
- Modify: `app/api/admin/homeworks/route.ts`
- Modify: `app/api/homeworks/route.ts`
- Create: `app/api/admin/homeworks/[id]/route.ts`

- [ ] **Step 1: Update admin homeworks POST + GET**

Replace `app/api/admin/homeworks/route.ts` entirely:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()

  // Admin sees: all published + own drafts.
  const { data: homeworks, error } = await supabase
    .from('homeworks')
    .select('*')
    .or(`publish_status.eq.published,and(publish_status.eq.draft,created_by.eq.${admin.id})`)
    .order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: users } = await supabase.from('users').select('id')
  const userCount = users?.length ?? 0

  const enriched = await Promise.all(homeworks.map(async hw => {
    // Drafts have no submissions; skip the count query.
    if (hw.publish_status === 'draft') {
      return { ...hw, submission_count: 0, user_count: userCount }
    }
    const { count } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('homework_id', hw.id)
      .in('status', ['pending', 'accepted', 'declined'])
    return { ...hw, submission_count: count ?? 0, user_count: userCount }
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { title, description, due_date, publish_status } = body
  const status = publish_status === 'draft' ? 'draft' : 'published'

  if (status === 'published') {
    const fields: { field: string; message: string }[] = []
    if (!title) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!due_date) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .insert({
      title: title ?? '',
      description: description ?? null,
      due_date: due_date ?? null,
      publish_status: status,
      created_by: admin.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create admin homework `[id]` PATCH/DELETE/GET**

Create `app/api/admin/homeworks/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = parseInt(params.id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Drafts visible only to author
  if (data.publish_status === 'draft' && data.created_by !== admin.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = parseInt(params.id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await req.json()
  const { title, description, due_date, publish_status } = body

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('homeworks').select('*').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Draft author check — per spec, PATCH from non-owner on a draft → 403 (not 404).
  // GET handler returns 404 for the same case; PATCH returns 403 because the caller
  // already holds the ID and we want to signal "not yours" explicitly.
  if (existing.publish_status === 'draft' && existing.created_by !== admin.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Status transition guard: published -> draft is rejected
  if (existing.publish_status === 'published' && publish_status === 'draft') {
    return NextResponse.json(
      { error: 'invalid_transition', message: 'Cannot revert published item to draft' },
      { status: 400 }
    )
  }

  // Effective resulting status
  const nextStatus: 'draft' | 'published' =
    publish_status === 'published' || existing.publish_status === 'published'
      ? 'published'
      : (publish_status === 'draft' ? 'draft' : existing.publish_status)

  // Validation when result is published
  if (nextStatus === 'published') {
    const effectiveTitle = title ?? existing.title
    const effectiveDueDate = due_date ?? existing.due_date
    const fields: { field: string; message: string }[] = []
    if (!effectiveTitle) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!effectiveDueDate) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const patch: Record<string, unknown> = { publish_status: nextStatus }
  if (title !== undefined) patch.title = title
  if (description !== undefined) patch.description = description
  if (due_date !== undefined) patch.due_date = due_date

  const { data, error } = await supabase
    .from('homeworks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = parseInt(params.id, 10)
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('homeworks').select('publish_status, created_by').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.publish_status !== 'draft') {
    return NextResponse.json(
      { error: 'cannot_delete_published', message: '게시된 과제는 삭제할 수 없습니다.' },
      { status: 409 }
    )
  }
  if (existing.created_by !== admin.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('homeworks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Filter champion-facing homeworks GET to published only**

Replace `app/api/homeworks/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .select('*')
    .eq('publish_status', 'published')
    .order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 4: Smoke test homework API**

Start dev server: `npm run dev`. Get an admin JWT from browser localStorage after admin login (DevTools → Application → Local Storage → look for sb-...auth-token; extract `access_token`).

Create a draft:
```bash
TOKEN="paste-admin-jwt"
curl -s -X POST http://localhost:3000/api/admin/homeworks \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"publish_status":"draft"}' | jq
```
Expected: 201 response with `publish_status: "draft"`, `created_by: "<admin uuid>"`, `title: ""`, `due_date: null`.

Try publishing empty:
```bash
curl -s -X POST http://localhost:3000/api/admin/homeworks \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"publish_status":"published"}' | jq
```
Expected: 400 with `fields: [{field:"title",...},{field:"due_date",...}]`.

Take the draft id from step above and try reverting after publishing:
```bash
ID="<draft id from earlier>"
curl -s -X PATCH http://localhost:3000/api/admin/homeworks/$ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Test HW","due_date":"2026-06-30","publish_status":"published"}' | jq
# Then attempt revert
curl -s -X PATCH http://localhost:3000/api/admin/homeworks/$ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"publish_status":"draft"}' | jq
```
Expected second response: 400 `invalid_transition`.

Champion-facing list should exclude drafts. Create one more draft then:
```bash
CHAMP_TOKEN="paste-champion-jwt"
curl -s http://localhost:3000/api/homeworks \
  -H "Authorization: Bearer $CHAMP_TOKEN" | jq '.[] | .publish_status' | sort -u
```
Expected: only `"published"`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/homeworks/route.ts app/api/admin/homeworks/\[id\]/route.ts app/api/homeworks/route.ts
git commit -m "feat(drafting): homework API — POST/PATCH/DELETE/GET with draft semantics

- POST accepts publish_status; validates title+due_date only on publish
- New PATCH endpoint with status-transition guard (no published→draft)
- New DELETE endpoint allowed only on drafts (409 on published)
- Admin GET returns published + own drafts; champion GET published only"
```

---

## Task 4: Admin homework UI — create page, edit page, dashboard

**Files:**
- Modify: `app/admin/homework/new/page.tsx`
- Create: `app/admin/homework/[id]/edit/page.tsx`
- Modify: `app/admin/page.tsx`

- [ ] **Step 1: Update create page to use `SaveOrPublishButtons`**

Replace the imports and `handleSubmit`/return-JSX of `app/admin/homework/new/page.tsx`. Add imports:

```tsx
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'
import { toast } from 'sonner'
```

Replace the entire `CreateHomeworkPage` function body, keeping the `TipTapEditor` definition above unchanged:

```tsx
export default function CreateHomeworkPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; due_date?: string }>({})

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: '',
  })

  async function submit(publishStatus: 'draft' | 'published') {
    setErrors({})
    setSaving(true)
    try {
      const created = await apiFetch<{ id: number; publish_status: string }>('/api/admin/homeworks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: editor?.getHTML() ?? '',
          due_date: dueDate || null,
          publish_status: publishStatus,
        }),
      })
      if (publishStatus === 'draft') {
        toast.success('임시저장되었습니다.')
        router.push(`/admin/homework/${created.id}/edit`)
      } else {
        toast.success('과제가 게시되었습니다.')
        router.push('/admin')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error'
      try {
        const parsed = JSON.parse(msg)
        if (parsed.error === 'validation_failed' && Array.isArray(parsed.fields)) {
          const map: { title?: string; due_date?: string } = {}
          for (const f of parsed.fields) map[f.field as 'title'|'due_date'] = f.message
          setErrors(map)
          toast.error('게시 실패: 필수 항목을 확인해주세요')
          return
        }
      } catch { /* not a JSON validation error */ }
      toast.error(publishStatus === 'draft' ? '임시저장 실패: ' + msg : '게시 실패: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  }
  const errorStyle = { color: 'var(--error)', fontSize: '11px', marginTop: '4px' }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 대시보드</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>새 과제 만들기</h1>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <input type="text" placeholder="과제 제목" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
          {errors.title && <p style={errorStyle}>{errors.title}</p>}
        </div>
        <div>
          <DatePicker value={dueDate} onChange={setDueDate} placeholder="마감일 선택" style={inputStyle} />
          {errors.due_date && <p style={errorStyle}>{errors.due_date}</p>}
        </div>
        <div>
          <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>과제 설명</p>
          <TipTapEditor editor={editor} />
        </div>
        <div className="flex justify-end pt-2">
          <SaveOrPublishButtons
            status="draft"
            saving={saving}
            onSaveDraft={() => submit('draft')}
            onPublish={() => submit('published')}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the edit page**

Create `app/admin/homework/[id]/edit/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import DatePicker from '@/components/DatePicker'
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'
import { DraftBadge } from '@/components/DraftBadge'
import { FullPageSpinner } from '@/components/ui/spinner'
import type { Homework } from '@/lib/types'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// Reuse TipTapEditor (copy-paste minimal definition; identical to new/page.tsx)
function TipTapEditor({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btnStyle = (active: boolean) => ({
    padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
    background: active ? 'var(--blue-600)' : 'var(--surface-secondary)',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)', cursor: 'pointer',
  })
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex gap-1 p-2 border-b" style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}>
        {[
          { label: 'B', cmd: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
          { label: 'I', cmd: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
          { label: 'U', cmd: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline') },
          { label: 'H2', cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }) },
          { label: '•', cmd: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
        ].map(b => (
          <button key={b.label} onMouseDown={e => { e.preventDefault(); b.cmd() }} style={btnStyle(b.active)}>{b.label}</button>
        ))}
      </div>
      <EditorContent editor={editor} className="p-3 min-h-32 text-sm prose max-w-none" />
    </div>
  )
}

export default function EditHomeworkPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [homework, setHomework] = useState<Homework | null>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; due_date?: string }>({})

  const editor = useEditor({ extensions: [StarterKit, Underline], content: '' })

  useEffect(() => {
    apiFetch<Homework>(`/api/admin/homeworks/${id}`)
      .then(hw => {
        setHomework(hw)
        setTitle(hw.title)
        setDueDate(hw.due_date ?? '')
        editor?.commands.setContent(hw.description ?? '')
      })
      .catch((e: Error) => toast.error('과제 로드 실패: ' + e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editor])

  async function submit(publishStatus: 'draft' | 'published') {
    if (!homework) return
    setErrors({})
    setSaving(true)
    try {
      const updated = await apiFetch<Homework>(`/api/admin/homeworks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          description: editor?.getHTML() ?? '',
          due_date: dueDate || null,
          publish_status: publishStatus,
        }),
      })
      setHomework(updated)
      if (publishStatus === 'published' && homework.publish_status === 'draft') {
        toast.success('과제가 게시되었습니다.')
        router.push('/admin')
      } else if (publishStatus === 'draft') {
        toast.success('임시저장되었습니다.')
      } else {
        toast.success('저장되었습니다.')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error'
      try {
        const parsed = JSON.parse(msg)
        if (parsed.error === 'validation_failed' && Array.isArray(parsed.fields)) {
          const map: { title?: string; due_date?: string } = {}
          for (const f of parsed.fields) map[f.field as 'title'|'due_date'] = f.message
          setErrors(map)
          toast.error('게시 실패: 필수 항목을 확인해주세요')
          return
        }
      } catch { /* not JSON */ }
      toast.error(publishStatus === 'draft' ? '임시저장 실패: ' + msg : '저장 실패: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await apiFetch(`/api/admin/homeworks/${id}`, { method: 'DELETE' })
      toast.success('임시저장이 삭제되었습니다.')
      router.push('/admin')
    } catch (e: unknown) {
      toast.error('삭제 실패: ' + (e instanceof Error ? e.message : 'Error'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <FullPageSpinner />
  if (!homework) return <p className="text-sm p-4" style={{ color: 'var(--error)' }}>과제를 찾을 수 없습니다.</p>

  const inputStyle = {
    background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px',
    color: 'var(--text-primary)', padding: '10px 14px', fontSize: '14px', width: '100%', outline: 'none',
  }
  const errorStyle = { color: 'var(--error)', fontSize: '11px', marginTop: '4px' }
  const isDraft = homework.publish_status === 'draft'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 대시보드</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>과제 편집</h1>
        {isDraft && <DraftBadge />}
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <input type="text" placeholder="과제 제목" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
          {errors.title && <p style={errorStyle}>{errors.title}</p>}
        </div>
        <div>
          <DatePicker value={dueDate} onChange={setDueDate} placeholder="마감일 선택" style={inputStyle} />
          {errors.due_date && <p style={errorStyle}>{errors.due_date}</p>}
        </div>
        <div>
          <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>과제 설명</p>
          <TipTapEditor editor={editor} />
        </div>
        <div className="flex items-center justify-between pt-2">
          {isDraft ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  disabled={deleting}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    color: 'var(--error)', border: '1px solid var(--error)', background: 'transparent',
                    cursor: deleting ? 'wait' : 'pointer',
                  }}
                >
                  삭제
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>임시저장 삭제</AlertDialogTitle>
                  <AlertDialogDescription>정말 삭제하시겠습니까? 되돌릴 수 없습니다.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <span />}
          <SaveOrPublishButtons
            status={homework.publish_status}
            saving={saving}
            onSaveDraft={() => submit('draft')}
            onPublish={() => submit('published')}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update admin dashboard with filter + draft badges + edit link**

Replace `app/admin/page.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { HomeworkWithCount, PublishStatus } from '@/lib/types'
import { DraftBadge } from '@/components/DraftBadge'
import { PublishStatusFilter, type PublishFilterValue } from '@/components/PublishStatusFilter'

type AdminHomework = HomeworkWithCount & { publish_status: PublishStatus }

export default function AdminDashboard() {
  const [homeworks, setHomeworks] = useState<AdminHomework[]>([])
  const [filter, setFilter] = useState<PublishFilterValue>(() => {
    if (typeof window === 'undefined') return 'all'
    const q = new URLSearchParams(window.location.search).get('status') as PublishFilterValue | null
    return q && ['all','published','draft'].includes(q) ? q : 'all'
  })

  useEffect(() => {
    apiFetch<AdminHomework[]>('/api/admin/homeworks').then(setHomeworks)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (filter === 'all') url.searchParams.delete('status')
    else url.searchParams.set('status', filter)
    window.history.replaceState({}, '', url.toString())
  }, [filter])

  const filtered = useMemo(() => {
    if (filter === 'all') return homeworks
    return homeworks.filter(hw => hw.publish_status === filter)
  }, [homeworks, filter])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>대시보드</h1>
        <a href="/admin/homework/new">
          <button className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>
            + 과제 만들기
          </button>
        </a>
      </div>
      <div className="mb-4">
        <PublishStatusFilter value={filter} onChange={setFilter} />
      </div>
      <div className="flex flex-col gap-3">
        {filtered.map(hw => {
          const isDraft = hw.publish_status === 'draft'
          const href = isDraft ? `/admin/homework/${hw.id}/edit` : `/admin/homework/${hw.id}`
          return (
            <a
              key={hw.id}
              href={href}
              className="flex items-center justify-between p-4 rounded-xl border hover:border-blue-500 transition-colors"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <span className="text-xs font-bold mr-2" style={{ color: 'var(--text-secondary)' }}>#{String(hw.id).padStart(2, '0')}</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{hw.title || '(제목 없음)'}</span>
                {isDraft && <span className="ml-2"><DraftBadge /></span>}
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>마감: {hw.due_date ?? '미정'}</p>
              </div>
              {isDraft ? (
                <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>편집 →</span>
              ) : (
                <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                  {hw.submission_count} / {hw.user_count} 제출
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Smoke test in browser**

`npm run dev`. Log in as admin. Visit `/admin/homework/new`:
- Click "임시저장" with empty form → redirected to `/admin/homework/<n>/edit`, toast "임시저장되었습니다."
- Visit `/admin` → see the new draft with 임시저장 badge, "편집 →" link.
- Click filter "게시됨" → draft disappears.
- Visit `/admin/homework/new` again, fill title + due_date + description → click "게시하기" → redirected to `/admin`, see it without badge.
- Open a draft's edit page, click 삭제 → confirm dialog → row disappears.
- On a published row, visit `/admin/homework/<id>/edit` → confirm only one "저장" button is shown.

- [ ] **Step 5: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/admin/homework/new/page.tsx app/admin/homework/\[id\]/edit/page.tsx app/admin/page.tsx
git commit -m "feat(drafting): admin homework UI — draft/publish on new + edit page

- New page renders SaveOrPublishButtons for create
- New edit page at /admin/homework/[id]/edit with prefill, delete for drafts
- Dashboard adds PublishStatusFilter, DraftBadge, and routes drafts to edit"
```

---

## Task 5: Charter API — draft semantics and admin filtering

**Files:**
- Modify: `app/api/charter/submissions/route.ts`
- Modify: `app/api/charter/submissions/[id]/route.ts`
- Modify: `app/api/admin/charters/route.ts`

- [ ] **Step 1: Update charter POST + admin-viewer GET**

Replace `app/api/charter/submissions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

function stripHtml(s: string | undefined | null) {
  return (s ?? '').replace(/<[^>]*>/g, '').trim()
}

function validateCharter(content: Record<string, string>, projectName: string | null) {
  const fields: { field: string; message: string }[] = []
  if (!projectName || !projectName.trim()) fields.push({ field: 'project_name', message: '프로젝트명은 필수입니다.' })
  for (const key of ['problem_definition', 'goal', 'scope_in', 'scope_out']) {
    if (!stripHtml(content?.[key])) fields.push({ field: key, message: '필수 항목입니다.' })
  }
  return fields
}

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const homeworkId = req.nextUrl.searchParams.get('homework_id')
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()

  // Admin listing across users: published only (drafts are author-private)
  if (isAdmin && !targetUserId && homeworkId) {
    const hwId = parseInt(homeworkId, 10)
    if (isNaN(hwId)) return NextResponse.json({ error: 'Invalid homework_id' }, { status: 400 })
    const { data, error } = await supabase
      .from('charter_submissions')
      .select('*, users(*)')
      .eq('homework_id', hwId)
      .eq('publish_status', 'published')
      .order('submitted_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  let query = supabase
    .from('charter_submissions')
    .select('*')
    .eq('user_id', effectiveUserId)
    .order('submitted_at', { ascending: false })

  // Admin fetching specific user's charter sees only published
  if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')

  if (homeworkId) {
    const hwId = parseInt(homeworkId, 10)
    if (isNaN(hwId)) return NextResponse.json({ error: 'Invalid homework_id' }, { status: 400 })
    query = query.eq('homework_id', hwId)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { project_name, content, homework_id, publish_status } = await req.json()
  const status = publish_status === 'published' ? 'published' : 'draft'

  if (status === 'published') {
    const fields = validateCharter(content ?? {}, project_name)
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .insert({
      user_id: user.id,
      project_name: project_name ?? null,
      content: content ?? {},
      publish_status: status,
      ...(homework_id ? { homework_id } : {}),
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Update charter PATCH with status transition + validation**

Replace `app/api/charter/submissions/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

function stripHtml(s: string | undefined | null) {
  return (s ?? '').replace(/<[^>]*>/g, '').trim()
}

function validateCharter(content: Record<string, string>, projectName: string | null) {
  const fields: { field: string; message: string }[] = []
  if (!projectName || !projectName.trim()) fields.push({ field: 'project_name', message: '프로젝트명은 필수입니다.' })
  for (const key of ['problem_definition', 'goal', 'scope_in', 'scope_out']) {
    if (!stripHtml(content?.[key])) fields.push({ field: key, message: '필수 항목입니다.' })
  }
  return fields
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { project_name, content, homework_id, publish_status } = await req.json()

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('charter_submissions').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (existing.publish_status === 'published' && publish_status === 'draft') {
    return NextResponse.json(
      { error: 'invalid_transition', message: 'Cannot revert published item to draft' },
      { status: 400 }
    )
  }

  const nextStatus: 'draft' | 'published' =
    publish_status === 'published' || existing.publish_status === 'published'
      ? 'published'
      : (publish_status === 'draft' ? 'draft' : existing.publish_status)

  if (nextStatus === 'published') {
    const effContent = { ...(existing.content ?? {}), ...(content ?? {}) }
    const effProjectName = project_name ?? existing.project_name
    const fields = validateCharter(effContent, effProjectName)
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const patch: Record<string, unknown> = {
    publish_status: nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (project_name !== undefined) patch.project_name = project_name
  if (content !== undefined) patch.content = content
  if (homework_id !== undefined) patch.homework_id = homework_id

  const { data, error } = await supabase
    .from('charter_submissions')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Filter `/api/admin/charters` to published only**

Replace `app/api/admin/charters/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .select('*, users(*)')
    .eq('publish_status', 'published')
    .order('homework_id', { ascending: true, nullsFirst: false })
    .order('submitted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 4: Smoke test charter API**

As champion JWT:
```bash
CHAMP_TOKEN="paste-champion-jwt"
curl -s -X POST http://localhost:3000/api/charter/submissions \
  -H "Authorization: Bearer $CHAMP_TOKEN" -H "Content-Type: application/json" \
  -d '{"project_name":"드래프트 차터","content":{},"publish_status":"draft"}' | jq
```
Expected: 201 with `publish_status: "draft"`.

Then publish without required sections:
```bash
ID="<draft id>"
curl -s -X PATCH http://localhost:3000/api/charter/submissions/$ID \
  -H "Authorization: Bearer $CHAMP_TOKEN" -H "Content-Type: application/json" \
  -d '{"publish_status":"published"}' | jq
```
Expected: 400 `validation_failed` with fields including problem_definition, goal, scope_in, scope_out.

As admin, list:
```bash
ADMIN_TOKEN="paste-admin-jwt"
curl -s http://localhost:3000/api/admin/charters \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.[] | .publish_status' | sort -u
```
Expected: only `"published"`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add app/api/charter/submissions/route.ts app/api/charter/submissions/\[id\]/route.ts app/api/admin/charters/route.ts
git commit -m "feat(drafting): charter API — draft/publish + admin filtering

POST/PATCH accept publish_status. Required fields (project_name,
problem_definition, goal, scope_in, scope_out) validated only on publish.
Admin-facing GETs filter to published only."
```

---

## Task 6: Champion charter UI — filter, badge, buttons, hide comments on drafts

**Files:**
- Modify: `app/(champion)/charter/page.tsx`

- [ ] **Step 1: Add filter state and helpers near the top of `CharterPage`**

In `app/(champion)/charter/page.tsx`, add imports at the top of the file:

```tsx
import { DraftBadge } from '@/components/DraftBadge'
import { PublishStatusFilter, type PublishFilterValue } from '@/components/PublishStatusFilter'
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'
```

Inside `CharterPage()`, after `const [sidePanel, setSidePanel] = useState<SidePanel>(null)`, add:

```tsx
const [filter, setFilter] = useState<PublishFilterValue>(() => {
  if (typeof window === 'undefined') return 'all'
  const q = new URLSearchParams(window.location.search).get('status') as PublishFilterValue | null
  return q && ['all','published','draft'].includes(q) ? q : 'all'
})
useEffect(() => {
  const url = new URL(window.location.href)
  if (filter === 'all') url.searchParams.delete('status')
  else url.searchParams.set('status', filter)
  window.history.replaceState({}, '', url.toString())
}, [filter])

const visibleSubmissions = useMemo(
  () => filter === 'all' ? submissions : submissions.filter(s => s.publish_status === filter),
  [submissions, filter]
)
```

Then change the `groups` `useMemo` to derive from `visibleSubmissions` instead of `submissions`:

```tsx
const groups = useMemo(() => {
  const map = new Map<string, { hwId: number | null; hwTitle: string | null; items: CharterSubmission[] }>()
  for (const s of visibleSubmissions) {
    const key = s.homework_id !== null ? String(s.homework_id) : '__none__'
    if (!map.has(key)) map.set(key, { hwId: s.homework_id, hwTitle: s.homework_id !== null ? (hwMap.get(s.homework_id) ?? null) : null, items: [] })
    map.get(key)!.items.push(s)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === '__none__') return 1
      if (b === '__none__') return -1
      return Number(a) - Number(b)
    })
    .map(([key, g]) => ({ key, ...g }))
}, [visibleSubmissions, hwMap])
```

- [ ] **Step 2: Add filter UI in the list header**

Find the existing list-header JSX block:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</span>
  <button ...>+ 과제정의서 추가</button>
</div>
```

Replace with:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
  <div className="flex items-center gap-3">
    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</span>
    <PublishStatusFilter value={filter} onChange={setFilter} />
  </div>
  <button
    onClick={() => setSidePanel('new')}
    className="text-xs px-2.5 py-1 rounded-lg font-semibold"
    style={{
      background: sidePanel === 'new' ? 'rgba(37,99,235,0.15)' : 'var(--surface-secondary)',
      color: sidePanel === 'new' ? 'var(--blue-600)' : 'var(--text-secondary)',
    }}
  >
    + 과제정의서 추가
  </button>
</div>
```

- [ ] **Step 3: Add `<DraftBadge>` to `SubmissionCard`**

Replace the `SubmissionCard` function:

```tsx
function SubmissionCard({ sub, compressed, active, onClick }: {
  sub: CharterSubmission; compressed: boolean; active: boolean; onClick: () => void
}) {
  const date = new Date(sub.updated_at ?? sub.submitted_at).toLocaleDateString('ko-KR')
  const isDraft = sub.publish_status === 'draft'

  if (compressed) {
    return (
      <button onClick={onClick} className="w-full text-left px-3 py-2.5 border-b"
        style={{ borderColor: 'var(--border-subtle)', background: active ? 'rgba(37,99,235,0.08)' : 'transparent' }}>
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold truncate flex-1" style={{ color: active ? 'var(--blue-600)' : 'var(--text-primary)' }}>
            {sub.project_name || '(제목 없음)'}
          </p>
          {isDraft && <DraftBadge />}
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>{date}</p>
      </button>
    )
  }

  return (
    <button onClick={onClick} className="text-left p-4 rounded-xl border transition-colors"
      style={{ borderColor: active ? 'var(--blue-600)' : 'var(--border-subtle)', background: active ? 'rgba(37,99,235,0.06)' : 'var(--surface-primary)' }}>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {sub.project_name || '(제목 없음)'}
        </p>
        {isDraft && <DraftBadge />}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>{date}</p>
    </button>
  )
}
```

- [ ] **Step 4: Replace `CharterPanel` save logic with `SaveOrPublishButtons`**

In `CharterPanel`, change the `handleSave` function to accept a target status:

```tsx
async function handleSave(targetStatus: 'draft' | 'published') {
  setSaving(true)
  try {
    if (mode === 'new') {
      const newSub = await apiFetch<CharterSubmission>('/api/charter/submissions', {
        method: 'POST',
        body: JSON.stringify({
          project_name: projectName,
          content: contentRef.current,
          homework_id: homeworkId !== '' ? homeworkId : null,
          publish_status: targetStatus,
        }),
      })
      dirtyRef.current = false
      onCreated(newSub)
    } else {
      const updated = await apiFetch<CharterSubmission>(`/api/charter/submissions/${submission!.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          project_name: projectName,
          content: contentRef.current,
          publish_status: targetStatus,
        }),
      })
      dirtyRef.current = false
      onUpdated(updated)
    }
    toast.success(targetStatus === 'draft' ? '임시저장되었습니다.' : '게시되었습니다.')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      const parsed = JSON.parse(msg)
      if (parsed.error === 'validation_failed') {
        toast.error('게시 실패: 필수 항목을 확인해주세요')
        return
      }
    } catch { /* not JSON */ }
    toast.error((targetStatus === 'draft' ? '임시저장 실패: ' : '게시 실패: ') + msg)
  } finally {
    setSaving(false)
  }
}
```

Then replace the existing two `<button>` blocks (DOCX export + 저장하기/재제출하기) — keep the DOCX export button as-is, replace the save button with `<SaveOrPublishButtons>`:

```tsx
<div className="flex gap-2 flex-shrink-0">
  <button
    onClick={handleExport}
    disabled={exporting}
    className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
    style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
  >
    {exporting ? (<><Spinner size="sm" className="inline" /> 내보내는 중...</>) : '📄 DOCX'}
  </button>
  <SaveOrPublishButtons
    status={submission?.publish_status}
    saving={saving}
    onSaveDraft={() => handleSave('draft')}
    onPublish={() => handleSave('published')}
    size="sm"
  />
</div>
```

- [ ] **Step 5: Update unsaved-changes dialog to include "임시저장 후 닫기"**

Find the existing `<AlertDialog open={showUnsavedDialog} ...>` block at the bottom of `CharterPanel`. Replace its body:

```tsx
<AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>저장하지 않은 변경사항이 있습니다</AlertDialogTitle>
      <AlertDialogDescription>닫기 전에 어떻게 하시겠어요?</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>계속 편집</AlertDialogCancel>
      <button
        onClick={async () => {
          setShowUnsavedDialog(false)
          await handleSave('draft')
          onClose()
        }}
        className="px-4 py-2 rounded-lg text-xs font-semibold"
        style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
      >
        임시저장 후 닫기
      </button>
      <AlertDialogAction onClick={() => { setShowUnsavedDialog(false); dirtyRef.current = false; onClose() }}>저장 안 함</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: Hide `CharterCommentPanel` for drafts**

Find the side-panel render block:
```tsx
{sidePanel !== 'new' && (
  <div className="flex flex-col border-l" ...>
    <CharterCommentPanel key={sidePanel.id} charterId={sidePanel.id} />
  </div>
)}
```

Replace with:
```tsx
{sidePanel !== 'new' && sidePanel.publish_status === 'published' && (
  <div className="flex flex-col border-l" style={{ width: '300px', minWidth: '280px', borderColor: 'var(--border-subtle)' }}>
    <CharterCommentPanel key={sidePanel.id} charterId={sidePanel.id} />
  </div>
)}
```

- [ ] **Step 7: Smoke test in browser**

`npm run dev`, log in as champion. `/charter`:
- Click "+ 과제정의서 추가", type any project name, click "임시저장" → list shows new draft with badge; comment panel is hidden.
- Click "게시하기" with required sections empty → toast says "게시 실패: 필수 항목을 확인해주세요".
- Fill the 4 required sections, click "게시하기" → toast success; badge disappears; comment panel appears.
- Click filter "임시저장" → only drafts show. Click "게시됨" → only published. URL updates with `?status=draft|published`.
- Reload `?status=draft` → filter is still draft.
- Edit a published charter, change project_name, click "저장" → updates without status change. Confirm only single "저장" button shows.
- Open a new draft, type a section, close the panel via × → dialog offers three buttons. Click "임시저장 후 닫기" → saves draft and closes.

- [ ] **Step 8: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add app/\(champion\)/charter/page.tsx
git commit -m "feat(drafting): champion charter UI — filter, badge, save-or-publish, hide comments on drafts

- PublishStatusFilter at list header (URL-persistent ?status=)
- DraftBadge on SubmissionCard (compressed + full sizes)
- SaveOrPublishButtons drives panel save buttons
- CharterCommentPanel hidden when current selection is draft
- Unsaved-changes dialog adds '임시저장 후 닫기' option"
```

---

## Task 7: Milestone API — draft semantics

**Files:**
- Modify: `app/api/milestones/route.ts`
- Modify: `app/api/milestones/[id]/route.ts`
- Modify: `app/api/admin/milestones/route.ts`

- [ ] **Step 1: Update milestones POST**

Replace `app/api/milestones/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const homeworkId = req.nextUrl.searchParams.get('homework_id')
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()
  let query = supabase
    .from('milestones')
    .select('*, milestone_deliverables(*), homeworks(id, title)')
    .eq('user_id', effectiveUserId)
    .order('display_order')

  // Admin fetching another user's milestones sees only published
  if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')

  if (homeworkId) {
    const hwId = parseInt(homeworkId, 10)
    if (isNaN(hwId)) return NextResponse.json({ error: 'Invalid homework_id' }, { status: 400 })
    query = query.eq('homework_id', hwId)
  } else {
    query = query.order('week_number')
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map(({ milestone_deliverables, ...rest }: any) => ({ ...rest, deliverables: milestone_deliverables }))
  return NextResponse.json(normalized)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { week_number, homework_id, title, start_date, due_date, description, publish_status } = body
  const status = publish_status === 'published' ? 'published' : 'draft'

  const resolvedWeekNumber = week_number ?? homework_id ?? 1

  if (status === 'published') {
    const fields: { field: string; message: string }[] = []
    if (!title) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!start_date) fields.push({ field: 'start_date', message: '필수 항목입니다.' })
    if (!due_date) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (!resolvedWeekNumber) fields.push({ field: 'week_number', message: '필수 항목입니다.' })
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .insert({
      user_id: user.id,
      week_number: resolvedWeekNumber,
      homework_id: homework_id ?? null,
      title: title ?? '',
      start_date: start_date ?? null,
      due_date: due_date ?? null,
      description: description ?? null,
      publish_status: status,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Update milestone PATCH with status transition + validation**

Replace `app/api/milestones/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

function computeStatus(milestone: { due_date: string; is_manual_progress: boolean }, hasDeliverable: boolean) {
  if (hasDeliverable) return 'completed'
  if (milestone.is_manual_progress) return 'in_progress'
  if (milestone.due_date && new Date(milestone.due_date) < new Date()) return 'delayed'
  return 'not_started'
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('milestones').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Status transition guard
  if (existing.publish_status === 'published' && body.publish_status === 'draft') {
    return NextResponse.json(
      { error: 'invalid_transition', message: 'Cannot revert published item to draft' },
      { status: 400 }
    )
  }
  const nextStatus: 'draft' | 'published' =
    body.publish_status === 'published' || existing.publish_status === 'published'
      ? 'published'
      : (body.publish_status === 'draft' ? 'draft' : existing.publish_status)

  if (nextStatus === 'published') {
    const eff = { ...existing, ...body }
    const fields: { field: string; message: string }[] = []
    if (!eff.title) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!eff.start_date) fields.push({ field: 'start_date', message: '필수 항목입니다.' })
    if (!eff.due_date) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (!eff.week_number) fields.push({ field: 'week_number', message: '필수 항목입니다.' })
    if (fields.length > 0)
      return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const { count: deliverableCount } = await supabase
    .from('milestone_deliverables')
    .select('*', { count: 'exact', head: true })
    .eq('milestone_id', params.id)

  const merged = { ...existing, ...body }
  // Compute milestone progress status only for published rows
  const computedStatus = nextStatus === 'published'
    ? computeStatus(merged, (deliverableCount ?? 0) > 0)
    : existing.status

  const patch: Record<string, unknown> = {
    ...body,
    publish_status: nextStatus,
    status: computedStatus,
    updated_at: new Date().toISOString(),
  }
  delete (patch as { publish_status?: unknown }).publish_status
  patch.publish_status = nextStatus

  const { data, error } = await supabase
    .from('milestones')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { error } = await supabase.from('milestones').delete().eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Filter `/api/admin/milestones` to published only**

Replace `app/api/admin/milestones/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .select('*, users(*), milestone_deliverables(*), homeworks(id, title)')
    .eq('publish_status', 'published')
    .order('user_id').order('week_number').order('display_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 4: Smoke test**

As champion:
```bash
curl -s -X POST http://localhost:3000/api/milestones \
  -H "Authorization: Bearer $CHAMP_TOKEN" -H "Content-Type: application/json" \
  -d '{"publish_status":"draft","title":"","week_number":1}' | jq
```
Expected: 201 with `publish_status: "draft"`, no error from missing dates.

Try publish empty:
```bash
ID="<draft id>"
curl -s -X PATCH http://localhost:3000/api/milestones/$ID \
  -H "Authorization: Bearer $CHAMP_TOKEN" -H "Content-Type: application/json" \
  -d '{"publish_status":"published"}' | jq
```
Expected: 400 with title/start_date/due_date fields.

- [ ] **Step 5: Type-check**

`npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add app/api/milestones/route.ts app/api/milestones/\[id\]/route.ts app/api/admin/milestones/route.ts
git commit -m "feat(drafting): milestone API — draft/publish + admin filtering

POST/PATCH accept publish_status. title/start_date/due_date/week_number
validated only on publish. Admin GET filters to published. Status
computation runs only for published milestones."
```

---

## Task 8: Champion milestone UI — filter, badge, buttons, gating

**Files:**
- Modify: `app/(champion)/milestones/page.tsx`

- [ ] **Step 1: Add imports + filter state**

In `app/(champion)/milestones/page.tsx`, add imports:

```tsx
import { DraftBadge } from '@/components/DraftBadge'
import { PublishStatusFilter, type PublishFilterValue } from '@/components/PublishStatusFilter'
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'
```

Inside `MilestonesPage()`, after the `useRef` declarations, add:

```tsx
const [filter, setFilter] = useState<PublishFilterValue>(() => {
  if (typeof window === 'undefined') return 'all'
  const q = new URLSearchParams(window.location.search).get('status') as PublishFilterValue | null
  return q && ['all','published','draft'].includes(q) ? q : 'all'
})
useEffect(() => {
  const url = new URL(window.location.href)
  if (filter === 'all') url.searchParams.delete('status')
  else url.searchParams.set('status', filter)
  window.history.replaceState({}, '', url.toString())
}, [filter])

const visibleMilestones = useMemo(
  () => filter === 'all' ? milestones : milestones.filter(m => m.publish_status === filter),
  [milestones, filter]
)
```

Update the `groups` `useMemo` to read from `visibleMilestones` instead of `milestones`.

- [ ] **Step 2: Replace add-form handler with draft/publish split**

In `handleAdd`, change the signature and logic. Replace the entire function:

```tsx
async function submitNew(publishStatus: 'draft' | 'published') {
  setError(null)
  try {
    const created = await apiFetch<MilestoneWithHomework>('/api/milestones', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        week_number: parseInt(form.week_number) || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        publish_status: publishStatus,
      }),
    })
    setMilestones(prev => [...prev, created])
    setShowForm(false)
    setForm({ week_number: '1', title: '', start_date: '', due_date: '', description: '' })
    toast.success(publishStatus === 'draft' ? '임시저장되었습니다.' : '마일스톤이 추가되었습니다.')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      const parsed = JSON.parse(msg)
      if (parsed.error === 'validation_failed') {
        setError('필수 항목을 확인해주세요: ' + parsed.fields.map((f: { field: string }) => f.field).join(', '))
        return
      }
    } catch { /* not JSON */ }
    setError('마일스톤 저장에 실패했습니다.')
    toast.error('저장 실패: ' + msg)
  }
}
```

Replace the form's existing submit `<button>` (currently `<button type="submit">저장</button>`) and remove `onSubmit={handleAdd}` from the `<form>` — change to:

```tsx
<form onSubmit={(e) => e.preventDefault()} className="mb-6 p-4 rounded-xl border flex flex-col gap-3" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
  {/* ...existing form fields unchanged... */}
  <div className="self-start">
    <SaveOrPublishButtons
      status="draft"
      saving={false}
      onSaveDraft={() => submitNew('draft')}
      onPublish={() => submitNew('published')}
      size="sm"
    />
  </div>
</form>
```

- [ ] **Step 3: Replace edit modal save with draft/publish split**

Change `handleEditSave` to:

```tsx
async function submitEdit(publishStatus: 'draft' | 'published') {
  if (!editingMilestone) return
  setEditSaving(true)
  try {
    const updated = await apiFetch<MilestoneWithHomework>(`/api/milestones/${editingMilestone.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...editForm,
        week_number: parseInt(editForm.week_number) || null,
        start_date: editForm.start_date || null,
        due_date: editForm.due_date || null,
        publish_status: publishStatus,
      }),
    })
    setMilestones(prev => prev.map(m => m.id === updated.id ? { ...updated, homeworks: m.homeworks } : m))
    setEditingMilestone(null)
    toast.success(publishStatus === 'draft' ? '임시저장되었습니다.' : '마일스톤이 수정되었습니다.')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      const parsed = JSON.parse(msg)
      if (parsed.error === 'validation_failed') {
        setError('필수 항목을 확인해주세요: ' + parsed.fields.map((f: { field: string }) => f.field).join(', '))
        return
      }
    } catch { /* not JSON */ }
    setError('수정에 실패했습니다.')
    toast.error('마일스톤 수정 실패: ' + msg)
  } finally {
    setEditSaving(false)
  }
}
```

In the edit modal `<DialogFooter>`, replace the existing 저장 `<button type="submit">` with:

```tsx
<SaveOrPublishButtons
  status={editingMilestone.publish_status}
  saving={editSaving}
  onSaveDraft={() => submitEdit('draft')}
  onPublish={() => submitEdit('published')}
  size="sm"
/>
```

Change the form wrapper to non-submitting: `<form onSubmit={(e) => e.preventDefault()} ...>`.

- [ ] **Step 4: Add `<DraftBadge>` next to milestone title in the table row**

In the table row's title cell:
```tsx
<td className="px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</td>
```
Replace with:
```tsx
<td className="px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
  <div className="flex items-center gap-1.5">
    <span>{m.title || '(제목 없음)'}</span>
    {m.publish_status === 'draft' && <DraftBadge />}
  </div>
</td>
```

- [ ] **Step 5: Gate deadline-request button and upload button for drafts**

In the "기간" cell, the deadline-request button is rendered when `m.status === 'delayed' || m.status === 'in_progress'`. Add a draft check:

```tsx
{m.publish_status === 'published' && (m.status === 'delayed' || m.status === 'in_progress') && (
  <button onClick={...}>...</button>
)}
```

Similarly hide the request status display block when draft. The block currently uses:
```tsx
{(() => { const pending = ... ; return ... })()}
```
Wrap with `{m.publish_status === 'published' && (() => { ... })()}`.

In the actions cell (the last `<td>`), wrap the upload/resubmit logic. Currently:
```tsx
{m.status === 'completed' ? (...) : (
  <label className="cursor-pointer ...">
    📤 과제 업로드
    <input type="file" .../>
  </label>
)}
```
Change to:
```tsx
{m.publish_status === 'draft' ? (
  <span
    title="임시저장 마일스톤은 산출물을 업로드할 수 없습니다. 먼저 게시해주세요."
    className="px-2 py-1 rounded font-semibold opacity-50 cursor-not-allowed"
    style={{ background: 'var(--surface-secondary)', color: 'var(--text-disabled)', border: '1px solid var(--border-subtle)' }}
  >
    📤 업로드 (게시 필요)
  </span>
) : m.status === 'completed' ? (
  <>
    {/* ...existing 과제 재제출 + hidden input... */}
  </>
) : (
  <label className="cursor-pointer px-2 py-1 rounded font-semibold" style={{ background: 'rgba(74,222,128,0.1)', color: 'var(--success)', border: '1px solid var(--success)' }}>
    📤 과제 업로드
    <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUpload(m.id, e.target.files[0]) }} />
  </label>
)}
```

Also hide the deliverable download link for drafts (it can't have deliverables, but defensive):
```tsx
{m.publish_status === 'published' && (() => {
  const lastDeliverable = m.deliverables?.slice().sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())[0]
  return lastDeliverable ? (
    <button onClick={() => handleDownload(m.id)} ...>⬇ {lastDeliverable.file_name}</button>
  ) : null
})()}
```

- [ ] **Step 6: Add filter to the page header**

Right under the existing `<h1>` block, add:
```tsx
<div className="mb-4">
  <PublishStatusFilter value={filter} onChange={setFilter} />
</div>
```

- [ ] **Step 7: Smoke test in browser**

`npm run dev`, log in as champion. `/milestones`:
- Click "+ 마일스톤 추가". Fill no fields, click "임시저장" → row appears with 임시저장 badge.
- On the draft row: confirm no "📤 과제 업로드" button (instead disabled chip), no "기한 변경 요청" link, no status badge weirdness.
- Click ✏ on the draft → edit modal opens. Click "게시하기" with still-empty title → error displays. Fill required fields, click "게시하기" → badge disappears, upload button appears.
- On a published row: confirm only single 저장 button in edit modal.
- Filter to 임시저장 then 게시됨; URL updates.

- [ ] **Step 8: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add app/\(champion\)/milestones/page.tsx
git commit -m "feat(drafting): champion milestone UI — filter, badge, save-or-publish, gating

- PublishStatusFilter at page top, URL-persistent
- DraftBadge in title cell
- SaveOrPublishButtons for new-form and edit-modal
- Deadline-request button + deliverable upload disabled for drafts"
```

---

## Task 9: Admin downstream APIs — exclude drafts from kanban + champion progress

**Files:**
- Modify: `app/api/admin/kanban/route.ts`
- Modify: `app/(champion)/progress/page.tsx`

- [ ] **Step 1: Exclude drafts from kanban aggregations**

In `app/api/admin/kanban/route.ts`, the milestone and charter queries need `.eq('publish_status', 'published')`. Find:

```ts
let msQuery = supabase.from('milestones').select('user_id, homework_id, status')
```
Change to:
```ts
let msQuery = supabase.from('milestones').select('user_id, homework_id, status').eq('publish_status', 'published')
```

Find:
```ts
let charterQuery = supabase.from('charter_submissions').select('user_id, homework_id')
```
Change to:
```ts
let charterQuery = supabase.from('charter_submissions').select('user_id, homework_id').eq('publish_status', 'published')
```

Also filter the homeworks query — admin kanban shows cards per (champion × homework), and we shouldn't show cards for draft homeworks:
```ts
let hwQuery = supabase.from('homeworks').select('id, title').eq('publish_status', 'published')
```

- [ ] **Step 2: Filter champion progress page to published milestones only**

In `app/(champion)/progress/page.tsx`, find:
```ts
const tasks   = useMemo(() => milestones.filter(m => m.start_date && m.due_date), [milestones])
const delayed = useMemo(() => milestones.filter(m => m.status === 'delayed'),      [milestones])
```
Replace with:
```ts
const published = useMemo(() => milestones.filter(m => m.publish_status === 'published'), [milestones])
const tasks     = useMemo(() => published.filter(m => m.start_date && m.due_date), [published])
const delayed   = useMemo(() => published.filter(m => m.status === 'delayed'),     [published])
```

- [ ] **Step 3: Smoke test**

As admin:
- Visit `/admin/kanban`. Confirm draft homeworks/charters/milestones do not contribute to any card. Create a draft charter as champion (in another browser), reload kanban — `hasCharter` should remain false for that champion.

As champion:
- Visit `/progress`. Confirm draft milestones do not appear on the Gantt grid or in the "지연" list.

- [ ] **Step 4: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/kanban/route.ts app/\(champion\)/progress/page.tsx
git commit -m "feat(drafting): exclude drafts from kanban + champion progress

Admin kanban aggregates only published homeworks/charters/milestones.
Champion's own progress page hides drafts (drafts are pre-work, not WIP)."
```

---

## Task 10: Notification gating + endpoint defenses for drafts

**Files:**
- Modify: `app/api/submissions/route.ts`
- Modify: `app/api/deadline-requests/route.ts`
- Modify: `app/api/charter/submissions/[id]/comments/route.ts`
- Modify: `app/api/milestones/[id]/deliverables/route.ts`

- [ ] **Step 1: Read each file to identify the notification call sites**

Run each Read in your editor:
```
app/api/submissions/route.ts
app/api/deadline-requests/route.ts
app/api/charter/submissions/[id]/comments/route.ts
app/api/milestones/[id]/deliverables/route.ts
```

For each: find the `notifyXxx(...)` call and the entity-existence check that precedes the insert.

- [ ] **Step 2: Submissions — defend against submitting to a draft homework**

In `app/api/submissions/route.ts`, before inserting the submission row, fetch the homework and confirm it's published. Add this check just after parsing the body and before the insert:

```ts
const { data: hw } = await supabase
  .from('homeworks').select('publish_status').eq('id', homework_id).single()
if (!hw || hw.publish_status !== 'published') {
  return NextResponse.json({ error: '게시되지 않은 과제에는 제출할 수 없습니다.' }, { status: 400 })
}
```

(Champion shouldn't be able to reach the submit UI for a draft homework because `/api/homeworks` filters drafts out, but this is server-side defense in depth.)

- [ ] **Step 3: Deadline requests — defend against draft milestone**

In `app/api/deadline-requests/route.ts` POST handler, after fetching the milestone (or before inserting if there's no fetch), add:

```ts
const { data: m } = await supabase
  .from('milestones').select('publish_status').eq('id', milestone_id).single()
if (!m || m.publish_status !== 'published') {
  return NextResponse.json({ error: '게시되지 않은 마일스톤에는 기한 변경을 요청할 수 없습니다.' }, { status: 400 })
}
```

Notification `notifyDeadlineChangeRequest` only fires after a successful insert, so this guard alone is sufficient to prevent emails.

- [ ] **Step 4: Charter comments — defend against draft charter**

In `app/api/charter/submissions/[id]/comments/route.ts` POST handler, after extracting the charter id (or fetching), add:

```ts
const { data: charter } = await supabase
  .from('charter_submissions').select('publish_status').eq('id', params.id).single()
if (!charter || charter.publish_status !== 'published') {
  return NextResponse.json({ error: '게시되지 않은 과제정의서에는 코멘트를 작성할 수 없습니다.' }, { status: 400 })
}
```

(Champion UI hides the comment panel for drafts; admin never sees drafts. This is defense.)

- [ ] **Step 5: Milestone deliverables — defend against draft milestone**

In `app/api/milestones/[id]/deliverables/route.ts` POST handler, before storage upload, add:

```ts
const { data: m } = await supabase
  .from('milestones').select('publish_status').eq('id', params.id).single()
if (!m || m.publish_status !== 'published') {
  return NextResponse.json({ error: '게시되지 않은 마일스톤에는 산출물을 업로드할 수 없습니다.' }, { status: 400 })
}
```

- [ ] **Step 6: Smoke test notifications**

Set ADMIN_NOTIFICATION_EMAIL in `.env.local` if not set (otherwise email helpers no-op). Create a draft milestone as champion. Try uploading a deliverable via curl:

```bash
curl -X POST http://localhost:3000/api/milestones/$DRAFT_MS_ID/deliverables \
  -H "Authorization: Bearer $CHAMP_TOKEN" -F file=@README.md
```
Expected: 400 with `게시되지 않은 마일스톤...`.

Publish the milestone (PATCH publish_status=published with valid fields), then upload again — expect 201 and an admin email.

- [ ] **Step 7: Type-check + build**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add app/api/submissions/route.ts app/api/deadline-requests/route.ts app/api/charter/submissions/\[id\]/comments/route.ts app/api/milestones/\[id\]/deliverables/route.ts
git commit -m "feat(drafting): reject downstream writes against draft entities

Server-side defense to prevent submissions/comments/deliverables/
deadline-requests being attached to draft homeworks/charters/milestones.
Blocks any notification side-effect for drafts."
```

---

## Task 11: Full smoke-test pass + Obsidian planning doc

**Files:**
- Create: `/Users/claud_01/Documents/flo/ax-homework-submission/2026-05-21-drafting-feature.md` (Obsidian vault)

- [ ] **Step 1: Run full smoke-test matrix from spec**

Open the spec at `docs/superpowers/specs/2026-05-19-drafting-feature-design.md`. Walk through every row of the "Manual test matrix" table (21 scenarios). Note any failures and fix before continuing.

- [ ] **Step 2: Run `npm run build` one final time**

```bash
npm run build
```
Expected: green build. Fix any errors before proceeding.

- [ ] **Step 3: Write Obsidian planning doc**

Create `/Users/claud_01/Documents/flo/ax-homework-submission/2026-05-21-drafting-feature.md`:

```markdown
# Drafting feature — planning summary (2026-05-21)

## Why
Champions and admins lost work or accidentally published incomplete homework/charter/milestone entries. Needed an explicit "not yet shared" state with no validation friction.

## Decisions (from brainstorming)
- Explicit `draft`/`published` enum per entity, not autosave
- Drafts author-private (admin doesn't see champion drafts, vice versa)
- Multiple drafts per user per entity
- Inline `임시저장` badge + 3-position filter
- Edit-after-publish stays published (no un-publish path)
- Drafts skip validation; publish enforces required fields
- Single `publish_status` column (Approach A), not separate `*_drafts` tables

## Implementation shape
- Migration `008_drafting.sql` — enum + 3 column additions + `homeworks.created_by` + partial indexes
- 3 shared components: `DraftBadge`, `PublishStatusFilter`, `SaveOrPublishButtons`
- API: per-route `publish_status` accept + status-transition guard + on-publish validation
- Notification gating moved to defensive endpoint guards (drafts can't have submissions/comments/deliverables/deadline-requests)

## Spec
`docs/superpowers/specs/2026-05-19-drafting-feature-design.md`

## Plan
`docs/superpowers/plans/2026-05-21-drafting-feature.md`
```

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-05-21-drafting-feature.md
git commit -m "docs(drafting): implementation plan + Obsidian planning summary

11-task implementation plan covering migration, shared primitives,
homework/charter/milestone API + UI, downstream API gating, and
notification defense. Plan saved alongside spec; planning summary
mirrored to Obsidian vault."
```
