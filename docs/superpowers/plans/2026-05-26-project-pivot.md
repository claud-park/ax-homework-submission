# Project Pivot: Single-Project Champion Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from admin-created multi-homework model to a single-project-per-champion model with a cross-cohort Summary Table accessible to all champions.

**Architecture:** DB migration drops `homework_id` FK from `submissions`, `charter_submissions`, `milestones` and removes `homeworks`/`project_charters` tables. A new `/api/champions` aggregation endpoint powers a Summary Table that becomes the home page for both champions and admins. Champion UI restructures to Summary Table `/` → My Project tabs `/my-project/charter|milestones|submission` → read-only peer view `/champions/[userId]`. Admin gets a matching Summary Table `/admin` + champion management page `/admin/champions/[userId]`.

**Tech Stack:** Next.js 14 (App Router), TypeScript 5, Supabase PostgreSQL, Tailwind CSS, bun

---

## File Map

### Created
- `app/api/champions/route.ts` — GET all champions summary (for Summary Table)
- `app/api/champions/[userId]/route.ts` — GET one champion's full project
- `app/api/admin/users/[userId]/submissions/route.ts` — admin: GET user's submission history
- `app/(champion)/my-project/layout.tsx` — tabbed sub-nav (charter | milestones | submission)
- `app/(champion)/my-project/page.tsx` — redirect to charter tab
- `app/(champion)/my-project/charter/page.tsx` — charter editor (moved + cleaned)
- `app/(champion)/my-project/milestones/page.tsx` — milestones manager (moved + cleaned)
- `app/(champion)/my-project/submission/page.tsx` — file submission
- `app/(champion)/champions/[userId]/page.tsx` — read-only champion view
- `app/admin/champions/[userId]/page.tsx` — admin champion management
- `components/ChampionSummaryTable.tsx` — shared summary table UI

### Modified
- `lib/types.ts` — remove Homework, HomeworkWithCount; update Submission/CharterSubmission/Milestone/KanbanCard; add ChampionSummary, ChampionProject
- `lib/utils.ts` — add parseName utility
- `lib/notifications.ts` — remove Homework import/param from notifyNewSubmission
- `app/api/submissions/route.ts` — remove homework_id, update storage path
- `app/api/milestones/route.ts` — remove homework_id
- `app/api/charter/submissions/route.ts` — remove homework_id, use upsert
- `app/api/admin/kanban/route.ts` — rewrite without homeworks join
- `app/api/admin/milestones/route.ts` — remove homeworks join
- `app/api/admin/charters/route.ts` — remove homework_id ordering
- `app/admin/progress/page.tsx` — remove homeworks join references
- `app/(champion)/layout.tsx` — update nav (전체 현황 + 내 프로젝트)
- `app/(champion)/page.tsx` — replace with Summary Table
- `app/admin/layout.tsx` — update nav (remove 진척도 link)
- `app/admin/page.tsx` — replace with Summary Table
- `app/admin/kanban/page.tsx` — remove homework selector, update cardDragId
- `components/SubmissionDetailPanel.tsx` — update fetch URL

### Deleted
- `app/(champion)/charter/page.tsx` (moved to my-project/charter)
- `app/(champion)/milestones/page.tsx` (moved to my-project/milestones)
- `app/(champion)/progress/page.tsx`
- `app/(champion)/homework/[id]/page.tsx`
- `app/api/homeworks/route.ts`
- `app/api/homeworks/[id]/route.ts`
- `app/api/admin/homeworks/**` (entire directory)
- `app/api/submissions/mine/[homeworkId]/route.ts`
- `app/admin/homework/**` (entire directory)

---

## Task 1: DB Migration

**Files:** Supabase SQL editor only

- [ ] **Step 1: Run migration in Supabase SQL Editor**

Open Supabase project → SQL Editor → New Query. Run:

```sql
-- Drop FK columns
ALTER TABLE submissions DROP COLUMN IF EXISTS homework_id;
ALTER TABLE charter_submissions DROP COLUMN IF EXISTS homework_id;
ALTER TABLE milestones DROP COLUMN IF EXISTS homework_id;

-- Remove old unique constraint on (user_id, homework_id) if it exists
DO $$
DECLARE cname text;
BEGIN
  SELECT constraint_name INTO cname
  FROM information_schema.table_constraints
  WHERE table_name = 'charter_submissions'
    AND constraint_type = 'UNIQUE'
    AND constraint_name ILIKE '%homework%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE charter_submissions DROP CONSTRAINT %I', cname);
  END IF;
END$$;

DROP INDEX IF EXISTS charter_submissions_user_id_homework_id_unique;

-- One charter per champion
ALTER TABLE charter_submissions
  ADD CONSTRAINT charter_submissions_user_id_unique UNIQUE (user_id);

-- Drop legacy tables
DROP TABLE IF EXISTS homeworks CASCADE;
DROP TABLE IF EXISTS project_charters CASCADE;

-- Rebuild partial indexes
DROP INDEX IF EXISTS charter_submissions_drafts_by_user;
DROP INDEX IF EXISTS milestones_drafts_by_user;
DROP INDEX IF EXISTS homeworks_drafts_by_author;

CREATE INDEX IF NOT EXISTS charter_submissions_drafts_by_user
  ON charter_submissions(user_id) WHERE publish_status = 'draft';
CREATE INDEX IF NOT EXISTS milestones_drafts_by_user
  ON milestones(user_id) WHERE publish_status = 'draft';
```

- [ ] **Step 2: Verify in Table Editor**

Confirm: `submissions`, `charter_submissions`, `milestones` have no `homework_id` column; `homeworks` and `project_charters` tables are gone; `charter_submissions_user_id_unique` constraint exists.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: run supabase db migration — remove homeworks, homework_id FKs"
```

---

## Task 2: Update lib/types.ts

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Replace the entire file**

```ts
export type SubmissionStatus = 'pending' | 'accepted' | 'declined'
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed'
export type RequestStatus = 'pending' | 'approved' | 'rejected'
export type PublishStatus = 'draft' | 'published'

export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface Submission {
  id: string
  user_id: string
  file_path: string
  file_name: string
  status: SubmissionStatus
  attempt_number: number
  submitted_at: string
  comments?: Comment[]
  user?: User
}

export interface Comment {
  id: string
  submission_id: string
  body: string
  author_role: 'admin' | 'user'
  author_id: string | null
  created_at: string
  updated_at: string
}

export interface CharterSubmission {
  id: string
  user_id: string
  project_name: string | null
  content: {
    summary?: string
    problem?: string
    user?: string
    goal?: string
    solution?: string
    build?: string
    timeline?: string
  }
  submitted_at: string
  updated_at: string
  publish_status: PublishStatus
}

export interface ProjectCharter {
  id: string
  user_id: string
  project_name: string | null
  content: CharterSubmission['content']
  updated_at: string
  created_at: string
}

export interface Milestone {
  id: string
  user_id: string
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

export interface MilestoneDeliverable {
  id: string
  milestone_id: string
  file_path: string
  file_name: string
  uploaded_at: string
}

export interface DeadlineChangeRequest {
  id: string
  milestone_id: string
  user_id: string
  original_due_date: string
  requested_due_date: string
  reason: string
  status: RequestStatus
  reviewed_by: string | null
  support_assignee: string | null
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  milestone?: Milestone
  user?: User
}

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
  replies?: CharterComment[]
}

export interface ChampionSummary {
  userId: string
  name: string
  department: string
  projectName: string | null
  charterStatus: PublishStatus | null
  charterSubmissionId: string | null
  weeklyStatus: Record<number, MilestoneStatus>
}

export interface ChampionProject {
  user: User
  charter: (CharterSubmission & { comments: CharterComment[] }) | null
  milestones: Milestone[]
  latestSubmission: Submission | null
}

export interface KanbanCard {
  userId: string
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

export type KanbanColumn = 'not_started' | 'in_progress' | 'reviewing' | 'accepted' | 'declined'
export type KanbanDataV2 = Record<KanbanColumn, KanbanCard[]>
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "refactor: update types — remove Homework, drop homework_id, add ChampionSummary/ChampionProject"
```

---

## Task 3: Update lib/utils.ts and lib/notifications.ts

**Files:**
- Modify: `lib/utils.ts`
- Modify: `lib/notifications.ts`

- [ ] **Step 1: Add parseName to lib/utils.ts**

Append after the `cn` function:

```ts
export function parseName(rawName: string): { displayName: string; department: string } {
  const parts = rawName.split('/')
  return {
    displayName: parts[0]?.trim() ?? rawName,
    department: parts[1]?.trim() ?? '',
  }
}
```

Full file:

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseName(rawName: string): { displayName: string; department: string } {
  const parts = rawName.split('/')
  return {
    displayName: parts[0]?.trim() ?? rawName,
    department: parts[1]?.trim() ?? '',
  }
}
```

- [ ] **Step 2: Update lib/notifications.ts — remove Homework from notifyNewSubmission**

Change the import line and `notifyNewSubmission` function only. All other functions (`notifyDeadlineChangeRequest`, `notifyNewComment`, `notifyMilestoneCompleted`) are unchanged.

```ts
import type { User, Milestone, Submission, DeadlineChangeRequest } from '@/lib/types'
```

Replace `notifyNewSubmission`:

```ts
export async function notifyNewSubmission(params: {
  user: User
  submission: Submission
}): Promise<void> {
  const to = adminEmail()
  if (!to) return
  const { user, submission } = params
  const subject = `[과제 제출] ${user.name}`
  const link = `${appBaseUrl()}/admin/kanban`
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">📝 새 과제 제출</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">시도 횟수</td><td style="padding:8px 0">${String(submission.attempt_number)}회</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">파일명</td><td style="padding:8px 0">${escapeHtml(submission.file_name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">제출 시각</td><td style="padding:8px 0">${escapeHtml(submission.submitted_at)}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">칸반에서 검토</a>
  </div>
</div>`.trim()
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyNewSubmission failed:', e)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/utils.ts lib/notifications.ts
git commit -m "refactor: add parseName, remove Homework from notifications"
```

---

## Task 4: Create GET /api/champions

**Files:**
- Create: `app/api/champions/route.ts`

- [ ] **Step 1: Create file**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { ChampionSummary, MilestoneStatus } from '@/lib/types'

function aggregateWeekStatus(milestones: { status: MilestoneStatus }[]): MilestoneStatus {
  if (milestones.some(m => m.status === 'delayed')) return 'delayed'
  if (milestones.some(m => m.status === 'in_progress')) return 'in_progress'
  if (milestones.every(m => m.status === 'completed')) return 'completed'
  return 'not_started'
}

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name'),
    supabase.from('charter_submissions').select('user_id, id, project_name, publish_status'),
    supabase.from('milestones').select('user_id, week_number, status').eq('publish_status', 'published'),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (chartersErr) return NextResponse.json({ error: chartersErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })

  const charterMap = new Map<string, NonNullable<typeof charters>[number]>()
  for (const c of charters ?? []) charterMap.set(c.user_id, c)

  const milestonesByUser = new Map<string, Map<number, { status: MilestoneStatus }[]>>()
  for (const m of milestones ?? []) {
    if (!milestonesByUser.has(m.user_id)) milestonesByUser.set(m.user_id, new Map())
    const byWeek = milestonesByUser.get(m.user_id)!
    if (!byWeek.has(m.week_number)) byWeek.set(m.week_number, [])
    byWeek.get(m.week_number)!.push({ status: m.status as MilestoneStatus })
  }

  const result: ChampionSummary[] = (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const charter = charterMap.get(u.id)
    const byWeek = milestonesByUser.get(u.id) ?? new Map()
    const weeklyStatus: Record<number, MilestoneStatus> = {}
    for (const [week, mss] of byWeek) {
      weeklyStatus[week] = aggregateWeekStatus(mss)
    }
    return {
      userId: u.id,
      name: displayName,
      department,
      projectName: charter?.project_name ?? null,
      charterStatus: (charter?.publish_status as ChampionSummary['charterStatus']) ?? null,
      charterSubmissionId: charter?.id ?? null,
      weeklyStatus,
    }
  })

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/champions/route.ts
git commit -m "feat: add GET /api/champions — summary data for all champions"
```

---

## Task 5: Create GET /api/champions/[userId] and admin submissions route

**Files:**
- Create: `app/api/champions/[userId]/route.ts`
- Create: `app/api/admin/users/[userId]/submissions/route.ts`

- [ ] **Step 1: Create app/api/champions/[userId]/route.ts**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { ChampionProject } from '@/lib/types'

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId } = params
  const supabase = createServiceClient()

  const [
    { data: userRow, error: userErr },
    { data: charterRows, error: charterErr },
    { data: milestones, error: msErr },
    { data: submissions, error: subErr },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase
      .from('charter_submissions')
      .select('*')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1),
    supabase
      .from('milestones')
      .select('*, milestone_deliverables(*)')
      .eq('user_id', userId)
      .eq('publish_status', 'published')
      .order('week_number')
      .order('display_order'),
    supabase
      .from('submissions')
      .select('*')
      .eq('user_id', userId)
      .order('attempt_number', { ascending: false })
      .limit(1),
  ])

  if (userErr || !userRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (charterErr) return NextResponse.json({ error: charterErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

  const charter = charterRows?.[0] ?? null
  let charterWithComments = null
  if (charter) {
    const { data: comments } = await supabase
      .from('charter_comments')
      .select('*, replies:charter_comments!parent_id(*)')
      .eq('charter_submission_id', charter.id)
      .is('parent_id', null)
      .order('created_at')
    charterWithComments = { ...charter, comments: comments ?? [] }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (milestones ?? []).map(({ milestone_deliverables, ...rest }: any) => ({
    ...rest,
    deliverables: milestone_deliverables,
  }))

  const result: ChampionProject = {
    user: userRow,
    charter: charterWithComments,
    milestones: normalized,
    latestSubmission: submissions?.[0] ?? null,
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Create app/api/admin/users/[userId]/submissions/route.ts**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*, comments(*)')
    .eq('user_id', params.userId)
    .order('attempt_number', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/champions/[userId]/route.ts app/api/admin/users/[userId]/submissions/route.ts
git commit -m "feat: add GET /api/champions/[userId] and admin user submissions route"
```

---

## Task 6: Update POST /api/submissions

**Files:**
- Modify: `app/api/submissions/route.ts`

- [ ] **Step 1: Replace file**

Removes `homework_id`, updates storage path to `{user_id}/{attemptNumber}/{filename}`, removes homework lookup before insert.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { notifyNewSubmission } from '@/lib/notifications'
import { createServiceClient } from '@/lib/supabase/server'

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx !== -1 ? name.slice(dotIdx) : ''
  const base = dotIdx !== -1 ? name.slice(0, dotIdx) : name
  return base.replace(/[^a-zA-Z0-9._-]/g, '_') + ext
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

  const supabase = createServiceClient()

  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
  const attemptNumber = (count ?? 0) + 1

  const safeFileName = sanitizeFileName(file.name)
  const filePath = `${user.id}/${attemptNumber}/${safeFileName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('submissions')
    .upload(filePath, arrayBuffer, { contentType: file.type, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data, error } = await supabase
    .from('submissions')
    .insert({
      user_id: user.id,
      file_path: filePath,
      file_name: file.name,
      status: 'pending',
      attempt_number: attemptNumber,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void (async () => {
    try {
      const { data: userRow } = await supabase.from('users').select('*').eq('id', user.id).single()
      if (userRow) await notifyNewSubmission({ user: userRow, submission: data })
    } catch (e) {
      console.error('[email] outer catch:', e)
    }
  })()

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/submissions/route.ts
git commit -m "feat: update POST /api/submissions — remove homework_id, update storage path"
```

---

## Task 7: Update GET+POST /api/milestones

**Files:**
- Modify: `app/api/milestones/route.ts`

- [ ] **Step 1: Replace file**

Removes `homework_id` filter and `homeworks(id, title)` join from GET. Removes `homework_id` from POST body.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()
  let query = supabase
    .from('milestones')
    .select('*, milestone_deliverables(*)')
    .eq('user_id', effectiveUserId)
    .order('week_number')
    .order('display_order')

  if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map(({ milestone_deliverables, ...rest }: any) => ({
    ...rest,
    deliverables: milestone_deliverables,
  }))
  return NextResponse.json(normalized)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { week_number, title, start_date, due_date, description, publish_status } = body
  const status = publish_status === 'published' ? 'published' : 'draft'
  const resolvedWeekNumber = week_number ?? 1

  if (status === 'published') {
    const fields: { field: string; message: string }[] = []
    if (!title) fields.push({ field: 'title', message: '필수 항목입니다.' })
    if (!start_date) fields.push({ field: 'start_date', message: '필수 항목입니다.' })
    if (!due_date) fields.push({ field: 'due_date', message: '필수 항목입니다.' })
    if (!resolvedWeekNumber) fields.push({ field: 'week_number', message: '필수 항목입니다.' })
    if (fields.length > 0) return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .insert({
      user_id: user.id,
      week_number: resolvedWeekNumber,
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

- [ ] **Step 2: Commit**

```bash
git add app/api/milestones/route.ts
git commit -m "feat: update /api/milestones — remove homework_id"
```

---

## Task 8: Update GET+POST /api/charter/submissions

**Files:**
- Modify: `app/api/charter/submissions/route.ts`

- [ ] **Step 1: Replace file**

Removes `homework_id`. POST now uses `upsert` on `user_id` (enforcing one charter per champion).

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
  for (const key of ['summary', 'problem']) {
    if (!stripHtml(content?.[key])) fields.push({ field: key, message: '필수 항목입니다.' })
  }
  return fields
}

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()

  if (isAdmin && !targetUserId) {
    const { data, error } = await supabase
      .from('charter_submissions')
      .select('*, users(*)')
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

  if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { project_name, content, publish_status } = await req.json()
  const status = publish_status === 'published' ? 'published' : 'draft'

  if (status === 'published') {
    const fields = validateCharter(content ?? {}, project_name)
    if (fields.length > 0) return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .upsert(
      {
        user_id: user.id,
        project_name: project_name ?? null,
        content: content ?? {},
        publish_status: status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/charter/submissions/route.ts
git commit -m "feat: update /api/charter/submissions — remove homework_id, upsert on user_id"
```

---

## Task 9: Update admin API routes — kanban, milestones, charters

**Files:**
- Modify: `app/api/admin/kanban/route.ts`
- Modify: `app/api/admin/milestones/route.ts`
- Modify: `app/api/admin/charters/route.ts`

- [ ] **Step 1: Replace app/api/admin/kanban/route.ts**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { KanbanCard, KanbanDataV2 } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: allSubmissions, error: subErr },
    { data: milestones, error: msErr },
    { data: charters, error: charterErr },
    { data: deadlineReqs, error: dlErr },
  ] = await Promise.all([
    supabase.from('users').select('*'),
    supabase
      .from('submissions')
      .select('id, user_id, file_name, status, attempt_number, submitted_at')
      .order('submitted_at', { ascending: false }),
    supabase.from('milestones').select('user_id, status').eq('publish_status', 'published'),
    supabase.from('charter_submissions').select('user_id').eq('publish_status', 'published'),
    supabase.from('deadline_change_requests').select('user_id').eq('status', 'pending'),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })
  if (charterErr) return NextResponse.json({ error: charterErr.message }, { status: 500 })
  if (dlErr) return NextResponse.json({ error: dlErr.message }, { status: 500 })

  const latestSubMap = new Map<string, NonNullable<typeof allSubmissions>[number]>()
  for (const sub of allSubmissions ?? []) {
    if (!latestSubMap.has(sub.user_id)) latestSubMap.set(sub.user_id, sub)
  }

  const milestoneMap = new Map<string, { total: number; completed: number }>()
  for (const m of milestones ?? []) {
    const entry = milestoneMap.get(m.user_id) ?? { total: 0, completed: 0 }
    entry.total++
    if (m.status === 'completed') entry.completed++
    milestoneMap.set(m.user_id, entry)
  }

  const charterSet = new Set<string>((charters ?? []).map(c => c.user_id))
  const deadlineMap = new Map<string, number>()
  for (const r of deadlineReqs ?? []) {
    deadlineMap.set(r.user_id, (deadlineMap.get(r.user_id) ?? 0) + 1)
  }

  const result: KanbanDataV2 = {
    not_started: [], in_progress: [], reviewing: [], accepted: [], declined: [],
  }

  for (const user of users ?? []) {
    const sub = latestSubMap.get(user.id) ?? null
    const ms = milestoneMap.get(user.id) ?? { total: 0, completed: 0 }
    const hasCharter = charterSet.has(user.id)
    const pendingDeadlineRequests = deadlineMap.get(user.id) ?? 0

    const card: KanbanCard = {
      userId: user.id,
      user,
      latestSubmission: sub
        ? {
            id: sub.id,
            status: sub.status,
            attemptNumber: sub.attempt_number,
            fileName: sub.file_name,
            submittedAt: sub.submitted_at,
          }
        : null,
      milestoneTotal: ms.total,
      milestoneCompleted: ms.completed,
      hasCharter,
      pendingDeadlineRequests,
    }

    if (sub?.status === 'accepted') result.accepted.push(card)
    else if (sub?.status === 'pending') result.reviewing.push(card)
    else if (sub?.status === 'declined') result.declined.push(card)
    else if (ms.total > 0 || hasCharter) result.in_progress.push(card)
    else result.not_started.push(card)
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Replace app/api/admin/milestones/route.ts**

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
    .select('*, users(*), milestone_deliverables(*)')
    .eq('publish_status', 'published')
    .order('user_id').order('week_number').order('display_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Replace app/api/admin/charters/route.ts**

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
    .order('submitted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/kanban/route.ts app/api/admin/milestones/route.ts app/api/admin/charters/route.ts
git commit -m "feat: update admin API — remove homeworks join, update KanbanCard shape"
```

---

## Task 10: Delete removed API files

**Files to delete:**
- `app/api/homeworks/route.ts`
- `app/api/homeworks/[id]/route.ts`
- `app/api/admin/homeworks/` (entire directory)
- `app/api/submissions/mine/[homeworkId]/route.ts`

- [ ] **Step 1: Delete**

```bash
rm app/api/homeworks/route.ts
rm "app/api/homeworks/[id]/route.ts"
rm -rf "app/api/admin/homeworks"
rm "app/api/submissions/mine/[homeworkId]/route.ts"
```

- [ ] **Step 2: Typecheck API layer only**

```bash
bun run typecheck 2>&1 | grep "app/api" | head -20
```

Expected: 0 errors in `app/api/**`. UI files may still have errors (they reference old types/routes).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove deleted API routes — homeworks, admin/homeworks, mine/[homeworkId]"
```

---

## Task 11: Create components/ChampionSummaryTable.tsx

**Files:**
- Create: `components/ChampionSummaryTable.tsx`

- [ ] **Step 1: Create component**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { ChampionSummary, MilestoneStatus } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'

const STATUS_ICON: Record<MilestoneStatus, string> = {
  completed: '🟢',
  in_progress: '🟡',
  delayed: '🔴',
  not_started: '⬜',
}

interface Props {
  onChampionClick: (userId: string) => void
  onCharterClick: (userId: string) => void
  highlightUserId?: string
}

export function ChampionSummaryTable({ onChampionClick, onCharterClick, highlightUserId }: Props) {
  const [champions, setChampions] = useState<ChampionSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<ChampionSummary[]>('/api/champions')
      .then(setChampions)
      .finally(() => setLoading(false))
  }, [])

  const allWeeks = Array.from(
    new Set(champions.flatMap(c => Object.keys(c.weeklyStatus).map(Number)))
  ).sort((a, b) => a - b)

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
            {['부서', '이름', '과제명', '과제정의서', ...allWeeks.map(w => `W${w}`)].map(h => (
              <th
                key={h}
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {champions.map(c => (
            <tr
              key={c.userId}
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                background: c.userId === highlightUserId ? 'rgba(37,99,235,0.06)' : 'transparent',
              }}
            >
              <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {c.department || '—'}
              </td>
              <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                <button
                  onClick={() => onChampionClick(c.userId)}
                  style={{ color: 'var(--blue-600)', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  {c.name}
                </button>
              </td>
              <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>
                {c.projectName || '—'}
              </td>
              <td style={{ padding: '10px 12px' }}>
                {c.charterSubmissionId ? (
                  <button
                    onClick={() => onCharterClick(c.userId)}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: 'none',
                      cursor: 'pointer',
                      background: c.charterStatus === 'published' ? 'rgba(37,99,235,0.1)' : 'rgba(100,116,139,0.1)',
                      color: c.charterStatus === 'published' ? 'var(--blue-600)' : 'var(--text-secondary)',
                    }}
                  >
                    {c.charterStatus === 'published' ? '📋 게시됨' : '📝 초안'}
                  </button>
                ) : (
                  <span style={{ color: 'var(--text-disabled)' }}>—</span>
                )}
              </td>
              {allWeeks.map(w => (
                <td key={w} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 16 }}>
                  {c.weeklyStatus[w]
                    ? STATUS_ICON[c.weeklyStatus[w]]
                    : <span style={{ color: 'var(--text-disabled)' }}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ChampionSummaryTable.tsx
git commit -m "feat: add ChampionSummaryTable shared component"
```

---

## Task 12: Champion layout nav + replace home page

**Files:**
- Modify: `app/(champion)/layout.tsx`
- Modify: `app/(champion)/page.tsx`

- [ ] **Step 1: Replace app/(champion)/layout.tsx**

```tsx
'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const NAV = [
  { emoji: '👥', label: '전체 현황', href: '/' },
  { emoji: '🗂️', label: '내 프로젝트', href: '/my-project' },
]

export default function ChampionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <aside className="w-44 flex-shrink-0 flex flex-col gap-1 p-4 border-r" style={{ background: 'hsl(var(--background))', borderColor: 'var(--border-subtle)' }}>
        <span className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>AX Homework</span>
        {NAV.map(item => {
          const active = item.href === '/'
            ? pathname === '/' || pathname.startsWith('/champions')
            : pathname.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              className="text-xs px-3 py-2 rounded-lg font-medium transition-colors"
              style={{
                background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
              }}
            >
              <span aria-hidden="true">{item.emoji}</span> {item.label}
            </a>
          )
        })}
        <div className="mt-auto">
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-2 rounded-lg w-full text-left"
            style={{ color: 'var(--text-disabled)' }}
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Replace app/(champion)/page.tsx**

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { ChampionSummaryTable } from '@/components/ChampionSummaryTable'

export default function SummaryPage() {
  const router = useRouter()
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>전체 현황</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>챔피언 프로젝트 진행 현황</p>
      </div>
      <ChampionSummaryTable
        onChampionClick={(userId) => router.push(`/champions/${userId}`)}
        onCharterClick={(userId) => router.push(`/champions/${userId}#charter`)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(champion)/layout.tsx" "app/(champion)/page.tsx"
git commit -m "feat: champion home — summary table + updated nav"
```

---

## Task 13: Create /my-project sub-routes

**Files:**
- Create: `app/(champion)/my-project/layout.tsx`
- Create: `app/(champion)/my-project/page.tsx`
- Create: `app/(champion)/my-project/charter/page.tsx` (moved + cleaned)
- Create: `app/(champion)/my-project/milestones/page.tsx` (moved + cleaned)
- Create: `app/(champion)/my-project/submission/page.tsx` (new)

- [ ] **Step 1: Create app/(champion)/my-project/layout.tsx**

```tsx
'use client'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: '과제정의서', href: '/my-project/charter' },
  { label: 'WBS / 마일스톤', href: '/my-project/milestones' },
  { label: '파일 제출', href: '/my-project/submission' },
]

export default function MyProjectLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>내 프로젝트</h1>
        <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <a
                key={tab.href}
                href={tab.href}
                className="text-xs px-4 py-2 font-medium transition-colors"
                style={{
                  color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
                  borderBottom: active ? '2px solid var(--blue-600)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </a>
            )
          })}
        </div>
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create app/(champion)/my-project/page.tsx**

```tsx
import { redirect } from 'next/navigation'
export default function MyProjectRoot() {
  redirect('/my-project/charter')
}
```

- [ ] **Step 3: Create app/(champion)/my-project/charter/page.tsx**

Copy `app/(champion)/charter/page.tsx` in full, then make exactly these changes:

**a) Change imports** — remove `Homework` from import line:
```tsx
// Before:
import type { Homework, ProjectCharter, CharterSubmission } from '@/lib/types'
// After:
import type { ProjectCharter, CharterSubmission } from '@/lib/types'
```

**b) Delete the entire `HomeworkSelect` function** (lines from `function HomeworkSelect` through its closing `}` — roughly 125 lines). This component is no longer needed.

**c) In `CharterPanel` component** — remove `homeworks` prop and `homeworkId` state:
```tsx
// Remove from props:
homeworks: Homework[]

// Remove state:
const [homeworkId, setHomeworkId] = useState<number | ''>(submission?.homework_id ?? '')

// Remove from handleSave POST body (mode === 'new' branch):
homework_id: homeworkId !== '' ? homeworkId : null,

// Remove HomeworkSelect JSX from the CharterPanel render
```

**d) In the parent component** — remove `homeworks` state and fetch:
```tsx
// Remove:
const [homeworks, setHomeworks] = useState<Homework[]>([])
// Remove the apiFetch('/api/homeworks') call from useEffect

// Remove homeworks prop from <CharterPanel> usages:
// Before: <CharterPanel ... homeworks={homeworks} ...>
// After: <CharterPanel ... >  (no homeworks prop)
```

**e) In the charter list GET** — remove `?homework_id=...` query param:
```tsx
// Before:
apiFetch<CharterSubmission[]>(`/api/charter/submissions?homework_id=${selectedHw}`)
// After:
apiFetch<CharterSubmission[]>('/api/charter/submissions')
```

Also remove `selectedHw` state and `PublishStatusFilter` homework filter if it references homework IDs (keep publish_status filter for draft/published filtering).

- [ ] **Step 4: Create app/(champion)/my-project/milestones/page.tsx**

Copy `app/(champion)/milestones/page.tsx` in full, then make exactly these changes:

**a) Remove `MilestoneWithHomework` type** — replace all uses with `Milestone`:
```tsx
// Remove:
type MilestoneWithHomework = Milestone & { homeworks: { id: number; title: string } | null }

// Replace all: MilestoneWithHomework → Milestone
// In state: useState<MilestoneWithHomework[]>([]) → useState<Milestone[]>([])
// In editingMilestone: useState<MilestoneWithHomework | null> → useState<Milestone | null>
```

**b) In GET milestones fetch** — remove `homeworks(id, title)` from select:
```tsx
// The milestones API no longer returns homeworks join — the type change handles this
// No code change needed beyond the type fix above
```

**c) In POST /api/milestones** — remove `homework_id` from request body:
```tsx
// Before:
body: JSON.stringify({
  week_number: form.week_number,
  homework_id: selectedHw || null,
  title: form.title,
  ...
})
// After:
body: JSON.stringify({
  week_number: form.week_number,
  title: form.title,
  ...
})
```

**d) Remove homework display** — any UI showing `m.homeworks?.title` or homework badge in milestone cards.

**e) Remove `selectedHw` state and homework selector** if it exists in this page (it may fetch from `/api/homeworks` — remove that fetch).

- [ ] **Step 5: Create app/(champion)/my-project/submission/page.tsx**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Submission } from '@/lib/types'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Upload, FileCheck } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

export default function SubmissionPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function load() {
    apiFetch<Submission[]>('/api/submissions/mine')
      .then(setSubmissions)
      .catch((e: Error) => toast.error('로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/submissions', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '제출 실패')
      }
      toast.success('제출되었습니다.')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '제출 실패')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const latest = submissions[0] ?? null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          {latest && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              최근 제출: {latest.file_name} · 시도 {latest.attempt_number}회
            </p>
          )}
        </div>
        <label
          className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer"
          style={{ background: 'var(--blue-600)', color: '#fff', opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? '업로드 중...' : latest ? '재제출' : '제출하기'}
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : submissions.length === 0 ? (
        <EmptyState icon={Upload} title="아직 제출하지 않았습니다" description="파일을 업로드해 제출하세요." />
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map(sub => (
            <div
              key={sub.id}
              className="flex items-center justify-between p-4 rounded-xl border"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-3">
                <FileCheck className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              </div>
              <span
                className="text-xs font-semibold px-2 py-1 rounded-md"
                style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}
              >
                {STATUS_LABEL[sub.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Build check**

```bash
bun run typecheck 2>&1 | grep "my-project" | head -20
```

Fix any type errors in the new files.

- [ ] **Step 7: Commit**

```bash
git add "app/(champion)/my-project/"
git commit -m "feat: add /my-project sub-routes — charter, milestones, submission tabs"
```

---

## Task 14: Create /champions/[userId] — read-only champion view

**Files:**
- Create: `app/(champion)/champions/[userId]/page.tsx`

- [ ] **Step 1: Create file**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { ChampionProject, MilestoneStatus } from '@/lib/types'
import { parseName } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const CHARTER_SECTIONS = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
  { key: 'timeline', label: '06. Timeline · Milestones' },
]

export default function ChampionDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [data, setData] = useState<ChampionProject | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<ChampionProject>(`/api/champions/${userId}`)
      .then(setData)
      .catch(() => router.push('/'))
      .finally(() => setLoading(false))
  }, [userId, router])

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    )
  }
  if (!data) return null

  const { displayName, department } = parseName(data.user.name)
  const weekGroups = new Map<number, typeof data.milestones>()
  for (const m of data.milestones) {
    if (!weekGroups.has(m.week_number)) weekGroups.set(m.week_number, [])
    weekGroups.get(m.week_number)!.push(m)
  }

  return (
    <div>
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-1 text-xs mb-6"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3 w-3" /> 전체 현황으로
      </button>

      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</h1>
        {department && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{department}</p>}
        {data.charter?.project_name && (
          <p className="text-sm mt-1 font-medium" style={{ color: 'var(--text-primary)' }}>{data.charter.project_name}</p>
        )}
      </div>

      {data.charter && (
        <section id="charter" className="mb-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>과제정의서</h2>
          <div className="flex flex-col gap-3">
            {CHARTER_SECTIONS.map(s => {
              const html = data.charter!.content?.[s.key as keyof CharterSubmission['content']]
              if (!html) return null
              return (
                <div
                  key={s.key}
                  className="p-4 rounded-xl border"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                >
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    style={{ color: 'var(--text-primary)' }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {weekGroups.size > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>WBS / 마일스톤</h2>
          {Array.from(weekGroups.entries()).sort(([a], [b]) => a - b).map(([week, ms]) => (
            <div key={week} className="mb-4">
              <h3 className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>W{week}</h3>
              <div className="flex flex-col gap-2">
                {ms.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{m.start_date} ~ {m.due_date}</p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-md"
                      style={{ color: STATUS_COLOR[m.status], background: `${STATUS_COLOR[m.status]}20` }}
                    >
                      {STATUS_LABEL[m.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
```

Note: Add `import type { CharterSubmission } from '@/lib/types'` to the imports.

- [ ] **Step 2: Commit**

```bash
git add "app/(champion)/champions/"
git commit -m "feat: add /champions/[userId] — read-only champion project view"
```

---

## Task 15: Delete old champion pages

**Files to delete:**
- `app/(champion)/charter/page.tsx`
- `app/(champion)/milestones/page.tsx`
- `app/(champion)/progress/page.tsx`
- `app/(champion)/homework/[id]/page.tsx`

- [ ] **Step 1: Delete**

```bash
rm "app/(champion)/charter/page.tsx"
rm "app/(champion)/milestones/page.tsx"
rm "app/(champion)/progress/page.tsx"
rm -rf "app/(champion)/homework"
```

- [ ] **Step 2: Typecheck champion section**

```bash
bun run typecheck 2>&1 | grep "(champion)" | head -20
```

Fix any remaining errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old champion pages — charter, milestones, progress, homework/[id]"
```

---

## Task 16: Replace admin home + update admin layout nav

**Files:**
- Modify: `app/admin/page.tsx`
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: Replace app/admin/page.tsx**

```tsx
'use client'
import { useRouter } from 'next/navigation'
import { ChampionSummaryTable } from '@/components/ChampionSummaryTable'

export default function AdminDashboard() {
  const router = useRouter()
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>대시보드</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>전체 챔피언 현황</p>
      </div>
      <ChampionSummaryTable
        onChampionClick={(userId) => router.push(`/admin/champions/${userId}`)}
        onCharterClick={(userId) => router.push(`/admin/champions/${userId}#charter`)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update app/admin/layout.tsx — update NAV**

```tsx
const NAV = [
  { emoji: '📋', label: '대시보드', href: '/admin' },
  { emoji: '📦', label: '제출 현황', href: '/admin/kanban' },
  { emoji: '📅', label: '기한 변경 요청', href: '/admin/requests' },
  { emoji: '📄', label: '주간 리포트', href: '/admin/reports' },
]
```

(Removes `진척도` link — progress is now visible in the summary table.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx app/admin/layout.tsx
git commit -m "feat: admin dashboard — champion summary table, updated nav"
```

---

## Task 17: Create admin champion management page

**Files:**
- Create: `app/admin/champions/[userId]/page.tsx`

- [ ] **Step 1: Create file**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { ChampionProject, Submission, MilestoneStatus } from '@/lib/types'
import { parseName } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

const MS_STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const MS_STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const SUB_STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const SUB_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}
const CHARTER_SECTIONS = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
  { key: 'timeline', label: '06. Timeline · Milestones' },
]

export default function AdminChampionPage() {
  const { userId } = useParams<{ userId: string }>()
  const router = useRouter()
  const [data, setData] = useState<ChampionProject | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)

  function loadSubs() {
    return apiFetch<Submission[]>(`/api/admin/users/${userId}/submissions`).then(setSubmissions)
  }

  useEffect(() => {
    Promise.all([
      apiFetch<ChampionProject>(`/api/champions/${userId}`).then(setData),
      loadSubs(),
    ])
      .catch(() => toast.error('데이터 로드 실패'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function updateStatus(submissionId: string, status: 'accepted' | 'declined') {
    try {
      await apiFetch(`/api/admin/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      toast.success('상태 변경 완료')
      await loadSubs()
    } catch {
      toast.error('상태 변경 실패')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    )
  }
  if (!data) return null

  const { displayName, department } = parseName(data.user.name)
  const weekGroups = new Map<number, typeof data.milestones>()
  for (const m of data.milestones) {
    if (!weekGroups.has(m.week_number)) weekGroups.set(m.week_number, [])
    weekGroups.get(m.week_number)!.push(m)
  }

  return (
    <div>
      <button
        onClick={() => router.push('/admin')}
        className="flex items-center gap-1 text-xs mb-6"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3 w-3" /> 대시보드로
      </button>

      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{displayName}</h1>
        {department && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{department}</p>}
        {data.charter?.project_name && (
          <p className="text-sm font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{data.charter.project_name}</p>
        )}
      </div>

      <section className="mb-8">
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>파일 제출 이력</h2>
        {submissions.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>아직 제출 없음</p>
        ) : (
          <div className="flex flex-col gap-2">
            {submissions.map(sub => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-3 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold px-2 py-1 rounded-md"
                    style={{ color: SUB_STATUS_COLOR[sub.status], background: `${SUB_STATUS_COLOR[sub.status]}20` }}
                  >
                    {SUB_STATUS_LABEL[sub.status]}
                  </span>
                  {sub.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateStatus(sub.id, 'accepted')}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)', border: 'none', cursor: 'pointer' }}
                      >합격</button>
                      <button
                        onClick={() => updateStatus(sub.id, 'declined')}
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--error)', border: 'none', cursor: 'pointer' }}
                      >불합격</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.charter && (
        <section id="charter" className="mb-8">
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>과제정의서</h2>
          <div className="flex flex-col gap-3">
            {CHARTER_SECTIONS.map(s => {
              const html = data.charter!.content?.[s.key as keyof typeof data.charter.content]
              if (!html) return null
              return (
                <div
                  key={s.key}
                  className="p-4 rounded-xl border"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                >
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                  <div
                    className="prose prose-sm max-w-none text-sm"
                    style={{ color: 'var(--text-primary)' }}
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {weekGroups.size > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>WBS / 마일스톤</h2>
          {Array.from(weekGroups.entries()).sort(([a], [b]) => a - b).map(([week, ms]) => (
            <div key={week} className="mb-4">
              <h3 className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>W{week}</h3>
              <div className="flex flex-col gap-2">
                {ms.map(m => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 rounded-xl border"
                    style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{m.start_date} ~ {m.due_date}</p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-md"
                      style={{ color: MS_STATUS_COLOR[m.status], background: `${MS_STATUS_COLOR[m.status]}20` }}
                    >
                      {MS_STATUS_LABEL[m.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/admin/champions/"
git commit -m "feat: add /admin/champions/[userId] — admin champion management"
```

---

## Task 18: Update admin kanban page + SubmissionDetailPanel

**Files:**
- Modify: `app/admin/kanban/page.tsx`
- Modify: `components/SubmissionDetailPanel.tsx`

- [ ] **Step 1: Update app/admin/kanban/page.tsx**

Make these targeted changes to the existing file:

**a) Update imports** — remove `Homework` type:
```tsx
// Before:
import type { Homework, KanbanCard, KanbanColumn, KanbanDataV2, SubmissionStatus } from '@/lib/types'
// After:
import type { KanbanCard, KanbanColumn, KanbanDataV2, SubmissionStatus } from '@/lib/types'
```

**b) Update `cardDragId`** — use userId only (no homeworkId):
```tsx
function cardDragId(card: KanbanCard) {
  return card.userId
}
```

**c) Remove homework state and fetch**:
```tsx
// Remove:
const [homeworks, setHomeworks] = useState<Homework[]>([])
const [selectedHw, setSelectedHw] = useState<string>('')

// Remove the useEffect that fetches /api/admin/homeworks
// Remove the selectedHw-based kanban URL logic — always use '/api/admin/kanban'
```

**d) Remove `showHomework` prop** from `KanbanCardView` and `DroppableCol` signatures, and all their usages.

**e) Remove homework display from `KanbanCardView`** — delete the `showHomework &&` block that shows `#{card.homeworkId} {card.homeworkTitle}`.

**f) Remove the `<select>` homework filter** from the page header.

**g) Update `fetchKanban`**:
```tsx
const fetchKanban = useCallback(() => {
  apiFetch<KanbanDataV2>('/api/admin/kanban').then(setData).catch(() => toast.error('데이터 로드 실패'))
}, [])
```

- [ ] **Step 2: Update components/SubmissionDetailPanel.tsx — fix fetch URL**

Find (around line 63):
```tsx
apiFetch<(Submission & { comments?: Comment[] })[]>(`/api/admin/homeworks/${card.homeworkId}/submissions/${card.userId}`)
```

Replace with:
```tsx
apiFetch<(Submission & { comments?: Comment[] })[]>(`/api/admin/users/${card.userId}/submissions`)
```

- [ ] **Step 3: Typecheck**

```bash
bun run typecheck
```

Fix all remaining type errors. Common ones:
- Any remaining reference to `card.homeworkId` or `card.homeworkTitle` → remove
- `KanbanCard` no longer has those fields

- [ ] **Step 4: Commit**

```bash
git add app/admin/kanban/page.tsx components/SubmissionDetailPanel.tsx
git commit -m "feat: update admin kanban — remove homework filter, fix SubmissionDetailPanel"
```

---

## Task 19: Update admin/progress + delete old admin pages + final build

**Files:**
- Modify: `app/admin/progress/page.tsx`
- Delete: `app/admin/homework/` (entire directory)

- [ ] **Step 1: Update app/admin/progress/page.tsx**

Make these targeted changes:

**a) Remove `HomeworkInfo` type and `homeworks` join reference**:
```tsx
// Remove:
type HomeworkInfo = { id: number; title: string } | null
// Change:
type MilestoneWithUser = Milestone & { users: User; homeworks: HomeworkInfo }
// To:
type MilestoneWithUser = Milestone & { users: User }
```

**b) Remove `homework_id` from `CharterWithUser`**:
```tsx
// Remove: homework_id: number | null
```

**c) Remove `ViewMode = 'user' | 'homework'`** if it exists, and any "by homework" grouping logic — only user-based grouping remains.

**d) Remove any `homeworks(id, title)` from the milestones select call** — the API no longer returns it.

- [ ] **Step 2: Delete old admin homework pages**

```bash
rm -rf app/admin/homework
```

- [ ] **Step 3: Final build**

```bash
bun run build
```

Expected: 0 errors and 0 type errors. If there are errors:
- Type errors referencing `homework_id` on any type → the field was removed in Task 2
- Type errors referencing `homeworkId`/`homeworkTitle` on `KanbanCard` → the fields were removed in Task 2
- Import errors for removed routes → update or remove the import

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete pivot — update admin/progress, remove old admin homework pages"
```

---

## Verification Checklist

After all tasks, verify these flows in the browser (`bun run dev`):

- [ ] Champion home (`/`) shows Summary Table with all champions
- [ ] Summary Table has columns: 부서, 이름, 과제명, 과제정의서, W1/W2... with traffic lights
- [ ] Clicking a champion name navigates to `/champions/[userId]` (read-only view)
- [ ] Clicking 과제정의서 button navigates to champion detail with `#charter` anchor
- [ ] `/my-project` redirects to `/my-project/charter`
- [ ] Charter tab works — can save/publish charter (no homework dropdown)
- [ ] Milestones tab works — can create/edit milestones (no homework field)
- [ ] Submission tab works — can upload file, see history
- [ ] Admin `/admin` shows same Summary Table (champions navigate to `/admin/champions/[userId]`)
- [ ] `/admin/champions/[userId]` shows submissions + charter + milestones, can approve/decline
- [ ] `/admin/kanban` works without homework selector, cards have no homework badge
- [ ] File submission email notification fires (check logs)
