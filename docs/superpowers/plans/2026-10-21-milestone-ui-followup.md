# 마일스톤 현황 UI 후속(접근성·노트 초안·오늘 날짜·되돌리기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR #78 최종 리뷰에서 미반영으로 남긴 Minor 4건을 닫는다 — 스테퍼 접근성, 행 접을 때 노트 초안 유실, `todayStr` SSR/CSR 불일치, 오래된 되돌리기 토스트.

**Architecture:** 화면 구조는 그대로 둔다. (1) `StageStepper`는 마크업만 보강(aria-describedby·aria-current·글리프 aria-hidden·포커스 링). (2) 노트 편집 상태를 `useNoteEditor` 훅으로 빼서 행/카드(항상 마운트)가 소유하고 펼침 패널은 받아서 그린다. (3) 오늘 날짜는 서버 페이지가 KST로 한 번 계산해 prop으로 내려 hydration 불일치를 없앤다. (4) 단계 전환마다 마일스톤별 순번을 올리고 이전 토스트를 닫아, 오래된 되돌리기가 이후 전환을 되돌리지 못하게 한다.

**Tech Stack:** Next.js App Router, React 18, sonner, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-10-20-milestone-status-ui-design.md` (§3·§4·§5를 이 플랜 Task 5에서 갱신)

## Global Constraints

- 스키마·API·`computeStatus`·PATCH 라우트 무변경.
- 색상은 `app/globals.css` 토큰만 사용. 흰 글자는 `var(--text-inverse)`(하드코딩 `#fff` 금지).
- 모바일 터치 타깃 최소 44×44px.
- 커밋 헤더 `[AX-1] type(scope): subject`, 본문 100자/줄, 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 테스트: `bun run test`, 타입: `bun run typecheck`, 린트: `bun run lint`.

## Review Focus

1. 스크린리더가 비활성 스테퍼에서 "왜 못 누르는지"를 듣는가 — 각 버튼의 accessible description이 사유 문구여야 한다. (Task 1 테스트)
2. 행을 접었다 펼쳐도 입력 중이던 노트가 남아 있는가. (Task 2 테스트)
3. KST 00~09시에 서버 렌더와 클라이언트 렌더의 D-배지가 같은가 — 날짜는 서버에서만 계산. (Task 3: `MilestonesClient`에 `new Date()` 호출이 없어야 함)
4. 같은 마일스톤에 시작→완료를 연달아 누른 뒤 첫 토스트의 되돌리기를 눌러도 완료가 풀리지 않는가. (Task 4 테스트)
5. 시작 버튼 연타가 PATCH 한 번만 보내는가. (Task 4 테스트)

---

### Task 1: StageStepper 접근성 + 토큰 + 모바일 터치 타깃

**Files:**
- Modify: `components/milestones/StageStepper.tsx`
- Modify: `components/MobileMilestoneCard.tsx` (펼침 버튼 크기)
- Modify: `components/milestones/MilestoneRow.tsx` (노트 저장 버튼 `#fff` → 토큰)
- Modify: `app/(champion)/my-project/milestones/MilestonesClient.tsx` (기한 변경 submit 버튼 `#fff` → 토큰)
- Test: `test/components/StageStepper.test.tsx`, `test/components/MobileMilestoneCard.test.tsx`

**Interfaces:**
- Consumes: `StageStepperProps` 그대로.
- Produces: props 변경 없음.

- [ ] **Step 1: 실패 테스트 추가** (`test/components/StageStepper.test.tsx`)

```tsx
it('glyphs are aria-hidden so accessible names are plain stage labels', () => {
  render(<StageStepper stage="in_progress" onStart={vi.fn()} onComplete={vi.fn()} />)
  expect(screen.getByRole('button', { name: '시작' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '완료로' })).toBeInTheDocument()
})

it('current stage segment carries aria-current="step"', () => {
  const { rerender } = render(<StageStepper stage="in_progress" onStart={vi.fn()} onComplete={vi.fn()} />)
  expect(screen.getByRole('button', { name: '진행중' })).toHaveAttribute('aria-current', 'step')
  expect(screen.getByRole('button', { name: '시작' })).not.toHaveAttribute('aria-current')
  rerender(<StageStepper stage="completed" onStart={vi.fn()} onComplete={vi.fn()} />)
  expect(screen.getByRole('button', { name: '완료' })).toHaveAttribute('aria-current', 'step')
  rerender(<StageStepper stage="not_started" onStart={vi.fn()} onComplete={vi.fn()} />)
  expect(screen.queryAllByRole('button').some(b => b.hasAttribute('aria-current'))).toBe(false)
})

it('disabled reason is exposed as each button\'s accessible description', () => {
  render(<StageStepper stage="not_started" disabled disabledReason="과제정의서 승인 후 진행할 수 있습니다" onStart={vi.fn()} onComplete={vi.fn()} />)
  for (const b of screen.getAllByRole('button')) {
    expect(b).toHaveAccessibleDescription('과제정의서 승인 후 진행할 수 있습니다')
  }
})

it('enabled stepper has no accessible description and no overflow clipping', () => {
  render(<StageStepper stage="not_started" onStart={vi.fn()} onComplete={vi.fn()} />)
  expect(screen.getByRole('button', { name: '시작' })).not.toHaveAttribute('aria-describedby')
  expect(screen.getByRole('group', { name: '진행 단계' }).style.overflow).not.toBe('hidden')
})
```

`test/components/MobileMilestoneCard.test.tsx`:

```tsx
it('expand button is a 44px touch target', () => {
  renderCard(base)  // 파일의 기존 렌더 헬퍼 이름을 그대로 사용
  const btn = screen.getByRole('button', { name: '상세 펼치기' })
  expect(btn).toHaveStyle({ width: '44px', height: '44px' })
})
```

- [ ] **Step 2: 실패 확인** — `bun run test test/components/StageStepper.test.tsx test/components/MobileMilestoneCard.test.tsx` → 새 테스트 FAIL.

- [ ] **Step 3: `StageStepper.tsx` 구현**

  - `Segment`를 `{ glyph?: '▶' | '✓'; label: string; tone; onClick?; current?: boolean }`로 바꾸고 렌더는 `{seg.glyph && <span aria-hidden="true">{seg.glyph} </span>}{seg.label}`. 진행중 단계의 `진행중`(fill-accent), 완료 단계의 `완료`(fill-success)에 `current: true` → `aria-current="step"`. 라벨 텍스트는 기존과 동일(`시작`/`진행중`/`완료`/`완료로`).
  - `const reasonId = useId()`; `disabled && disabledReason`일 때만 그룹 안에 `<span id={reasonId} className="sr-only">{disabledReason}</span>`를 렌더하고 각 버튼에 `aria-describedby={reasonId}`. 그 외에는 속성 자체를 넣지 않는다. 그룹 `title`은 유지.
  - 그룹의 `overflow: 'hidden'` 제거. 대신 첫/끝 버튼에 `borderRadius: i === 0 ? '7px 0 0 7px' : i === 2 ? '0 7px 7px 0' : 0`. 포커스 링은 `outlineOffset: -2px` 로 안쪽에 그린다(`:focus-visible` 스타일은 전역 기본값 사용).
  - `TONE_STYLE`의 `'#fff'` 두 곳 → `'var(--text-inverse)'`.

- [ ] **Step 4: `MobileMilestoneCard.tsx`** — 펼침 버튼 `width: 44, height: 44, margin: '-8px -10px -8px 0'`(시각 위치 유지).

- [ ] **Step 5: `MilestoneRow.tsx` 노트 저장 버튼, `MilestonesClient.tsx` 기한 변경 submit 버튼** — `color: '#fff'` → `color: 'var(--text-inverse)'`.

- [ ] **Step 6: 통과 확인** — 위 두 파일 테스트 + `bun run test` 전체, `bun run typecheck`.

- [ ] **Step 7: Commit** — `[AX-1] fix(milestones): 스테퍼 접근성(비활성 사유·aria-current·글리프)과 모바일 터치 타깃`

---

### Task 2: 노트 편집 상태를 `useNoteEditor` 훅으로 올려 접어도 초안 유지

**Files:**
- Create: `components/milestones/useNoteEditor.ts`
- Modify: `components/milestones/MilestoneRow.tsx` (`MilestoneDetailPanel` props, `MilestoneRow`)
- Modify: `components/MobileMilestoneCard.tsx`
- Test: `test/components/MilestoneRow.test.tsx`, `test/components/MobileMilestoneCard.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface NoteEditor {
  editing: boolean
  value: string
  saving: boolean
  open: () => void          // value = m.note ?? '', editing = true
  cancel: () => void        // editing = false (value는 버려도 됨)
  setValue: (v: string) => void
  save: () => Promise<void> // trim → ''이면 null; m.note와 같으면 PATCH 없이 닫기; 실패 시 editing 유지(throw 삼킴)
}
export function useNoteEditor(
  m: Pick<Milestone, 'id' | 'note'>,
  onNoteUpdate: (id: string, note: string | null) => Promise<void>,
): NoteEditor
```

  `m.id`가 바뀌면 `editing=false, value=''`로 리셋(기존 `useEffect` 그대로 이동).
- `MilestoneDetailPanelProps`: `onNoteUpdate` 제거, `noteEditor: NoteEditor` 추가. `MilestoneRowProps`는 그대로(`onNoteUpdate` 유지, 행이 훅을 만든다).

- [ ] **Step 1: 실패 테스트** (`test/components/MilestoneRow.test.tsx`; 모바일 파일에도 같은 시나리오 1개)

```tsx
it('keeps the note draft when the row is collapsed and re-expanded', () => {
  renderRow({ ...base, status: 'in_progress', is_manual_progress: true })
  fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
  fireEvent.click(screen.getByRole('button', { name: '노트 편집' }))
  fireEvent.change(screen.getByPlaceholderText('진행 상황을 간단히 메모해주세요'), { target: { value: '초안 작성 중' } })
  fireEvent.click(screen.getByRole('button', { name: '상세 접기' }))
  expect(screen.getByText('노트 편집중')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '상세 펼치기' }))
  expect(screen.getByPlaceholderText('진행 상황을 간단히 메모해주세요')).toHaveValue('초안 작성 중')
})
```

  (`renderRow`는 파일의 기존 헬퍼 이름을 따른다. 모바일 테스트는 `노트 편집중` 칩 확인 포함.)

- [ ] **Step 2: 실패 확인** — `bun run test test/components/MilestoneRow.test.tsx test/components/MobileMilestoneCard.test.tsx`.

- [ ] **Step 3: `useNoteEditor.ts` 구현** — 기존 `MilestoneDetailPanel`의 `noteEditing/noteValue/noteSaving/openNoteEdit/handleNoteSave` 로직을 그대로 옮긴다(동작 변경 없음).

- [ ] **Step 4: `MilestoneDetailPanel`** — `noteEditor` prop으로 그린다. `handleNoteKeyDown`은 패널에 남기되 `noteEditor.save()/cancel()` 호출. Enter(shift 아님)=저장, Escape=취소 유지.

- [ ] **Step 5: `MilestoneRow`·`MobileMilestoneCard`** — `const noteEditor = useNoteEditor(m, onNoteUpdate)`를 만들고 패널에 전달. 접힌 상태에서 `noteEditor.editing`이면 제목 옆(데스크톱) / 기간 줄(모바일)에 `CHIP_STYLE` 칩 `노트 편집중` 표시. `MilestoneRow.tsx`의 `CHIP_STYLE`을 export 해서 모바일에서 재사용.

- [ ] **Step 6: 통과 확인** — 두 파일 + 전체 테스트(`MilestonesClient.test.tsx`의 노트 실패 시나리오 포함), typecheck.

- [ ] **Step 7: Commit** — `[AX-1] fix(milestones): 노트 편집 상태를 행으로 올려 접어도 초안 유지`

---

### Task 3: 오늘 날짜를 서버(KST)에서 계산해 prop으로 전달

**Files:**
- Modify: `app/(champion)/my-project/milestones/page.tsx`
- Modify: `app/(champion)/my-project/milestones/MilestonesClient.tsx` (`Props`에 `todayStr: string`, `useMemo` 제거)
- Modify: `app/(champion)/ChampionSidebar.tsx` (`kstTodayStr()` 사용)
- Test: `test/components/MilestonesClient.test.tsx` (렌더 헬퍼에 `todayStr` 전달), `test/lib/milestone-view.test.ts`는 무변경

**Interfaces:**
- Consumes: `kstTodayStr(now?: Date): string` from `@/lib/nudge/overdue` (이미 존재, `YYYY-MM-DD` KST).
- Produces: `MilestonesClient` `Props.todayStr: string` (필수).

- [ ] **Step 1: 테스트 갱신** — `renderClient`/`renderMobile`과 직접 `render(<MilestonesClient …/>)`하는 곳 전부에 `todayStr="2026-06-01"` 추가(기존 fixture 날짜 `2026-01-01`~`2099-12-31`와 어긋나지 않는 값). 새 단언 1개:

```tsx
it('uses the server-provided todayStr for D-badges (no client Date)', () => {
  const area = renderClient([{ ...base, due_date: '2026-06-03', status: 'in_progress' }])  // todayStr=2026-06-01
  expect(within(area).getByText('D-2')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인** — typecheck 실패(필수 prop 누락) 또는 테스트 FAIL.

- [ ] **Step 3: 구현**
  - `page.tsx`: `import { kstTodayStr } from '@/lib/nudge/overdue'`; `<MilestonesClient … todayStr={kstTodayStr()} />`.
  - `MilestonesClient.tsx`: `todayStr` prop 사용, `useMemo(() => new Date()…)` 블록 삭제. 파일 안에 `new Date()` 호출이 남지 않아야 한다.
  - `ChampionSidebar.tsx`: `useEffect` 안의 로컬 날짜 계산을 `const today = kstTodayStr()`로 교체.

- [ ] **Step 4: 통과 확인** — `bun run test`, `bun run typecheck`, `grep -n "new Date()" "app/(champion)/my-project/milestones/MilestonesClient.tsx"` 결과 없음.

- [ ] **Step 5: Commit** — `[AX-1] fix(milestones): 오늘 날짜를 서버 KST로 한 번 계산해 hydration 불일치 제거`

---

### Task 4: 되돌리기 토스트 — 마일스톤별 전환 순번 + 이전 토스트 닫기 + busy 안내

**Files:**
- Modify: `app/(champion)/my-project/milestones/MilestonesClient.tsx`
- Test: `test/components/MilestonesClient.test.tsx`

**Interfaces:**
- Consumes: sonner `toast.success(...)`가 돌려주는 id, `toast.dismiss(id)`, `toast.info(msg)`.
- Produces: 내부 전용. 사용자 문구(정확히):
  - 오래된 되돌리기: `'이미 다른 변경이 있어 되돌릴 수 없습니다.'`
  - 처리 중 되돌리기: `'처리 중입니다. 잠시 후 다시 시도해주세요.'`

- [ ] **Step 1: 테스트** — 파일 상단 sonner mock을 `{ toast: { success: vi.fn(() => 'tid'), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }`로 확장. `mockApiFetch`는 PATCH body를 반영한 `milestone`을 돌려주도록 각 테스트에서 구현(기존 테스트가 쓰는 방식 유지). 추가:

```tsx
it('a newer transition dismisses the previous undo toast and the stale undo is refused', async () => {
  // start(m1) → toast#1(action undo1) ; complete(m1) → dismiss(toast#1), toast#2
  // undo1 클릭 → PATCH 없음, toast.info('이미 다른 변경이 있어 되돌릴 수 없습니다.')
})

it('undo while the same milestone is busy shows an info toast and sends nothing', async () => {
  // apiFetch를 pending Promise로 두고 undo 액션 호출 → toast.info('처리 중입니다. 잠시 후 다시 시도해주세요.'), PATCH 호출 수 불변
})

it('double-clicking 시작 sends a single PATCH', async () => {
  // fireEvent.click 두 번 연속 → apiFetch PATCH 1회
})
```

- [ ] **Step 2: 실패 확인** — `bun run test test/components/MilestonesClient.test.tsx`.

- [ ] **Step 3: 구현** (`MilestonesClient.tsx`)
  - `const transitionSeq = useRef<Map<string, number>>(new Map())`, `const stageToast = useRef<Map<string, string | number>>(new Map())`.
  - `function beginTransition(id: string): number` — 순번 +1 저장, `stageToast`에 남은 이전 토스트가 있으면 `toast.dismiss(prev)` 후 삭제, 새 순번 반환.
  - `handleStart`/`handleComplete`: PATCH 성공 후 `const seq = beginTransition(id)`; `const tid = toast.success(msg, { duration: 6000, action: undoAction(id, action, prevStage, seq) })`; `stageToast.current.set(id, tid)`.
  - `undo(id, action, prevStage, seq)`: `transitionSeq.current.get(id) !== seq` → `toast.info('이미 다른 변경이 있어 되돌릴 수 없습니다.')` 후 return. `busyRef.current.has(id)` → `toast.info('처리 중입니다. 잠시 후 다시 시도해주세요.')` 후 return. 성공 시 `beginTransition(id)`(되돌린 토스트의 재실행 차단) 후 `toast.success('되돌렸습니다.')`.
  - 이슈 보고·노트·기한 변경은 단계를 바꾸지 않으므로 순번을 올리지 않는다(주석으로 남긴다).

- [ ] **Step 4: 통과 확인** — 파일 테스트 + 전체 테스트, typecheck, lint.

- [ ] **Step 5: Commit** — `[AX-1] fix(milestones): 오래된 되돌리기 토스트가 이후 전환을 되돌리지 못하게 순번 가드`

---

### Task 5: 스펙 갱신·전체 검증·리뷰·PR

**Files:**
- Modify: `docs/superpowers/specs/2026-10-20-milestone-status-ui-design.md`

- [ ] **Step 1: 스펙 갱신**
  - §3 D-배지 항목의 "오늘 = 로컬 날짜" → "오늘 = 서버가 KST로 계산해 내려준 `todayStr`(`kstTodayStr`)".
  - §3 펼침 패널 문단에 "노트 편집 상태는 행이 소유(`useNoteEditor`)하므로 접었다 펼쳐도 초안이 남고, 접힌 동안 제목 옆에 `노트 편집중` 칩" 추가.
  - §4 마지막 불릿 뒤에: "비활성 사유는 각 버튼의 `aria-describedby`(sr-only 텍스트)로도 노출. 현재 단계 칸은 `aria-current="step"`. `▶/✓` 글리프는 `aria-hidden`. 그룹은 `overflow:hidden`을 쓰지 않는다(포커스 링 보존). 모바일 펼침 버튼은 44×44px."
  - §5 표 아래 불릿에: "되돌리기는 같은 마일스톤의 가장 최근 전환에만 유효하다. 새 전환이 생기면 이전 토스트를 닫고, 그래도 눌리면 `'이미 다른 변경이 있어 되돌릴 수 없습니다.'`. 처리 중이면 `'처리 중입니다. 잠시 후 다시 시도해주세요.'`."
- [ ] **Step 2: 전체 검증** — `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`.
- [ ] **Step 3: Commit** — `[AX-1] docs(milestones): 후속 반영 사항을 설계 스펙에 갱신`
- [ ] **Step 4: 전체 브랜치 리뷰(Opus) → 수정 → PR** — PR 본문은 4건 요약 + 검증 결과, 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
