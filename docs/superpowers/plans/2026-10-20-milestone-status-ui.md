# 마일스톤 현황 UI 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챔피언 마일스톤 현황 화면을 "한 줄 행 + 상태 스테퍼" 구조로 바꿔 상태 전환이 한자리에서 보이고, 카드 높이가 1/3로 줄고, 지연이 단계가 아닌 일정 표시로 분리되게 한다.

**Architecture:** 서버 페이지(`page.tsx`)와 API는 그대로 둔다. 화면 로직을 순수 함수 모듈 `lib/milestone-view.ts`로 빼고(단계·지연·D-배지·필터·요약·그룹핑), 표현은 `StageStepper` → `MilestoneRow` → `MilestonesClient` 순으로 조립한다. 완료 확인 모달은 제거하고 sonner 토스트의 `action`으로 되돌리기를 제공한다. `CheckinTab.tsx`는 삭제하고 그 안의 이슈 보고 모달만 `IssueReportDialog`로 이관한다.

**Tech Stack:** Next.js App Router, React 18, vitest + @testing-library/react(jsdom), sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-20-milestone-status-ui-design.md`

## Global Constraints

- 스키마·`computeStatus`·`/api/milestones/[id]` PATCH 변경 금지. 단계 전환 body는 스펙 §5 표 그대로.
- 색은 `app/globals.css` 변수 사용: `--accent`, `--error`, `--success`, `--amber`, `--border`, `--surface-minimal`, `--text-secondary`, `--text-disabled`. 이모지 금지(아이콘은 lucide-react 또는 인라인 SVG). 단, 스테퍼 라벨 `▶ 시작`, `✓ 시작`은 텍스트 기호로 허용.
- 데스크톱 행 그리드 `4px minmax(0,1fr) 168px 256px 32px`, 최소 높이 46px. 스테퍼 216×30(데스크톱), 전폭×34(모바일).
- "오늘"은 로컬 날짜 `YYYY-MM-DD` (기존 `MilestonesClient.todayStr` 방식, `toISOString` 금지).
- 게시(`publish_status === 'published'`)된 마일스톤만 보인다.
- 커밋 메시지 `[AX-1] type(scope): subject`, body 줄 100자 이하, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 작업은 worktree `.claude/worktrees/milestone-status-ui`, 브랜치 `feat/milestone-status-ui`.

## Review Focus

1. 과제정의서 미승인 챔피언: 스테퍼가 비활성이고 이유가 `title`로 보이며, 어떤 PATCH도 나가지 않는다. → Task 2 테스트.
2. 완료 후 "되돌리기"는 완료 전 단계로 돌아간다(진행중이었으면 진행중, 미시작이었으면 미시작). → Task 5 테스트.
3. `status === 'delayed'` 이고 `is_manual_progress === false` 인 건: 단계 미시작(`▶ 시작` 활성), D-배지 빨강, "이슈 보고" 버튼 노출. 이슈 보고 후 검토 전(`bottleneck_type` 있고 `bottleneck_reviewed_at` null)이면 버튼 대신 "이슈 검토중". → Task 1·3 테스트.
4. 필터 "지연"은 이슈 검토중 건과 시작일만 지난 미시작 건을 포함하고, "예정"·"진행중"은 지연 건을 제외한다. 요약 숫자 네 개의 합이 전체와 같다. → Task 1 테스트.
5. 상위 마일스톤(그룹 헤더)은 자식 완료 수로 진행률을 보이되 자기 자신의 스테퍼로 직접 완료할 수 있다. 자식이 없는 최상위 마일스톤은 헤더 없이 행으로 나온다. → Task 1(그룹핑)·Task 5 테스트.

---

### Task 1: 화면 로직 순수 함수 `lib/milestone-view.ts`

**Files:**
- Create: `lib/milestone-view.ts`
- Test: `test/lib/milestone-view.test.ts`

**Interfaces (Produces):**
```ts
export type Stage = 'not_started' | 'in_progress' | 'completed'
export type ViewFilter = 'all' | 'prog' | 'over' | 'todo' | 'done'
export type DueBadge = { label: string; tone: 'ok' | 'soon' | 'over' | 'muted' } | null
export interface MilestoneGroup { parent: Milestone | null; items: Milestone[] }
export interface ViewSummary { total: number; done: number; prog: number; over: number; not: number; pending: number; thisWeek: number }

export function deriveStage(m: Pick<Milestone, 'status' | 'is_manual_progress'>): Stage
export function isScheduleDelayed(m: Pick<Milestone, 'status' | 'is_manual_progress' | 'start_date' | 'due_date'>, todayStr: string): boolean
export function isIssuePending(m: Pick<Milestone, 'bottleneck_type' | 'bottleneck_reviewed_at'>): boolean
export function dueBadge(m: Pick<Milestone, 'status' | 'is_manual_progress' | 'start_date' | 'due_date'>, todayStr: string): DueBadge
export function matchesFilter(m: Milestone, filter: ViewFilter, todayStr: string): boolean
export function summarize(ms: Milestone[], todayStr: string): ViewSummary
export function groupByParent(ms: Milestone[]): MilestoneGroup[]
export function fmtRange(m: Pick<Milestone, 'start_date' | 'due_date'>): string
export function daysBetween(fromYmd: string, toYmd: string): number  // 달력 일수, 타임존 무관(Date.UTC)
```

규칙(스펙 §4, §6):
- `deriveStage`: completed→completed, in_progress→in_progress, delayed→`is_manual_progress ? in_progress : not_started`, 그 외 not_started.
- `isScheduleDelayed`: stage가 completed면 false. `status==='delayed'` 또는 `due_date < today` 또는 (`start_date < today` 이고 stage not_started).
- `dueBadge`: completed→`{label:'완료',tone:'muted'}`; `due_date` 없음→null; `d = daysBetween(today, due)`; `d<0`→`{label:\`D+${-d} 지연\`,tone:'over'}`; 지연인데 `d>=0`→`{label:'시작 지연',tone:'over'}`; `d===0`→`D-DAY` soon; `d<=7`→`D-${d}` soon; else `D-${d}` ok.
- `matchesFilter`: all→published 전체; prog→stage in_progress && !delayed; over→delayed; todo→stage not_started && !delayed; done→completed. 호출 전 published 필터는 호출자가 한다.
- `summarize`: 각 건을 done/over/prog/not 중 정확히 하나로 분류(우선순위 done > over > prog > not). `pending`은 완료 아니면서 `isIssuePending`. `thisWeek`는 완료 아니면서 `0 <= daysBetween(today, due) <= 6`.
- `groupByParent`: 입력 순서 유지. `parent_milestone_id` null이고 자식이 있는 건 → `{parent, items: 자식들}`; 자식 없는 최상위 건들 → 맨 앞 `{parent:null, items}` 그룹 하나(없으면 생략). 부모가 목록에 없는 자식은 `{parent:null}` 그룹에 넣는다.
- `fmtRange`: 기존 `CheckinTab.fmtMD` 이관. `start – due`, start 없으면 `~due`, 둘 다 없으면 `''`.

- [ ] **Step 1: 실패하는 테스트 작성** `test/lib/milestone-view.test.ts`

```ts
const base = { id: 'm', status: 'not_started', is_manual_progress: false, start_date: '2026-10-13', due_date: '2026-10-17',
  bottleneck_type: null, bottleneck_reviewed_at: null, parent_milestone_id: null, publish_status: 'published' } as Milestone
const today = '2026-10-20'

describe('deriveStage', () => {
  it('delayed + manual progress → in_progress', () => expect(deriveStage({ status: 'delayed', is_manual_progress: true })).toBe('in_progress'))
  it('delayed without manual progress → not_started', () => expect(deriveStage({ status: 'delayed', is_manual_progress: false })).toBe('not_started'))
})
describe('isScheduleDelayed', () => {
  it('start passed and not started, due in future → true', () =>
    expect(isScheduleDelayed({ ...base, due_date: '2026-10-30' }, today)).toBe(true))
  it('completed never delayed', () => expect(isScheduleDelayed({ ...base, status: 'completed' }, today)).toBe(false))
})
describe('dueBadge', () => {
  it('overdue → D+n 지연 over', () => expect(dueBadge(base, today)).toEqual({ label: 'D+3 지연', tone: 'over' }))
  it('start passed, due ahead → 시작 지연', () => expect(dueBadge({ ...base, due_date: '2026-10-30' }, today)).toEqual({ label: '시작 지연', tone: 'over' }))
  it('due today → D-DAY soon', () => expect(dueBadge({ ...base, start_date: today, due_date: today }, today)).toEqual({ label: 'D-DAY', tone: 'soon' }))
  it('due in 18 days → D-18 ok', () => expect(dueBadge({ ...base, start_date: '2026-10-27', due_date: '2026-11-07' }, today)).toEqual({ label: 'D-18', tone: 'ok' }))
  it('completed → 완료 muted; no due → null', () => {
    expect(dueBadge({ ...base, status: 'completed' }, today)).toEqual({ label: '완료', tone: 'muted' })
    expect(dueBadge({ ...base, due_date: null, start_date: null }, today)).toBeNull()
  })
})
describe('matchesFilter / summarize', () => {
  const ms = [
    { ...base, id: 'done', status: 'completed' },
    { ...base, id: 'prog', status: 'in_progress', is_manual_progress: true, start_date: '2026-10-06', due_date: '2026-10-24' },
    { ...base, id: 'overProg', status: 'delayed', is_manual_progress: true, due_date: '2026-10-15', bottleneck_type: 'technical' },
    { ...base, id: 'overNot' },
    { ...base, id: 'todo', start_date: '2026-10-27', due_date: '2026-11-07' },
  ] as Milestone[]
  it('over includes pending issue and start-passed not-started; todo/prog exclude delayed', () => {
    expect(ms.filter(m => matchesFilter(m, 'over', today)).map(m => m.id)).toEqual(['overProg', 'overNot'])
    expect(ms.filter(m => matchesFilter(m, 'prog', today)).map(m => m.id)).toEqual(['prog'])
    expect(ms.filter(m => matchesFilter(m, 'todo', today)).map(m => m.id)).toEqual(['todo'])
  })
  it('summary partitions sum to total', () => {
    const s = summarize(ms, today)
    expect(s).toEqual({ total: 5, done: 1, prog: 1, over: 2, not: 1, pending: 1, thisWeek: 1 })
  })
})
describe('groupByParent', () => {
  it('parents with children become groups; childless top-level go to a leading null group', () => {
    const p = { ...base, id: 'p' }, c1 = { ...base, id: 'c1', parent_milestone_id: 'p' }, leaf = { ...base, id: 'leaf' }
    expect(groupByParent([p, c1, leaf] as Milestone[])).toEqual([{ parent: null, items: [leaf] }, { parent: p, items: [c1] }])
  })
})
```

- [ ] **Step 2: 실패 확인** `bun run test test/lib/milestone-view.test.ts` → "Cannot find module '@/lib/milestone-view'"
- [ ] **Step 3: `lib/milestone-view.ts` 구현** (위 시그니처·규칙)
- [ ] **Step 4: 통과 확인** `bun run test test/lib/milestone-view.test.ts` → PASS
- [ ] **Step 5: 커밋** `[AX-1] feat(milestones): 현황 화면용 단계·지연·필터 순수 함수 추가`

### Task 2: `StageStepper` 컴포넌트

**Files:**
- Create: `components/milestones/StageStepper.tsx`
- Test: `test/components/StageStepper.test.tsx`

**Interfaces:**
- Consumes: `Stage` from Task 1.
- Produces:
```ts
export interface StageStepperProps {
  stage: Stage
  disabled?: boolean            // charter 미승인 등. 전체 비활성 + title
  disabledReason?: string
  size?: 'sm' | 'md'            // sm = 30px/216px(데스크톱), md = 34px/전폭(모바일)
  busy?: boolean                // PATCH 진행 중 → 모든 칸 disabled
  onStart: () => void
  onComplete: () => void
}
export function StageStepper(props: StageStepperProps): JSX.Element
```
- 세 칸은 모두 `<button type="button">`; 클릭 가능한 칸(미시작의 1칸, 진행중의 3칸)만 `disabled={false}`. 라벨은 스펙 §4 표. 컨테이너 `role="group" aria-label="진행 단계"`. 색: 진행중 채움 `var(--accent)`/흰 글자, 완료 채움 `var(--success)`/흰 글자, 흐림 `var(--text-disabled)`.

- [ ] **Step 1: 실패하는 테스트**

```ts
it('not_started: only 시작 is enabled and calls onStart', () => {
  const onStart = vi.fn(), onComplete = vi.fn()
  render(<StageStepper stage="not_started" onStart={onStart} onComplete={onComplete} />)
  fireEvent.click(screen.getByRole('button', { name: /시작/ }))
  expect(onStart).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '진행중' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '완료' })).toBeDisabled()
})
it('in_progress: 완료로 is enabled, 시작 is disabled', () => { /* click 완료로 → onComplete called, 시작 disabled */ })
it('completed: all three disabled', () => { /* getAllByRole('button') every disabled */ })
it('disabled with reason: nothing clickable, group has title', () => {
  render(<StageStepper stage="not_started" disabled disabledReason="과제정의서 승인 후 진행할 수 있습니다" onStart={vi.fn()} onComplete={vi.fn()} />)
  expect(screen.getByRole('group', { name: '진행 단계' })).toHaveAttribute('title', '과제정의서 승인 후 진행할 수 있습니다')
  expect(screen.getAllByRole('button').every(b => (b as HTMLButtonElement).disabled)).toBe(true)
})
```

- [ ] **Step 2: 실패 확인** `bun run test test/components/StageStepper.test.tsx`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `[AX-1] feat(milestones): 상태 스테퍼 컴포넌트 추가`

### Task 3: `MilestoneRow`, `IssueReportDialog`, 작업 로그 토글 `defaultExpanded`

**Files:**
- Create: `components/milestones/MilestoneRow.tsx`
- Create: `components/milestones/IssueReportDialog.tsx` (기존 `components/CheckinTab.tsx` 하단 "이슈 보고/도움 요청" Dialog + `BOTTLENECK_OPTIONS` 이관, 로직 동일)
- Modify: `components/milestones/MilestoneActivityLogToggle.tsx` — `defaultExpanded?: boolean`, `onLoaded?: (count: number) => void` prop 추가(마운트 시 `defaultExpanded`면 즉시 fetch)
- Test: `test/components/MilestoneRow.test.tsx`, `test/components/MilestoneActivityLogToggle.test.tsx`(케이스 1개 추가)

**Interfaces:**
```ts
export interface MilestoneRowProps {
  m: Milestone
  todayStr: string
  charterApproved: boolean
  busy?: boolean
  onStart: (id: string) => void
  onComplete: (id: string) => void
  onIssueClick: (m: Milestone) => void
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
  onNoteUpdate: (id: string, note: string | null) => Promise<void>
}
export function MilestoneRow(props: MilestoneRowProps): JSX.Element   // 데스크톱 행 + 펼침 패널

export interface IssueReportDialogProps {
  milestone: Milestone | null
  onClose: () => void
  onSubmit: (id: string, type: BottleneckType, note: string) => Promise<void>
}
export function IssueReportDialog(props: IssueReportDialogProps): JSX.Element
```
- 행 구조·열 폭·배지·칩·액션 클러스터는 스펙 §3. 펼침 토글 버튼 `aria-label="상세 펼치기"`/`"상세 접기"`, `aria-expanded`.
- 노트 편집 로직(`noteEditing`, Enter 저장, Esc 취소, `canEditNote = stage === 'in_progress'`)은 기존 `CheckinTab.MilestoneCard`에서 이관.
- 기한 링크: `due_date` 없음→"기한 설정"(`onDeadlineExtension(m,false)`), `start_date < today && stage not_started`→"기한 변경"(`(m,true)`), 그 외→"기한 연장"(`(m,false)`). 완료면 숨김.
- 관리자 답변(`bottleneck_reviewed_at && bottleneck_admin_comment`)은 펼침 패널 왼쪽에 기존 스타일로.

- [ ] **Step 1: 실패하는 테스트** `test/components/MilestoneRow.test.tsx` (`vi.mock('@/lib/api-client')`로 로그 fetch 차단)

```ts
it('delayed not-started row: 시작 enabled, D+ badge, 이슈 보고 button', () => {
  render(<MilestoneRow m={{ ...base, status: 'delayed' }} todayStr="2026-10-20" charterApproved {...handlers} />)
  expect(screen.getByRole('button', { name: /시작/ })).toBeEnabled()
  expect(screen.getByText('D+3 지연')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '이슈 보고' })).toBeInTheDocument()
})
it('pending issue shows 이슈 검토중 instead of the button', () => { /* bottleneck_type:'technical', reviewed_at:null */ })
it('detail panel is hidden until expanded; note shown after expand', () => {
  render(<MilestoneRow m={{ ...base, note: '보안팀 승인 대기' }} ... />)
  expect(screen.queryByText('보안팀 승인 대기')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
  expect(screen.getByText('보안팀 승인 대기')).toBeInTheDocument()
})
it('unapproved charter disables the stepper', () => { /* charterApproved={false} → group title present, no enabled stepper button */ })
```
`MilestoneActivityLogToggle.test.tsx` 추가: `defaultExpanded` 렌더 시 `apiFetch`가 즉시 1회 호출되고 `onLoaded(1)`이 불린다.

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: 구현** (`IssueReportDialog`는 이관만, `MilestoneRow`는 새로 작성, 토글 prop 추가)
- [ ] **Step 4: 통과 확인** `bun run test test/components`
- [ ] **Step 5: 커밋** `[AX-1] feat(milestones): 한 줄 마일스톤 행·펼침 패널, 이슈 보고 모달 분리`

### Task 4: `MilestoneSummary` (요약 카드 + 필터 칩)

**Files:**
- Create: `components/milestones/MilestoneSummary.tsx`
- Test: `test/components/MilestoneSummary.test.tsx`

**Interfaces:**
```ts
export interface MilestoneSummaryProps {
  summary: ViewSummary
  todayStr: string
  filter: ViewFilter
  onFilterChange: (f: ViewFilter) => void
  compact?: boolean   // 모바일: 범례·오른쪽 패널 생략
}
export function MilestoneSummary(props: MilestoneSummaryProps): JSX.Element
```
- 진행률 바는 `role="img" aria-label="전체 진행률 n%"`, 세 구간 폭 = 각 수/전체 %. 칩 5개는 `<button aria-pressed>`; 라벨 `전체 N`, `진행중 n`, `지연 n`, `예정 n`, `완료 n`. 오른쪽: `이번 주 마감 n건`, `지연 n건 · 이슈 검토중 n건`, `오늘 YYYY-MM-DD (요일)`.

- [ ] **Step 1: 실패하는 테스트** — 칩 클릭이 `onFilterChange('over')`를 호출하고 `aria-pressed`가 현재 필터에만 true; `summary.total===0`이면 진행률 0%로 NaN 없이 렌더.
- [ ] **Step 2: 실패 확인** → **Step 3: 구현** → **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `[AX-1] feat(milestones): 현황 요약 카드와 필터 칩`

### Task 5: `MilestonesClient` 재조립, 완료 모달 제거·되돌리기, `CheckinTab` 삭제

**Files:**
- Modify: `app/(champion)/my-project/milestones/MilestonesClient.tsx`
- Delete: `components/CheckinTab.tsx`
- Test: `test/components/MilestonesClient.test.tsx` (기존 케이스 유지 + 추가)

**Interfaces (Consumes):** Task 1~4 전부. 기존 props `{ initialMilestones, charterApproved, charters, currentCharterId }` 유지(page.tsx 무변경).

구현 요점:
- `published = milestones.filter(published)`; `summary = summarize(published, todayStr)`; `groups = groupByParent(published)`; 각 그룹 `items.filter(m => matchesFilter(m, filter, todayStr))`.
- 데스크톱(`hidden md:flex`): `MilestoneSummary` → 그룹마다 헤더(`<button aria-expanded>` 접기, 제목, `fmtRange(parent)`, 미니 바 `자식 완료 수/자식 수`, 오른쪽 끝 부모용 `StageStepper size="sm"`) → `MilestoneRow` 목록. `parent === null` 그룹은 헤더 없이 행만.
- 모바일(`md:hidden`): `MilestoneSummary compact` → 같은 그룹 → `MobileMilestoneCard`(Task 6).
- 핸들러: 기존 `handleCheckinInProgress`/`handleCheckinComplete` body 유지. 완료 confirm 상태·Dialog 제거. 전환 성공 시
  `toast.success(msg, { duration: 6000, action: { label: '되돌리기', onClick: () => undo(id, prevStage) } })`.
  `undo`: 스펙 §5 표의 body로 PATCH 후 상태 반영, `toast.success('되돌렸습니다.')`.
- 403 `charter_not_approved` 응답은 `toast.error('과제정의서 승인 후 진행할 수 있습니다.')`.
- `busy` id 집합으로 같은 행 연타 방지.
- 기한 변경 Dialog는 기존 그대로. 이슈 모달은 `IssueReportDialog`.

- [ ] **Step 1: 실패하는 테스트** (sonner mock을 `toast.success: vi.fn()`로 두고 호출 인자 검사)

```ts
it('completing from in_progress has no confirm dialog and offers undo that restores in_progress', async () => {
  mockApiFetch.mockResolvedValue({ milestone: { ...m, status: 'completed', is_manual_completed: true }, parentUpdated: null })
  render(<MilestonesClient initialMilestones={[m /* in_progress */]} charterApproved charters={[c]} currentCharterId="c" />)
  fireEvent.click(screen.getAllByRole('button', { name: '완료로' })[0])
  await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/api/milestones/m1', expect.objectContaining({ method: 'PATCH' })))
  expect(screen.queryByText('마일스톤을 완료로 표시하시겠어요?')).not.toBeInTheDocument()
  const opts = (toast.success as Mock).mock.calls[0][1]
  mockApiFetch.mockResolvedValue({ milestone: m, parentUpdated: null })
  opts.action.onClick()
  await waitFor(() => expect(JSON.parse(mockApiFetch.mock.calls[1][1].body)).toEqual({ is_manual_completed: false, is_manual_progress: true }))
})
it('filter chip 지연 hides non-delayed rows', () => { /* 두 건 렌더 → 지연 칩 클릭 → 한 건만 */ })
it('parent with children renders a group header with its own stepper; childless top-level renders as a plain row', () => {})
```

- [ ] **Step 2: 실패 확인** `bun run test test/components/MilestonesClient.test.tsx`
- [ ] **Step 3: 구현 + `components/CheckinTab.tsx` 삭제** (`grep -rn CheckinTab app components test` → 0건 확인)
- [ ] **Step 4: 통과 확인** `bun run test && bun run typecheck && bun run lint`
- [ ] **Step 5: 커밋** `[AX-1] feat(milestones): 현황 화면을 그룹·필터·스테퍼 구조로 재조립, 완료 확인 모달 제거`

### Task 6: 모바일 카드

**Files:**
- Modify: `components/MobileMilestoneCard.tsx`
- Test: `test/components/MobileMilestoneCard.test.tsx`

**Interfaces:** props를 `MilestoneRowProps`와 동일하게 맞춘다(`onIssueReport` → `onIssueClick(m)`으로 변경해 데스크톱과 같은 `IssueReportDialog`를 쓴다). 레이아웃은 스펙 §7: 3단(제목+펼침 / 기간+배지+검토중 / [이슈 보고]+`StageStepper size="md"`), 펼침 패널 1열.

- [ ] **Step 1: 실패하는 테스트** — in_progress 카드에 `완료로` 버튼이 있고 클릭 시 `onComplete('m1')`; 지연·미보고 카드에 `이슈 보고` 버튼이 `onIssueClick(m)`을 호출; 노트는 펼치기 전 숨김.
- [ ] **Step 2: 실패 확인** → **Step 3: 구현**(기존 `STATUS_*` 상수·상단 컬러 바·`✓ 완료`/`⚠ 이슈 보고` 버튼 제거) → **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** `[AX-1] feat(milestones): 모바일 카드를 스테퍼·D-배지 구조로 통일`

### Task 7: 검증·리뷰·배포

- [ ] `bun run test && bun run typecheck && bun run lint && bun run build`
- [ ] 로컬에서 `/my-project/milestones` 수동 확인: 미승인 차터 계정(스테퍼 비활성), 승인 계정에서 시작→완료→되돌리기, 지연 필터, 그룹 접기, 모바일 폭(390px).
- [ ] deep-reasoner(opus) 전체 브랜치 리뷰 → fix-first 반영
- [ ] PR 생성(본문 끝 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`) → `verify` Action 통과 → main 머지 → production Ready 확인 → Obsidian 노트에 결과 추가
