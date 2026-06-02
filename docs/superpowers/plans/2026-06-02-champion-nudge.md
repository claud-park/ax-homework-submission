# Champion Nudging Userflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 어드민이 `ChampionGanttView`의 "확인 요함" 칩 또는 delayed 간트 바를 클릭해 챔피언에게 넛지 이메일을 발송할 수 있는 admin-only 기능 추가.

**Architecture:** `nudgeChampion()` (notifications.ts) → `POST /api/admin/nudge` (route) → `NudgePopover` (UI) → `ChampionGanttView` (chip/bar click trigger). 챔피언 뷰에는 `isAdmin=false`(default)로 완전히 숨김.

**Tech Stack:** Next.js App Router, React, TypeScript, nodemailer(sendEmail), sonner toast, inline styles

---

## File Map

| 파일 | 유형 | 역할 |
|------|------|------|
| `lib/notifications.ts` | Modify | `nudgeChampion()` 추가 |
| `app/api/admin/nudge/route.ts` | Create | POST API — verifyAdmin + nudgeChampion 호출 |
| `components/NudgePopover.tsx` | Create | fixed-positioned popover + 찌르기 버튼 |
| `components/ChampionGanttView.tsx` | Modify | `isAdmin` prop, milestoneMap, chip/bar 클릭 핸들러, NudgePopover 렌더 |
| `app/admin/page.tsx` | Modify | `<ChampionGanttView isAdmin />` |

---

## Task 1: `nudgeChampion()` — notifications.ts

**Files:**
- Modify: `lib/notifications.ts`

### 배경
`sendEmail()`은 이미 존재. 넛지 3종에 대한 이메일 HTML을 생성하고 수신자에게 발송하는 함수를 추가한다. 모든 이메일에는 쿠션어가 포함된다.

- [ ] **Step 1: `nudgeChampion()` 함수를 파일 맨 끝에 추가**

`lib/notifications.ts` 파일 끝 (`export async function notifyBottleneck(...)` 블록 닫는 `}` 다음 줄)에 아래 코드를 추가한다.

```typescript
export async function nudgeChampion(params: {
  user: { id: string; email: string; name: string }
  nudgeType: 'no_charter' | 'no_milestone' | 'delayed_milestone'
  milestoneTitle?: string
}): Promise<void> {
  const { user, nudgeType, milestoneTitle } = params
  const base = appBaseUrl()

  const cushion = `바쁜 일정 속에서도 AX 프로젝트를 함께해 주셔서 진심으로 감사드립니다.<br>번거로우시겠지만, 잠깐만 아래 내용을 확인해 주시면 정말 감사하겠습니다.`

  let subject: string
  let bodyLine: string
  let ctaHref: string
  let ctaLabel: string

  if (nudgeType === 'no_charter') {
    subject = '[AX] 과제정의서 제출을 기다리고 있습니다 🙏'
    bodyLine = 'AX Champion 과제정의서를 제출해주세요.'
    ctaHref = `${base}/my-project/charter`
    ctaLabel = '과제정의서 작성하기'
  } else if (nudgeType === 'no_milestone') {
    subject = '[AX] 마일스톤 등록을 기다리고 있습니다 🙏'
    bodyLine = '과제정의서에 마일스톤을 등록해주세요.'
    ctaHref = `${base}/my-project/milestones`
    ctaLabel = '마일스톤 등록하기'
  } else {
    const titleRaw = milestoneTitle ?? ''
    subject = `[AX] '${titleRaw}' 마일스톤을 확인해주세요 🙏`
    const titleEsc = escapeHtml(titleRaw)
    bodyLine = `${titleEsc} 마일스톤을 완료해주세요. 혹시 병목이 생긴다면 [내 업무 현황] &gt; [이슈 보고/도움 요청]을 해 주세요.`
    ctaHref = `${base}/my-project/milestones`
    ctaLabel = '마일스톤 확인하기'
  }

  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #d97706;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">🙏 AX 팀에서 알림드립니다</h2>
  </div>
  <p style="margin:0 0 16px 0;font-size:14px;color:#0f172a">안녕하세요, ${escapeHtml(user.name)}님.</p>
  <p style="margin:0 0 16px 0;font-size:14px;color:#64748b;line-height:1.6">${cushion}</p>
  <p style="margin:0 0 24px 0;font-size:14px;color:#0f172a">${bodyLine}</p>
  <div>
    <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#d97706;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${ctaLabel}</a>
  </div>
</div>
`.trim()

  await sendEmail({ to: user.email, subject, html })
}
```

- [ ] **Step 2: TypeScript 오류 없는지 확인**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission && npx tsc --noEmit 2>&1 | grep -E "notifications|error"
```

오류 없으면 OK.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications.ts
git commit -m "[AX-1] feat(notifications): nudgeChampion() 이메일 발송 함수 추가"
```

---

## Task 2: `POST /api/admin/nudge` — API Route

**Files:**
- Create: `app/api/admin/nudge/route.ts`

### 배경
어드민만 호출할 수 있는 POST 엔드포인트. `verifyAdmin`으로 인증·권한 확인 후 Supabase에서 유저 정보를 조회해 `nudgeChampion()`을 호출한다.

`verifyAdmin`은 `lib/auth.ts`에 이미 있으며, `user.user_metadata?.is_admin`이 없으면 null을 반환한다.

- [ ] **Step 1: 디렉터리 확인 후 route.ts 생성**

`app/api/admin/` 디렉터리가 이미 존재하는지 확인:

```bash
ls /Users/claud_01/Documents/flo/AX/ax-homework-submission/app/api/admin/
```

그 다음 파일 생성:

```typescript
// app/api/admin/nudge/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { nudgeChampion } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    userId?: string
    nudgeType?: 'no_charter' | 'no_milestone' | 'delayed_milestone'
    milestoneTitle?: string
  }

  const { userId, nudgeType, milestoneTitle } = body

  if (!userId || !nudgeType) {
    return NextResponse.json({ error: 'userId and nudgeType are required' }, { status: 400 })
  }
  if (nudgeType === 'delayed_milestone' && !milestoneTitle) {
    return NextResponse.json({ error: 'milestoneTitle is required for delayed_milestone' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('id', userId)
    .single()

  if (userErr || !userData) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    await nudgeChampion({ user: userData, nudgeType, milestoneTitle })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[nudge] email send failed:', e)
    return NextResponse.json({ error: 'Email send failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: TypeScript 오류 확인**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission && npx tsc --noEmit 2>&1 | grep -E "nudge|error"
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/nudge/route.ts
git commit -m "[AX-1] feat(api): POST /api/admin/nudge 엔드포인트 추가"
```

---

## Task 3: `NudgePopover` — 컴포넌트

**Files:**
- Create: `components/NudgePopover.tsx`

### 배경
어드민이 칩 또는 간트 바를 클릭하면 표시되는 fixed-positioned popover. 상태: idle → sending → (success: close + toast) | (error: toast + re-enable).

로딩 스피너는 Tailwind `animate-spin` 클래스 사용. `apiFetch`는 `'Content-Type': 'application/json'`과 Bearer 토큰을 자동 추가한다.

- [ ] **Step 1: `components/NudgePopover.tsx` 생성**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'

type NudgeType = 'no_charter' | 'no_milestone' | 'delayed_milestone'

const ISSUE_LABEL: Record<NudgeType, string> = {
  no_charter: '과제정의서 미제출',
  no_milestone: '마일스톤 미등록',
  delayed_milestone: '마일스톤 지연',
}

interface Props {
  userId: string
  name: string
  nudgeType: NudgeType
  milestoneTitle?: string
  anchorX: number
  anchorY: number
  onClose: () => void
}

export function NudgePopover({ userId, name, nudgeType, milestoneTitle, anchorX, anchorY, onClose }: Props) {
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (sending) return
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [sending, onClose])

  async function handleSend() {
    setSending(true)
    try {
      await apiFetch('/api/admin/nudge', {
        method: 'POST',
        body: JSON.stringify({ userId, nudgeType, milestoneTitle }),
      })
      onClose()
      toast.success('📧 넛지 메일을 발송했습니다')
    } catch {
      toast.error('메일 발송에 실패했습니다. 다시 시도해주세요.')
      setSending(false)
    }
  }

  const issueLabel = nudgeType === 'delayed_milestone' && milestoneTitle
    ? `'${milestoneTitle}' 지연`
    : ISSUE_LABEL[nudgeType]

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: anchorX,
        top: anchorY,
        zIndex: 9999,
        minWidth: 180,
        padding: '12px 14px',
        borderRadius: 8,
        background: 'var(--surface-primary)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{issueLabel}</div>
      </div>
      <button
        onClick={handleSend}
        disabled={sending}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '7px 12px',
          borderRadius: 6,
          border: 'none',
          background: sending ? 'rgba(217,119,6,0.4)' : 'rgba(217,119,6,0.85)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: sending ? 'default' : 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {sending ? (
          <>
            <span
              className="animate-spin"
              style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff',
                display: 'inline-block',
              }}
            />
            발송 중...
          </>
        ) : (
          '찌르기 📧'
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 오류 확인**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission && npx tsc --noEmit 2>&1 | grep -E "NudgePopover|error"
```

- [ ] **Step 3: Commit**

```bash
git add components/NudgePopover.tsx
git commit -m "[AX-1] feat(ui): NudgePopover 컴포넌트 추가"
```

---

## Task 4: `ChampionGanttView.tsx` — isAdmin + 클릭 핸들러 + NudgePopover

**Files:**
- Modify: `components/ChampionGanttView.tsx`

### 배경
공유 컴포넌트이므로 `isAdmin?: boolean` prop(default false)으로 어드민 기능을 게이팅한다.

두 가지 클릭 트리거:
1. **"확인 요함" 칩 클릭**: 칩 element의 `getBoundingClientRect()`로 앵커 좌표 계산
2. **간트 delayed 바 클릭**: `onMouseMove`로 마지막 마우스 좌표를 추적하고, `<Gantt onClick>`에서 delayed task일 때 팝오버 표시

milestoneMap: 전체 챔피언의 마일스톤을 id → `{milestone, userId, championName}` 로 O(1) 조회.

### 변경 순서

- [ ] **Step 1: import 추가**

`components/ChampionGanttView.tsx` 상단의 기존 import 블록에 아래 두 줄을 추가한다.

기존:
```tsx
import type { ChampionProject, MilestoneStatus } from '@/lib/types'
```

변경 후:
```tsx
import type { ChampionProject, MilestoneStatus } from '@/lib/types'
import { NudgePopover } from '@/components/NudgePopover'
import type { GanttMilestone } from '@/app/api/champions/gantt/route'
```

- [ ] **Step 2: NudgeState 타입 추가**

`const PROJECT_W_DEFAULT = 130` 상수 선언 바로 위(파일 상단 constants 블록)에 추가한다.

```typescript
type NudgeType = 'no_charter' | 'no_milestone' | 'delayed_milestone'

interface NudgeState {
  userId: string
  name: string
  nudgeType: NudgeType
  milestoneTitle?: string
  anchorX: number
  anchorY: number
}
```

- [ ] **Step 3: 컴포넌트 props에 `isAdmin` 추가**

기존:
```typescript
export function ChampionGanttView() {
```

변경 후:
```typescript
export function ChampionGanttView({ isAdmin = false }: { isAdmin?: boolean }) {
```

- [ ] **Step 4: state / ref 추가**

기존 state 선언 블록 (`const [champions, setChampions]...` 등) 마지막 줄(`const resizeDragRef = ...`) 바로 다음에 두 줄을 추가한다.

```typescript
  const [nudgeState, setNudgeState] = useState<NudgeState | null>(null)
  const lastMousePos = useRef({ x: 0, y: 0 })
```

- [ ] **Step 5: `milestoneMap` useMemo 추가**

`champMap` useMemo 블록 바로 다음에 추가한다.

기존 (champMap 끝):
```typescript
  }, [champions])

  const noCharter = useMemo(
```

변경 후:
```typescript
  }, [champions])

  const milestoneMap = useMemo(() => {
    const m = new Map<string, { milestone: GanttMilestone; userId: string; championName: string }>()
    for (const c of champions) {
      for (const ms of c.milestones) {
        m.set(ms.id, { milestone: ms, userId: c.userId, championName: c.name })
      }
    }
    return m
  }, [champions])

  const noCharter = useMemo(
```

- [ ] **Step 6: 클릭 핸들러 2개 추가**

`handleCharterClick` useCallback 선언 바로 다음에 두 핸들러를 추가한다.

```typescript
  const handleChipNudge = useCallback((
    c: GanttChampion,
    nudgeType: 'no_charter' | 'no_milestone',
    e: React.MouseEvent<HTMLElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setNudgeState({ userId: c.userId, name: c.name, nudgeType, anchorX: rect.left, anchorY: rect.bottom + 8 })
  }, [])

  const handleGanttMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    lastMousePos.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleGanttClick = useCallback((task: Task) => {
    if (!isAdmin) return
    if (task.id.startsWith('champ-')) return
    const msId = task.id.startsWith('group-') ? task.id.slice(6) : task.id
    const entry = milestoneMap.get(msId)
    if (!entry || entry.milestone.status !== 'delayed') return
    setNudgeState({
      userId: entry.userId,
      name: entry.championName,
      nudgeType: 'delayed_milestone',
      milestoneTitle: entry.milestone.title,
      anchorX: lastMousePos.current.x,
      anchorY: lastMousePos.current.y + 12,
    })
  }, [isAdmin, milestoneMap])
```

- [ ] **Step 7: "확인 요함" 칩을 클릭 가능하게 변경**

현재 "확인 요함" 섹션의 그룹 배열:
```tsx
            {[
              { label: '과제정의서 미제출', list: noCharter },
              { label: '마일스톤 미등록', list: noMilestone },
            ].filter(g => g.list.length > 0).map(g => (
```

아래로 교체한다 (nudgeType 필드 추가):
```tsx
            {[
              { label: '과제정의서 미제출', nudgeType: 'no_charter' as const, list: noCharter },
              { label: '마일스톤 미등록', nudgeType: 'no_milestone' as const, list: noMilestone },
            ].filter(g => g.list.length > 0).map(g => (
```

그리고 같은 섹션 내 `{g.list.map(c => (` 아래의 `<span` 엘리먼트:

기존:
```tsx
                  <span
                    key={c.userId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '3px 8px 3px 4px',
                      borderRadius: 20,
                      border: '1px solid rgba(217,119,6,0.3)',
                      background: 'rgba(217,119,6,0.08)',
                      fontSize: 12,
                      color: 'rgba(180,83,9,1)',
                    }}
                  >
```

변경 후:
```tsx
                  <span
                    key={c.userId}
                    role={isAdmin ? 'button' : undefined}
                    tabIndex={isAdmin ? 0 : undefined}
                    onClick={isAdmin ? (e) => handleChipNudge(c, g.nudgeType, e as React.MouseEvent<HTMLElement>) : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '3px 8px 3px 4px',
                      borderRadius: 20,
                      border: '1px solid rgba(217,119,6,0.3)',
                      background: 'rgba(217,119,6,0.08)',
                      fontSize: 12,
                      color: 'rgba(180,83,9,1)',
                      cursor: isAdmin ? 'pointer' : 'default',
                    }}
                  >
```

- [ ] **Step 8: 간트 컨테이너에 `onMouseMove` 추가**

현재 `{tasks.length > 0 && (` 블록 내부의 `<div style={{ fontSize: 12 }}>` 시작 태그:

기존:
```tsx
            <div style={{ fontSize: 12 }}>
              <Gantt
```

변경 후:
```tsx
            <div style={{ fontSize: 12 }} onMouseMove={handleGanttMouseMove}>
              <Gantt
```

그리고 `<Gantt` 컴포넌트의 `TooltipContent={GanttTooltip}` prop 바로 다음에 (닫는 `/>` 전에) 추가:

기존:
```tsx
                TooltipContent={GanttTooltip}
              />
```

변경 후:
```tsx
                TooltipContent={GanttTooltip}
                onClick={handleGanttClick}
              />
```

- [ ] **Step 9: NudgePopover 렌더링 추가**

`return` 블록의 마지막 닫는 태그 바로 앞, `{panelUserId && (` 블록과 나란히:

기존 (return 블록 끝):
```tsx
      {panelUserId && (
        <CharterDetailPanel
          key={panelUserId}
          userId={panelUserId}
          champMap={champMap}
          onClose={() => setPanelUserId(null)}
        />
      )}
    </div>
  )
}
```

변경 후:
```tsx
      {panelUserId && (
        <CharterDetailPanel
          key={panelUserId}
          userId={panelUserId}
          champMap={champMap}
          onClose={() => setPanelUserId(null)}
        />
      )}

      {nudgeState && (
        <NudgePopover
          userId={nudgeState.userId}
          name={nudgeState.name}
          nudgeType={nudgeState.nudgeType}
          milestoneTitle={nudgeState.milestoneTitle}
          anchorX={nudgeState.anchorX}
          anchorY={nudgeState.anchorY}
          onClose={() => setNudgeState(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 10: TypeScript 오류 확인**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission && npx tsc --noEmit 2>&1 | grep -E "ChampionGanttView|NudgePopover|error TS"
```

오류 없어야 한다.

- [ ] **Step 11: Commit**

```bash
git add components/ChampionGanttView.tsx
git commit -m "[AX-1] feat(gantt): isAdmin prop + 넛지 칩/간트바 클릭 핸들러 추가"
```

---

## Task 5: `app/admin/page.tsx` — `isAdmin` prop 전달

**Files:**
- Modify: `app/admin/page.tsx`

### 배경
`ChampionGanttView`에 `isAdmin` prop을 전달해야 어드민 전용 넛지 기능이 활성화된다. 챔피언 뷰(`/(champion)/page.tsx`)는 변경하지 않으므로 기본값 `false`가 유지된다.

- [ ] **Step 1: `<ChampionGanttView />` → `<ChampionGanttView isAdmin />`**

`app/admin/page.tsx`의:

기존:
```tsx
        <ChampionGanttView />
```

변경 후:
```tsx
        <ChampionGanttView isAdmin />
```

- [ ] **Step 2: TypeScript 오류 확인**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission && npx tsc --noEmit 2>&1 | grep error
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/page.tsx
git commit -m "[AX-1] feat(admin): ChampionGanttView에 isAdmin prop 전달"
```

---

## 최종 동작 확인 체크리스트

개발 서버(`npm run dev`) 실행 후:

- [ ] `/admin` 대시보드 → 간트 뷰 → "확인 요함" 칩 클릭 → NudgePopover 표시 (이름, 이슈유형, 찌르기 버튼)
- [ ] "찌르기 📧" 클릭 → 버튼 disabled + 로딩 스피너 → 성공 시 popover 닫힘 + sonner toast
- [ ] `/admin` 간트 차트 내 delayed(빨간) 바에 마우스 오버 후 클릭 → NudgePopover 표시
- [ ] Popover 바깥 클릭 → dismiss (발송 중에는 dismiss 불가)
- [ ] `/(champion)/` 뷰에서는 칩 클릭해도 popover 미표시, 간트 바 클릭해도 반응 없음
