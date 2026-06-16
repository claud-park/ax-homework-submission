# Conversational AI Milestone (Iterative Refine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a champion refine an AI-generated milestone draft via natural-language instructions ("베타 2주 늘려"), where each refinement operates on the current on-screen draft and updates it in place.

**Architecture:** A new `POST /api/milestones/refine` takes the current absolute-dated draft + an instruction, converts the draft back to working-day relative form (`draftToRelative`), asks the AI (Anthropic, `generateText` + `Output.object`) to return a revised relative plan **without re-sending the Charter**, then re-schedules to absolute dates (`scheduleRelativeMilestones`). The drawer gains a bottom "refine bar" (layout A). AI never computes dates; deterministic code does.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vercel AI SDK v6 (`generateText`/`Output.object`) + `@ai-sdk/anthropic`, zod, Vitest + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-06-16-conversational-milestone-design.md`](../specs/2026-06-16-conversational-milestone-design.md)

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `lib/milestone-schedule.ts` | add `draftToRelative()` — absolute draft → relative (inverse of `scheduleRelativeMilestones`) | Modify |
| `lib/milestone-ai.ts` | add `buildRefinePrompt()` — current relative plan + instruction, no Charter | Modify |
| `app/api/milestones/refine/route.ts` | thin handler: auth → draftToRelative → buildRefinePrompt → AI → reschedule | Create |
| `components/milestones/MilestoneDraftDrawer.tsx` | bottom refine bar + `handleRefine` + `refining`/`instruction`/`recentInstructions` state | Modify |
| tests | `test/lib/milestone-schedule.test.ts` (extend), `test/lib/milestone-ai.test.ts` (extend), `test/components/MilestoneDraftDrawer.test.tsx` (extend) | Modify |

---

## Task 1: `draftToRelative` — absolute draft → relative

**Files:**
- Modify: `lib/milestone-schedule.ts`
- Test: `test/lib/milestone-schedule.test.ts`

- [ ] **Step 1: Add the round-trip test** to `test/lib/milestone-schedule.test.ts`

Append inside the existing `describe('milestone schedule', () => { ... })` block (before its closing `})`):
```ts
  it('draftToRelative is the inverse of scheduleRelativeMilestones (round-trip)', () => {
    const rel = [
      { title: 'A', offset_days: 0, duration_days: 5, children: [{ title: 'A1', offset_days: 0, duration_days: 2 }] },
      { title: 'B', offset_days: 5, duration_days: 3 },
    ]
    const scheduled = scheduleRelativeMilestones('2026-06-16', rel)
    const back = draftToRelative(scheduled, '2026-06-16')
    expect(back[0].offset_days).toBe(0)
    expect(back[0].duration_days).toBe(5)
    expect(back[0].children?.[0].offset_days).toBe(0)
    expect(back[0].children?.[0].duration_days).toBe(2)
    expect(back[1].offset_days).toBe(5)
    expect(back[1].duration_days).toBe(3)
  })
  it('draftToRelative handles null dates with safe defaults', () => {
    const back = draftToRelative([{ title: 'X', start_date: null, due_date: null }], '2026-06-16')
    expect(back[0].offset_days).toBe(0)
    expect(back[0].duration_days).toBe(1)
  })
```
Also update the import line at the top of the file to include `draftToRelative`:
```ts
import { nextWorkingDay, addWorkingDays, scheduleRelativeMilestones, draftToRelative } from '@/lib/milestone-schedule'
```

- [ ] **Step 2: Run the test, confirm it FAILS**

Run: `bun run test test/lib/milestone-schedule.test.ts`
Expected: FAIL — `draftToRelative` is not exported / not a function.

- [ ] **Step 3: Implement `draftToRelative`** in `lib/milestone-schedule.ts`

First, extend the holidays import at the top of the file to include `countWorkingDays`:
```ts
import { HOLIDAYS_FALLBACK, toKey, parseKey, isWorkingDay, countWorkingDays } from '@/lib/holidays'
```
Then append at the end of the file:
```ts
export interface DraftLike {
  title: string
  description?: string
  start_date: string | null
  due_date: string | null
  children?: DraftLike[]
}

// Inverse of scheduleRelativeMilestones: absolute-dated draft → working-day relative form.
export function draftToRelative(
  milestones: DraftLike[],
  startDate: string,
  holidays: Holidays = HOLIDAYS_FALLBACK,
): RelativeMilestone[] {
  const projectStart = nextWorkingDay(startDate, holidays)
  const one = (m: DraftLike): RelativeMilestone => {
    const start = m.start_date ?? projectStart
    const offset_days = Math.max(0, countWorkingDays(projectStart, start, holidays) - 1)
    const duration_days = m.start_date && m.due_date
      ? Math.max(1, countWorkingDays(m.start_date, m.due_date, holidays))
      : 1
    return {
      title: m.title,
      description: m.description,
      offset_days,
      duration_days,
      children: m.children?.map(one),
    }
  }
  return milestones.map(one)
}
```
Note: `Holidays` type and `RelativeMilestone` interface already exist in this file; reuse them.

- [ ] **Step 4: Run the test, confirm it PASSES**

Run: `bun run test test/lib/milestone-schedule.test.ts`
Expected: PASS (all, including the 2 new tests).

- [ ] **Step 5: Typecheck + commit**

Run: `bun run typecheck` (expect clean), then:
```bash
git add lib/milestone-schedule.ts test/lib/milestone-schedule.test.ts
git commit -m "[AX-1] feat: draftToRelative (절대 초안→상대 역산)"
```

---

## Task 2: `buildRefinePrompt` — current plan + instruction (no Charter)

**Files:**
- Modify: `lib/milestone-ai.ts`
- Test: `test/lib/milestone-ai.test.ts`

- [ ] **Step 1: Add the test** to `test/lib/milestone-ai.test.ts`

Update the import at the top to include `buildRefinePrompt`:
```ts
import { GenerationOutputSchema, buildGenerationPrompt, buildRefinePrompt } from '@/lib/milestone-ai'
```
Append inside the existing `describe('milestone-ai', () => { ... })` block (before its closing `})`):
```ts
  it('buildRefinePrompt includes the instruction and current milestone titles', () => {
    const p = buildRefinePrompt(
      [{ title: '베타 테스트', offset_days: 5, duration_days: 5 }],
      '베타를 2주로 늘려줘',
    )
    expect(p).toContain('베타 테스트')
    expect(p).toContain('베타를 2주로 늘려줘')
    expect(p).toContain('offset_days')
  })
```

- [ ] **Step 2: Run the test, confirm it FAILS**

Run: `bun run test test/lib/milestone-ai.test.ts`
Expected: FAIL — `buildRefinePrompt` is not exported.

- [ ] **Step 3: Implement `buildRefinePrompt`** in `lib/milestone-ai.ts`

Add an import of the relative type at the top of the file (after the existing imports):
```ts
import type { RelativeMilestone } from '@/lib/milestone-schedule'
```
Append at the end of the file:
```ts
export function buildRefinePrompt(milestones: RelativeMilestone[], instruction: string): string {
  const lines: string[] = [
    '당신은 프로젝트 매니저입니다. 아래 기존 마일스톤 계획을 사용자 요청에 맞게 수정하세요.',
    '규칙:',
    '- 절대 날짜를 만들지 마세요. offset_days(프로젝트 시작 기준 시작 오프셋, working days)와 duration_days(기간, working days)로만 표현합니다.',
    '- 변경이 없는 항목도 포함해 전체 마일스톤 목록을 반환합니다.',
    '- 제목은 한국어로 간결하게. children은 1단계 깊이까지.',
    '',
    '[현재 마일스톤]',
    JSON.stringify(milestones, null, 2),
    '',
    `[수정 요청] ${instruction.trim()}`,
  ]
  return lines.join('\n')
}
```

- [ ] **Step 4: Run the test, confirm it PASSES**

Run: `bun run test test/lib/milestone-ai.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `bun run typecheck` (expect clean), then:
```bash
git add lib/milestone-ai.ts test/lib/milestone-ai.test.ts
git commit -m "[AX-1] feat: buildRefinePrompt (Charter 없는 수정 프롬프트)"
```

---

## Task 3: `POST /api/milestones/refine` route

**Files:**
- Create: `app/api/milestones/refine/route.ts`

This mirrors `app/api/milestones/generate/route.ts` (same auth, model, retry, AI call) but: reads the current draft, converts it via `draftToRelative`, builds the refine prompt (no Charter, no DB read), and reschedules.

- [ ] **Step 1: Create `app/api/milestones/refine/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { generateText, Output } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { verifyJWT } from '@/lib/auth'
import { GenerationOutputSchema, buildRefinePrompt } from '@/lib/milestone-ai'
import { draftToRelative, scheduleRelativeMilestones, type DraftLike } from '@/lib/milestone-schedule'

const MODEL = process.env.MILESTONE_AI_MODEL ?? 'claude-haiku-4-5'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const instruction: string = typeof body?.instruction === 'string' ? body.instruction : ''
  const milestones: DraftLike[] = Array.isArray(body?.milestones) ? body.milestones : []
  const rawStart: unknown = body?.startDate
  const startDate: string =
    typeof rawStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawStart)
      ? rawStart
      : new Date().toISOString().slice(0, 10)

  if (!instruction.trim() || milestones.length === 0) {
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 })
  }

  const relative = draftToRelative(milestones, startDate)
  const prompt = buildRefinePrompt(relative, instruction)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: anthropic(MODEL),
        output: Output.object({ schema: GenerationOutputSchema }),
        prompt,
      })
      const scheduled = scheduleRelativeMilestones(startDate, output.milestones)
      return NextResponse.json({ milestones: scheduled })
    } catch {
      if (attempt === 1) {
        return NextResponse.json({ error: 'refine_failed' }, { status: 502 })
      }
    }
  }
  return NextResponse.json({ error: 'refine_failed' }, { status: 502 })
}
```

- [ ] **Step 2: Typecheck + build**

Run: `bun run typecheck && bun run build`
Expected: PASS; `/api/milestones/refine` appears in the route list.

- [ ] **Step 3: Commit**

```bash
git add app/api/milestones/refine/route.ts
git commit -m "[AX-1] feat: /api/milestones/refine (현재 초안 기반 수정)"
```

---

## Task 4: Drawer refine bar + `handleRefine`

**Files:**
- Modify: `components/milestones/MilestoneDraftDrawer.tsx`
- Test: `test/components/MilestoneDraftDrawer.test.tsx`

- [ ] **Step 1: Add a test** to `test/components/MilestoneDraftDrawer.test.tsx`

Append inside the existing `describe('MilestoneDraftDrawer', () => { ... })` block (before its closing `})`):
```ts
  it('shows the refine bar only after a draft exists, with refine disabled until an instruction is typed', () => {
    render(<MilestoneDraftDrawer open onClose={() => {}} onSaved={() => {}} />)
    // No draft yet → no refine bar
    expect(screen.queryByPlaceholderText('수정 요청 (예: 베타를 2주로 늘려줘)')).not.toBeInTheDocument()
    // Populate a draft via a template (synchronous)
    fireEvent.click(screen.getByText('템플릿에서'))
    fireEvent.click(screen.getByText('스프린트 / 해커톤'))
    const refineInput = screen.getByPlaceholderText('수정 요청 (예: 베타를 2주로 늘려줘)')
    expect(refineInput).toBeInTheDocument()
    const refineBtn = screen.getByRole('button', { name: /수정/ })
    expect(refineBtn).toBeDisabled()
    fireEvent.change(refineInput, { target: { value: '리서치 단계 빼줘' } })
    expect(refineBtn).not.toBeDisabled()
  })
```

- [ ] **Step 2: Run the test, confirm it FAILS**

Run: `bun run test test/components/MilestoneDraftDrawer.test.tsx`
Expected: FAIL — placeholder not found (refine bar not implemented).

- [ ] **Step 3: Add refine state** in `components/milestones/MilestoneDraftDrawer.tsx`

After the existing `const [saving, setSaving] = useState(false)` line, add:
```ts
  const [instruction, setInstruction] = useState('')
  const [refining, setRefining] = useState(false)
  const [recentInstructions, setRecentInstructions] = useState<string[]>([])
```

- [ ] **Step 4: Add `handleRefine`** in the same component

After the existing `handleSave` function, add:
```ts
  async function handleRefine() {
    if (!instruction.trim()) return
    setRefining(true)
    try {
      const { milestones } = await apiFetch<{ milestones: Scheduled[] }>('/api/milestones/refine', {
        method: 'POST',
        body: JSON.stringify({ milestones: rows, startDate, instruction }),
      })
      setRows(milestones.map(m => toDraft(m, 'ai')))
      setRecentInstructions(prev => [instruction.trim(), ...prev].slice(0, 2))
      setInstruction('')
    } catch {
      toast.error('수정에 실패했어요. 다시 시도해 주세요.')
    } finally {
      setRefining(false)
    }
  }
```
Note: `Scheduled`, `toDraft`, `apiFetch`, `toast`, `rows`, `startDate` already exist in this file.

- [ ] **Step 5: Render the refine bar** between the draft-list `</div>` and the save footer

Find this block (the draft list closes, then the footer opens):
```tsx
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg"
```
Insert the refine bar between them so it reads:
```tsx
        </div>

        {rows.length > 0 && (
          <div className="px-4 py-3 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !refining && instruction.trim()) handleRefine() }}
                placeholder="수정 요청 (예: 베타를 2주로 늘려줘)"
                style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)', width: '100%' }}
              />
              <button type="button" onClick={handleRefine} disabled={refining || !instruction.trim()}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>
                {refining ? (<><Spinner size="sm" className="text-white" /> 수정 중…</>) : '수정 ▸'}
              </button>
            </div>
            {recentInstructions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recentInstructions.map((t, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--surface-secondary, #eef2f7)', color: 'var(--text-secondary)' }}>↺ {t}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg"
```
(`Spinner` is already imported in this file.)

- [ ] **Step 6: Run the test, confirm it PASSES**

Run: `bun run test test/components/MilestoneDraftDrawer.test.tsx`
Expected: PASS (existing + new test).

- [ ] **Step 7: Typecheck + build + commit**

Run: `bun run typecheck && bun run build` (expect clean), then:
```bash
git add components/milestones/MilestoneDraftDrawer.tsx test/components/MilestoneDraftDrawer.test.tsx
git commit -m "[AX-1] feat: 드로어 하단 수정바 + handleRefine (반복 수정)"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `bun run test`
Expected: all suites pass (schedule incl. round-trip, ai incl. refine prompt, drawer incl. refine bar).

- [ ] **Step 2: Typecheck + lint + build**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: PASS; `/api/milestones/refine` registered.

- [ ] **Step 3: Manual smoke (optional, needs ANTHROPIC_API_KEY)**

`bun run dev` → Charter → `+ 마일스톤 추가` → 템플릿/AI로 초안 생성 → 하단 수정바에 "베타 2주로 늘려" 입력 → 수정 → 목록 갱신·최근 지시 칩 확인. (키 없으면 수정 실패 토스트가 정상)

---

## Self-Review Notes (spec coverage)

- Iterative refine on current on-screen draft → Tasks 3, 4 (sends `rows` + instruction).
- AI stays in relative space; dates via code → Tasks 1, 3 (`draftToRelative` ↔ `scheduleRelativeMilestones`).
- Refine turns exclude Charter → Task 2 (`buildRefinePrompt` has no charter), Task 3 (no DB read).
- Bottom refine bar (layout A), shown only when draft>0, recent-instruction chips (display-only) → Task 4.
- Error handling (retry+502 server, toast+keep draft client, disabled states) → Tasks 3, 4.
- Tests (draftToRelative round-trip first-priority, refine prompt, drawer bar) → Tasks 1, 2, 4.
- New `/refine` endpoint separate from `/generate` → Task 3.
- `source: 'ai'` on refined rows; save reuses batch → Task 4 (`toDraft(m, 'ai')`, existing `handleSave`).
