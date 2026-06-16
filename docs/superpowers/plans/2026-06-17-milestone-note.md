# Milestone Note (진행 노트) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챔피언이 진행 중인(in_progress) 마일스톤 카드에 진행 공유 노트를 인라인으로 작성/수정할 수 있게 한다. 어드민도 해당 노트를 조회할 수 있다.

**Architecture:** `milestones` 테이블에 `note text` 컬럼을 추가하고, 기존 PATCH `/api/milestones/[id]` 엔드포인트를 그대로 활용한다. `CheckinTab`의 `MilestoneCard`와 `MobileMilestoneCard`에 인라인 편집 UI를 추가하고, 어드민 챔피언 상세 페이지의 `MilestoneRow`에 노트를 읽기 전용으로 표시한다.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase, Tailwind / CSS variables

## Global Constraints

- CSS: CSS variable 기반 스타일링 (`var(--text-primary)` 등), 인라인 style 객체 사용 (기존 패턴)
- 기존 `apiFetch` 유틸리티 사용
- 노트 편집은 `in_progress` 상태 카드에서만 가능; 노트 텍스트는 다른 상태에서도 읽기 전용으로 표시
- Enter = 저장, Escape = 취소, onBlur는 저장하지 않음 (명시적 저장)
- 모바일/데스크톱 모두 동일한 UX

---

### Task 1: DB Migration — note 컬럼 추가

**Files:**
- Create: `supabase/migrations/20260617000000_add_milestone_note.sql`

**Interfaces:**
- Produces: `milestones.note` text nullable column

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
ALTER TABLE milestones ADD COLUMN note text;
```

- [ ] **Step 2: Supabase에 마이그레이션 적용**

```bash
npx supabase db push
```
또는 로컬 환경이면:
```bash
npx supabase migration up
```

Expected: 에러 없이 완료

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260617000000_add_milestone_note.sql
git commit -m "feat: add note column to milestones table"
```

---

### Task 2: 타입 업데이트

**Files:**
- Modify: `lib/types.ts:70-92`

**Interfaces:**
- Consumes: 없음
- Produces: `Milestone.note: string | null`

- [ ] **Step 1: Milestone 인터페이스에 note 필드 추가**

`lib/types.ts`의 Milestone 인터페이스 `bottleneck_reviewed_at` 아래에 추가:

```typescript
export interface Milestone {
  id: string
  user_id: string
  week_number: number | null
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  status: MilestoneStatus
  is_manual_progress: boolean
  is_manual_completed: boolean
  bottleneck_type: BottleneckType | null
  bottleneck_note: string | null
  bottleneck_admin_comment: string | null
  bottleneck_reviewed_at: string | null
  note: string | null            // ← 추가
  parent_milestone_id: string | null
  display_order: number
  source: MilestoneSource
  created_at: string
  updated_at: string
  publish_status: PublishStatus
  children?: Milestone[]
}
```

- [ ] **Step 2: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add lib/types.ts
git commit -m "feat: add note field to Milestone type"
```

---

### Task 3: MilestonesClient — handleNoteUpdate 추가

**Files:**
- Modify: `app/(champion)/my-project/milestones/MilestonesClient.tsx`

**Interfaces:**
- Consumes: `Milestone.note: string | null` (Task 2)
- Produces: `handleNoteUpdate(id: string, note: string | null): Promise<void>` — CheckinTab과 MobileMilestoneCard로 전달

- [ ] **Step 1: handleNoteUpdate 함수 추가**

`handleCheckinInProgress` 함수 아래에 추가:

```typescript
async function handleNoteUpdate(id: string, note: string | null) {
  try {
    const { milestone: updated } = await apiFetch<{ milestone: Milestone, parentUpdated: Milestone | null }>(`/api/milestones/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ note }),
    })
    setMilestones(prev => prev.map(m => m.id === id ? updated : m))
  } catch (e: unknown) {
    toast.error('노트 저장에 실패했습니다: ' + (e instanceof Error ? e.message : String(e)))
  }
}
```

- [ ] **Step 2: checkinProps에 onNoteUpdate 추가**

```typescript
const checkinProps = {
  charterApproved,
  onComplete: handleCheckinComplete,
  onIssueReport: handleCheckinIssueReport,
  onInProgress: handleCheckinInProgress,
  onDeadlineExtension: openDeadlineForCheckin,
  onNoteUpdate: handleNoteUpdate,       // ← 추가
}
```

- [ ] **Step 3: MobileMilestoneCard에 onNoteUpdate 전달**

모바일 렌더링 부분에서 `MobileMilestoneCard`에 prop 추가:

```tsx
<MobileMilestoneCard
  key={m.id}
  milestone={m}
  todayStr={todayStr}
  charterApproved={charterApproved}
  onComplete={handleCheckinComplete}
  onIssueReport={(id) => handleCheckinIssueReport(id, 'other', null)}
  onDeadlineExtension={openDeadlineForCheckin}
  onNoteUpdate={handleNoteUpdate}       // ← 추가
/>
```

- [ ] **Step 4: 커밋**

```bash
git add app/\(champion\)/my-project/milestones/MilestonesClient.tsx
git commit -m "feat: add handleNoteUpdate to MilestonesClient"
```

---

### Task 4: CheckinTab — MilestoneCard에 인라인 노트 UI 추가

**Files:**
- Modify: `components/CheckinTab.tsx`

**Interfaces:**
- Consumes: `handleNoteUpdate(id: string, note: string | null): Promise<void>` (Task 3)
- Produces: 인라인 노트 편집 UI in MilestoneCard

- [ ] **Step 1: MilestoneCardProps에 onNoteUpdate 추가**

```typescript
interface MilestoneCardProps {
  m: Milestone
  showActions: boolean
  charterApproved: boolean
  onCompleteClick: (id: string) => void
  onIssueClick: (m: Milestone) => void
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
  onInProgress: (id: string) => void
  onNoteUpdate: (id: string, note: string | null) => Promise<void>  // ← 추가
}
```

- [ ] **Step 2: MilestoneCard 함수 시그니처에 onNoteUpdate 추가**

```typescript
function MilestoneCard({ m, showActions, charterApproved, onCompleteClick, onIssueClick, onDeadlineExtension, onInProgress, onNoteUpdate }: MilestoneCardProps) {
```

- [ ] **Step 3: 노트 편집 상태 추가**

MilestoneCard 함수 내부 상단 (기존 const 선언 아래)에 추가:

```typescript
const [noteEditing, setNoteEditing] = useState(false)
const [noteValue, setNoteValue] = useState(m.note ?? '')
const [noteSaving, setNoteSaving] = useState(false)

const canEditNote = m.status === 'in_progress'

async function handleNoteSave() {
  const trimmed = noteValue.trim()
  const next = trimmed === '' ? null : trimmed
  if (next === (m.note ?? null)) { setNoteEditing(false); return }
  setNoteSaving(true)
  try {
    await onNoteUpdate(m.id, next)
  } finally {
    setNoteSaving(false)
    setNoteEditing(false)
  }
}

function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleNoteSave()
  }
  if (e.key === 'Escape') {
    setNoteValue(m.note ?? '')
    setNoteEditing(false)
  }
}
```

- [ ] **Step 4: 노트 섹션 JSX 추가**

`hasAdminReply` 버블 아래, 액션 버튼 위에 노트 섹션 삽입:

```tsx
{/* 진행 노트 */}
{noteEditing ? (
  <div className="flex flex-col gap-1.5 mb-3">
    <textarea
      autoFocus
      value={noteValue}
      onChange={e => setNoteValue(e.target.value)}
      onKeyDown={handleNoteKeyDown}
      placeholder="진행 상황을 간단히 메모해주세요"
      rows={2}
      style={{
        background: 'var(--background)',
        border: '1px solid var(--blue-600)',
        borderRadius: '6px',
        color: 'var(--text-primary)',
        padding: '7px 10px',
        fontSize: '12px',
        resize: 'none',
        width: '100%',
        outline: 'none',
      }}
    />
    <div className="flex gap-2">
      <button
        onClick={handleNoteSave}
        disabled={noteSaving}
        className="text-xs px-3 py-1 rounded-md font-semibold"
        style={{ background: 'var(--blue-600)', color: '#fff', opacity: noteSaving ? 0.7 : 1 }}
      >
        저장
      </button>
      <button
        onClick={() => { setNoteValue(m.note ?? ''); setNoteEditing(false) }}
        className="text-xs px-3 py-1 rounded-md"
        style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
      >
        취소
      </button>
    </div>
  </div>
) : m.note ? (
  <div
    className="flex items-start gap-2 mb-3"
    style={{
      background: 'rgba(37,99,235,0.04)',
      borderRadius: '6px',
      padding: '7px 10px',
    }}
  >
    <p className="text-xs flex-1" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
      {m.note}
    </p>
    {canEditNote && (
      <button
        onClick={() => { setNoteValue(m.note ?? ''); setNoteEditing(true) }}
        className="flex-shrink-0 text-xs"
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer' }}
        title="노트 편집"
      >
        ✏️
      </button>
    )}
  </div>
) : canEditNote ? (
  <div className="mb-3">
    <button
      onClick={() => setNoteEditing(true)}
      className="text-xs"
      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer' }}
    >
      + 진행 노트 추가
    </button>
  </div>
) : null}
```

- [ ] **Step 5: CheckinTabProps에 onNoteUpdate 추가**

```typescript
export interface CheckinTabProps {
  milestones: Milestone[]
  charterApproved: boolean
  onComplete: (id: string) => Promise<void>
  onIssueReport: (id: string, type: BottleneckType, note: string | null) => Promise<void>
  onInProgress: (id: string) => Promise<void>
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
  onNoteUpdate: (id: string, note: string | null) => Promise<void>  // ← 추가
  showOverdue?: boolean
}
```

- [ ] **Step 6: CheckinTab 함수 시그니처에 onNoteUpdate 추가 및 cardProps에 전달**

```typescript
export function CheckinTab({ milestones, charterApproved, onComplete, onIssueReport, onInProgress, onDeadlineExtension, onNoteUpdate, showOverdue = true }: CheckinTabProps) {
```

`cardProps` 함수:
```typescript
const cardProps = (m: Milestone, showActions: boolean) => ({
  m,
  showActions,
  charterApproved,
  onCompleteClick: (id: string) => setCompleteConfirmId(id),
  onIssueClick: (m: Milestone) => { setIssueMilestone(m); setIssueForm({ type: '', note: '' }) },
  onDeadlineExtension,
  onInProgress,
  onNoteUpdate,   // ← 추가
})
```

- [ ] **Step 7: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 8: 커밋**

```bash
git add components/CheckinTab.tsx
git commit -m "feat: add inline note editing to MilestoneCard in CheckinTab"
```

---

### Task 5: MobileMilestoneCard — 노트 UI 추가

**Files:**
- Modify: `components/MobileMilestoneCard.tsx`

**Interfaces:**
- Consumes: `onNoteUpdate: (id: string, note: string | null) => Promise<void>` (Task 3)
- Produces: 모바일 카드에 노트 표시/편집 UI

- [ ] **Step 1: MobileMilestoneCardProps에 onNoteUpdate 추가**

```typescript
export interface MobileMilestoneCardProps {
  milestone: Milestone
  todayStr: string
  charterApproved: boolean
  onComplete: (id: string) => void
  onIssueReport: (id: string) => void
  onDeadlineExtension: (m: Milestone, isReschedule?: boolean) => void
  onNoteUpdate: (id: string, note: string | null) => Promise<void>  // ← 추가
}
```

- [ ] **Step 2: 함수 시그니처에 onNoteUpdate 추가**

```typescript
export function MobileMilestoneCard({
  milestone: m,
  todayStr,
  charterApproved,
  onComplete,
  onIssueReport,
  onDeadlineExtension,
  onNoteUpdate,         // ← 추가
}: MobileMilestoneCardProps) {
```

`'use client'` 추가 및 `useState` import 필요:

파일 최상단에:
```typescript
'use client'
import { useState } from 'react'
import type { Milestone, MilestoneStatus } from '@/lib/types'
```

- [ ] **Step 3: 노트 상태와 핸들러 추가**

기존 `const isOverdue` 선언 위에 추가:

```typescript
const [noteEditing, setNoteEditing] = useState(false)
const [noteValue, setNoteValue] = useState(m.note ?? '')
const [noteSaving, setNoteSaving] = useState(false)
const canEditNote = m.status === 'in_progress'

async function handleNoteSave() {
  const trimmed = noteValue.trim()
  const next = trimmed === '' ? null : trimmed
  if (next === (m.note ?? null)) { setNoteEditing(false); return }
  setNoteSaving(true)
  try {
    await onNoteUpdate(m.id, next)
  } finally {
    setNoteSaving(false)
    setNoteEditing(false)
  }
}

function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNoteSave() }
  if (e.key === 'Escape') { setNoteValue(m.note ?? ''); setNoteEditing(false) }
}
```

- [ ] **Step 4: 노트 섹션 JSX 추가**

이슈 내역(`hasBottleneck` 블록) 아래, 액션 버튼 위에 삽입:

```tsx
{/* 진행 노트 */}
{noteEditing ? (
  <div className="flex flex-col gap-1.5 mb-2">
    <textarea
      autoFocus
      value={noteValue}
      onChange={e => setNoteValue(e.target.value)}
      onKeyDown={handleNoteKeyDown}
      placeholder="진행 상황을 간단히 메모해주세요"
      rows={2}
      style={{
        background: 'var(--background)',
        border: '1px solid #3b82f6',
        borderRadius: '6px',
        color: 'var(--text-primary)',
        padding: '7px 10px',
        fontSize: '12px',
        resize: 'none',
        width: '100%',
        outline: 'none',
      }}
    />
    <div className="flex gap-2">
      <button
        onClick={handleNoteSave}
        disabled={noteSaving}
        className="text-xs px-3 py-1 rounded-md font-semibold"
        style={{ background: '#3b82f6', color: '#fff', opacity: noteSaving ? 0.7 : 1 }}
      >
        저장
      </button>
      <button
        onClick={() => { setNoteValue(m.note ?? ''); setNoteEditing(false) }}
        className="text-xs px-3 py-1 rounded-md"
        style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
      >
        취소
      </button>
    </div>
  </div>
) : m.note ? (
  <div
    className="flex items-start gap-2 mb-2"
    style={{ background: 'rgba(59,130,246,0.06)', borderRadius: '6px', padding: '6px 9px' }}
  >
    <p className="text-xs flex-1" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
      {m.note}
    </p>
    {canEditNote && (
      <button
        onClick={() => { setNoteValue(m.note ?? ''); setNoteEditing(true) }}
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer', flexShrink: 0 }}
      >
        ✏️
      </button>
    )}
  </div>
) : canEditNote ? (
  <div className="mb-2">
    <button
      onClick={() => setNoteEditing(true)}
      className="text-xs"
      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-disabled)', cursor: 'pointer' }}
    >
      + 진행 노트 추가
    </button>
  </div>
) : null}
```

- [ ] **Step 5: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: 커밋**

```bash
git add components/MobileMilestoneCard.tsx
git commit -m "feat: add inline note editing to MobileMilestoneCard"
```

---

### Task 6: 어드민 챔피언 상세 페이지 — 노트 읽기 전용 표시

**Files:**
- Modify: `app/admin/champions/[userId]/page.tsx` (`MilestoneRow` 컴포넌트)

**Interfaces:**
- Consumes: `Milestone.note: string | null` (Task 2)
- Produces: 어드민 뷰에서 노트 읽기 전용 표시

- [ ] **Step 1: MilestoneRow에 노트 표시 추가**

`app/admin/champions/[userId]/page.tsx`의 `MilestoneRow` 컴포넌트에서, 날짜 표시 `<p>` 아래에 노트 표시 추가:

```tsx
{m.note && (
  <p style={{
    fontSize: 10,
    color: 'var(--text-secondary)',
    margin: '3px 0 0 0',
    fontStyle: 'italic',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }}>
    📝 {m.note}
  </p>
)}
```

- [ ] **Step 2: TypeScript 컴파일 최종 확인**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/admin/champions/\[userId\]/page.tsx
git commit -m "feat: show milestone note in admin champion detail view"
```
