# Check-in Status Workflow & Admin Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict check-in tab action buttons by milestone status, add [관리자 검토중] pending-review pills, and let admin respond to delay reports via a new section on `/admin/requests`.

**Architecture:** Two new columns on `milestones` (`bottleneck_admin_comment`, `bottleneck_reviewed_at`) track the admin's response cycle per delay report. The champion card reads these to show/hide the [관리자 검토중] pill and display the admin reply bubble. A new admin section on `/admin/requests` fetches pending reports and submits answers via two new API routes.

**Tech Stack:** Next.js 14 App Router, TypeScript 5, Supabase PostgreSQL, `sonner` toasts, shadcn/ui Dialog, `@/lib/api-client` `apiFetch`.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/011_milestone_bottleneck_review.sql` | Create | 2 new columns on milestones |
| `lib/types.ts` | Modify | Add `bottleneck_admin_comment`, `bottleneck_reviewed_at` to `Milestone` |
| `app/api/admin/milestones/bottleneck-pending/route.ts` | Create | GET pending delay reports (admin-only) |
| `app/api/admin/milestones/[id]/bottleneck-review/route.ts` | Create | PATCH admin review submission |
| `app/api/milestones/[id]/route.ts` | Modify | Reset admin review columns when champion re-files |
| `app/(champion)/my-project/milestones/page.tsx` | Modify | Status-based buttons, [관리자 검토중] pills, admin reply bubble, `requests` prop on CheckinTab |
| `app/admin/requests/page.tsx` | Modify | New "지연 신고" section above existing deadline requests |

---

## Task 1: DB migration + TypeScript types

**Files:**
- Create: `supabase/migrations/011_milestone_bottleneck_review.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: Create the migration SQL**

Create `supabase/migrations/011_milestone_bottleneck_review.sql` with this exact content:

```sql
-- supabase/migrations/011_milestone_bottleneck_review.sql
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS bottleneck_admin_comment text,
  ADD COLUMN IF NOT EXISTS bottleneck_reviewed_at timestamptz;
```

- [ ] **Step 2: Run migration in Supabase dashboard**

Open the Supabase project dashboard → SQL Editor → paste and run the SQL above.
Expected: command completes without error, two new columns appear in the `milestones` table schema.

- [ ] **Step 3: Add the two new fields to the `Milestone` interface in `lib/types.ts`**

In `lib/types.ts`, find the `Milestone` interface (currently ends with `deliverables?: MilestoneDeliverable[]`). Add the two new fields after `bottleneck_note`:

```ts
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
  is_manual_completed: boolean
  bottleneck_type: BottleneckType | null
  bottleneck_note: string | null
  bottleneck_admin_comment: string | null   // ← NEW
  bottleneck_reviewed_at: string | null     // ← NEW
  display_order: number
  created_at: string
  updated_at: string
  publish_status: PublishStatus
  deliverables?: MilestoneDeliverable[]
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bun run build
```

Expected: build succeeds (or only fails on unrelated issues).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/011_milestone_bottleneck_review.sql lib/types.ts
git commit -m "[AX-1] feat: milestones 테이블에 bottleneck 관리자 검토 컬럼 추가"
```

---

## Task 2: New admin API routes

**Files:**
- Create: `app/api/admin/milestones/bottleneck-pending/route.ts`
- Create: `app/api/admin/milestones/[id]/bottleneck-review/route.ts`

### Step 1: Create directory for bottleneck-pending route

The path `app/api/admin/milestones/` already has `route.ts`. The sub-routes are new directories under it.

- [ ] **Step 1a: Create `app/api/admin/milestones/bottleneck-pending/route.ts`**

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
    .select('*, users(*)')
    .eq('publish_status', 'published')
    .not('bottleneck_type', 'is', null)
    .is('bottleneck_reviewed_at', null)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 1b: Create `app/api/admin/milestones/[id]/bottleneck-review/route.ts`**

The path `app/api/admin/milestones/[id]/` is a new dynamic segment directory.

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .update({
      bottleneck_admin_comment: body.admin_comment ?? '',
      bottleneck_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Verify build**

```bash
bun run build
```

Expected: build succeeds — new routes are picked up without errors.

- [ ] **Step 3: Smoke-test the GET route**

With the dev server running (`bun run dev`), open a browser console on an admin-authenticated page and run:

```js
fetch('/api/admin/milestones/bottleneck-pending', { headers: { 'Content-Type': 'application/json' } }).then(r => r.json()).then(console.log)
```

Expected: JSON array (empty `[]` if no pending reports, or list of milestone objects with `users` field).

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/milestones/bottleneck-pending/route.ts app/api/admin/milestones/[id]/bottleneck-review/route.ts
git commit -m "[AX-1] feat: 관리자 지연신고 검토 API 2개 추가 (GET pending, PATCH review)"
```

---

## Task 3: Reset admin review columns on re-filing

**Files:**
- Modify: `app/api/milestones/[id]/route.ts` (lines ~67–75, the patch construction block)

When a champion files a new delay report (`bottleneck_type` is set in the request body), the previous admin review is no longer valid and must be cleared. This ensures the "관리자 검토중" cycle is fresh for each new filing.

- [ ] **Step 1: Locate the patch construction in `app/api/milestones/[id]/route.ts`**

Find the block starting at line ~67 that builds the `patch` object:

```ts
const patch: Record<string, unknown> = {
  ...body,
  publish_status: nextStatus,
  status: computedStatus,
  updated_at: new Date().toISOString(),
}
```

- [ ] **Step 2: Add the reset logic immediately after the patch object construction**

Insert directly after the `delete (patch as ...).publish_status` / re-assign block (around line 73):

```ts
// Reset admin review when champion re-files a delay report
if (body.bottleneck_type != null) {
  patch.bottleneck_admin_comment = null
  patch.bottleneck_reviewed_at = null
}
```

The full updated section looks like:

```ts
const patch: Record<string, unknown> = {
  ...body,
  publish_status: nextStatus,
  status: computedStatus,
  updated_at: new Date().toISOString(),
}
delete (patch as { publish_status?: unknown }).publish_status
patch.publish_status = nextStatus

// Reset admin review when champion re-files a delay report
if (body.bottleneck_type != null) {
  patch.bottleneck_admin_comment = null
  patch.bottleneck_reviewed_at = null
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bun run build
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/milestones/[id]/route.ts
git commit -m "[AX-1] feat: 지연신고 재접수 시 관리자 검토 컬럼 초기화"
```

---

## Task 4: Champion UI — status-based buttons, [관리자 검토중] pills, admin reply bubble

**Files:**
- Modify: `app/(champion)/my-project/milestones/page.tsx`

This task rewrites `MilestoneCard` and updates `CheckinTabProps` / `CheckinTab`. The component is defined at module scope (not inside another component) — keep it there to preserve React identity.

### What changes

1. `MilestoneCardProps` gains `hasPendingDeadlineRequest: boolean`
2. `MilestoneCard` shows buttons based on `m.status`:
   - `not_started`: [기한 연장] [진행 중]
   - `in_progress` / `delayed`: [완료] [지연 신고] [기한 연장]
   - `completed`: already handled by `showActions = false`
3. `MilestoneCard` replaces each button with an amber [관리자 검토중] pill when pending
4. `MilestoneCard` shows an admin reply bubble (blue left border) when `bottleneck_reviewed_at` is set and comment is non-empty
5. `CheckinTabProps` gains `requests: DeadlineChangeRequest[]`
6. `CheckinTab` computes `pendingDeadlineIds` Set and passes `hasPendingDeadlineRequest` to each card
7. `MilestonesPage` passes `requests={requests}` to `<CheckinTab>`

- [ ] **Step 1: Add `timeAgo` helper above the `BOTTLENECK_OPTIONS` constant (module level)**

Find the line with `const BOTTLENECK_OPTIONS` and insert this function before it:

```ts
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}
```

- [ ] **Step 2: Replace `MilestoneCardProps` interface**

Find and replace the entire `MilestoneCardProps` interface:

```ts
interface MilestoneCardProps {
  m: Milestone
  showActions: boolean
  hasPendingDeadlineRequest: boolean
  onCompleteClick: (id: string) => void
  onDelayClick: (m: Milestone) => void
  onDeadlineExtension: (m: Milestone) => void
  onInProgress: (id: string) => void
  onGoToWBS: (m: Milestone) => void
}
```

- [ ] **Step 3: Replace the entire `MilestoneCard` function**

Replace the whole `function MilestoneCard(...)` body with:

```ts
function MilestoneCard({ m, showActions, hasPendingDeadlineRequest, onCompleteClick, onDelayClick, onDeadlineExtension, onInProgress, onGoToWBS }: MilestoneCardProps) {
  const statusColor = STATUS_COLOR[m.status] ?? 'var(--text-disabled)'
  const statusLabel = STATUS_LABEL[m.status] ?? m.status

  const isDelayPending = m.bottleneck_type !== null && m.bottleneck_reviewed_at === null
  const hasAdminReply = m.bottleneck_reviewed_at !== null && !!m.bottleneck_admin_comment

  // Status-based button visibility
  const showComplete = m.status === 'in_progress' || m.status === 'delayed'
  const showDelay = m.status === 'in_progress' || m.status === 'delayed'
  const showDeadline = m.status === 'not_started' || m.status === 'in_progress' || m.status === 'delayed'
  const showProgress = m.status === 'not_started'

  const pendingPill = (
    <span
      className="text-xs px-3 py-1.5 rounded-full font-semibold"
      style={{
        background: 'rgba(251,191,36,0.12)',
        color: 'var(--amber)',
        cursor: 'default',
        border: '1px solid rgba(251,191,36,0.4)',
      }}
    >
      관리자 검토중
    </span>
  )

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        padding: '14px 16px',
        background: showActions ? 'var(--surface-primary)' : 'var(--surface-secondary)',
        opacity: showActions ? 1 : 0.6,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-bold mr-2" style={{ color: 'var(--blue-600)' }}>W{m.week_number}</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
        </div>
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-disabled)' }}>~{m.due_date}</span>
      </div>
      <div className="mb-3">
        <span className="text-xs font-semibold" style={{ color: statusColor }}>
          {statusLabel}{m.status === 'delayed' ? ' ⚠️' : m.status === 'completed' ? ' ✅' : ''}
        </span>
      </div>

      {/* Admin reply bubble — only when reviewed and comment is non-empty */}
      {hasAdminReply && (
        <div
          style={{
            borderLeft: '3px solid var(--blue-600)',
            borderRadius: '0 6px 6px 0',
            background: 'rgba(37,99,235,0.04)',
            padding: '8px 10px 8px 12px',
            marginBottom: '12px',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded"
              style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)' }}
            >
              관리자
            </span>
            <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
              {timeAgo(m.bottleneck_reviewed_at!)}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {m.bottleneck_admin_comment}
          </p>
        </div>
      )}

      {showActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {showComplete && (
            <button
              onClick={() => onCompleteClick(m.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}
            >
              ✅ 완료
            </button>
          )}
          {showDelay && (
            isDelayPending ? pendingPill : (
              <button
                onClick={() => onDelayClick(m)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}
              >
                ⚠ 지연 신고
              </button>
            )
          )}
          {showDeadline && (
            hasPendingDeadlineRequest ? pendingPill : (
              <button
                onClick={() => onDeadlineExtension(m)}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--amber)', border: '1px solid var(--amber)' }}
              >
                📅 기한 연장
              </button>
            )
          )}
          {showProgress && (
            <button
              onClick={() => onInProgress(m.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
            >
              ▶ 진행 중
            </button>
          )}
          <button
            onClick={() => onGoToWBS(m)}
            className="text-xs ml-auto"
            style={{ color: 'var(--text-disabled)' }}
          >
            자세히 보기 →
          </button>
        </div>
      ) : (
        <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>완료됨</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update `CheckinTabProps` to include `requests`**

Find and replace `CheckinTabProps` interface:

```ts
interface CheckinTabProps {
  milestones: Milestone[]
  requests: DeadlineChangeRequest[]
  onComplete: (id: string) => Promise<void>
  onDelayReport: (id: string, type: BottleneckType, note: string | null) => Promise<void>
  onInProgress: (id: string) => Promise<void>
  onDeadlineExtension: (m: Milestone) => void
  onGoToWBS: (m: Milestone) => void
}
```

- [ ] **Step 5: Update `CheckinTab` function signature and add `pendingDeadlineIds`**

Find `function CheckinTab({ milestones, onComplete, ...` and update the destructuring to include `requests`, then add the `useMemo` for pending deadline IDs right after the existing `completedInRange` memo:

```ts
function CheckinTab({ milestones, requests, onComplete, onDelayReport, onInProgress, onDeadlineExtension, onGoToWBS }: CheckinTabProps) {
  // ... existing state ...

  // existing memos: today, published, thisWeek, overdue, completedInRange
  // ADD this after completedInRange:
  const pendingDeadlineIds = useMemo(
    () => new Set(requests.filter(r => r.status === 'pending').map(r => r.milestone_id)),
    [requests]
  )
  // ...
```

- [ ] **Step 6: Add `hasPendingDeadlineRequest` prop to all `MilestoneCard` usages inside `CheckinTab`**

There are three places in `CheckinTab` where `<MilestoneCard>` is rendered (thisWeek loop, overdue loop, completedInRange loop). For the active sections (thisWeek and overdue) add the prop:

```tsx
<MilestoneCard
  key={m.id}
  m={m}
  showActions
  hasPendingDeadlineRequest={pendingDeadlineIds.has(m.id)}
  onCompleteClick={id => setCompleteConfirmId(id)}
  onDelayClick={m => { setDelayMilestone(m); setDelayForm({ type: '', note: '' }) }}
  onDeadlineExtension={onDeadlineExtension}
  onInProgress={onInProgress}
  onGoToWBS={onGoToWBS}
/>
```

For the completedInRange section (showActions=false), `hasPendingDeadlineRequest` is irrelevant but the prop is required — pass `false`:

```tsx
<MilestoneCard
  key={m.id}
  m={m}
  showActions={false}
  hasPendingDeadlineRequest={false}
  onCompleteClick={() => {}}
  onDelayClick={() => {}}
  onDeadlineExtension={() => {}}
  onInProgress={() => {}}
  onGoToWBS={() => {}}
/>
```

- [ ] **Step 7: Pass `requests` to `<CheckinTab>` in `MilestonesPage`**

Find the `<CheckinTab>` render in `MilestonesPage` (around line 698) and add `requests={requests}`:

```tsx
<CheckinTab
  milestones={milestones}
  requests={requests}
  onComplete={handleCheckinComplete}
  onDelayReport={handleCheckinDelayReport}
  onInProgress={handleCheckinInProgress}
  onDeadlineExtension={openDeadlineForCheckin}
  onGoToWBS={goToWBSDetail}
/>
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
bun run build
```

Expected: no errors on the modified file.

- [ ] **Step 9: Manual browser test**

Start dev server (`bun run dev`), log in as a champion with milestones, open 주간 체크인 tab, verify:
- `not_started` milestone: only [기한 연장] and [진행 중] buttons visible
- `in_progress` milestone: [완료] [지연 신고] [기한 연장] visible
- `delayed` milestone: [완료] [지연 신고] [기한 연장] visible
- `completed` milestone: greyed out, "완료됨" label, no buttons

- [ ] **Step 10: Commit**

```bash
git add app/\(champion\)/my-project/milestones/page.tsx
git commit -m "[AX-1] feat: 체크인 탭 - 상태별 버튼, 관리자검토중 태그, 관리자 답변 버블"
```

---

## Task 5: Admin requests page — 지연 신고 section

**Files:**
- Modify: `app/admin/requests/page.tsx`

Add a new "지연 신고" section **above** the existing "기한 변경 요청" section. The section shows pending delay reports; clicking [확인 완료] calls `PATCH /api/admin/milestones/[id]/bottleneck-review` and removes the card from the list.

- [ ] **Step 1: Replace the entire `app/admin/requests/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { DeadlineChangeRequest } from '@/lib/types'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Inbox } from 'lucide-react'

// Shape returned by GET /api/admin/milestones/bottleneck-pending
interface BottleneckReport {
  id: string
  week_number: number
  title: string
  bottleneck_type: string
  bottleneck_note: string | null
  due_date: string
  users: { name: string; email: string; avatar_url: string | null } | null
}

const BOTTLENECK_LABEL: Record<string, string> = {
  technical: '기술적 문제',
  resource: '리소스 부족',
  external: '외부 의존성',
  other: '기타',
}

const DEADLINE_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', approved: 'var(--success)', rejected: 'var(--error)',
}
const DEADLINE_STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', approved: '승인됨', rejected: '반려됨',
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--surface-secondary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: '13px',
  width: '100%',
  resize: 'none',
}

export default function AdminRequestsPage() {
  const [bottleneckReports, setBottleneckReports] = useState<BottleneckReport[]>([])
  const [comments, setComments] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])

  useEffect(() => {
    apiFetch<BottleneckReport[]>('/api/admin/milestones/bottleneck-pending')
      .then(setBottleneckReports)
      .catch((e: Error) => toast.error('지연 신고 목록 로드 실패: ' + e.message))
    apiFetch<DeadlineChangeRequest[]>('/api/admin/deadline-requests')
      .then(setRequests)
      .catch((e: Error) => toast.error('기한 변경 요청 로드 실패: ' + e.message))
  }, [])

  async function handleBottleneckReview(id: string) {
    setSubmitting(id)
    try {
      await apiFetch(`/api/admin/milestones/${id}/bottleneck-review`, {
        method: 'PATCH',
        body: JSON.stringify({ admin_comment: comments[id] ?? '' }),
      })
      setBottleneckReports(prev => prev.filter(r => r.id !== id))
      toast.success('확인 완료 처리되었습니다.')
    } catch (e) {
      toast.error('처리 실패: ' + (e as Error).message)
    } finally {
      setSubmitting(null)
    }
  }

  async function handleDeadlineReview(id: string, status: 'approved' | 'rejected') {
    try {
      const updated = await apiFetch<DeadlineChangeRequest>(`/api/admin/deadline-requests/${id}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      })
      setRequests(prev => prev.map(r => r.id === id ? updated : r))
      toast.success(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.')
    } catch (e) {
      toast.error('승인/반려 처리 실패: ' + (e as Error).message)
    }
  }

  // Per milestone: all pending + most recent resolved
  const displayedDeadlines = (() => {
    const byMilestone = new Map<string, DeadlineChangeRequest[]>()
    for (const r of requests) {
      const list = byMilestone.get(r.milestone_id) ?? []
      list.push(r)
      byMilestone.set(r.milestone_id, list)
    }
    const result: DeadlineChangeRequest[] = []
    Array.from(byMilestone.values()).forEach(reqs => {
      reqs.filter(r => r.status === 'pending').forEach(r => result.push(r))
      const resolved = reqs.find(r => r.status === 'approved' || r.status === 'rejected')
      if (resolved) result.push(resolved)
    })
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })()

  return (
    <div className="flex flex-col gap-8">
      {/* ── 지연 신고 섹션 ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>지연 신고</h2>
          {bottleneckReports.length > 0 && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)' }}
            >
              {bottleneckReports.length}건 대기중
            </span>
          )}
        </div>
        {bottleneckReports.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>대기중인 지연 신고가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {bottleneckReports.map(report => (
              <div
                key={report.id}
                className="p-4 rounded-xl border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    {report.users?.avatar_url && (
                      <img src={report.users.avatar_url} alt={report.users.name} className="w-5 h-5 rounded-full" />
                    )}
                    <span className="text-xs font-semibold" style={{ color: 'var(--blue-600)' }}>
                      {report.users?.name ?? '알 수 없음'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}
                    >
                      {report.week_number}주차
                    </span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {report.title}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                      지연 유형: {BOTTLENECK_LABEL[report.bottleneck_type] ?? report.bottleneck_type}
                    </span>
                  </div>
                  {report.bottleneck_note && (
                    <p
                      className="text-xs px-3 py-2 rounded-lg mt-2"
                      style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', fontStyle: 'italic' }}
                    >
                      "{report.bottleneck_note}"
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>답변</label>
                  <textarea
                    rows={3}
                    value={comments[report.id] ?? ''}
                    onChange={e => setComments(prev => ({ ...prev, [report.id]: e.target.value }))}
                    placeholder="답변을 입력하세요 (선택)"
                    style={INPUT_STYLE}
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleBottleneckReview(report.id)}
                      disabled={submitting === report.id}
                      className="text-xs px-4 py-2 rounded-lg font-semibold"
                      style={{
                        background: submitting === report.id ? 'var(--surface-secondary)' : 'rgba(37,99,235,0.15)',
                        color: submitting === report.id ? 'var(--text-disabled)' : 'var(--blue-600)',
                        border: '1px solid var(--blue-600)',
                        cursor: submitting === report.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {submitting === report.id ? '처리 중...' : '확인 완료'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 기한 변경 요청 섹션 ── */}
      <section>
        <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-primary)' }}>기한 변경 요청</h2>
        <div className="flex flex-col gap-3">
          {displayedDeadlines.map(req => (
            <div key={req.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {req.user?.avatar_url && (
                      <img src={req.user.avatar_url} alt={req.user.name} className="w-5 h-5 rounded-full" />
                    )}
                    <span className="text-xs font-semibold" style={{ color: 'var(--blue-600)' }}>{req.user?.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {req.milestone?.week_number && (
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}>
                        {req.milestone.week_number}주차
                      </span>
                    )}
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{req.milestone?.title}</span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {req.original_due_date} → {req.requested_due_date}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>사유: {req.reason}</p>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={{ color: DEADLINE_STATUS_COLOR[req.status], background: `${DEADLINE_STATUS_COLOR[req.status]}20` }}
                >
                  {DEADLINE_STATUS_LABEL[req.status]}
                </span>
              </div>
              {req.status === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>
                        ✓ 승인
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>기한변경 요청 승인</AlertDialogTitle>
                        <AlertDialogDescription>마일스톤 마감일이 요청 날짜로 변경됩니다. 진행하시겠습니까?</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeadlineReview(req.id, 'approved')}>승인</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
                        ✗ 반려
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>기한변경 요청 반려</AlertDialogTitle>
                        <AlertDialogDescription>이 요청을 반려하시겠습니까?</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>취소</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeadlineReview(req.id, 'rejected')}>반려</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
          {displayedDeadlines.length === 0 && <EmptyState icon={Inbox} title="대기 중인 요청이 없습니다" />}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run build
```

Expected: no errors.

- [ ] **Step 3: Manual browser test — admin flow**

Start dev server, log in as admin, go to `/admin/requests`:
- 지연 신고 섹션이 위에 나타남
- 대기 건수 badge 표시 확인
- 답변 텍스트 없이도 [확인 완료] 클릭 가능 확인
- 확인 완료 후 카드가 즉시 사라짐 확인
- 기한 변경 요청 섹션은 아래에 기존과 동일하게 표시됨 확인

- [ ] **Step 4: End-to-end test — champion sees reply**

1. As champion: 주간 체크인 탭 → 지연 신고 제출 → [관리자 검토중] 태그 확인
2. As admin: `/admin/requests` → 카드에 답변 입력 → [확인 완료]
3. As champion: 페이지 새로고침 → 관리자 답변 버블 표시 확인 → 지연 신고 버튼 다시 나타남 확인

- [ ] **Step 5: Commit**

```bash
git add app/admin/requests/page.tsx
git commit -m "[AX-1] feat: 관리자 지연신고 검토 섹션 추가 (/admin/requests)"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|---|---|
| 2 new columns on milestones (`bottleneck_admin_comment`, `bottleneck_reviewed_at`) | Task 1 |
| Reset columns on re-filing | Task 3 |
| Migration SQL `011` | Task 1 |
| TypeScript type additions | Task 1 |
| Status-based button rules (not_started / in_progress / delayed / completed) | Task 4 |
| [관리자 검토중] pill replacing 지연 신고 button | Task 4 |
| [관리자 검토중] pill replacing 기한 연장 button | Task 4 |
| Admin comment display (charter comment visual style, blue border, badge, timeAgo) | Task 4 |
| Only show comment bubble when non-empty | Task 4 — `!!m.bottleneck_admin_comment` guard |
| New "지연 신고" section on `/admin/requests` | Task 5 |
| Section badge showing pending count | Task 5 |
| [확인 완료] works with empty comment | Task 5 — `body.admin_comment ?? ''` |
| Card disappears after confirmation | Task 5 — `.filter(r => r.id !== id)` |
| `GET /api/admin/milestones/bottleneck-pending` | Task 2 |
| `PATCH /api/admin/milestones/[id]/bottleneck-review` | Task 2 |

All spec requirements covered.
