# Weekly Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "주간 체크인" tab to the champion's milestones page so champions can report weekly progress on milestones via four actions: 완료, 지연 신고, 기한 연장, and 진행 중.

**Architecture:** Four tasks in dependency order — types first (other tasks depend on them), then the notification function, then the API changes, then the UI. The check-in tab lives inside the existing `milestones/page.tsx` as a new `CheckinTab` section (no new files). The PATCH API handler gains notification side-effects and an updated `computeStatus()`. The DB migration must be run manually in the Supabase dashboard.

**Tech Stack:** Next.js 14 App Router, TypeScript 5, Supabase PostgreSQL, `sonner` for toasts, shadcn/ui `Dialog` for modals, `apiFetch` from `@/lib/api-client`

---

## File Map

| File | Change |
|---|---|
| `lib/types.ts` | Add `BottleneckType`, extend `Milestone` with 3 new fields |
| `lib/notifications.ts` | Add `notifyBottleneck()`, make `fileName` optional on `notifyMilestoneCompleted` |
| `app/api/milestones/[id]/route.ts` | Update `computeStatus()`, import + call notification functions |
| `app/(champion)/my-project/milestones/page.tsx` | Add tab toggle, `CheckinTab` component, cross-navigation, action handlers, modals |

---

## Task 1: TypeScript Types + DB Migration

**Files:**
- Modify: `lib/types.ts`

**Context:** `Milestone` currently has `is_manual_progress: boolean` but not the three new fields. The DB migration must be run separately — this task only covers the TypeScript side. Without these types, all subsequent tasks will have type errors.

- [ ] **Step 1: Add `BottleneckType` and extend `Milestone` in `lib/types.ts`**

Open `lib/types.ts`. After the existing type aliases at the top (lines 1–4), add:

```ts
export type BottleneckType = 'technical' | 'resource' | 'external' | 'other'
```

Then find the `Milestone` interface (starts around line 63) and add three fields after `is_manual_progress`:

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
  is_manual_completed: boolean          // ← add
  bottleneck_type: BottleneckType | null // ← add
  bottleneck_note: string | null         // ← add
  display_order: number
  created_at: string
  updated_at: string
  publish_status: PublishStatus
  deliverables?: MilestoneDeliverable[]
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no new errors. If TypeScript complains about the Milestone type in other files, those will be resolved when the DB columns exist — the new fields are additive and won't break existing reads (Supabase returns them as `null` until columns are added).

- [ ] **Step 3: Run DB migration in Supabase dashboard**

Go to the Supabase dashboard → SQL editor and run:

```sql
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS bottleneck_type  text    CHECK (bottleneck_type IN ('technical','resource','external','other')),
  ADD COLUMN IF NOT EXISTS bottleneck_note  text,
  ADD COLUMN IF NOT EXISTS is_manual_completed boolean NOT NULL DEFAULT false;
```

Verify by running `SELECT id, bottleneck_type, bottleneck_note, is_manual_completed FROM milestones LIMIT 1;` — you should see the three new columns.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add BottleneckType and weekly check-in fields to Milestone type"
```

---

## Task 2: Add `notifyBottleneck()` + Fix `notifyMilestoneCompleted` Signature

**Files:**
- Modify: `lib/notifications.ts`

**Context:** `notifyBottleneck` is a new function. `notifyMilestoneCompleted` already exists but requires `fileName: string` — for manual completion (no file upload), there is no file, so `fileName` must be made optional. The email pattern in this file uses `escapeHtml`, `sendEmail`, `appBaseUrl`, `adminEmail` — follow the same pattern.

Korean labels for bottleneck types:
- `technical` → 기술적 문제
- `resource` → 리소스 부족
- `external` → 외부 의존성
- `other` → 기타

- [ ] **Step 1: Make `fileName` optional on `notifyMilestoneCompleted`**

Find `notifyMilestoneCompleted` in `lib/notifications.ts` (around line 130). Change its params type so `fileName` is optional:

```ts
export async function notifyMilestoneCompleted(params: {
  user: User
  milestone: Milestone
  fileName?: string  // ← was required, now optional
}): Promise<void> {
  const to = adminEmail()
  if (!to) return
  const { user, milestone, fileName = '(수동 완료)' } = params  // ← add default
  // ... rest unchanged
```

- [ ] **Step 2: Add `notifyBottleneck()` at the bottom of `lib/notifications.ts`**

Append this after `notifyMilestoneCompleted`:

```ts
const BOTTLENECK_LABEL: Record<string, string> = {
  technical: '기술적 문제',
  resource: '리소스 부족',
  external: '외부 의존성',
  other: '기타',
}

export async function notifyBottleneck(params: {
  user: User
  milestone: Milestone
  type: string
  note: string | null
}): Promise<void> {
  const to = adminEmail()
  if (!to) return
  const { user, milestone, type, note } = params
  const weekLabel = milestone.week_number ? `W${String(milestone.week_number).padStart(2, '0')} ` : ''
  const subject = `[AX] 지연 신고 — ${user.name} · ${weekLabel}${milestone.title}`
  const link = `${appBaseUrl()}/admin/requests`
  const typeLabel = BOTTLENECK_LABEL[type] ?? type
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #dc2626;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">⚠️ 지연 신고</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마일스톤</td><td style="padding:8px 0">${escapeHtml(weekLabel + milestone.title)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마감일</td><td style="padding:8px 0">${escapeHtml(milestone.due_date)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">지연 유형</td><td style="padding:8px 0;color:#dc2626;font-weight:600">${escapeHtml(typeLabel)}</td></tr>
    ${note ? `<tr><td style="padding:8px 0;color:#64748b;vertical-align:top">설명</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(note)}</td></tr>` : ''}
  </table>
  <div style="margin-top:24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">요청 검토</a>
  </div>
</div>
`.trim()
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyBottleneck failed:', e)
  }
}
```

Note: `BottleneckType` import is not needed here since we use `string` for the type param (the route.ts passes a string from the DB row). `User` and `Milestone` are already imported at the top of the file.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/notifications.ts
git commit -m "feat: add notifyBottleneck(), make fileName optional on notifyMilestoneCompleted"
```

---

## Task 3: Update `computeStatus()` and Wire Notifications in PATCH Handler

**Files:**
- Modify: `app/api/milestones/[id]/route.ts`

**Context:** The PATCH handler at `app/api/milestones/[id]/route.ts` currently has a `computeStatus()` that doesn't know about `is_manual_completed` or `bottleneck_type`. The priority order is:
1. `hasDeliverable || is_manual_completed` → `'completed'`
2. `bottleneck_type IS NOT NULL` → `'delayed'`
3. `is_manual_progress` → `'in_progress'`
4. `due_date < today` → `'delayed'`
5. otherwise → `'not_started'`

Two notifications must be fired as side-effects (fire-and-forget):
- When `is_manual_completed` transitions from false → true: call `notifyMilestoneCompleted`
- When `bottleneck_type` changes from null → a value: call `notifyBottleneck`

The `user` object is available from `verifyJWT(req)` which returns `{ id, email, name, ... }`.

- [ ] **Step 1: Update the import at the top of `app/api/milestones/[id]/route.ts`**

Add the notification imports after the existing imports:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyMilestoneCompleted, notifyBottleneck } from '@/lib/notifications'
```

- [ ] **Step 2: Replace `computeStatus()` with the updated version**

Replace the existing `computeStatus` function (lines 5–10) with:

```ts
function computeStatus(
  milestone: {
    due_date: string
    is_manual_progress: boolean
    is_manual_completed: boolean
    bottleneck_type: string | null
  },
  hasDeliverable: boolean,
): MilestoneStatus {
  if (hasDeliverable || milestone.is_manual_completed) return 'completed'
  if (milestone.bottleneck_type) return 'delayed'
  if (milestone.is_manual_progress) return 'in_progress'
  if (milestone.due_date && new Date(milestone.due_date) < new Date()) return 'delayed'
  return 'not_started'
}
```

Add the missing import for `MilestoneStatus`:

```ts
import type { MilestoneStatus } from '@/lib/types'
```

- [ ] **Step 3: Add notification side-effects after the successful Supabase update**

Find the section after `const { data, error } = await supabase.from('milestones').update(patch)...` and before `return NextResponse.json(data)`. Add:

```ts
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget notifications
  if (body.is_manual_completed === true && !existing.is_manual_completed) {
    notifyMilestoneCompleted({ user, milestone: data }).catch(console.error)
  }
  if (body.bottleneck_type != null && existing.bottleneck_type !== body.bottleneck_type) {
    notifyBottleneck({ user, milestone: data, type: body.bottleneck_type, note: body.bottleneck_note ?? null }).catch(console.error)
  }

  return NextResponse.json(data)
```

Note: `user` is already in scope (from `verifyJWT`). `data` is the updated milestone row returned by Supabase. The `user` from `verifyJWT` has shape `{ id, email, name, avatar_url, created_at }` matching `User` type.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run `bun dev`, log in as a champion, and in the browser console or Network tab, send a PATCH to `/api/milestones/<some-id>` with `{ is_manual_completed: true }`. The response status should be 200 and the returned milestone's `status` field should be `'completed'`.

- [ ] **Step 6: Commit**

```bash
git add app/api/milestones/[id]/route.ts
git commit -m "feat: update computeStatus() for check-in fields, wire milestone notifications in PATCH"
```

---

## Task 4: Weekly Check-in UI in Milestones Page

**Files:**
- Modify: `app/(champion)/my-project/milestones/page.tsx`

**Context:** This is the largest task. The milestones page currently shows a single WBS tab with a table. We're adding:
1. A tab toggle (`WBS` / `주간 체크인`) at the top
2. A `CheckinTab` component (defined inside the same file, before `MilestonesPage`)
3. Three action handlers in `MilestonesPage`: `handleCheckinComplete`, `handleCheckinDelayReport`, `handleCheckinInProgress`
4. The `기한 연장` action reuses the existing `deadlineModal` state and `handleDeadlineRequest`
5. A helper `openDeadlineForCheckin(m: Milestone)` that sets `deadlineModal` from the check-in card
6. Cross-navigation: `goToWBSDetail(m: Milestone)` switches tab and opens the edit modal

When the check-in tab is active: the `showForm` right panel is hidden, the `PublishStatusFilter` is hidden, and `CheckinTab` renders instead of the milestone table.

The `CheckinTab` component manages its own modal state (complete confirm, delay report form) and calls parent callbacks for API actions.

- [ ] **Step 1: Add imports needed by CheckinTab**

At the top of `app/(champion)/my-project/milestones/page.tsx`, ensure these imports exist (add any missing ones):

```ts
import type { BottleneckType } from '@/lib/types'
```

The rest of the existing imports (`Dialog`, `DialogContent`, etc., `toast`, `apiFetch`) are already present and will be reused.

- [ ] **Step 2: Define `CheckinTab` component above `MilestonesPage`**

Add this entire component definition **before** the `export default function MilestonesPage()` line:

```tsx
const BOTTLENECK_OPTIONS: { value: BottleneckType; label: string }[] = [
  { value: 'technical', label: '기술적 문제' },
  { value: 'resource', label: '리소스 부족' },
  { value: 'external', label: '외부 의존성' },
  { value: 'other', label: '기타' },
]

interface CheckinTabProps {
  milestones: Milestone[]
  onComplete: (id: string) => Promise<void>
  onDelayReport: (id: string, type: BottleneckType, note: string | null) => Promise<void>
  onInProgress: (id: string) => Promise<void>
  onDeadlineExtension: (m: Milestone) => void
  onGoToWBS: (m: Milestone) => void
}

function CheckinTab({ milestones, onComplete, onDelayReport, onInProgress, onDeadlineExtension, onGoToWBS }: CheckinTabProps) {
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(null)
  const [delayMilestone, setDelayMilestone] = useState<Milestone | null>(null)
  const [delayForm, setDelayForm] = useState<{ type: BottleneckType | ''; note: string }>({ type: '', note: '' })
  const [submitting, setSubmitting] = useState(false)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const published = milestones.filter(m => m.publish_status === 'published' && m.start_date && m.due_date)

  const thisWeek = published.filter(m =>
    new Date(m.start_date) <= today &&
    today <= new Date(m.due_date) &&
    m.status !== 'completed'
  )

  const overdue = published.filter(m =>
    new Date(m.due_date) < today &&
    m.status !== 'completed'
  )

  const completedInRange = published.filter(m =>
    m.status === 'completed' &&
    new Date(m.start_date) <= today
  )

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    padding: '8px 12px',
    fontSize: '13px',
    width: '100%',
  }

  async function handleCompleteConfirm() {
    if (!completeConfirmId) return
    setSubmitting(true)
    try {
      await onComplete(completeConfirmId)
      setCompleteConfirmId(null)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelaySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!delayMilestone || !delayForm.type) return
    setSubmitting(true)
    try {
      await onDelayReport(delayMilestone.id, delayForm.type as BottleneckType, delayForm.note || null)
      setDelayMilestone(null)
      setDelayForm({ type: '', note: '' })
    } finally {
      setSubmitting(false)
    }
  }

  function MilestoneCard({ m, showActions }: { m: Milestone; showActions: boolean }) {
    const statusColor = STATUS_COLOR[m.status] ?? 'var(--text-disabled)'
    const statusLabel = STATUS_LABEL[m.status] ?? m.status
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
        {showActions ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCompleteConfirmId(m.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}
            >
              ✅ 완료
            </button>
            <button
              onClick={() => { setDelayMilestone(m); setDelayForm({ type: '', note: '' }) }}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}
            >
              ⚠ 지연 신고
            </button>
            <button
              onClick={() => onDeadlineExtension(m)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--amber)', border: '1px solid var(--amber)' }}
            >
              📅 기한 연장
            </button>
            <button
              onClick={() => onInProgress(m.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
            >
              ▶ 진행 중
            </button>
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

  const isEmpty = thisWeek.length === 0 && overdue.length === 0

  return (
    <div className="flex flex-col gap-6 pb-8">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>이번 주 체크인할 마일스톤이 없습니다.</p>
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>WBS 탭에서 마일스톤을 추가해보세요.</p>
        </div>
      ) : (
        <>
          {thisWeek.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-disabled)' }}>이번 주</h2>
              <div className="flex flex-col gap-3">
                {thisWeek.map(m => <MilestoneCard key={m.id} m={m} showActions />)}
              </div>
            </section>
          )}
          {overdue.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--error)' }}>지연 / 미완료</h2>
              <div className="flex flex-col gap-3">
                {overdue.map(m => <MilestoneCard key={m.id} m={m} showActions />)}
              </div>
            </section>
          )}
          {completedInRange.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-disabled)' }}>완료됨</h2>
              <div className="flex flex-col gap-3">
                {completedInRange.map(m => <MilestoneCard key={m.id} m={m} showActions={false} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* 완료 confirm dialog */}
      <Dialog open={!!completeConfirmId} onOpenChange={open => { if (!open) setCompleteConfirmId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>마일스톤을 완료로 표시하시겠어요?</DialogTitle>
            <DialogDescription>완료 후에도 WBS 탭에서 파일을 첨부할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setCompleteConfirmId(null)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
            >
              취소
            </button>
            <button
              onClick={handleCompleteConfirm}
              disabled={submitting}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--success)', color: '#fff', opacity: submitting ? 0.7 : 1 }}
            >
              완료로 표시
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 지연 신고 modal */}
      <Dialog open={!!delayMilestone} onOpenChange={open => { if (!open) { setDelayMilestone(null); setDelayForm({ type: '', note: '' }) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>지연 신고</DialogTitle>
            {delayMilestone && (
              <DialogDescription>W{delayMilestone.week_number} {delayMilestone.title}</DialogDescription>
            )}
          </DialogHeader>
          <form onSubmit={handleDelaySubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                지연 유형 <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <select
                value={delayForm.type}
                onChange={e => setDelayForm(f => ({ ...f, type: e.target.value as BottleneckType | '' }))}
                required
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">선택해주세요</option>
                {BOTTLENECK_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>설명 (선택)</label>
              <textarea
                value={delayForm.note}
                onChange={e => setDelayForm(f => ({ ...f, note: e.target.value }))}
                placeholder="지연 상황을 자세히 설명해주세요"
                rows={3}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => { setDelayMilestone(null); setDelayForm({ type: '', note: '' }) }}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting || !delayForm.type}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--error)', color: '#fff', opacity: (submitting || !delayForm.type) ? 0.7 : 1 }}
              >
                신고하기
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Add tab state and action handlers inside `MilestonesPage`**

Inside `export default function MilestonesPage()`, after the existing `useState` declarations (after `const { width: listWidth, ... } = useResizableWidth(...)`), add:

```ts
const [activeTab, setActiveTab] = useState<'wbs' | 'checkin'>('wbs')
```

Then add these three handler functions after the existing `handleMarkProgress` function:

```ts
async function handleCheckinComplete(id: string) {
  try {
    const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_manual_completed: true, bottleneck_type: null, bottleneck_note: null }),
    })
    setMilestones(prev => prev.map(m => m.id === id ? updated : m))
    toast.success('완료로 표시되었습니다.')
  } catch (e: unknown) {
    toast.error('완료 처리에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleCheckinDelayReport(id: string, type: BottleneckType, note: string | null) {
  try {
    const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ bottleneck_type: type, bottleneck_note: note, is_manual_completed: false, is_manual_progress: false }),
    })
    setMilestones(prev => prev.map(m => m.id === id ? updated : m))
    toast.success('지연 신고가 완료되었습니다. 관리자에게 알림이 전송되었습니다.')
  } catch (e: unknown) {
    toast.error('지연 신고에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleCheckinInProgress(id: string) {
  try {
    const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_manual_progress: true, bottleneck_type: null, bottleneck_note: null, is_manual_completed: false }),
    })
    setMilestones(prev => prev.map(m => m.id === id ? updated : m))
    toast.success('진행 중으로 표시되었습니다.')
  } catch (e: unknown) {
    toast.error('상태 변경에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
  }
}
```

Also add this helper for deadline extension from checkin (reuses existing `deadlineModal` state):

```ts
function openDeadlineForCheckin(m: Milestone) {
  const existing = requests.filter(r => r.milestone_id === m.id)[0]
  setDeadlineModal({ id: m.id, due_date: m.due_date, existingReqId: existing?.id })
  setReqForm({ requested_due_date: existing?.requested_due_date ?? '', reason: existing?.reason ?? '' })
}
```

And for cross-navigation:

```ts
function goToWBSDetail(m: Milestone) {
  setActiveTab('wbs')
  openEdit(m)
}
```

- [ ] **Step 4: Add tab toggle and wire CheckinTab into the render**

In the `return (...)` of `MilestonesPage`, find the existing header section (the `<div className="flex items-center justify-between mb-6 ...">` containing the `주차별 WBS` title). Replace that section with:

```tsx
<div className="flex items-center justify-between mb-4 whitespace-nowrap">
  <div>
    <div className="flex gap-1 mb-1">
      <button
        onClick={() => setActiveTab('wbs')}
        className="text-xs px-3 py-1.5 rounded-lg font-semibold"
        style={{
          background: activeTab === 'wbs' ? 'rgba(37,99,235,0.15)' : 'transparent',
          color: activeTab === 'wbs' ? 'var(--blue-600)' : 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        WBS
      </button>
      <button
        onClick={() => { setActiveTab('checkin'); if (showForm) closeForm() }}
        className="text-xs px-3 py-1.5 rounded-lg font-semibold"
        style={{
          background: activeTab === 'checkin' ? 'rgba(37,99,235,0.15)' : 'transparent',
          color: activeTab === 'checkin' ? 'var(--blue-600)' : 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        주간 체크인
      </button>
    </div>
    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{milestones.length}개 마일스톤</p>
  </div>
  {activeTab === 'wbs' && (
    <button
      onClick={() => (showForm ? closeForm() : openForm())}
      className="px-4 py-2 rounded-lg text-xs font-semibold"
      style={{
        background: showForm ? 'rgba(37,99,235,0.15)' : 'var(--blue-600)',
        color: showForm ? 'var(--blue-600)' : '#fff',
      }}
    >
      + 마일스톤 추가
    </button>
  )}
</div>
```

Then, find the `<div className="mb-4">` that wraps `<PublishStatusFilter .../>` and wrap it in a condition:

```tsx
{activeTab === 'wbs' && (
  <div className="mb-4">
    <PublishStatusFilter value={filter} onChange={setFilter} />
  </div>
)}
```

Then replace the milestone table section (the `{milestones.length === 0 ? ... : ...}` block) with:

```tsx
{activeTab === 'checkin' ? (
  <CheckinTab
    milestones={milestones}
    onComplete={handleCheckinComplete}
    onDelayReport={handleCheckinDelayReport}
    onInProgress={handleCheckinInProgress}
    onDeadlineExtension={openDeadlineForCheckin}
    onGoToWBS={goToWBSDetail}
  />
) : milestones.length === 0 ? (
  <EmptyState
    icon={ListTodo}
    title="마일스톤이 없습니다"
    description="아래에서 첫 마일스톤을 추가해보세요."
  />
) : (
  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
    {/* ... existing table ... */}
  </div>
)}
```

Also: the outer wrapper `<div className="flex" style={{ height: 'calc(100vh - 48px)', ... }}>` should conditionally suppress the right panel when `activeTab === 'checkin'`:

Change the left column's width condition:
```tsx
style={{
  width: (showForm && activeTab === 'wbs') ? `${listWidth}px` : '100%',
  borderRight: (showForm && activeTab === 'wbs') ? '1px solid var(--border-subtle)' : 'none',
}}
```

And the right panel render:
```tsx
{showForm && activeTab === 'wbs' && (
  <div className="flex flex-col flex-1 overflow-hidden">
    {/* ... existing form panel ... */}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual browser test — check-in tab renders**

```bash
bun dev
```

Navigate to `/my-project/milestones`. Verify:
1. Two tabs appear at the top: `WBS` and `주간 체크인`
2. `WBS` tab is active by default (shows existing table + publish filter)
3. Clicking `주간 체크인` hides the table and publish filter
4. Check-in tab shows milestone cards grouped by "이번 주" and "지연 / 미완료" sections
5. Milestones without `start_date` or `due_date` do not appear in check-in tab
6. Draft milestones do not appear in check-in tab
7. If no milestones qualify, the empty state message appears

- [ ] **Step 7: Manual browser test — action buttons**

With a milestone that falls in "이번 주":
1. **완료**: click `✅ 완료` → confirm dialog appears → click `완료로 표시` → toast "완료로 표시되었습니다." → milestone moves to "완료됨" section, showing greyed card with no action buttons
2. **지연 신고**: click `⚠ 지연 신고` → modal with dropdown and textarea → select a type → click `신고하기` → toast with admin notification message → milestone status changes to `지연`
3. **진행 중**: click `▶ 진행 중` → immediately shows toast "진행 중으로 표시되었습니다." → milestone status changes to `진행 중`
4. **기한 연장**: click `📅 기한 연장` → existing deadline change request modal opens → fill in and submit → toast success
5. **자세히 보기 →**: click → switches to WBS tab and opens the edit modal for that milestone

- [ ] **Step 8: Commit**

```bash
git add app/(champion)/my-project/milestones/page.tsx
git commit -m "feat: add 주간 체크인 tab to milestones page with complete/delay/extension/progress actions"
```
