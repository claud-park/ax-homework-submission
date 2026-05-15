# Charter Review & Threaded Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin can view each user's 과제정의서 and leave threaded resolved/unresolved feedback; users can see and reply to that feedback — all inside the existing homework user-detail page.

**Architecture:** New `charter_comments` table (2-level threading + resolved state). Five new API routes. Admin `homework/[id]/[userId]` page gets three tabs (제출물 | 과제정의서 | 마일스톤). Champion's charter tab gains a comment section below the editor.

**Tech Stack:** Next.js 14 App Router · Supabase PostgreSQL service client · `apiFetch` · DOMPurify · existing CSS variable design system

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/006_charter_comments.sql` | DB table |
| Modify | `lib/types.ts` | Add `CharterComment` interface |
| Modify | `app/api/charter/submissions/route.ts` | Add admin `user_id` param |
| Create | `app/api/charter/submissions/[id]/comments/route.ts` | GET + POST top-level comments |
| Create | `app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts` | POST reply |
| Create | `app/api/charter/comments/[commentId]/route.ts` | PATCH edit body (own only) |
| Create | `app/api/charter/comments/[commentId]/resolve/route.ts` | PATCH resolve (admin only) |
| Modify | `app/api/milestones/route.ts` | Admin can fetch another user's milestones |
| Modify | `app/admin/homework/[id]/[userId]/page.tsx` | Tabs + CharterReviewTab + MilestonesAdminTab |
| Modify | `app/(champion)/homework/[id]/page.tsx` | CharterCommentSection below editor |
| Modify | `docs/ERD.md` | Document charter_comments table |

---

## Task 1: Migration + Types

**Files:**
- Create: `supabase/migrations/006_charter_comments.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/006_charter_comments.sql`:

```sql
create table if not exists charter_comments (
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

- [ ] **Step 2: Run in Supabase dashboard**

Copy the SQL above into the Supabase SQL Editor and run it. Verify the `charter_comments` table appears in Table Editor.

- [ ] **Step 3: Add `CharterComment` to `lib/types.ts`**

Open `lib/types.ts` and add after the `Comment` interface:

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
  replies?: CharterComment[]
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/006_charter_comments.sql lib/types.ts
git commit -m "feat: add charter_comments table and CharterComment type"
```

---

## Task 2: API — GET + POST top-level comments; admin charter fetch

**Files:**
- Modify: `app/api/charter/submissions/route.ts`
- Create: `app/api/charter/submissions/[id]/comments/route.ts`

- [ ] **Step 1: Modify charter submissions GET to support admin `user_id` param**

Open `app/api/charter/submissions/route.ts`. Replace the full file with:

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
  // Admins may fetch any user's charter by passing ?user_id=; users always get their own
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()
  let query = supabase
    .from('charter_submissions')
    .select('*')
    .eq('user_id', effectiveUserId)
    .order('submitted_at', { ascending: false })
  if (homeworkId) query = query.eq('homework_id', Number(homeworkId))
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { project_name, content, homework_id } = await req.json()
  if (!content) return NextResponse.json({ error: 'Missing content' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .insert({ user_id: user.id, project_name, content, ...(homework_id ? { homework_id } : {}) })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create comments route**

Create `app/api/charter/submissions/[id]/comments/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

async function getCharterAndVerifyAccess(supabase: ReturnType<typeof import('@/lib/supabase/server').createServiceClient>, charterId: string, userId: string, isAdmin: boolean) {
  const { data: charter } = await supabase
    .from('charter_submissions')
    .select('id, user_id')
    .eq('id', charterId)
    .single()
  if (!charter) return null
  if (!isAdmin && charter.user_id !== userId) return null
  return charter
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()
  const charter = await getCharterAndVerifyAccess(supabase, params.id, user.id, isAdmin)
  if (!charter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await supabase
    .from('charter_comments')
    .select('*')
    .eq('charter_submission_id', params.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()
  const charter = await getCharterAndVerifyAccess(supabase, params.id, user.id, isAdmin)
  if (!charter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })
  const { data, error } = await supabase
    .from('charter_comments')
    .insert({
      charter_submission_id: params.id,
      parent_id: null,
      body: body.trim(),
      author_role: isAdmin ? 'admin' : 'user',
      author_id: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/charter/submissions/route.ts \
        app/api/charter/submissions/[id]/comments/route.ts
git commit -m "feat: charter comments GET/POST + admin user_id param on submissions"
```

---

## Task 3: API — POST reply

**Files:**
- Create: `app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts`

- [ ] **Step 1: Create replies route**

```bash
mkdir -p "app/api/charter/submissions/[id]/comments/[commentId]/replies"
```

Create `app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()

  // Verify charter access
  const { data: charter } = await supabase
    .from('charter_submissions')
    .select('id, user_id')
    .eq('id', params.id)
    .single()
  if (!charter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isAdmin && charter.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Verify parent is top-level (no reply-to-reply)
  const { data: parent } = await supabase
    .from('charter_comments')
    .select('id, parent_id')
    .eq('id', params.commentId)
    .eq('charter_submission_id', params.id)
    .single()
  if (!parent) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  if (parent.parent_id !== null) return NextResponse.json({ error: 'Cannot reply to a reply' }, { status: 400 })

  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const { data, error } = await supabase
    .from('charter_comments')
    .insert({
      charter_submission_id: params.id,
      parent_id: params.commentId,
      body: body.trim(),
      author_role: isAdmin ? 'admin' : 'user',
      author_id: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add "app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts"
git commit -m "feat: charter comment replies POST (2-level threading)"
```

---

## Task 4: API — PATCH edit comment body

**Files:**
- Create: `app/api/charter/comments/[commentId]/route.ts`

- [ ] **Step 1: Create edit route**

```bash
mkdir -p "app/api/charter/comments/[commentId]"
```

Create `app/api/charter/comments/[commentId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_comments')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', params.commentId)
    .eq('author_id', user.id)
    .select()
    .single()
  if (error || !data) return NextResponse.json({ error: 'Not found or not yours' }, { status: 404 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add "app/api/charter/comments/[commentId]/route.ts"
git commit -m "feat: charter comment PATCH (edit own body)"
```

---

## Task 5: API — PATCH resolve (admin only)

**Files:**
- Create: `app/api/charter/comments/[commentId]/resolve/route.ts`

- [ ] **Step 1: Create resolve route**

```bash
mkdir -p "app/api/charter/comments/[commentId]/resolve"
```

Create `app/api/charter/comments/[commentId]/resolve/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { commentId: string } }
) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { is_resolved } = await req.json()
  if (typeof is_resolved !== 'boolean') return NextResponse.json({ error: 'is_resolved boolean required' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_comments')
    .update({
      is_resolved,
      resolved_by: is_resolved ? admin.id : null,
      resolved_at: is_resolved ? new Date().toISOString() : null,
    })
    .eq('id', params.commentId)
    .is('parent_id', null)
    .select()
    .single()
  if (error || !data) return NextResponse.json({ error: 'Not found or not a top-level comment' }, { status: 404 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add "app/api/charter/comments/[commentId]/resolve/route.ts"
git commit -m "feat: charter comment resolve toggle (admin only)"
```

---

## Task 6: Milestones API — admin user_id param

**Files:**
- Modify: `app/api/milestones/route.ts`

- [ ] **Step 1: Add admin `user_id` support**

Open `app/api/milestones/route.ts`. Replace the GET function:

```ts
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
    .select('*, milestone_deliverables(*)')
    .eq('user_id', effectiveUserId)
    .order('display_order')
  if (homeworkId) {
    query = query.eq('homework_id', Number(homeworkId))
  } else {
    query = query.order('week_number')
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map(({ milestone_deliverables, ...rest }: any) => ({ ...rest, deliverables: milestone_deliverables }))
  return NextResponse.json(normalized)
}
```

(Leave the POST function unchanged.)

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add app/api/milestones/route.ts
git commit -m "feat: milestones GET supports admin user_id param"
```

---

## Task 7: Admin page — tabs + CharterReviewTab + MilestonesAdminTab

**Files:**
- Modify: `app/admin/homework/[id]/[userId]/page.tsx`

This is a full rewrite. The existing page content becomes the "제출물" tab. Two new tabs are added.

- [ ] **Step 1: Replace the full file**

Replace `app/admin/homework/[id]/[userId]/page.tsx` with:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Submission, Comment, CharterSubmission, CharterComment, Milestone } from '@/lib/types'
import ReactMarkdown from 'react-markdown'
import DOMPurify from 'dompurify'

// ─── shared constants ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}
const MILESTONE_STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const MILESTONE_STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const CHARTER_SECTIONS = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)' },
  { key: 'goal', label: '목표 (TO-BE)' },
  { key: 'scope_in', label: '범위 In' },
  { key: 'scope_out', label: '범위 Out' },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
] as const

// ─── submission tab ───────────────────────────────────────────────────────────

function AdminCommentItem({ comment, onEdit }: { comment: Comment; onEdit: (c: Comment, body: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!body.trim() || body.trim() === comment.body) { setEditing(false); return }
    setSaving(true)
    try { await onEdit(comment, body.trim()); setEditing(false) } finally { setSaving(false) }
  }

  const isAdmin = comment.author_role === 'admin'
  const badge = isAdmin
    ? { label: '관리자', color: 'var(--amber)', bg: 'rgba(217,119,6,0.1)' }
    : { label: '챔피언', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.1)' }

  return (
    <div className="mb-2 p-2 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0"
          style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>{badge.label}</span>
        {editing ? (
          <div className="flex-1">
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
              className="w-full text-xs rounded p-2 resize-none"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2 mt-1">
              <button onClick={() => { setEditing(false); setBody(comment.body) }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>취소</button>
              <button onClick={save} disabled={saving || !body.trim()}
                className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-between gap-2">
            <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{comment.body}</p>
            {isAdmin && <button onClick={() => setEditing(true)} className="text-xs shrink-0" style={{ color: 'var(--text-disabled)' }}>편집</button>}
          </div>
        )}
      </div>
      <p className="text-xs mt-1 ml-[52px]" style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
        {new Date(comment.created_at).toLocaleString('ko-KR')}
        {comment.updated_at !== comment.created_at && ' · 편집됨'}
      </p>
    </div>
  )
}

function FilePreview({ submission, fileUrl }: { submission: Submission; fileUrl: string | null }) {
  const ext = submission.file_name.split('.').pop()?.toLowerCase()
  const [mdContent, setMdContent] = useState<string | null>(null)

  useEffect(() => {
    setMdContent(null)
    if (ext === 'md' && fileUrl) {
      fetch(fileUrl).then(r => r.text()).then(setMdContent).catch(() => setMdContent('파일을 불러올 수 없습니다.'))
    }
  }, [fileUrl, ext])

  if (!fileUrl) return (
    <div className="mt-3 rounded-xl border p-4 text-center" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-secondary)' }}>
      <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>파일 URL 로딩 중...</p>
    </div>
  )

  return (
    <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      {ext === 'md' && mdContent !== null ? (
        <div className="p-4 prose max-w-none text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>
          <ReactMarkdown disallowedElements={['script', 'iframe', 'object', 'embed']} unwrapDisallowed>{mdContent}</ReactMarkdown>
        </div>
      ) : ext === 'pdf' ? (
        <iframe src={fileUrl} className="w-full" style={{ height: '500px', background: '#fff' }} title="PDF preview" sandbox="allow-scripts allow-same-origin" />
      ) : (
        <div className="p-4 text-center" style={{ background: 'var(--surface-secondary)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>미리보기를 지원하지 않는 파일 형식입니다.</p>
        </div>
      )}
      <div className="p-3 border-t" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <button onClick={() => window.open(fileUrl, '_blank')}
          className="px-4 py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
          ⬇ 다운로드 ({submission.file_name})
        </button>
      </div>
    </div>
  )
}

function SubmissionTab({ homeworkId, userId }: { homeworkId: string; userId: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeSubId, setActiveSubId] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Submission[]>(`/api/admin/homeworks/${homeworkId}/submissions/${userId}`).then(subs => {
      setSubmissions(subs)
      if (subs.length > 0) setActiveSubId(subs[0].id)
    })
  }, [homeworkId, userId])

  useEffect(() => {
    if (!activeSubId) return
    setFileUrl(null)
    apiFetch<{ url: string }>(`/api/admin/storage/${activeSubId}/download`)
      .then(data => setFileUrl(data.url))
      .catch(() => setFileUrl(null))
  }, [activeSubId])

  async function handleStatus(subId: string, status: string) {
    setSaving(true)
    try {
      await apiFetch(`/api/admin/submissions/${subId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: status as Submission['status'] } : s))
    } finally { setSaving(false) }
  }

  async function handleComment(subId: string) {
    if (!comment.trim()) return
    setSaving(true)
    try {
      const newComment = await apiFetch<Comment>(`/api/admin/submissions/${subId}/comments`, {
        method: 'POST', body: JSON.stringify({ body: comment }),
      })
      setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, comments: [...(s.comments ?? []), newComment] } : s))
      setComment('')
    } finally { setSaving(false) }
  }

  async function handleEditComment(subId: string, c: Comment, newBody: string) {
    const updated = await apiFetch<Comment>(`/api/admin/submissions/${subId}/comments/${c.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: newBody }),
    })
    setSubmissions(prev => prev.map(s =>
      s.id === subId ? { ...s, comments: (s.comments ?? []).map(cm => cm.id === c.id ? updated : cm) } : s
    ))
  }

  const activeSub = submissions.find(s => s.id === activeSubId)

  return (
    <div>
      {submissions.length > 1 && (
        <div className="flex gap-2 mb-4">
          {submissions.map(sub => (
            <button key={sub.id} onClick={() => setActiveSubId(sub.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: activeSubId === sub.id ? 'var(--blue-600)' : 'var(--surface-primary)', color: activeSubId === sub.id ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              시도 #{sub.attempt_number}
            </button>
          ))}
        </div>
      )}
      {activeSub && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{activeSub.file_name}</p>
            <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: STATUS_COLOR[activeSub.status], background: `${STATUS_COLOR[activeSub.status]}20` }}>
              {STATUS_LABEL[activeSub.status]}
            </span>
          </div>
          <FilePreview submission={activeSub} fileUrl={fileUrl} />
          <div className="mt-4 flex gap-2">
            <button onClick={() => handleStatus(activeSub.id, 'accepted')} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>✓ 합격</button>
            <button onClick={() => handleStatus(activeSub.id, 'declined')} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>✗ 불합격</button>
          </div>
          {activeSub.comments && activeSub.comments.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>코멘트</p>
              {activeSub.comments.map(c => (
                <AdminCommentItem key={c.id} comment={c} onEdit={(cm, body) => handleEditComment(activeSub.id, cm, body)} />
              ))}
            </div>
          )}
          <div className="mt-4">
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="코멘트 입력..." rows={3}
              className="w-full text-sm rounded-lg p-3 resize-none"
              style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <button onClick={() => handleComment(activeSub.id)} disabled={saving || !comment.trim()}
              className="mt-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}>코멘트 저장</button>
          </div>
        </div>
      )}
      {submissions.length === 0 && <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>제출 이력이 없습니다.</p>}
    </div>
  )
}

// ─── charter review tab ───────────────────────────────────────────────────────

function CharterThreadComment({
  comment, isAdmin, onReply, onEdit, onResolve,
}: {
  comment: CharterComment
  isAdmin: boolean
  onReply: (parentId: string, body: string) => Promise<void>
  onEdit: (commentId: string, body: string) => Promise<void>
  onResolve: (commentId: string, resolved: boolean) => Promise<void>
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  const isTopLevel = comment.parent_id === null
  const authorIsAdmin = comment.author_role === 'admin'
  const badge = authorIsAdmin
    ? { label: '관리자', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.08)' }
    : { label: '챔피언', color: 'var(--success)', bg: 'rgba(22,163,74,0.08)' }

  async function submitReply() {
    if (!replyBody.trim()) return
    setSaving(true)
    try { await onReply(comment.id, replyBody.trim()); setReplyBody(''); setReplyOpen(false) } finally { setSaving(false) }
  }

  async function submitEdit() {
    if (!editBody.trim() || editBody.trim() === comment.body) { setEditOpen(false); return }
    setSaving(true)
    try { await onEdit(comment.id, editBody.trim()); setEditOpen(false) } finally { setSaving(false) }
  }

  const dimmed = isTopLevel && comment.is_resolved

  return (
    <div style={{ opacity: dimmed ? 0.45 : 1, transition: 'opacity 0.2s' }}>
      <div className="rounded-xl border p-3 mb-1"
        style={{
          background: 'var(--surface-primary)',
          borderColor: dimmed ? 'var(--border-subtle)' : isTopLevel ? 'var(--blue-600)' : 'var(--border-subtle)',
          borderLeftWidth: isTopLevel ? '3px' : '1px',
        }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>{badge.label}</span>
            <span className="text-xs" style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
              {new Date(comment.created_at).toLocaleString('ko-KR')}
              {comment.updated_at !== comment.created_at && ' · 편집됨'}
            </span>
          </div>
          {isTopLevel && isAdmin && (
            <button
              onClick={() => onResolve(comment.id, !comment.is_resolved)}
              className="text-xs px-2 py-0.5 rounded font-semibold"
              style={comment.is_resolved
                ? { background: 'var(--surface-secondary)', color: 'var(--text-disabled)', border: '1px solid var(--border-subtle)' }
                : { background: 'rgba(22,163,74,0.1)', color: 'var(--success)', border: '1px solid var(--success)' }}>
              {comment.is_resolved ? '✓ 해결됨' : '✓ 해결'}
            </button>
          )}
          {isTopLevel && !isAdmin && comment.is_resolved && (
            <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>✓ 해결됨</span>
          )}
        </div>

        {editOpen ? (
          <div>
            <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={2}
              className="w-full text-xs rounded-lg p-2 resize-none mb-1"
              style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2">
              <button onClick={() => { setEditOpen(false); setEditBody(comment.body) }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
              <button onClick={submitEdit} disabled={saving}
                className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: dimmed ? 'var(--text-disabled)' : 'var(--text-primary)', textDecoration: dimmed ? 'line-through' : 'none' }}>
            {comment.body}
          </p>
        )}

        {!editOpen && !dimmed && (
          <div className="flex gap-3 mt-2">
            {!editOpen && (
              <button onClick={() => setEditOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>편집</button>
            )}
            {isTopLevel && !replyOpen && (
              <button onClick={() => setReplyOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>↩ 답글</button>
            )}
          </div>
        )}
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-4 border-l pl-3 mb-2" style={{ borderColor: 'var(--border-subtle)' }}>
          {comment.replies.map(reply => (
            <CharterThreadComment key={reply.id} comment={reply} isAdmin={isAdmin}
              onReply={onReply} onEdit={onEdit} onResolve={onResolve} />
          ))}
        </div>
      )}

      {/* Reply input */}
      {replyOpen && (
        <div className="ml-4 border-l pl-3 mb-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={2}
            placeholder="답글 작성..."
            className="w-full text-xs rounded-lg p-2 resize-none mb-1"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2">
            <button onClick={() => { setReplyOpen(false); setReplyBody('') }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
            <button onClick={submitReply} disabled={saving || !replyBody.trim()}
              className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}>답글 작성</button>
          </div>
        </div>
      )}
    </div>
  )
}

function CharterReviewTab({ homeworkId, userId }: { homeworkId: number; userId: string }) {
  const [charter, setCharter] = useState<CharterSubmission | null | 'loading'>('loading')
  const [comments, setComments] = useState<CharterComment[]>([])
  const [filter, setFilter] = useState<'unresolved' | 'all'>('unresolved')
  const [newComment, setNewComment] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    apiFetch<CharterSubmission[]>(`/api/charter/submissions?homework_id=${homeworkId}&user_id=${userId}`)
      .then(data => setCharter(data[0] ?? null))
  }, [homeworkId, userId])

  useEffect(() => {
    if (!charter || charter === 'loading') return
    apiFetch<CharterComment[]>(`/api/charter/submissions/${charter.id}/comments`)
      .then(flat => {
        const map = new Map<string, CharterComment>()
        flat.forEach(c => map.set(c.id, { ...c, replies: [] }))
        const roots: CharterComment[] = []
        map.forEach(c => {
          if (c.parent_id) map.get(c.parent_id)?.replies?.push(c)
          else roots.push(c)
        })
        setComments(roots)
      })
  }, [charter])

  function updateCommentInTree(comments: CharterComment[], updated: CharterComment): CharterComment[] {
    return comments.map(c => {
      if (c.id === updated.id) return { ...updated, replies: c.replies }
      return { ...c, replies: c.replies ? updateCommentInTree(c.replies, updated) : [] }
    })
  }

  async function handlePost() {
    if (!newComment.trim() || !charter || charter === 'loading') return
    setPosting(true)
    try {
      const created = await apiFetch<CharterComment>(`/api/charter/submissions/${charter.id}/comments`, {
        method: 'POST', body: JSON.stringify({ body: newComment.trim() }),
      })
      setComments(prev => [...prev, { ...created, replies: [] }])
      setNewComment('')
    } finally { setPosting(false) }
  }

  async function handleReply(parentId: string, body: string) {
    if (!charter || charter === 'loading') return
    const created = await apiFetch<CharterComment>(
      `/api/charter/submissions/${charter.id}/comments/${parentId}/replies`,
      { method: 'POST', body: JSON.stringify({ body }) }
    )
    setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c))
  }

  async function handleEdit(commentId: string, body: string) {
    const updated = await apiFetch<CharterComment>(`/api/charter/comments/${commentId}`, {
      method: 'PATCH', body: JSON.stringify({ body }),
    })
    setComments(prev => updateCommentInTree(prev, updated))
  }

  async function handleResolve(commentId: string, is_resolved: boolean) {
    const updated = await apiFetch<CharterComment>(`/api/charter/comments/${commentId}/resolve`, {
      method: 'PATCH', body: JSON.stringify({ is_resolved }),
    })
    setComments(prev => prev.map(c => c.id === commentId ? { ...updated, replies: c.replies } : c))
  }

  const unresolvedCount = comments.filter(c => !c.is_resolved).length
  const filtered = filter === 'unresolved' ? comments.filter(c => !c.is_resolved) : comments

  if (charter === 'loading') return <p className="text-sm p-4" style={{ color: 'var(--text-disabled)' }}>로딩 중...</p>

  if (charter === null) return (
    <div className="p-6 text-center">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>이 챔피언은 아직 과제정의서를 제출하지 않았습니다.</p>
    </div>
  )

  return (
    <div className="flex" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
      {/* Left: charter content */}
      <div className="flex-1 overflow-y-auto p-5" style={{ borderRight: '1px solid var(--border-subtle)' }}>
        <div className="mb-4">
          <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>프로젝트명</p>
          <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{charter.project_name ?? '(미입력)'}</p>
        </div>
        {CHARTER_SECTIONS.map(s => {
          const html = (charter.content as Record<string, string>)[s.key]
          if (!html) return null
          return (
            <div key={s.key} className="mb-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
              </div>
              <div className="p-4 prose max-w-none text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
            </div>
          )
        })}
        <p className="text-xs mt-2" style={{ color: 'var(--text-disabled)' }}>
          마지막 수정: {new Date(charter.updated_at).toLocaleString('ko-KR')}
        </p>
      </div>

      {/* Right: feedback panel */}
      <div className="flex flex-col" style={{ width: '300px', minWidth: '280px' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>피드백</span>
          <div className="flex gap-1.5">
            <button onClick={() => setFilter('unresolved')}
              className="text-xs px-2.5 py-1 rounded-md font-semibold"
              style={filter === 'unresolved'
                ? { background: 'rgba(124,58,237,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }
                : { background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              미해결 {unresolvedCount}
            </button>
            <button onClick={() => setFilter('all')}
              className="text-xs px-2.5 py-1 rounded-md font-semibold"
              style={filter === 'all'
                ? { background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }
                : { background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              전체
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {filtered.length === 0 && (
            <p className="text-xs text-center mt-8" style={{ color: 'var(--text-disabled)' }}>
              {filter === 'unresolved' ? '미해결 피드백이 없습니다.' : '피드백이 없습니다.'}
            </p>
          )}
          {filtered.map(c => (
            <CharterThreadComment key={c.id} comment={c} isAdmin
              onReply={handleReply} onEdit={handleEdit} onResolve={handleResolve} />
          ))}
        </div>

        <div className="p-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
            placeholder="새 피드백 작성..."
            rows={2}
            className="w-full text-xs rounded-lg p-2 resize-none mb-2"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <div className="flex justify-end">
            <button onClick={handlePost} disabled={posting || !newComment.trim()}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}>
              {posting ? '작성 중...' : '작성'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── milestones admin tab ─────────────────────────────────────────────────────

function MilestonesAdminTab({ homeworkId, userId }: { homeworkId: number; userId: string }) {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<Milestone[]>(`/api/milestones?homework_id=${homeworkId}&user_id=${userId}`)
      .then(data => { setMilestones(data); setLoading(false) })
  }, [homeworkId, userId])

  if (loading) return <p className="text-sm p-4" style={{ color: 'var(--text-disabled)' }}>로딩 중...</p>

  if (milestones.length === 0) return (
    <div className="p-6 text-center">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>등록된 마일스톤이 없습니다.</p>
    </div>
  )

  return (
    <div className="p-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)' }}>
            <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤</th>
            <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>기간</th>
            <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>상태</th>
            <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>산출물</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map(m => (
            <tr key={m.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
              <td className="py-3 pr-4">
                <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                {m.description && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{m.description}</p>}
              </td>
              <td className="py-3 pr-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                {m.start_date} ~ {m.due_date}
              </td>
              <td className="py-3 pr-4">
                <span className="text-xs font-semibold" style={{ color: MILESTONE_STATUS_COLOR[m.status] }}>
                  {MILESTONE_STATUS_LABEL[m.status]}
                </span>
              </td>
              <td className="py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {m.deliverables && m.deliverables.length > 0 ? `${m.deliverables.length}개` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

type Tab = 'submission' | 'charter' | 'milestones'

export default function SubmissionReviewPage() {
  const { id, userId } = useParams<{ id: string; userId: string }>()
  const homeworkId = Number(id)
  const [activeTab, setActiveTab] = useState<Tab>('submission')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'submission', label: '제출물' },
    { key: 'charter', label: '과제정의서' },
    { key: 'milestones', label: '마일스톤 (WBS)' },
  ]

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <a href={`/admin/homework/${id}`} className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 목록으로</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>제출 검토</h1>
      </div>

      {/* Tab bar */}
      <div className="flex border-b mb-6" style={{ borderColor: 'var(--border-subtle)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors"
            style={{
              borderColor: activeTab === t.key ? 'var(--blue-600)' : 'transparent',
              color: activeTab === t.key ? 'var(--blue-600)' : 'var(--text-secondary)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'submission' && <SubmissionTab homeworkId={id} userId={userId} />}
      {activeTab === 'charter' && <CharterReviewTab homeworkId={homeworkId} userId={userId} />}
      {activeTab === 'milestones' && <MilestonesAdminTab homeworkId={homeworkId} userId={userId} />}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/homework/[id]/[userId]/page.tsx
git commit -m "feat: admin charter review tab with threaded feedback + milestones tab"
```

---

## Task 8: Champion page — CharterCommentSection

**Files:**
- Modify: `app/(champion)/homework/[id]/page.tsx`

Add a comment section below CharterEditor when a charter exists. The section is read-only for resolved state but allows creating/replying/editing.

- [ ] **Step 1: Add `CharterCommentSection` component**

Open `app/(champion)/homework/[id]/page.tsx`.

After the closing `}` of `CharterEditor` (before `function CharterTab`), insert this new component:

```tsx
function CharterCommentSection({ charterId }: { charterId: string }) {
  const [comments, setComments] = useState<CharterComment[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createSupabaseBrowserClient }) => {
      createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
        setUserId(session?.user?.id ?? null)
      })
    })
    apiFetch<CharterComment[]>(`/api/charter/submissions/${charterId}/comments`).then(flat => {
      const map = new Map<string, CharterComment>()
      flat.forEach(c => map.set(c.id, { ...c, replies: [] }))
      const roots: CharterComment[] = []
      map.forEach(c => {
        if (c.parent_id) map.get(c.parent_id)?.replies?.push(c)
        else roots.push(c)
      })
      setComments(roots)
    })
  }, [charterId])

  function updateInTree(list: CharterComment[], updated: CharterComment): CharterComment[] {
    return list.map(c => {
      if (c.id === updated.id) return { ...updated, replies: c.replies }
      return { ...c, replies: c.replies ? updateInTree(c.replies, updated) : [] }
    })
  }

  async function handlePost() {
    if (!newBody.trim()) return
    setPosting(true)
    try {
      const created = await apiFetch<CharterComment>(`/api/charter/submissions/${charterId}/comments`, {
        method: 'POST', body: JSON.stringify({ body: newBody.trim() }),
      })
      setComments(prev => [...prev, { ...created, replies: [] }])
      setNewBody('')
    } finally { setPosting(false) }
  }

  async function handleReply(parentId: string, body: string) {
    const created = await apiFetch<CharterComment>(
      `/api/charter/submissions/${charterId}/comments/${parentId}/replies`,
      { method: 'POST', body: JSON.stringify({ body }) }
    )
    setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c))
  }

  async function handleEdit(commentId: string, body: string) {
    const updated = await apiFetch<CharterComment>(`/api/charter/comments/${commentId}`, {
      method: 'PATCH', body: JSON.stringify({ body }),
    })
    setComments(prev => updateInTree(prev, updated))
  }

  return (
    <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
      <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>피드백</p>
      {comments.map(c => (
        <ChampionCommentThread key={c.id} comment={c} currentUserId={userId}
          onReply={handleReply} onEdit={handleEdit} />
      ))}
      {comments.length === 0 && (
        <p className="text-sm mb-3" style={{ color: 'var(--text-disabled)' }}>아직 피드백이 없습니다.</p>
      )}
      <div className="mt-3">
        <textarea value={newBody} onChange={e => setNewBody(e.target.value)}
          placeholder="새 코멘트 작성..."
          rows={2}
          className="w-full text-sm rounded-lg p-3 resize-none mb-2"
          style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
        <div className="flex justify-end">
          <button onClick={handlePost} disabled={posting || !newBody.trim()}
            className="text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}>
            {posting ? '작성 중...' : '작성'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChampionCommentThread({ comment, currentUserId, onReply, onEdit }: {
  comment: CharterComment
  currentUserId: string | null
  onReply: (parentId: string, body: string) => Promise<void>
  onEdit: (commentId: string, body: string) => Promise<void>
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  const isOwn = comment.author_id === currentUserId
  const isAdminComment = comment.author_role === 'admin'
  const badge = isAdminComment
    ? { label: '관리자', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.08)' }
    : { label: '챔피언', color: 'var(--success)', bg: 'rgba(22,163,74,0.08)' }
  const dimmed = comment.parent_id === null && comment.is_resolved

  async function submitReply() {
    if (!replyBody.trim()) return
    setSaving(true)
    try { await onReply(comment.id, replyBody.trim()); setReplyBody(''); setReplyOpen(false) } finally { setSaving(false) }
  }

  async function submitEdit() {
    if (!editBody.trim() || editBody.trim() === comment.body) { setEditOpen(false); return }
    setSaving(true)
    try { await onEdit(comment.id, editBody.trim()); setEditOpen(false) } finally { setSaving(false) }
  }

  return (
    <div style={{ opacity: dimmed ? 0.5 : 1, marginBottom: '8px' }}>
      <div className="rounded-xl border p-3"
        style={{
          background: 'var(--surface-primary)',
          borderColor: dimmed ? 'var(--border-subtle)' : comment.parent_id === null ? 'var(--blue-600)' : 'var(--border-subtle)',
          borderLeftWidth: comment.parent_id === null ? '3px' : '1px',
        }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>{badge.label}</span>
            <span style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
              {new Date(comment.created_at).toLocaleString('ko-KR')}
              {comment.updated_at !== comment.created_at && ' · 편집됨'}
            </span>
          </div>
          {comment.parent_id === null && comment.is_resolved && (
            <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>✓ 해결됨</span>
          )}
        </div>

        {editOpen ? (
          <div>
            <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={2}
              className="w-full text-xs rounded-lg p-2 resize-none mb-1"
              style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2">
              <button onClick={() => { setEditOpen(false); setEditBody(comment.body) }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
              <button onClick={submitEdit} disabled={saving}
                className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: dimmed ? 'var(--text-disabled)' : 'var(--text-primary)', textDecoration: dimmed ? 'line-through' : 'none' }}>
            {comment.body}
          </p>
        )}

        {!editOpen && !dimmed && (
          <div className="flex gap-3 mt-2">
            {isOwn && <button onClick={() => setEditOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>편집</button>}
            {comment.parent_id === null && !replyOpen && (
              <button onClick={() => setReplyOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>↩ 답글</button>
            )}
          </div>
        )}
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-4 border-l pl-3 mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
          {comment.replies.map(r => (
            <ChampionCommentThread key={r.id} comment={r} currentUserId={currentUserId}
              onReply={onReply} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {replyOpen && (
        <div className="ml-4 border-l pl-3 mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={2}
            placeholder="답글 작성..."
            className="w-full text-xs rounded-lg p-2 resize-none mb-1"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2">
            <button onClick={() => { setReplyOpen(false); setReplyBody('') }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
            <button onClick={submitReply} disabled={saving || !replyBody.trim()}
              className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}>답글 작성</button>
          </div>
        </div>
      )}
    </div>
  )

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleEdit(commentId: string, body: string) {
    return onEdit(commentId, body)
  }
}
```

- [ ] **Step 2: Add `CharterComment` to the import in the champion page**

At the top of `app/(champion)/homework/[id]/page.tsx`, update the type import line:

```ts
import type { Homework, Submission, Comment, CharterSubmission, Milestone, ProjectCharter, CharterComment } from '@/lib/types'
```

- [ ] **Step 3: Wire `CharterCommentSection` into `CharterTab`**

In `CharterTab`, update the final return block so it renders comments below the editor when a real charter exists:

```tsx
  const existing = charter === 'new' ? undefined : charter
  return (
    <div className="p-6">
      <CharterEditor
        key={existing?.id ?? 'new'}
        homeworkId={homeworkId}
        charter={existing}
        onSaved={saved => setCharter(saved)}
      />
      {existing && <CharterCommentSection charterId={existing.id} />}
    </div>
  )
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(champion)/homework/[id]/page.tsx"
git commit -m "feat: champion charter tab — threaded comment section"
```

---

## Task 9: Update ERD + final commit

**Files:**
- Modify: `docs/ERD.md`

- [ ] **Step 1: Add `charter_comments` table to ERD**

In `docs/ERD.md`, add after the `charter_submissions` section:

```markdown
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
```

And add to the Relationships section:

```
charter_submissions  1 ──< N  charter_comments (via charter_submission_id)
charter_comments     1 ──< N  charter_comments (replies, via parent_id, max depth 2)
users                1 ──< N  charter_comments (via author_id)
```

- [ ] **Step 2: Update ERD date**

Change the date header line to: `> ax-homework-submission · Supabase PostgreSQL · Updated 2026-05-15`

- [ ] **Step 3: Final type-check + commit**

```bash
npx tsc --noEmit
git add docs/ERD.md
git commit -m "docs: add charter_comments to ERD"
```

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage check:**
- ✅ DB: `charter_comments` table with `parent_id`, `is_resolved` — Task 1
- ✅ GET + POST top-level comments — Task 2
- ✅ POST reply (depth guard) — Task 3
- ✅ PATCH edit own body — Task 4
- ✅ PATCH resolve (admin only) — Task 5
- ✅ Milestones admin `user_id` param — Task 6
- ✅ Admin tabs + CharterReviewTab (split layout, filter, resolve button) + MilestonesAdminTab — Task 7
- ✅ Champion CharterCommentSection (view, reply, edit own, resolved state) — Task 8
- ✅ ERD updated — Task 9

**Type consistency:**
- `CharterComment` defined in Task 1, used in Tasks 7 and 8 ✅
- `apiFetch<CharterComment>` calls match route return shapes ✅
- `onReply`, `onEdit`, `onResolve` signatures consistent across Task 7 and Task 8 ✅

**No placeholders:** All steps contain complete code. ✅
