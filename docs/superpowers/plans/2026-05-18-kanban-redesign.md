# Kanban 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민 칸반을 파일 제출 단위 보드에서 챔피언 × 과제 통합 진행 단계 보드(5컬럼)로 전환한다.

**Architecture:** API가 users × homeworks 카르테시안 곱을 집계해 `KanbanCard[]`를 반환하고, 프론트엔드는 5개 컬럼(미시작/진행중/검토중/합격/불합격)에 카드를 배치한다. DnD는 검토중 → 합격/불합격 방향만 허용.

**Tech Stack:** Next.js 14 App Router, Supabase PostgreSQL, @dnd-kit/core, TypeScript

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|---------|
| `lib/types.ts` | `KanbanCard`, `KanbanColumn`, `KanbanDataV2` 추가. 기존 `KanbanData` 유지(deprecated) |
| `app/api/admin/kanban/route.ts` | 전면 재작성 — 4개 테이블 집계 로직 |
| `app/admin/kanban/page.tsx` | 전면 재작성 — 5컬럼 UI + 새 카드 컴포넌트 |

---

## Task 1: 타입 정의 추가 (`lib/types.ts`)

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: `KanbanCard`, `KanbanColumn`, `KanbanDataV2` 타입을 `lib/types.ts` 끝에 추가**

  기존 `KanbanData` 인터페이스(line 117–122)는 그대로 유지하고, 아래 코드를 파일 끝에 추가한다.

  ```ts
  // lib/types.ts 끝에 추가
  export interface KanbanCard {
    userId: string
    homeworkId: number
    homeworkTitle: string
    user: User
    latestSubmission: {
      id: string
      status: SubmissionStatus
      attemptNumber: number
      fileName: string
      submittedAt: string
    } | null
    milestoneTotal: number
    milestoneCompleted: number
    hasCharter: boolean
    pendingDeadlineRequests: number
  }

  export type KanbanColumn = 'not_started' | 'in_progress' | 'reviewing' | 'accepted' | 'declined'

  export interface KanbanDataV2 {
    not_started: KanbanCard[]
    in_progress: KanbanCard[]
    reviewing: KanbanCard[]
    accepted: KanbanCard[]
    declined: KanbanCard[]
  }
  ```

- [ ] **Step 2: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: 오류 없음 (또는 타입 관련 기존 오류만)

- [ ] **Step 3: Commit**

  ```bash
  git add lib/types.ts
  git commit -m "feat(types): KanbanCard, KanbanColumn, KanbanDataV2 추가"
  ```

---

## Task 2: API 라우트 재작성 (`app/api/admin/kanban/route.ts`)

**Files:**
- Modify: `app/api/admin/kanban/route.ts`

**집계 로직 설명:**
1. `users` 전체 조회
2. `homeworks` 조회 (homework_id 필터 적용)
3. `submissions` — submitted_at DESC 정렬 후 JS로 user_id+homework_id 기준 최신 1건 추출
4. `milestones` — (user_id, homework_id) 별 total/completed 카운트
5. `charter_submissions` — (user_id, homework_id) 존재 여부 Set
6. `deadline_change_requests` — status='pending', milestones 조인으로 homework_id 연결, (user_id, homework_id) 별 카운트

**컬럼 배치 로직:**
- `accepted`: latestSubmission.status === 'accepted'
- `reviewing`: latestSubmission.status === 'pending'
- `declined`: latestSubmission.status === 'declined'
- `in_progress`: latestSubmission === null AND (milestoneTotal > 0 OR hasCharter)
- `not_started`: latestSubmission === null AND milestoneTotal === 0 AND !hasCharter

- [ ] **Step 1: `app/api/admin/kanban/route.ts` 전면 재작성**

  ```ts
  import { NextRequest, NextResponse } from 'next/server'
  import { verifyAdmin } from '@/lib/auth'
  import { createServiceClient } from '@/lib/supabase/server'
  import type { KanbanCard, KanbanDataV2 } from '@/lib/types'

  export async function GET(req: NextRequest) {
    const admin = await verifyAdmin(req)
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const homeworkIdParam = searchParams.get('homework_id')
    if (homeworkIdParam !== null && isNaN(parseInt(homeworkIdParam, 10))) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }
    const homeworkId = homeworkIdParam ? parseInt(homeworkIdParam, 10) : null

    const supabase = createServiceClient()

    // 1. Users
    const { data: users, error: usersErr } = await supabase.from('users').select('*')
    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

    // 2. Homeworks
    let hwQuery = supabase.from('homeworks').select('id, title')
    if (homeworkId) hwQuery = hwQuery.eq('id', homeworkId)
    const { data: homeworks, error: hwErr } = await hwQuery
    if (hwErr) return NextResponse.json({ error: hwErr.message }, { status: 500 })

    // 3. Latest submission per (user_id, homework_id)
    const { data: allSubmissions, error: subErr } = await supabase
      .from('submissions')
      .select('id, user_id, homework_id, file_name, status, attempt_number, submitted_at')
      .order('submitted_at', { ascending: false })
    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })

    const latestSubMap = new Map<string, typeof allSubmissions[0]>()
    for (const sub of allSubmissions ?? []) {
      const key = `${sub.user_id}_${sub.homework_id}`
      if (!latestSubMap.has(key)) latestSubMap.set(key, sub)
    }

    // 4. Milestone counts per (user_id, homework_id)
    const { data: milestones, error: msErr } = await supabase
      .from('milestones')
      .select('user_id, homework_id, status')
    if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })

    const milestoneMap = new Map<string, { total: number; completed: number }>()
    for (const m of milestones ?? []) {
      if (m.homework_id === null) continue
      const key = `${m.user_id}_${m.homework_id}`
      const entry = milestoneMap.get(key) ?? { total: 0, completed: 0 }
      entry.total++
      if (m.status === 'completed') entry.completed++
      milestoneMap.set(key, entry)
    }

    // 5. Charter existence per (user_id, homework_id)
    const { data: charters, error: charterErr } = await supabase
      .from('charter_submissions')
      .select('user_id, homework_id')
    if (charterErr) return NextResponse.json({ error: charterErr.message }, { status: 500 })

    const charterSet = new Set<string>()
    for (const c of charters ?? []) {
      if (c.homework_id !== null) charterSet.add(`${c.user_id}_${c.homework_id}`)
    }

    // 6. Pending deadline requests per (user_id, homework_id) via milestone join
    const { data: deadlineReqs, error: dlErr } = await supabase
      .from('deadline_change_requests')
      .select('user_id, milestones(homework_id)')
      .eq('status', 'pending')
    if (dlErr) return NextResponse.json({ error: dlErr.message }, { status: 500 })

    const deadlineMap = new Map<string, number>()
    for (const req of deadlineReqs ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hwId = (req.milestones as any)?.homework_id
      if (!hwId) continue
      const key = `${req.user_id}_${hwId}`
      deadlineMap.set(key, (deadlineMap.get(key) ?? 0) + 1)
    }

    // Build KanbanCard[] for every user × homework pair
    const result: KanbanDataV2 = {
      not_started: [],
      in_progress: [],
      reviewing: [],
      accepted: [],
      declined: [],
    }

    for (const hw of homeworks ?? []) {
      for (const user of users ?? []) {
        const key = `${user.id}_${hw.id}`
        const sub = latestSubMap.get(key) ?? null
        const ms = milestoneMap.get(key) ?? { total: 0, completed: 0 }
        const hasCharter = charterSet.has(key)
        const pendingDeadlineRequests = deadlineMap.get(key) ?? 0

        const card: KanbanCard = {
          userId: user.id,
          homeworkId: hw.id,
          homeworkTitle: hw.title,
          user,
          latestSubmission: sub
            ? {
                id: sub.id,
                status: sub.status,
                attemptNumber: sub.attempt_number,
                fileName: sub.file_name,
                submittedAt: sub.submitted_at,
              }
            : null,
          milestoneTotal: ms.total,
          milestoneCompleted: ms.completed,
          hasCharter,
          pendingDeadlineRequests,
        }

        if (sub?.status === 'accepted') result.accepted.push(card)
        else if (sub?.status === 'pending') result.reviewing.push(card)
        else if (sub?.status === 'declined') result.declined.push(card)
        else if (ms.total > 0 || hasCharter) result.in_progress.push(card)
        else result.not_started.push(card)
      }
    }

    return NextResponse.json(result)
  }
  ```

- [ ] **Step 2: API 응답 확인 (개발 서버 실행 중 상태에서)**

  ```bash
  # 터미널에서 (개발 서버가 실행 중이어야 함)
  curl -s "http://localhost:3000/api/admin/kanban" \
    -H "Cookie: $(cat .dev-cookie 2>/dev/null || echo '')" \
    | npx -y prettier --parser json 2>/dev/null | head -60
  ```

  Expected: `{ not_started: [...], in_progress: [...], reviewing: [...], accepted: [...], declined: [...] }` 형태의 JSON

  > 참고: 인증 쿠키가 필요하므로 브라우저 DevTools Network 탭에서 응답을 확인해도 된다.

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: 오류 없음

- [ ] **Step 4: Commit**

  ```bash
  git add app/api/admin/kanban/route.ts
  git commit -m "feat(api): kanban 라우트 재작성 — 챔피언×과제 집계"
  ```

---

## Task 3: 프론트엔드 재작성 (`app/admin/kanban/page.tsx`)

**Files:**
- Modify: `app/admin/kanban/page.tsx`

**설계 요점:**
- `useDroppable`: `accepted`, `declined` 컬럼만
- `useDraggable`: `reviewing` 컬럼 카드만 (card.latestSubmission 보장됨)
- 아바타 이니셜: `user.name`의 첫 글자
- 마일스톤 바: `milestoneTotal === 0`이면 숨김
- 과제 번호/타이틀: `selectedHw === ''`(전체 과제)일 때만 표시

- [ ] **Step 1: `app/admin/kanban/page.tsx` 전면 재작성**

  ```tsx
  'use client'
  import { useEffect, useState, useCallback } from 'react'
  import {
    DndContext, DragEndEvent, DragOverlay, DragStartEvent,
    PointerSensor, useSensor, useSensors, useDroppable,
  } from '@dnd-kit/core'
  import { useDraggable } from '@dnd-kit/core'
  import { apiFetch } from '@/lib/api-client'
  import type { Homework, KanbanCard, KanbanColumn, KanbanDataV2 } from '@/lib/types'

  const COLS: { key: KanbanColumn; label: string; color: string; cardBorder: string; cardBg: string }[] = [
    { key: 'not_started', label: '미시작',  color: 'var(--text-disabled)', cardBorder: 'var(--border-subtle)',    cardBg: 'var(--surface-secondary)' },
    { key: 'in_progress', label: '진행 중', color: 'var(--amber)',          cardBorder: 'rgba(217,119,6,0.3)',    cardBg: 'rgba(217,119,6,0.04)'     },
    { key: 'reviewing',   label: '검토 중', color: 'var(--blue-600)',       cardBorder: 'rgba(37,99,235,0.3)',    cardBg: 'rgba(37,99,235,0.04)'     },
    { key: 'accepted',    label: '합격',    color: 'var(--success)',         cardBorder: 'rgba(22,163,74,0.3)',    cardBg: 'rgba(22,163,74,0.04)'     },
    { key: 'declined',    label: '불합격',  color: 'var(--error)',           cardBorder: 'rgba(220,38,38,0.3)',    cardBg: 'rgba(220,38,38,0.04)'     },
  ]

  const DROPPABLE_COLS: KanbanColumn[] = ['accepted', 'declined']

  function cardDragId(card: KanbanCard) {
    return `${card.userId}_${card.homeworkId}`
  }

  function KanbanCardView({
    card,
    col,
    draggable,
    showHomework,
  }: {
    card: KanbanCard
    col: typeof COLS[0]
    draggable: boolean
    showHomework: boolean
  }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: cardDragId(card),
      disabled: !draggable,
    })

    const initial = card.user.name?.[0] ?? '?'
    const avatarBg = col.cardBg
    const barPct = card.milestoneTotal > 0
      ? Math.round((card.milestoneCompleted / card.milestoneTotal) * 100)
      : 0

    return (
      <div
        ref={setNodeRef}
        {...(draggable ? { ...attributes, ...listeners } : {})}
        className="rounded-xl border text-xs p-3"
        style={{
          background: col.cardBg,
          borderColor: col.cardBorder,
          opacity: isDragging ? 0.4 : 1,
          cursor: draggable ? 'grab' : 'default',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        {/* Avatar + Name */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-full font-bold"
            style={{
              width: 28, height: 28,
              background: avatarBg,
              color: col.color,
              fontSize: 12,
              border: `1px solid ${col.cardBorder}`,
            }}
          >
            {initial}
          </div>
          <div>
            <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{card.user.name}</div>
            {showHomework && (
              <div style={{ color: 'var(--text-disabled)' }}>
                #{String(card.homeworkId).padStart(2, '0')} {card.homeworkTitle}
              </div>
            )}
          </div>
        </div>

        {/* Milestone bar */}
        {card.milestoneTotal > 0 && (
          <div className="mb-2">
            <div className="flex justify-between mb-1" style={{ color: 'var(--text-disabled)' }}>
              <span>마일스톤</span>
              <span style={{ color: col.color, fontWeight: 600 }}>
                {card.milestoneCompleted} / {card.milestoneTotal} 완료
              </span>
            </div>
            <div style={{ height: 4, background: col.cardBorder, borderRadius: 2 }}>
              <div
                style={{
                  width: `${barPct}%`,
                  height: '100%',
                  background: col.color,
                  borderRadius: 2,
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          {card.hasCharter && (
            <span
              className="rounded px-1.5 py-0.5"
              style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}
            >
              📋 과제정의서 제출
            </span>
          )}
          {card.pendingDeadlineRequests > 0 && (
            <span
              className="rounded px-1.5 py-0.5"
              style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--error)' }}
            >
              ⚠️ 기한변경 {card.pendingDeadlineRequests}건
            </span>
          )}
        </div>

        {/* Submission info */}
        {card.latestSubmission && (
          <div className="mt-2 truncate" style={{ color: 'var(--text-disabled)' }}>
            {card.latestSubmission.fileName} · 시도 {card.latestSubmission.attemptNumber}회
          </div>
        )}
      </div>
    )
  }

  function DroppableCol({
    col,
    cards,
    showHomework,
    isDropTarget,
  }: {
    col: typeof COLS[0]
    cards: KanbanCard[]
    showHomework: boolean
    isDropTarget: boolean
  }) {
    const { setNodeRef, isOver } = useDroppable({ id: col.key, disabled: !isDropTarget })

    return (
      <div
        ref={setNodeRef}
        className="flex-1 min-w-0 rounded-xl p-3 transition-colors"
        style={{
          minHeight: 200,
          background: isOver ? 'rgba(37,99,235,0.06)' : 'var(--surface-primary)',
          border: `1px solid ${isOver ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
        }}
      >
        <div className="flex items-center gap-1.5 mb-3">
          <div
            className="rounded-full flex-shrink-0"
            style={{ width: 8, height: 8, background: col.color }}
          />
          <h3
            className="text-xs font-bold tracking-wide uppercase"
            style={{ color: col.color }}
          >
            {col.label} / {cards.length}
          </h3>
        </div>
        <div className="flex flex-col gap-2">
          {cards.map(card => (
            <KanbanCardView
              key={cardDragId(card)}
              card={card}
              col={col}
              draggable={col.key === 'reviewing'}
              showHomework={showHomework}
            />
          ))}
        </div>
      </div>
    )
  }

  const EMPTY_DATA: KanbanDataV2 = {
    not_started: [],
    in_progress: [],
    reviewing: [],
    accepted: [],
    declined: [],
  }

  export default function AdminKanbanPage() {
    const [homeworks, setHomeworks] = useState<Homework[]>([])
    const [selectedHw, setSelectedHw] = useState<string>('')
    const [data, setData] = useState<KanbanDataV2>(EMPTY_DATA)
    const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
    const [toast, setToast] = useState<string | null>(null)

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

    function showToast(msg: string) {
      setToast(msg)
      setTimeout(() => setToast(null), 3000)
    }

    const fetchKanban = useCallback(() => {
      const url = selectedHw ? `/api/admin/kanban?homework_id=${selectedHw}` : '/api/admin/kanban'
      apiFetch<KanbanDataV2>(url).then(setData).catch(() => showToast('데이터 로드 실패'))
    }, [selectedHw])

    useEffect(() => {
      apiFetch<Homework[]>('/api/admin/homeworks').then(setHomeworks)
    }, [])

    useEffect(() => { fetchKanban() }, [fetchKanban])

    function onDragStart(event: DragStartEvent) {
      const card = data.reviewing.find(c => cardDragId(c) === event.active.id) ?? null
      setActiveCard(card)
    }

    async function onDragEnd(event: DragEndEvent) {
      setActiveCard(null)
      const { active, over } = event
      if (!over || !active) return
      const dragId = active.id as string
      const targetCol = over.id as KanbanColumn
      if (!DROPPABLE_COLS.includes(targetCol)) return

      const card = data.reviewing.find(c => cardDragId(c) === dragId)
      if (!card?.latestSubmission) return

      const newStatus = targetCol === 'accepted' ? 'accepted' : 'declined'
      const submissionId = card.latestSubmission.id

      // Optimistic update
      setData(prev => ({
        ...prev,
        reviewing: prev.reviewing.filter(c => cardDragId(c) !== dragId),
        [targetCol]: [
          ...prev[targetCol],
          { ...card, latestSubmission: { ...card.latestSubmission!, status: newStatus } },
        ],
      }))

      try {
        await apiFetch(`/api/admin/submissions/${submissionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        })
      } catch {
        showToast('상태 변경 실패. 되돌립니다.')
        fetchKanban()
      }
    }

    const showHomework = selectedHw === ''

    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            제출 현황 (Kanban)
          </h1>
          <select
            value={selectedHw}
            onChange={e => setSelectedHw(e.target.value)}
            className="text-sm rounded-lg px-3 py-2"
            style={{
              background: 'var(--surface-primary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">전체 과제</option>
            {homeworks.map(hw => (
              <option key={hw.id} value={hw.id}>
                #{String(hw.id).padStart(2, '0')} {hw.title}
              </option>
            ))}
          </select>
        </div>

        {toast && (
          <div
            className="mb-4 p-3 rounded-lg text-sm"
            style={{
              background: 'rgba(220,38,38,0.1)',
              color: 'var(--error)',
              border: '1px solid var(--error)',
            }}
          >
            {toast}
          </div>
        )}

        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-3" style={{ overflowX: 'auto', minWidth: 0 }}>
            {COLS.map(col => (
              <DroppableCol
                key={col.key}
                col={col}
                cards={data[col.key]}
                showHomework={showHomework}
                isDropTarget={DROPPABLE_COLS.includes(col.key)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeCard && (
              <KanbanCardView
                card={activeCard}
                col={COLS.find(c => c.key === 'reviewing')!}
                draggable={false}
                showHomework={showHomework}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    )
  }
  ```

- [ ] **Step 2: 개발 서버에서 시각 검증**

  ```bash
  # 개발 서버가 실행 중이지 않다면:
  npm run dev
  ```

  브라우저에서 `http://localhost:3000/admin/kanban` 접속 후 확인:
  - [ ] 5개 컬럼(미시작/진행 중/검토 중/합격/불합격) 표시
  - [ ] 각 컬럼 색상이 디자인 시스템 변수와 일치 (amber=진행중, blue=검토중, green=합격, red=불합격)
  - [ ] 챔피언 아바타 이니셜 표시
  - [ ] 마일스톤 진행 바 표시 (milestoneTotal > 0인 카드에만)
  - [ ] 과제정의서 뱃지 표시 (hasCharter인 카드)
  - [ ] 기한변경 요청 경고 표시 (pendingDeadlineRequests > 0인 카드)
  - [ ] 전체 과제 선택 시 카드에 과제 번호+타이틀 표시
  - [ ] 특정 과제 선택 시 과제 정보 숨김
  - [ ] 검토 중 카드 drag 가능 (cursor: grab)
  - [ ] 합격/불합격 컬럼으로만 drop 가능
  - [ ] DnD 완료 후 optimistic update 반영 (drag 직후 이동)
  - [ ] 미시작/진행 중 컬럼은 drop 불가 (isOver 하이라이트 없음)

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: 오류 없음

- [ ] **Step 4: Commit**

  ```bash
  git add app/admin/kanban/page.tsx
  git commit -m "feat(kanban): 5컬럼 챔피언×과제 보드로 재작성"
  ```
