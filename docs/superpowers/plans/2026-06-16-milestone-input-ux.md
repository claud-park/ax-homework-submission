# Smart Milestone Input UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-by-one milestone add flow with a single entry point (AI generate / template / direct) that drops results into an editable draft list, committed in one batch save.

**Architecture:** A `MilestoneDraftDrawer` hosts three input methods that all converge on a local editable `DraftMilestone[]` staging list, then commit via `POST /api/milestones/batch`. AI generation (`POST /api/milestones/generate`) reads the champion's Charter content and returns **relative-duration** milestones; absolute dates are computed deterministically by `lib/milestone-schedule.ts` (working-days, holiday-aware). Pure logic (schedule, templates, prompt building, batch normalization) lives in tested `lib/` modules; route handlers and React components stay thin.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service client), Vercel AI SDK v6 (`generateObject`) + Claude via AI Gateway, Zod, Vitest + @testing-library/react (new), Tailwind + FLO design tokens.

**Spec:** [`docs/superpowers/specs/2026-06-16-milestone-input-ux-design.md`](../specs/2026-06-16-milestone-input-ux-design.md)

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `supabase/migrations/023_milestone_source.sql` | `milestones.source` column | ✅ committed (apply in Task 2) |
| `lib/holidays.ts` | Holiday data + working-day primitives (extracted from DateRangePicker) | Create |
| `components/DateRangePicker.tsx` | Import primitives from `lib/holidays.ts` (DRY) | Modify |
| `lib/milestone-schedule.ts` | Relative (offset/duration in working days) → absolute dates | Create |
| `lib/milestone-templates.ts` | Built-in presets (relative) | Create |
| `lib/milestone-ai.ts` | Zod schema + prompt builder for AI generation (pure) | Create |
| `lib/milestone-batch.ts` | Normalize/validate draft rows into insert payloads (pure) | Create |
| `lib/types.ts` | `MilestoneSource` + `Milestone.source` | Modify |
| `app/api/milestones/generate/route.ts` | Thin handler: auth → read charter → generateObject | Create |
| `app/api/milestones/batch/route.ts` | Thin handler: auth → insert parents → children → syncParentDates | Create |
| `app/api/milestones/route.ts` | POST writes `source: 'manual'` | Modify |
| `components/milestones/MilestoneDraftRow.tsx` | One editable draft row | Create |
| `components/milestones/MilestoneDraftDrawer.tsx` | Drawer shell: tabs + draft list + batch save | Create |
| `app/(champion)/my-project/charter/CharterClient.tsx` | Replace `+ 추가` toggle with `+ 마일스톤 추가 ▾` menu opening the drawer | Modify |
| Test infra | `vitest.config.ts`, `test/setup.ts`, package scripts | Create |

---

## Task 1: Set up Vitest test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Create: `test/smoke.test.ts`
- Modify: `package.json` (scripts + devDeps)

- [ ] **Step 1: Install test dependencies**

Run:
```bash
bun add -d vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```
Expected: deps added to `package.json` devDependencies.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'slides'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 3: Create `test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Add scripts to `package.json`**

In the `"scripts"` block add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create smoke test `test/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest'

describe('test infra', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Run smoke test**

Run: `bun run test`
Expected: PASS — 1 passed.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts test/setup.ts test/smoke.test.ts package.json bun.lock
git commit -m "[AX-1] test: vitest + testing-library 설정"
```

---

## Task 2: Apply migration + add `source` to types

**Files:**
- Modify: `lib/types.ts`
- Apply: `supabase/migrations/023_milestone_source.sql` (already committed)

- [ ] **Step 1: Apply the migration to the database**

Run the SQL in `supabase/migrations/023_milestone_source.sql` against the Supabase project (via Supabase SQL editor or the team's migration runner). The file content is:
```sql
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai', 'template'));
```
Expected: column `source` exists on `milestones`, existing rows = `'manual'`.

- [ ] **Step 2: Add `MilestoneSource` type and field in `lib/types.ts`**

Find the `Milestone` interface (around line 69) and the status type exports. Add the type near the other milestone enums:
```ts
export type MilestoneSource = 'manual' | 'ai' | 'template'
```
Inside `interface Milestone`, add after `display_order: number`:
```ts
  source: MilestoneSource
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no new errors). If `typecheck` script is absent, run `bunx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "[AX-1] feat: milestone source 타입 추가"
```

---

## Task 3: Extract holiday/working-day primitives to `lib/holidays.ts`

**Files:**
- Create: `lib/holidays.ts`
- Modify: `components/DateRangePicker.tsx`
- Test: `test/lib/holidays.test.ts`

Rationale: the AI/template schedule logic must run server-side and in pure tests, but the holiday data + working-day math currently live inside the `'use client'` `DateRangePicker.tsx`. Move the pure pieces to a shared module; `DateRangePicker` re-imports them.

- [ ] **Step 1: Write the failing test `test/lib/holidays.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { toKey, parseKey, isWorkingDay, countWorkingDays } from '@/lib/holidays'

describe('holidays primitives', () => {
  it('toKey/parseKey round-trip', () => {
    expect(toKey(parseKey('2026-06-16'))).toBe('2026-06-16')
  })
  it('weekends are not working days', () => {
    expect(isWorkingDay(parseKey('2026-06-20'))).toBe(false) // Saturday
    expect(isWorkingDay(parseKey('2026-06-21'))).toBe(false) // Sunday
  })
  it('Korean holiday is not a working day (현충일 2026-06-06)', () => {
    expect(isWorkingDay(parseKey('2026-06-06'))).toBe(false)
  })
  it('a normal weekday is a working day', () => {
    expect(isWorkingDay(parseKey('2026-06-16'))).toBe(true) // Tuesday
  })
  it('countWorkingDays excludes weekend (Mon–Fri = 5)', () => {
    expect(countWorkingDays('2026-06-15', '2026-06-19')).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/lib/holidays.test.ts`
Expected: FAIL — cannot resolve `@/lib/holidays`.

- [ ] **Step 3: Create `lib/holidays.ts`**

Move `HOLIDAYS_FALLBACK`, `toKey`, `parseKey`, `countWorkingDays` out of `DateRangePicker.tsx` verbatim (copy the full `HOLIDAYS_FALLBACK` map from the component) and add `isWorkingDay`. NO `'use client'` directive.
```ts
// Pure date/holiday helpers shared by DateRangePicker and milestone scheduling.
export const HOLIDAYS_FALLBACK: Record<string, string> = {
  // ... copy the full map (2026–2027) from DateRangePicker.tsx verbatim ...
}

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseKey(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isWorkingDay(d: Date, holidays: Record<string, string> = HOLIDAYS_FALLBACK): boolean {
  const dow = d.getDay()
  if (dow === 0 || dow === 6) return false
  return !holidays[toKey(d)]
}

export function countWorkingDays(start: string, end: string, holidays: Record<string, string> = HOLIDAYS_FALLBACK): number {
  if (!start || !end) return 0
  const s = parseKey(start)
  const e = parseKey(end)
  if (s > e) return 0
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6 && !holidays[toKey(cur)]) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test test/lib/holidays.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `DateRangePicker.tsx` to import from the shared module**

In `components/DateRangePicker.tsx`: delete the local `HOLIDAYS_FALLBACK`, `toKey`, `parseKey`, and `countWorkingDays` definitions. Add at the top (after `'use client'`):
```ts
import { HOLIDAYS_FALLBACK, toKey, parseKey, countWorkingDays } from '@/lib/holidays'
```
Keep `countWorkingDays` re-exported if other files import it from the component:
```ts
export { countWorkingDays } from '@/lib/holidays'
```

- [ ] **Step 6: Verify nothing else broke**

Run: `bun run typecheck && bun run build`
Expected: PASS. (Build catches any other importer of the moved symbols.)

- [ ] **Step 7: Commit**

```bash
git add lib/holidays.ts components/DateRangePicker.tsx test/lib/holidays.test.ts
git commit -m "[AX-1] refactor: 공휴일·워킹데이 로직 lib/holidays로 추출"
```

---

## Task 4: `lib/milestone-schedule.ts` — relative → absolute dates

**Files:**
- Create: `lib/milestone-schedule.ts`
- Test: `test/lib/milestone-schedule.test.ts`

- [ ] **Step 1: Write the failing test `test/lib/milestone-schedule.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { nextWorkingDay, addWorkingDays, scheduleRelativeMilestones } from '@/lib/milestone-schedule'

describe('milestone schedule', () => {
  it('nextWorkingDay rolls a Saturday to Monday', () => {
    expect(nextWorkingDay('2026-06-20')).toBe('2026-06-22') // Sat -> Mon
  })
  it('addWorkingDays(0) returns the first working day on/after', () => {
    expect(addWorkingDays('2026-06-16', 0)).toBe('2026-06-16') // Tue
  })
  it('addWorkingDays skips the weekend', () => {
    // Fri 2026-06-19 + 1 working day -> Mon 2026-06-22
    expect(addWorkingDays('2026-06-19', 1)).toBe('2026-06-22')
  })
  it('schedules a top-level milestone: offset 0, duration 5 working days', () => {
    const out = scheduleRelativeMilestones('2026-06-16', [
      { title: 'A', offset_days: 0, duration_days: 5 },
    ])
    // Tue 6/16 .. Mon 6/22 (5 working days: 16,17,18,19,22)
    expect(out[0].start_date).toBe('2026-06-16')
    expect(out[0].due_date).toBe('2026-06-22')
  })
  it('schedules children relative to project start and preserves order', () => {
    const out = scheduleRelativeMilestones('2026-06-16', [
      { title: 'P', offset_days: 0, duration_days: 3, children: [
        { title: 'C1', offset_days: 0, duration_days: 2 },
      ] },
    ])
    expect(out[0].children?.[0].start_date).toBe('2026-06-16')
    expect(out[0].children?.[0].due_date).toBe('2026-06-17')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/lib/milestone-schedule.test.ts`
Expected: FAIL — cannot resolve `@/lib/milestone-schedule`.

- [ ] **Step 3: Create `lib/milestone-schedule.ts`**

```ts
import { HOLIDAYS_FALLBACK, toKey, parseKey, isWorkingDay } from '@/lib/holidays'

type Holidays = Record<string, string>

export function nextWorkingDay(key: string, holidays: Holidays = HOLIDAYS_FALLBACK): string {
  const d = parseKey(key)
  while (!isWorkingDay(d, holidays)) d.setDate(d.getDate() + 1)
  return toKey(d)
}

// addWorkingDays(key, 0) === nextWorkingDay(key); each step advances to the next working day.
export function addWorkingDays(key: string, n: number, holidays: Holidays = HOLIDAYS_FALLBACK): string {
  const d = parseKey(key)
  while (!isWorkingDay(d, holidays)) d.setDate(d.getDate() + 1)
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    if (isWorkingDay(d, holidays)) added++
  }
  return toKey(d)
}

export interface RelativeMilestone {
  title: string
  description?: string
  offset_days: number   // start offset from project start, in working days
  duration_days: number // length in working days (>= 1)
  children?: RelativeMilestone[]
}

export interface ScheduledMilestone {
  title: string
  description?: string
  start_date: string
  due_date: string
  children?: ScheduledMilestone[]
}

function scheduleOne(projectStart: string, m: RelativeMilestone, holidays: Holidays): ScheduledMilestone {
  const start = addWorkingDays(projectStart, m.offset_days, holidays)
  const due = addWorkingDays(start, Math.max(1, m.duration_days) - 1, holidays)
  return {
    title: m.title,
    description: m.description,
    start_date: start,
    due_date: due,
    children: m.children?.map(c => scheduleOne(projectStart, c, holidays)),
  }
}

export function scheduleRelativeMilestones(
  startDate: string,
  milestones: RelativeMilestone[],
  holidays: Holidays = HOLIDAYS_FALLBACK,
): ScheduledMilestone[] {
  const projectStart = nextWorkingDay(startDate, holidays)
  return milestones.map(m => scheduleOne(projectStart, m, holidays))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test test/lib/milestone-schedule.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add lib/milestone-schedule.ts test/lib/milestone-schedule.test.ts
git commit -m "[AX-1] feat: 상대 기간→절대 날짜 스케줄러 (워킹데이)"
```

---

## Task 5: `lib/milestone-templates.ts` — presets

**Files:**
- Create: `lib/milestone-templates.ts`
- Test: `test/lib/milestone-templates.test.ts`

- [ ] **Step 1: Write the failing test `test/lib/milestone-templates.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { TEMPLATES, getTemplate } from '@/lib/milestone-templates'
import { scheduleRelativeMilestones } from '@/lib/milestone-schedule'

describe('milestone templates', () => {
  it('exposes the three presets by id', () => {
    expect(TEMPLATES.map(t => t.id).sort()).toEqual(['launch', 'research', 'sprint'])
  })
  it('getTemplate returns relative milestones', () => {
    const t = getTemplate('launch')
    expect(t).toBeTruthy()
    expect(t!.milestones.length).toBeGreaterThan(0)
    expect(t!.milestones[0]).toHaveProperty('duration_days')
  })
  it('a template schedules into valid dated milestones', () => {
    const out = scheduleRelativeMilestones('2026-06-16', getTemplate('sprint')!.milestones)
    expect(out.every(m => m.start_date <= m.due_date)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/lib/milestone-templates.test.ts`
Expected: FAIL — cannot resolve `@/lib/milestone-templates`.

- [ ] **Step 3: Create `lib/milestone-templates.ts`**

```ts
import type { RelativeMilestone } from '@/lib/milestone-schedule'

export interface MilestoneTemplate {
  id: 'launch' | 'research' | 'sprint'
  label: string
  milestones: RelativeMilestone[]
}

// Durations/offsets are in WORKING days. 1 week ≈ 5 working days.
export const TEMPLATES: MilestoneTemplate[] = [
  {
    id: 'launch',
    label: '제품 출시',
    milestones: [
      { title: '리서치 & 정의', offset_days: 0, duration_days: 5 },
      { title: '설계', offset_days: 5, duration_days: 5 },
      { title: 'MVP 개발', offset_days: 10, duration_days: 15 },
      { title: '베타 테스트', offset_days: 25, duration_days: 10 },
      { title: '출시 준비', offset_days: 35, duration_days: 5 },
    ],
  },
  {
    id: 'research',
    label: '리서치 → MVP → 검증',
    milestones: [
      { title: '문제 리서치', offset_days: 0, duration_days: 10 },
      { title: 'MVP 개발', offset_days: 10, duration_days: 15 },
      { title: '사용자 검증', offset_days: 25, duration_days: 10 },
    ],
  },
  {
    id: 'sprint',
    label: '스프린트 / 해커톤',
    milestones: [
      { title: '기획', offset_days: 0, duration_days: 1 },
      { title: '개발', offset_days: 1, duration_days: 3 },
      { title: '데모 준비', offset_days: 4, duration_days: 1 },
    ],
  },
]

export function getTemplate(id: string): MilestoneTemplate | undefined {
  return TEMPLATES.find(t => t.id === id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test test/lib/milestone-templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/milestone-templates.ts test/lib/milestone-templates.test.ts
git commit -m "[AX-1] feat: 마일스톤 템플릿 프리셋 3종"
```

---

## Task 6: `lib/milestone-ai.ts` — Zod schema + prompt builder

**Files:**
- Create: `lib/milestone-ai.ts`
- Test: `test/lib/milestone-ai.test.ts`

- [ ] **Step 1: Write the failing test `test/lib/milestone-ai.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { GenerationOutputSchema, buildGenerationPrompt } from '@/lib/milestone-ai'

describe('milestone-ai', () => {
  it('schema accepts valid AI output', () => {
    const parsed = GenerationOutputSchema.safeParse({
      milestones: [
        { title: 'A', offset_days: 0, duration_days: 5,
          children: [{ title: 'A1', offset_days: 0, duration_days: 2 }] },
      ],
    })
    expect(parsed.success).toBe(true)
  })
  it('schema rejects negative duration', () => {
    const parsed = GenerationOutputSchema.safeParse({
      milestones: [{ title: 'A', offset_days: 0, duration_days: 0 }],
    })
    expect(parsed.success).toBe(false)
  })
  it('prompt includes charter content when provided', () => {
    const p = buildGenerationPrompt(
      { problem: '느린 결제', goal: '결제 3초 이내' },
      '8주 일정으로',
    )
    expect(p).toContain('느린 결제')
    expect(p).toContain('결제 3초 이내')
    expect(p).toContain('8주 일정으로')
  })
  it('prompt is robust when charter is empty', () => {
    const p = buildGenerationPrompt({}, undefined)
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/lib/milestone-ai.test.ts`
Expected: FAIL — cannot resolve `@/lib/milestone-ai`.

- [ ] **Step 3: Create `lib/milestone-ai.ts`**

```ts
import { z } from 'zod'

const ChildSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  offset_days: z.number().int().min(0),
  duration_days: z.number().int().min(1),
})

const MilestoneSchema = ChildSchema.extend({
  children: z.array(ChildSchema).optional(),
})

export const GenerationOutputSchema = z.object({
  milestones: z.array(MilestoneSchema).min(1),
})

export type GenerationOutput = z.infer<typeof GenerationOutputSchema>

export interface CharterContent {
  summary?: string
  problem?: string
  user?: string
  goal?: string
  solution?: string
  build?: string
}

const FIELD_LABELS: Array<[keyof CharterContent, string]> = [
  ['problem', '문제'],
  ['user', '사용자'],
  ['goal', '목표'],
  ['solution', '솔루션'],
  ['build', '빌드 계획'],
]

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function buildGenerationPrompt(charter: CharterContent, userPrompt?: string): string {
  const lines: string[] = [
    '당신은 프로젝트 매니저입니다. 아래 정보를 바탕으로 실행 가능한 마일스톤 계획을 만드세요.',
    '규칙:',
    '- 절대 날짜를 만들지 마세요. 기간은 working days 기준의 offset_days(프로젝트 시작 기준 시작 오프셋)와 duration_days(기간)로만 표현합니다.',
    '- 5~8개의 최상위 마일스톤. 필요하면 각 항목에 1단계 깊이의 children을 둡니다.',
    '- 제목은 한국어로 간결하게.',
  ]
  const charterLines = FIELD_LABELS
    .filter(([k]) => charter[k] && stripHtml(charter[k]!))
    .map(([k, label]) => `- ${label}: ${stripHtml(charter[k]!)}`)
  if (charterLines.length) {
    lines.push('', '[Charter 내용]', ...charterLines)
  } else {
    lines.push('', '[Charter 내용 없음 — 일반적인 프로젝트 가정]')
  }
  if (userPrompt && userPrompt.trim()) {
    lines.push('', `[추가 요청] ${userPrompt.trim()}`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test test/lib/milestone-ai.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/milestone-ai.ts test/lib/milestone-ai.test.ts
git commit -m "[AX-1] feat: AI 생성 스키마·프롬프트 빌더"
```

---

## Task 7: `POST /api/milestones/generate` route

**Files:**
- Create: `app/api/milestones/generate/route.ts`

Note: this is a thin handler over the pure pieces tested in Task 6 + the schedule in Task 4. It calls the AI SDK `generateObject`. We verify it via typecheck/build; the testable logic is already covered.

- [ ] **Step 1: Install the AI SDK**

Run:
```bash
bun add ai
```
Expected: `ai` added to dependencies. (Zod is already present via Task 6; if not, `bun add zod`.)

- [ ] **Step 2: Create `app/api/milestones/generate/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { GenerationOutputSchema, buildGenerationPrompt, type CharterContent } from '@/lib/milestone-ai'
import { scheduleRelativeMilestones } from '@/lib/milestone-schedule'

const MODEL = process.env.MILESTONE_AI_MODEL ?? 'anthropic/claude-haiku-4-5'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const prompt: string | undefined = body?.prompt
  const useCharter: boolean = body?.useCharter !== false
  const startDate: string = body?.startDate || new Date().toISOString().slice(0, 10)

  let charter: CharterContent = {}
  if (useCharter) {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('charter_submissions')
      .select('content')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    charter = (data?.content as CharterContent) ?? {}
  }

  const fullPrompt = buildGenerationPrompt(charter, prompt)

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({
        model: MODEL,
        schema: GenerationOutputSchema,
        prompt: fullPrompt,
      })
      const scheduled = scheduleRelativeMilestones(startDate, object.milestones)
      return NextResponse.json({ milestones: scheduled })
    } catch (err) {
      if (attempt === 1) {
        return NextResponse.json({ error: 'generation_failed' }, { status: 502 })
      }
    }
  }
  return NextResponse.json({ error: 'generation_failed' }, { status: 502 })
}
```

- [ ] **Step 3: Add env var documentation**

Append to `.env.local.example` (create if absent) — do NOT put real secrets:
```
# 마일스톤 AI 생성 (Vercel AI Gateway)
AI_GATEWAY_API_KEY=
MILESTONE_AI_MODEL=anthropic/claude-haiku-4-5
```

- [ ] **Step 4: Typecheck + build**

Run: `bun run typecheck && bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/milestones/generate/route.ts .env.local.example package.json bun.lock
git commit -m "[AX-1] feat: /api/milestones/generate (Charter 기반 AI 생성)"
```

---

## Task 8: `lib/milestone-batch.ts` — normalize draft rows (pure)

**Files:**
- Create: `lib/milestone-batch.ts`
- Test: `test/lib/milestone-batch.test.ts`

- [ ] **Step 1: Write the failing test `test/lib/milestone-batch.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { normalizeBatch, type BatchInput } from '@/lib/milestone-batch'

const valid: BatchInput[] = [
  { title: 'Parent', start_date: '2026-06-16', due_date: '2026-06-20', source: 'ai',
    children: [{ title: 'Child', start_date: '2026-06-16', due_date: '2026-06-17', source: 'ai' }] },
]

describe('normalizeBatch', () => {
  it('accepts valid rows and counts total', () => {
    const r = normalizeBatch(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.parents[0].children.length).toBe(1)
  })
  it('rejects empty input', () => {
    expect(normalizeBatch([]).ok).toBe(false)
  })
  it('rejects a row without a title', () => {
    const r = normalizeBatch([{ title: '  ', start_date: null, due_date: null, source: 'manual' }])
    expect(r.ok).toBe(false)
  })
  it('rejects start_date after due_date', () => {
    const r = normalizeBatch([{ title: 'X', start_date: '2026-06-20', due_date: '2026-06-16', source: 'manual' }])
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/lib/milestone-batch.test.ts`
Expected: FAIL — cannot resolve `@/lib/milestone-batch`.

- [ ] **Step 3: Create `lib/milestone-batch.ts`**

```ts
import type { MilestoneSource } from '@/lib/types'

export interface BatchInput {
  title: string
  description?: string | null
  start_date: string | null
  due_date: string | null
  source: MilestoneSource
  children?: BatchInput[]
}

export interface NormalizedParent {
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  source: MilestoneSource
  children: Omit<NormalizedParent, 'children'>[]
}

export type NormalizeResult =
  | { ok: true; parents: NormalizedParent[]; total: number }
  | { ok: false; error: string }

function validateOne(m: BatchInput): string | null {
  if (!m.title || !m.title.trim()) return '제목은 필수입니다.'
  if (m.start_date && m.due_date && m.start_date > m.due_date) return '시작일이 종료일보다 늦습니다.'
  return null
}

export function normalizeBatch(rows: BatchInput[]): NormalizeResult {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '저장할 마일스톤이 없습니다.' }
  const parents: NormalizedParent[] = []
  let total = 0
  for (const m of rows) {
    const err = validateOne(m)
    if (err) return { ok: false, error: err }
    total++
    const children: Omit<NormalizedParent, 'children'>[] = []
    for (const c of m.children ?? []) {
      const cErr = validateOne(c)
      if (cErr) return { ok: false, error: cErr }
      total++
      children.push({
        title: c.title.trim(),
        description: c.description ?? null,
        start_date: c.start_date,
        due_date: c.due_date,
        source: c.source,
      })
    }
    parents.push({
      title: m.title.trim(),
      description: m.description ?? null,
      start_date: m.start_date,
      due_date: m.due_date,
      source: m.source,
      children,
    })
  }
  return { ok: true, parents, total }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test test/lib/milestone-batch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/milestone-batch.ts test/lib/milestone-batch.test.ts
git commit -m "[AX-1] feat: batch 정규화·검증 유틸"
```

---

## Task 9: `POST /api/milestones/batch` route

**Files:**
- Create: `app/api/milestones/batch/route.ts`

- [ ] **Step 1: Create `app/api/milestones/batch/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeBatch, type BatchInput } from '@/lib/milestone-batch'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const result = normalizeBatch((body?.milestones ?? []) as BatchInput[])
  if (!result.ok) {
    return NextResponse.json({ error: 'validation_failed', message: result.error }, { status: 400 })
  }

  const supabase = createServiceClient()
  const createdIds: string[] = []

  try {
    const created = []
    for (const parent of result.parents) {
      const { data: p, error: pErr } = await supabase
        .from('milestones')
        .insert({
          user_id: user.id,
          title: parent.title,
          description: parent.description,
          start_date: parent.start_date,
          due_date: parent.due_date,
          source: parent.source,
          publish_status: 'published',
          parent_milestone_id: null,
        })
        .select()
        .single()
      if (pErr || !p) throw new Error(pErr?.message ?? 'parent insert failed')
      createdIds.push(p.id)
      created.push(p)

      for (const child of parent.children) {
        const { data: c, error: cErr } = await supabase
          .from('milestones')
          .insert({
            user_id: user.id,
            title: child.title,
            description: child.description,
            start_date: child.start_date,
            due_date: child.due_date,
            source: child.source,
            publish_status: 'published',
            parent_milestone_id: p.id,
          })
          .select()
          .single()
        if (cErr || !c) throw new Error(cErr?.message ?? 'child insert failed')
        createdIds.push(c.id)
        created.push(c)
      }
    }
    return NextResponse.json({ milestones: created }, { status: 201 })
  } catch (err) {
    // Roll back everything created in this batch so the user never sees a partial save.
    if (createdIds.length) {
      await supabase.from('milestones').delete().in('id', createdIds).eq('user_id', user.id)
    }
    return NextResponse.json({ error: 'batch_failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck + build**

Run: `bun run typecheck && bun run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/milestones/batch/route.ts
git commit -m "[AX-1] feat: /api/milestones/batch (일괄 저장 + 롤백)"
```

---

## Task 10: Set `source: 'manual'` on the existing single-create route

**Files:**
- Modify: `app/api/milestones/route.ts`

- [ ] **Step 1: Add `source` to the insert in `POST`**

In `app/api/milestones/route.ts`, find the `.insert({ ... })` inside `POST` and add `source: 'manual',` after `parent_milestone_id: parent_milestone_id ?? null,`:
```ts
      parent_milestone_id: parent_milestone_id ?? null,
      source: 'manual',
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/milestones/route.ts
git commit -m "[AX-1] feat: 단일 생성 시 source=manual 기록"
```

---

## Task 11: `MilestoneDraftRow` component

**Files:**
- Create: `components/milestones/MilestoneDraftRow.tsx`

This is a controlled, editable row. It reuses `DateRangePicker`. State is owned by the parent drawer.

- [ ] **Step 1: Create `components/milestones/MilestoneDraftRow.tsx`**

```tsx
'use client'
import DateRangePicker from '@/components/DateRangePicker'

export interface DraftMilestone {
  tempId: string
  title: string
  description?: string
  start_date: string | null
  due_date: string | null
  source: 'manual' | 'ai' | 'template'
  children?: DraftMilestone[]
}

const INPUT: React.CSSProperties = {
  fontSize: 13, padding: '6px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'var(--background)',
  color: 'var(--text-primary)', width: '100%',
}

export default function MilestoneDraftRow({
  row, isChild = false, onChange, onRemove,
}: {
  row: DraftMilestone
  isChild?: boolean
  onChange: (next: DraftMilestone) => void
  onRemove: () => void
}) {
  const titleError = !row.title.trim()
  return (
    <div className="flex flex-col gap-2 py-2" style={{ paddingLeft: isChild ? 20 : 0 }}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={row.title}
          onChange={e => onChange({ ...row, title: e.target.value })}
          placeholder={isChild ? '서브 마일스톤 이름' : '마일스톤 이름'}
          style={{ ...INPUT, borderColor: titleError ? 'var(--red-500, #ef4444)' : 'var(--border)' }}
        />
        <button type="button" onClick={onRemove} aria-label="삭제"
          className="text-xs px-2 py-1 rounded" style={{ color: 'var(--text-secondary)' }}>✕</button>
      </div>
      <DateRangePicker
        startDate={row.start_date}
        endDate={row.due_date}
        onChange={(s, e) => onChange({ ...row, start_date: s, due_date: e })}
      />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/milestones/MilestoneDraftRow.tsx
git commit -m "[AX-1] feat: MilestoneDraftRow 편집 행 컴포넌트"
```

---

## Task 12: `MilestoneDraftDrawer` component

**Files:**
- Create: `components/milestones/MilestoneDraftDrawer.tsx`
- Test: `test/components/MilestoneDraftDrawer.test.tsx`

- [ ] **Step 1: Write the failing test `test/components/MilestoneDraftDrawer.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MilestoneDraftDrawer from '@/components/milestones/MilestoneDraftDrawer'

// DateRangePicker calls fetch on mount; stub it.
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as any))

describe('MilestoneDraftDrawer', () => {
  it('renders the three method tabs when open', () => {
    render(<MilestoneDraftDrawer open onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('AI로 생성')).toBeInTheDocument()
    expect(screen.getByText('템플릿에서')).toBeInTheDocument()
    expect(screen.getByText('직접 입력')).toBeInTheDocument()
  })

  it('direct tab adds an empty draft row and disables save until a title exists', () => {
    render(<MilestoneDraftDrawer open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('직접 입력'))
    fireEvent.click(screen.getByText('+ 행 추가'))
    const saveBtn = screen.getByRole('button', { name: /저장/ })
    expect(saveBtn).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/components/MilestoneDraftDrawer.test.tsx`
Expected: FAIL — cannot resolve `@/components/milestones/MilestoneDraftDrawer`.

- [ ] **Step 3: Create `components/milestones/MilestoneDraftDrawer.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { Milestone } from '@/lib/types'
import { TEMPLATES } from '@/lib/milestone-templates'
import { scheduleRelativeMilestones } from '@/lib/milestone-schedule'
import MilestoneDraftRow, { type DraftMilestone } from './MilestoneDraftRow'

type Tab = 'ai' | 'template' | 'direct'
type Scheduled = { title: string; description?: string; start_date: string; due_date: string; children?: Scheduled[] }

let counter = 0
function tempId(): string { counter += 1; return `draft-${counter}` }

function toDraft(s: Scheduled, source: DraftMilestone['source']): DraftMilestone {
  return {
    tempId: tempId(), title: s.title, description: s.description,
    start_date: s.start_date, due_date: s.due_date, source,
    children: s.children?.map(c => toDraft(c, source)),
  }
}

function today(): string { return new Date().toISOString().slice(0, 10) }

export default function MilestoneDraftDrawer({
  open, onClose, onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: (created: Milestone[]) => void
}) {
  const [tab, setTab] = useState<Tab>('ai')
  const [rows, setRows] = useState<DraftMilestone[]>([])
  const [prompt, setPrompt] = useState('')
  const [useCharter, setUseCharter] = useState(true)
  const [startDate, setStartDate] = useState(today())
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const hasInvalid = rows.length === 0 || rows.some(r => !r.title.trim() ||
    (r.children ?? []).some(c => !c.title.trim()))

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { milestones } = await apiFetch<{ milestones: Scheduled[] }>('/api/milestones/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, useCharter, startDate }),
      })
      setRows(milestones.map(m => toDraft(m, 'ai')))
    } catch {
      toast.error('초안 생성에 실패했어요. 다시 시도하거나 템플릿을 사용해 주세요.')
    } finally {
      setGenerating(false)
    }
  }

  function handleTemplate(id: string) {
    const t = TEMPLATES.find(x => x.id === id)
    if (!t) return
    const scheduled = scheduleRelativeMilestones(startDate, t.milestones) as Scheduled[]
    setRows(scheduled.map(m => toDraft(m, 'template')))
  }

  function addEmptyRow() {
    setRows(prev => [...prev, {
      tempId: tempId(), title: '', start_date: null, due_date: null, source: 'manual',
    }])
  }

  function updateRow(i: number, next: DraftMilestone) {
    setRows(prev => prev.map((r, idx) => idx === i ? next : r))
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = rows.map(r => ({
        title: r.title, description: r.description ?? null,
        start_date: r.start_date, due_date: r.due_date, source: r.source,
        children: (r.children ?? []).map(c => ({
          title: c.title, description: c.description ?? null,
          start_date: c.start_date, due_date: c.due_date, source: c.source,
        })),
      }))
      const { milestones } = await apiFetch<{ milestones: Milestone[] }>('/api/milestones/batch', {
        method: 'POST',
        body: JSON.stringify({ milestones: payload }),
      })
      toast.success(`${milestones.length}개 마일스톤을 저장했어요.`)
      onSaved(milestones)
      setRows([])
      onClose()
    } catch {
      toast.error('저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  const TAB_BTN = (t: Tab, label: string) => (
    <button type="button" onClick={() => setTab(t)}
      className="text-xs px-3 py-1.5 rounded-full font-semibold"
      style={{
        background: tab === t ? 'var(--blue-600)' : 'transparent',
        color: tab === t ? '#fff' : 'var(--text-secondary)',
        border: tab === t ? 'none' : '1px solid var(--border)',
      }}>{label}</button>
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="h-full w-full max-w-md flex flex-col"
        style={{ background: 'var(--background)', borderLeft: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>마일스톤 추가</h3>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ color: 'var(--text-secondary)' }}>✕</button>
        </div>

        <div className="flex gap-2 px-4 py-3">
          {TAB_BTN('ai', 'AI로 생성')}
          {TAB_BTN('template', '템플릿에서')}
          {TAB_BTN('direct', '직접 입력')}
        </div>

        <div className="px-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          {tab === 'ai' && (
            <div className="flex flex-col gap-2">
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2}
                placeholder="(선택) 예: 8주 출시 일정, 격주 데모 포함"
                style={{ fontSize: 13, padding: 8, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)' }} />
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={useCharter} onChange={e => setUseCharter(e.target.checked)} />
                Charter 내용 활용
              </label>
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                시작일 <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)' }} />
              </label>
              <button type="button" onClick={handleGenerate} disabled={generating}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50 self-start"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>
                {generating ? '생성 중…' : '✨ 생성'}
              </button>
            </div>
          )}
          {tab === 'template' && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                시작일 <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)' }} />
              </label>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} type="button" onClick={() => handleTemplate(t.id)}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>{t.label}</button>
                ))}
              </div>
            </div>
          )}
          {tab === 'direct' && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>아래에서 행을 직접 추가하세요.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {rows.map((r, i) => (
            <div key={r.tempId} className="border-b" style={{ borderColor: 'var(--border)' }}>
              <MilestoneDraftRow row={r} onChange={n => updateRow(i, n)} onRemove={() => removeRow(i)} />
              {(r.children ?? []).map((c, ci) => (
                <MilestoneDraftRow key={c.tempId} row={c} isChild
                  onChange={n => updateRow(i, { ...r, children: r.children!.map((x, xi) => xi === ci ? n : x) })}
                  onRemove={() => updateRow(i, { ...r, children: r.children!.filter((_, xi) => xi !== ci) })} />
              ))}
            </div>
          ))}
          <button type="button" onClick={addEmptyRow}
            className="text-xs px-3 py-1.5 rounded-full mt-3"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>+ 행 추가</button>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>취소</button>
          <button type="button" onClick={handleSave} disabled={hasInvalid || saving}
            className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}>
            {saving ? '저장 중…' : `${rows.length}개 마일스톤 저장`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test test/components/MilestoneDraftDrawer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/milestones/MilestoneDraftDrawer.tsx test/components/MilestoneDraftDrawer.test.tsx
git commit -m "[AX-1] feat: MilestoneDraftDrawer (탭+초안 목록+일괄 저장)"
```

---

## Task 13: Wire the drawer into `TimelineSection`

**Files:**
- Modify: `app/(champion)/my-project/charter/CharterClient.tsx`

The `TimelineSection` (around line 155) currently has a `+ 추가` button toggling `showForm`. Add a `+ 마일스톤 추가 ▾` menu that opens the drawer, while keeping the existing inline add form for backward-compatible direct entry.

- [ ] **Step 1: Import the drawer**

At the top of `CharterClient.tsx`, near the other imports (e.g. after `import DateRangePicker from '@/components/DateRangePicker'`):
```ts
import MilestoneDraftDrawer from '@/components/milestones/MilestoneDraftDrawer'
```

- [ ] **Step 2: Add drawer state inside `TimelineSection`**

Find the `TimelineSection` function (line ~155) and its state hooks (e.g. `const [showForm, setShowForm] = useState(false)`). Add:
```ts
  const [drawerOpen, setDrawerOpen] = useState(false)
```

- [ ] **Step 3: Replace the `+ 추가` button with a menu trigger**

Find the button (around line 384) that toggles `showForm`:
```tsx
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="text-xs px-2.5 py-1 rounded font-semibold"
          style={{
            background: showForm ? 'transparent' : 'var(--blue-600)',
            color: showForm ? 'var(--text-secondary)' : '#fff',
            border: showForm ? '1px solid var(--border)' : 'none',
          }}
        >
          {showForm ? '취소' : '+ 추가'}
        </button>
```
Replace it with two buttons (primary opens the drawer; the inline quick-add remains as a secondary toggle):
```tsx
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="text-xs px-2.5 py-1 rounded font-semibold"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none' }}
          >
            + 마일스톤 추가
          </button>
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            className="text-xs px-2.5 py-1 rounded"
            style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            {showForm ? '취소' : '직접 입력'}
          </button>
        </div>
```

- [ ] **Step 4: Render the drawer**

Inside `TimelineSection`'s returned JSX, just before its outermost closing tag, add:
```tsx
      <MilestoneDraftDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={created => created.forEach(onAdded)}
      />
```
Note: `onAdded` is the existing prop (see line ~851 `onAdded={m => setMilestones(prev => [...prev, m])}`). Calling it per created milestone appends each to the parent list.

- [ ] **Step 5: Typecheck + build**

Run: `bun run typecheck && bun run build`
Expected: PASS.

- [ ] **Step 6: Manual smoke (dev server)**

Run: `bun run dev`, open the charter page, click `+ 마일스톤 추가`. Verify: drawer opens, the three tabs render, template tab populates rows, save closes the drawer and the new milestones appear in the timeline. (AI tab requires `AI_GATEWAY_API_KEY`; if unset, expect the failure toast — that is correct behavior.)

- [ ] **Step 7: Commit**

```bash
git add "app/(champion)/my-project/charter/CharterClient.tsx"
git commit -m "[AX-1] feat: Charter Timeline에 마일스톤 추가 Drawer 연결"
```

---

## Task 14: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `bun run test`
Expected: PASS — all suites green (holidays, schedule, templates, ai, batch, drawer, smoke).

- [ ] **Step 2: Typecheck + lint + build**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: PASS.

- [ ] **Step 3: Commit any lint fixes (if needed)**

```bash
git add -A
git commit -m "[AX-1] chore: 마일스톤 입력 UX 정리"
```

---

## Self-Review Notes (spec coverage)

- AI generate (Charter-grounded, structure-only) → Tasks 6, 7 (`buildGenerationPrompt`, `/generate`, AI returns relative; dates via Task 4).
- Templates/presets → Task 5, surfaced in Task 12.
- Editable draft staging + batch save → Tasks 11, 12, 8, 9.
- Deterministic working-day/holiday dates → Tasks 3, 4.
- `source` tracking (manual/ai/template) → Tasks 2, 9, 10, 12.
- Error handling (AI retry+toast, validation disables save, batch rollback) → Tasks 7, 8, 9, 12.
- Tests (schedule first-priority, templates, ai schema, batch, drawer) → Tasks 3–6, 8, 12.
- Single-Drawer-with-tabs decision (approved in brainstorming) → Task 12, 13.
