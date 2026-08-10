# Milestone Activity Log Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give champions and admins a way to read the dated work-log entries the `champion-milestone-sync` skill writes to `milestone_activity_log` — today the table is write-only (nothing displays it).

**Context:** `POST /api/milestones/[id]/log` (merged in PR #62) already writes rows to `milestone_activity_log` (`id, milestone_id, user_id, log_date, note, created_at`, RLS enabled, service-role-only access — same pattern as `nudge_log`). No `GET` exists yet, and no UI reads it. This plan adds a read endpoint and a small reusable "작업 로그" expand/collapse toggle wired into the three places milestones are already rendered: the champion desktop card (`CheckinTab.tsx`), the champion mobile card (`MobileMilestoneCard.tsx`), and the admin per-champion milestone tree (`app/admin/champions/[userId]/page.tsx`). Logs are fetched lazily (only when a user expands a row), not eagerly for every milestone on page load.

**Architecture:** One new `GET` handler co-located with the existing `POST` in `app/api/milestones/[id]/log/route.ts`, following the exact `requireUser` + `isAdminUser` + `?user_id=` override pattern already used by `GET /api/milestones`. One new shared client component (`components/milestones/MilestoneActivityLogToggle.tsx`) that both champion card components and the admin tree row import — this is a genuinely repeated need across three call sites, so one component is the right call, not three copies.

**Tech Stack:** Next.js App Router API routes, Supabase service-role client, React client components, Vitest + @testing-library/react (matches the existing `test/components/MilestoneDraftDrawer.test.tsx` convention).

## Global Constraints

- No new npm dependencies.
- Every DB query in the new `GET` handler must be scoped by both `milestone_id` and the effective `user_id` — the service-role client bypasses RLS, so this scoping is the only authorization boundary (same as every other route touching `milestone_activity_log`/`milestones`).
- Logs are fetched lazily (on first expand), never eagerly for a whole milestone list — avoid N+1 fetches on page load.
- This is a read-only viewer. Nothing in this plan adds a way to edit or delete a log entry from the UI.
- Follow existing inline styling conventions exactly (this codebase uses inline `style={{}}` objects with CSS custom properties like `var(--text-secondary)`, not a component library, for these specific files) — do not introduce a different styling approach for the new component.
- This repo has no automated test coverage for API routes (only pure `lib/` functions and select interactive components get tests — see `test/components/MilestoneDraftDrawer.test.tsx` for the convention). Follow that: the new component gets a Vitest test; the new route handler gets `typecheck`/`lint` + manual reasoning, no new route-test infrastructure.

---

### Task 1: `GET /api/milestones/[id]/log` + `MilestoneActivityLog` type

**Files:**
- Modify: `lib/types.ts`
- Modify: `app/api/milestones/[id]/log/route.ts`

**Interfaces:**
- Produces: `MilestoneActivityLog` type (`lib/types.ts`) — `{ id: string, milestone_id: string, user_id: string, log_date: string, note: string, created_at: string }`. `GET /api/milestones/[id]/log[?user_id=]` → `{ logs: MilestoneActivityLog[] }`, ordered newest-first by `log_date` then `created_at`. Task 2's component imports this type and calls this exact endpoint shape.

- [ ] **Step 1: Add the type to `lib/types.ts`**

Find the `Milestone` interface in `lib/types.ts` and add this new interface directly after it:

```typescript
export interface MilestoneActivityLog {
  id: string
  milestone_id: string
  user_id: string
  log_date: string
  note: string
  created_at: string
}
```

- [ ] **Step 2: Add the `GET` handler**

In `app/api/milestones/[id]/log/route.ts`, change the import line:

```typescript
import { requireUser } from '@/lib/api/guard'
```

to:

```typescript
import { requireUser } from '@/lib/api/guard'
import { isAdminUser } from '@/lib/auth'
```

Then add this function anywhere in the file (e.g., right before `export async function POST`):

```typescript
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const isAdmin = isAdminUser(user)
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestone_activity_log')
    .select('*')
    .eq('milestone_id', params.id)
    .eq('user_id', effectiveUserId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ logs: data })
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no new errors.

- [ ] **Step 4: Manual verification (no live DB in this worktree — see Global Constraints of the parent feature; reasoning-based check here)**

Read the final file and confirm: for a non-admin champion, `effectiveUserId` always resolves to `user.id` regardless of any `?user_id=` they might pass (an admin-only override) — so a champion can never read another champion's logs by manipulating the query string. Confirm the query is scoped by both `milestone_id` AND `user_id`, so even if a champion somehow guessed another user's `milestone_id`, the `.eq('user_id', effectiveUserId)` filter still returns nothing (no cross-user leak).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts "app/api/milestones/[id]/log/route.ts"
git commit -m "$(cat <<'EOF'
[AX-1] feat(milestones): 마일스톤 활동 로그 조회 API 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared `MilestoneActivityLogToggle` component

**Files:**
- Create: `components/milestones/MilestoneActivityLogToggle.tsx`
- Test: `test/components/MilestoneActivityLogToggle.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`lib/api-client.ts`, existing), `MilestoneActivityLog` type (Task 1), `GET /api/milestones/[id]/log` (Task 1).
- Produces: `MilestoneActivityLogToggle` — a default-exported React component with props `{ milestoneId: string, userId?: string }` (`userId` is the admin override; omit it for a champion viewing their own milestones). Tasks 3 and 4 import this component by this exact name and prop shape.

- [ ] **Step 1: Write the failing test**

```typescript
// test/components/MilestoneActivityLogToggle.test.tsx
import { vi } from 'vitest'

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }))

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { apiFetch } from '@/lib/api-client'
import MilestoneActivityLogToggle from '@/components/milestones/MilestoneActivityLogToggle'

const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>

describe('MilestoneActivityLogToggle', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it('does not fetch logs until expanded', () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('fetches and renders log entries on first expand', async () => {
    mockApiFetch.mockResolvedValue({
      logs: [
        { id: 'l1', milestone_id: 'm1', user_id: 'u1', log_date: '2026-08-07', note: 'ModuSign 연동 에러 핸들링 보완', created_at: '2026-08-07T10:00:00Z' },
      ],
    })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(screen.getByText('ModuSign 연동 에러 핸들링 보완')).toBeInTheDocument())
    expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1/log')
  })

  it('passes user_id as a query param when provided (admin viewing a champion)', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" userId="champion-42" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1/log?user_id=champion-42'))
  })

  it('does not re-fetch on subsequent expands after the first successful load', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    const button = screen.getByText(/작업 로그/)
    fireEvent.click(button)
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1))
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
  })

  it('shows an empty-state message when there are no log entries', async () => {
    mockApiFetch.mockResolvedValue({ logs: [] })
    render(<MilestoneActivityLogToggle milestoneId="m1" />)
    fireEvent.click(screen.getByText(/작업 로그/))
    await waitFor(() => expect(screen.getByText('기록된 작업 로그가 없습니다.')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run vitest run test/components/MilestoneActivityLogToggle.test.tsx`
Expected: FAIL — `Cannot find module '@/components/milestones/MilestoneActivityLogToggle'`

- [ ] **Step 3: Write the component**

```typescript
// components/milestones/MilestoneActivityLogToggle.tsx
'use client'
import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { MilestoneActivityLog } from '@/lib/types'

function relativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  return `${days}일 전`
}

interface MilestoneActivityLogToggleProps {
  milestoneId: string
  userId?: string
}

export default function MilestoneActivityLogToggle({ milestoneId, userId }: MilestoneActivityLogToggleProps) {
  const [expanded, setExpanded] = useState(false)
  const [logs, setLogs] = useState<MilestoneActivityLog[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (!expanded && logs === null) {
      setLoading(true)
      try {
        const qs = userId ? `?user_id=${userId}` : ''
        const { logs: data } = await apiFetch<{ logs: MilestoneActivityLog[] }>(`/api/milestones/${milestoneId}/log${qs}`)
        setLogs(data)
      } catch {
        setLogs([])
      } finally {
        setLoading(false)
      }
    }
    setExpanded(e => !e)
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={toggle}
        className="text-xs"
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer' }}
      >
        {expanded ? '작업 로그 접기' : '작업 로그 보기'}
        {logs && logs.length > 0 ? ` (${logs.length})` : ''}
      </button>

      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {loading ? (
            <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>불러오는 중...</p>
          ) : logs && logs.length > 0 ? (
            logs.map(l => (
              <div
                key={l.id}
                style={{ background: 'rgba(37,99,235,0.04)', borderRadius: '6px', padding: '6px 9px' }}
              >
                <p className="text-xs font-semibold" style={{ color: 'var(--text-disabled)' }}>
                  {l.log_date} · {relativeDate(l.log_date)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {l.note}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>기록된 작업 로그가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run vitest run test/components/MilestoneActivityLogToggle.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/milestones/MilestoneActivityLogToggle.tsx test/components/MilestoneActivityLogToggle.test.tsx
git commit -m "$(cat <<'EOF'
[AX-1] feat(milestones): 작업 로그 표시용 공용 토글 컴포넌트 추가

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire into the champion-facing milestone cards

**Files:**
- Modify: `components/CheckinTab.tsx`
- Modify: `components/MobileMilestoneCard.tsx`

**Interfaces:**
- Consumes: `MilestoneActivityLogToggle` (Task 2), default import, props `{ milestoneId, userId? }` — omit `userId` here since a champion only ever views their own milestones.

- [ ] **Step 1: Add the import and integration to `components/CheckinTab.tsx`**

Add this import near the top of the file, alongside the existing imports:

```typescript
import MilestoneActivityLogToggle from '@/components/milestones/MilestoneActivityLogToggle'
```

Then, inside `function MilestoneCard(...)`, find this block (it's the closing of the three-way note-display conditional, right before the `{showActions ? (` block):

```typescript
      ) : canEditNote ? (
        <div className="mb-3">
          <button
            onClick={openNoteEdit}
            className="text-xs"
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer' }}
          >
            + 진행 노트 추가
          </button>
        </div>
      ) : null}

      {showActions ? (
```

Insert a new line directly after `) : null}` and before `{showActions ? (`:

```typescript
      ) : null}

      <MilestoneActivityLogToggle milestoneId={m.id} />

      {showActions ? (
```

- [ ] **Step 2: Add the same integration to `components/MobileMilestoneCard.tsx`**

Add the same import near the top:

```typescript
import MilestoneActivityLogToggle from '@/components/milestones/MilestoneActivityLogToggle'
```

Find the equivalent closing block (right before the `{/* 액션 버튼 */}` comment):

```typescript
        ) : canEditNote ? (
          <div className="mb-2">
            <button
              onClick={openNoteEdit}
              className="text-xs"
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer' }}
            >
              + 진행 노트 추가
            </button>
          </div>
        ) : null}

        {/* 액션 버튼 */}
```

Insert a new line after `) : null}` and before `{/* 액션 버튼 */}`:

```typescript
        ) : null}

        <MilestoneActivityLogToggle milestoneId={m.id} />

        {/* 액션 버튼 */}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no new errors.

- [ ] **Step 4: Run the full component test suite**

Run: `bun run vitest run`
Expected: all existing tests still pass, plus the 5 from Task 2.

- [ ] **Step 5: Manual verification**

Read both modified files back and confirm the toggle renders unconditionally (not gated behind `canEditNote` or any status check) — every milestone, regardless of status, should show the "작업 로그 보기" toggle, since the skill can write a log entry to a milestone in any state.

- [ ] **Step 6: Commit**

```bash
git add components/CheckinTab.tsx components/MobileMilestoneCard.tsx
git commit -m "$(cat <<'EOF'
[AX-1] feat(milestones): 챔피언 마일스톤 카드에 작업 로그 토글 연결

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire into the admin champion milestone tree

**Files:**
- Modify: `app/admin/champions/[userId]/page.tsx`

**Interfaces:**
- Consumes: `MilestoneActivityLogToggle` (Task 2), passing `userId` explicitly (the admin override) since this page views a specific champion's data, not the logged-in admin's own.

- [ ] **Step 1: Add the import**

Add this import near the top of the file, alongside the existing imports:

```typescript
import MilestoneActivityLogToggle from '@/components/milestones/MilestoneActivityLogToggle'
```

- [ ] **Step 2: Thread `userId` into `MilestoneRow` and render the toggle**

`MilestoneRow` is defined as a module-level function component (not inside `AdminChampionPage`), so it needs `userId` passed down explicitly — it isn't in scope otherwise. Change the props type and destructuring:

```typescript
function MilestoneRow({ m, depth = 0 }: { m: Milestone & { children?: Milestone[] }; depth?: number }) {
```

to:

```typescript
function MilestoneRow({ m, userId, depth = 0 }: { m: Milestone & { children?: Milestone[] }; userId: string; depth?: number }) {
```

Then find the closing of the row's main content `<div>` (the one with `flex: 1, display: 'flex', ...`) — it ends right before the `{/* Children with vertical line */}` comment:

```typescript
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, color, background: bg, flexShrink: 0, marginLeft: 8 }}>
            {MS_STATUS_LABEL[m.status]}
          </span>
        </div>
      </div>

      {/* Children with vertical line */}
```

Insert the toggle between the closing `</div>` of the row wrapper and the children comment, with left margin matching the row's own indentation so it visually aligns under the row's text rather than the full card:

```typescript
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 5, color, background: bg, flexShrink: 0, marginLeft: 8 }}>
            {MS_STATUS_LABEL[m.status]}
          </span>
        </div>
      </div>

      <div style={{ marginLeft: depth > 0 ? 20 + 18 : 12 }}>
        <MilestoneActivityLogToggle milestoneId={m.id} userId={userId} />
      </div>

      {/* Children with vertical line */}
```

Finally, update the two recursive/initial call sites to pass `userId` through. In `MilestoneRow` itself, the recursive call:

```typescript
          {children.map((c) => (
            <MilestoneRow key={c.id} m={c as Milestone & { children?: Milestone[] }} depth={depth + 1} />
          ))}
```

becomes:

```typescript
          {children.map((c) => (
            <MilestoneRow key={c.id} m={c as Milestone & { children?: Milestone[] }} userId={userId} depth={depth + 1} />
          ))}
```

And in `AdminChampionPage`'s render (where the tree is first mounted):

```typescript
                    {buildTree(activeCharterMilestones).map(m => (
                      <MilestoneRow key={m.id} m={m as Milestone & { children?: Milestone[] }} depth={0} />
                    ))}
```

becomes:

```typescript
                    {buildTree(activeCharterMilestones).map(m => (
                      <MilestoneRow key={m.id} m={m as Milestone & { children?: Milestone[] }} userId={userId} depth={0} />
                    ))}
```

`userId` here is the page's own `const { userId } = useParams()` value (already in scope in `AdminChampionPage` — confirm the exact variable name by reading the file; it comes from `useParams<{ userId: string }>()` or similar near the top of the component).

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite**

Run: `bun run vitest run`
Expected: all tests pass (no regressions).

- [ ] **Step 5: Manual verification**

Read the final file and trace: does every `MilestoneRow` render (root and every nested child, at every depth) now receive `userId`? Confirm there's no path where `MilestoneRow` is rendered without it (TypeScript's required prop would already catch this at typecheck, but double-check the diff didn't miss a call site typecheck somehow didn't cover, e.g. inside a conditionally-rendered branch).

- [ ] **Step 6: Commit**

```bash
git add "app/admin/champions/[userId]/page.tsx"
git commit -m "$(cat <<'EOF'
[AX-1] feat(milestones): 어드민 챔피언 마일스톤 트리에 작업 로그 토글 연결

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun run vitest run`
Expected: all tests pass, including the 5 new `MilestoneActivityLogToggle` tests.

- [ ] **Step 2: Run typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: both clean (pre-existing unrelated lint warnings in other files are not this plan's concern).

- [ ] **Step 3: Note the pending manual verification**

This plan's UI can't be exercised against a live server in this worktree (no `.env.local`, no linked Supabase project — same constraint as the parent `champion-milestone-sync` feature). Call this out when reporting the branch as ready: once deployed, confirm in a browser that (a) a champion sees "작업 로그 보기" on their own milestone cards and it lazily loads entries the skill wrote, and (b) an admin sees the same on a specific champion's milestone tree at `/admin/champions/[userId]`.
