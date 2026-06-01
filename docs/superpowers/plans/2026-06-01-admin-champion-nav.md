# Admin Champion Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin 대시보드에 챔피언 리스트 메뉴 및 전용 페이지를 추가하고, Kanban의 미클릭 컬럼 카드를 챔피언 상세 페이지로 이동 가능하게 한다.

**Architecture:** 세 가지 독립적인 변경으로 구성된다. (1) `admin/layout.tsx`에 네비게이션 항목 추가, (2) `app/admin/champions/page.tsx` 신규 생성 — 기존 `ChampionSummaryTable` 재사용, (3) `app/admin/kanban/page.tsx`에서 `not_started`/`in_progress` 카드 클릭 시 `useRouter`로 `/admin/champions/:id` 이동. 백엔드 변경 없음.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, lucide-react (아이콘), `useRouter` (next/navigation)

---

## File Map

| 파일 | 변경 |
|---|---|
| `app/admin/layout.tsx` | Modify — NAV 배열에 챔피언 리스트 항목 추가 |
| `app/admin/champions/page.tsx` | **Create** — 챔피언 리스트 페이지 |
| `app/admin/kanban/page.tsx` | Modify — 모든 컬럼 카드 클릭 가능, not_started/in_progress → router.push |

---

### Task 1: 네비게이션에 "챔피언 리스트" 메뉴 추가

**Files:**
- Modify: `app/admin/layout.tsx`

- [ ] **Step 1: `Users` 아이콘 import 추가**

`app/admin/layout.tsx` 상단 import 라인을 수정한다.

```typescript
// 기존
import { LayoutDashboard, Layers, CalendarClock, AlertTriangle, FileText, LogOut, Menu, X } from 'lucide-react'

// 변경 후
import { LayoutDashboard, Layers, CalendarClock, AlertTriangle, FileText, LogOut, Menu, X, Users } from 'lucide-react'
```

- [ ] **Step 2: NAV 배열에 챔피언 리스트 항목 추가**

`대시보드` 항목 바로 다음에 삽입한다.

```typescript
const NAV = [
  { icon: LayoutDashboard, label: '대시보드', href: '/admin' },
  { icon: Users, label: '챔피언 리스트', href: '/admin/champions' },
  { icon: Layers, label: '제출 현황', href: '/admin/kanban' },
  { icon: AlertTriangle, label: '지연 신고', href: '/admin/delay-reports' },
  { icon: CalendarClock, label: '기한 변경 요청', href: '/admin/requests' },
  { icon: FileText, label: '주간 리포트', href: '/admin/reports' },
]
```

- [ ] **Step 3: active 매칭 로직 확인**

기존 active 로직: `item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)`

`/admin/champions` 항목은 `pathname.startsWith('/admin/champions')` 로 매칭되므로 `/admin/champions/:id` 진입 시에도 active 상태가 된다. 별도 수정 불필요.

- [ ] **Step 4: 개발 서버에서 수동 확인**

```bash
npm run dev
```

브라우저에서 `http://localhost:3000/admin` 접속. 좌측 사이드바에 "챔피언 리스트" 메뉴가 대시보드 아래에 나타나는지 확인. 클릭 시 404가 뜨는 것은 Task 2 완료 전 정상.

- [ ] **Step 5: 커밋**

```bash
git add app/admin/layout.tsx
git commit -m "[AX-1] feat(admin): 챔피언 리스트 네비게이션 메뉴 추가"
```

---

### Task 2: `/admin/champions` 챔피언 리스트 페이지 신규 생성

**Files:**
- Create: `app/admin/champions/page.tsx`

> **주의:** `app/admin/champions/[userId]/page.tsx` 가 이미 존재한다. Next.js App Router에서 `page.tsx` (인덱스)와 `[userId]/page.tsx` (동적 라우트)는 공존 가능하다. 디렉토리 구조는 그대로 유지한다.

- [ ] **Step 1: 챔피언 리스트 페이지 파일 생성**

`ChampionSummaryTable`은 이미 `/api/champions` 를 내부에서 호출하므로 데이터 페칭 로직이 필요 없다. `onChampionClick`과 `onCharterClick` 모두 `/admin/champions/:id` 로 라우팅한다.

```typescript
'use client'
import { useRouter } from 'next/navigation'
import { ChampionSummaryTable } from '@/components/ChampionSummaryTable'

export default function AdminChampionsPage() {
  const router = useRouter()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>챔피언 리스트</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>챔피언을 선택하면 상세 페이지로 이동합니다.</p>
      </div>
      <ChampionSummaryTable
        onChampionClick={(userId) => router.push(`/admin/champions/${userId}`)}
        onCharterClick={(userId) => router.push(`/admin/champions/${userId}`)}
      />
    </div>
  )
}
```

- [ ] **Step 2: 개발 서버에서 수동 확인**

```bash
npm run dev
```

1. `http://localhost:3000/admin/champions` 접속 → 챔피언 목록 테이블이 표시되는지 확인
2. 챔피언 이름 클릭 → `/admin/champions/:id` 로 이동하는지 확인
3. "📋 게시됨" 버튼 클릭 → `/admin/champions/:id` 로 이동하는지 확인
4. 좌측 메뉴 "챔피언 리스트" 항목이 active 상태인지 확인

- [ ] **Step 3: 커밋**

```bash
git add app/admin/champions/page.tsx
git commit -m "[AX-1] feat(admin): 챔피언 리스트 페이지 (/admin/champions) 신규 추가"
```

---

### Task 3: Kanban — `not_started` / `in_progress` 카드 클릭 시 챔피언 상세 이동

**Files:**
- Modify: `app/admin/kanban/page.tsx`

현재 동작:
- `CLICKABLE_COLS = ['reviewing', 'accepted', 'declined']` → 클릭 시 `SubmissionDetailPanel` 오픈
- `not_started`, `in_progress` → 클릭 불가

변경 후 동작:
- `reviewing`, `accepted`, `declined` → 기존과 동일 (SubmissionDetailPanel 오픈, 변경 없음)
- `not_started`, `in_progress` → 클릭 시 `/admin/champions/:id` 페이지 이동

구현 전략: `KanbanCardView`에 `onNavigate` prop 추가. `DroppableCol`에서 컬럼에 따라 `onClick`(기존 패널)과 `onNavigate`(라우터 이동)를 분기.

- [ ] **Step 1: `useRouter` import 추가**

`app/admin/kanban/page.tsx` 상단 import 수정.

```typescript
// 기존
import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'  // 추가
```

실제로는 다음과 같이 수정한다:

```typescript
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { SubmissionDetailPanel } from '@/components/SubmissionDetailPanel'
import type { KanbanCard, KanbanColumn, KanbanDataV2, SubmissionStatus } from '@/lib/types'
```

- [ ] **Step 2: `NAVIGATE_COLS` 상수 추가 및 `KanbanCardView` props 확장**

`CLICKABLE_COLS` 상수 아래에 `NAVIGATE_COLS` 추가:

```typescript
const CLICKABLE_COLS: KanbanColumn[] = ['reviewing', 'accepted', 'declined']
const NAVIGATE_COLS: KanbanColumn[] = ['not_started', 'in_progress']
```

`KanbanCardView` 컴포넌트 props 인터페이스 수정 (기존 `onClick` 에 `onNavigate` 추가):

```typescript
function KanbanCardView({
  card,
  col,
  draggable,
  clickable,
  onClick,
  onNavigate,
}: {
  card: KanbanCard
  col: typeof COLS[0]
  draggable: boolean
  clickable: boolean
  onClick?: () => void
  onNavigate?: () => void
}) {
```

- [ ] **Step 3: `KanbanCardView` 내부 cursor 및 이벤트 핸들러 수정**

`KanbanCardView` 내부에서 `cursor` 계산과 클릭 핸들러를 수정한다. `onNavigate`가 있으면 navigate 동작, 없으면 기존 `onClick` 동작:

```typescript
  const isInteractive = draggable || clickable || !!onNavigate
  const cursor = draggable ? 'grab' : (clickable || onNavigate) ? 'pointer' : 'default'

  function handleClick() {
    if (onNavigate) { onNavigate(); return }
    if (clickable) onClick?.()
  }

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={isInteractive && !draggable ? handleClick : undefined}
      role={isInteractive && !draggable ? 'button' : undefined}
      tabIndex={isInteractive && !draggable ? 0 : undefined}
      onKeyDown={isInteractive && !draggable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      } : undefined}
      className="rounded-xl border text-xs p-3 transition-shadow hover:shadow-md"
      style={{
        background: col.cardBg,
        borderColor: col.cardBorder,
        opacity: isDragging ? 0.4 : 1,
        cursor,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
```

- [ ] **Step 4: `DroppableCol`에 `onCardNavigate` prop 추가 및 `KanbanCardView` 호출 수정**

`DroppableCol` props 인터페이스에 `onCardNavigate` 추가:

```typescript
function DroppableCol({
  col,
  cards,
  isDropTarget,
  onCardClick,
  onCardNavigate,
}: {
  col: typeof COLS[0]
  cards: KanbanCard[]
  isDropTarget: boolean
  onCardClick: (card: KanbanCard) => void
  onCardNavigate: (card: KanbanCard) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key, disabled: !isDropTarget })
  const isClickable = CLICKABLE_COLS.includes(col.key)
  const isNavigable = NAVIGATE_COLS.includes(col.key)

  return (
    // ... (기존 JSX 유지, 아래 KanbanCardView 호출 부분만 수정)
    <div className="flex flex-col gap-2">
      {cards.map(card => (
        <KanbanCardView
          key={cardDragId(card)}
          card={card}
          col={col}
          draggable={DRAGGABLE_COLS.includes(col.key)}
          clickable={isClickable}
          onClick={() => onCardClick(card)}
          onNavigate={isNavigable ? () => onCardNavigate(card) : undefined}
        />
      ))}
    </div>
```

- [ ] **Step 5: `AdminKanbanPage`에 `useRouter` 및 `onCardNavigate` 핸들러 추가**

`AdminKanbanPage` 함수 상단에 `useRouter` 추가:

```typescript
export default function AdminKanbanPage() {
  const router = useRouter()
  const [data, setData] = useState<KanbanDataV2>(EMPTY_DATA)
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null)
  const [loading, setLoading] = useState(true)
  // ...
```

`DroppableCol` 렌더 부분에 `onCardNavigate` prop 전달:

```typescript
{COLS.map(col => (
  <DroppableCol
    key={col.key}
    col={col}
    cards={data[col.key]}
    isDropTarget={DROPPABLE_COLS.includes(col.key)}
    onCardClick={setSelectedCard}
    onCardNavigate={(card) => router.push(`/admin/champions/${card.userId}`)}
  />
))}
```

- [ ] **Step 6: TypeScript 컴파일 오류 확인**

```bash
npx tsc --noEmit 2>&1 | grep "kanban"
```

Expected: 출력 없음 (오류 없음)

- [ ] **Step 7: 개발 서버에서 수동 확인**

```bash
npm run dev
```

1. `http://localhost:3000/admin/kanban` 접속
2. **미시작** 컬럼 카드 hover → cursor: pointer 확인
3. **미시작** 카드 클릭 → `/admin/champions/:id` 로 이동 확인
4. **진행 중** 카드 클릭 → `/admin/champions/:id` 로 이동 확인
5. **검토 중** 카드 클릭 → 기존과 동일하게 SubmissionDetailPanel 열리는지 확인
6. **합격/불합격** 카드 클릭 → 기존과 동일하게 SubmissionDetailPanel 열리는지 확인
7. **검토 중** 카드 드래그 → 합격/불합격으로 드래그 가능한지 확인 (기존 기능 regression 체크)

- [ ] **Step 8: 커밋**

```bash
git add app/admin/kanban/page.tsx
git commit -m "[AX-1] feat(admin/kanban): 미시작·진행중 카드 클릭 시 챔피언 상세 이동"
```
