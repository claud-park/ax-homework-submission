# Admin Progress — 제출 상태 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/progress` 페이지에 상단 집계 통계 바(합격/검토중/불합격/미제출/지연)와 과제 그룹 헤더 제출 상태 뱃지를 추가한다.

**Architecture:** 기존 milestones·charters fetch에 `/api/admin/kanban` fetch를 병렬로 추가한다. Kanban 응답을 `Map<"userId|hwId", SubmissionStatusOrNull>`로 변환해 클라이언트에서 통계 계산과 뱃지 렌더링에 재활용한다. 새 API 엔드포인트 없음.

**Tech Stack:** Next.js 15 App Router, TypeScript, React `useMemo`

---

## 파일 맵

| 파일 | 변경 |
|---|---|
| `app/admin/progress/page.tsx` | 유일한 변경 파일 — kanban fetch, 두 memos, 세 인라인 컴포넌트(StatItem·StatsBar·SubmissionBadge), 기존 두 컴포넌트 props 확장 |

---

### Task 1: kanban fetch + subStatusMap + stats useMemo

**Files:**
- Modify: `app/admin/progress/page.tsx:5` (import)
- Modify: `app/admin/progress/page.tsx:499–513` (state + useEffect)
- Modify: `app/admin/progress/page.tsx:525–554` (useMemo 블록 뒤에 추가)

- [ ] **Step 1: import에 `KanbanDataV2` 추가**

`app/admin/progress/page.tsx` 5번 라인을 교체:

```typescript
// 기존
import type { Milestone, User } from '@/lib/types'

// 변경 후
import type { KanbanDataV2, Milestone, User } from '@/lib/types'
```

- [ ] **Step 2: `kanbanData` state 추가**

`selectedCharter` state 선언(line 504) 바로 아래에 추가:

```typescript
const [kanbanData, setKanbanData] = useState<KanbanDataV2>({
  not_started: [], in_progress: [], reviewing: [], accepted: [], declined: [],
})
```

- [ ] **Step 3: useEffect에 kanban fetch 추가**

`useEffect` 내부 charters fetch(line 511–512) 바로 아래에 추가:

```typescript
apiFetch<KanbanDataV2>('/api/admin/kanban')
  .then(setKanbanData)
  .catch((e: Error) => toast.error('제출 현황 로드 실패: ' + e.message))
```

- [ ] **Step 4: `SubmissionStatusOrNull` 타입 + `subStatusMap` useMemo 추가**

`filteredCharters` useMemo(line 525–528) 바로 아래에 추가:

```typescript
type SubmissionStatusOrNull = 'accepted' | 'pending' | 'declined' | 'not_submitted'

const subStatusMap = useMemo(() => {
  const map = new Map<string, SubmissionStatusOrNull>()
  for (const card of kanbanData.accepted)    map.set(`${card.userId}|${card.homeworkId}`, 'accepted')
  for (const card of kanbanData.reviewing)   map.set(`${card.userId}|${card.homeworkId}`, 'pending')
  for (const card of kanbanData.declined)    map.set(`${card.userId}|${card.homeworkId}`, 'declined')
  for (const card of kanbanData.in_progress) map.set(`${card.userId}|${card.homeworkId}`, 'not_submitted')
  for (const card of kanbanData.not_started) map.set(`${card.userId}|${card.homeworkId}`, 'not_submitted')
  return map
}, [kanbanData])
```

- [ ] **Step 5: `stats` useMemo 추가**

`subStatusMap` useMemo 바로 아래에 추가:

```typescript
const stats = useMemo(() => {
  let accepted = 0, reviewing = 0, declined = 0, not_submitted = 0
  for (const card of kanbanData.accepted)    { if (selectedUsers.has(card.userId)) accepted++ }
  for (const card of kanbanData.reviewing)   { if (selectedUsers.has(card.userId)) reviewing++ }
  for (const card of kanbanData.declined)    { if (selectedUsers.has(card.userId)) declined++ }
  for (const card of kanbanData.in_progress) { if (selectedUsers.has(card.userId)) not_submitted++ }
  for (const card of kanbanData.not_started) { if (selectedUsers.has(card.userId)) not_submitted++ }
  const overdue = milestones.filter(m => selectedUsers.has(m.user_id) && isOverdue(m)).length
  return { accepted, reviewing, declined, not_submitted, overdue }
}, [kanbanData, selectedUsers, milestones])
```

- [ ] **Step 6: 타입 오류 확인**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
bun run typecheck 2>&1 | grep "progress/page"
```

Expected: 출력 없음.

- [ ] **Step 7: 커밋**

```bash
git add app/admin/progress/page.tsx
git commit -m "[AX-1] feat: admin progress kanban fetch + subStatusMap + stats useMemo 추가"
```

---

### Task 2: StatsBar 컴포넌트 추가 + JSX 배치

**Files:**
- Modify: `app/admin/progress/page.tsx` — `// ─── shared sub-components` 블록 앞에 두 컴포넌트 추가, JSX 내 배치

- [ ] **Step 1: `StatItem` 컴포넌트 추가**

`// ─── shared sub-components` 주석(line 68) 바로 위에 추가:

```typescript
function StatItem({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--text-disabled)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

function StatsBar({ stats }: {
  stats: { accepted: number; reviewing: number; declined: number; not_submitted: number; overdue: number }
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '20px',
      background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', padding: '10px 18px', marginBottom: '16px',
    }}>
      <StatItem value={stats.accepted}      label="합격"          color="var(--success)" />
      <StatItem value={stats.reviewing}     label="검토중"         color="var(--amber)" />
      <StatItem value={stats.declined}      label="불합격"         color="var(--error)" />
      <StatItem value={stats.not_submitted} label="미제출"         color="var(--text-disabled)" />
      <div style={{ width: '1px', height: '32px', background: 'var(--border-subtle)' }} />
      <StatItem value={stats.overdue}       label="지연 마일스톤" color="var(--error)" />
    </div>
  )
}
```

- [ ] **Step 2: JSX에 StatsBar 배치**

`return` 블록 내 페이지 헤더 `<div>` 닫히는 부분(line ~574) 바로 아래, view mode toggle `<div>` 바로 위에 삽입:

```tsx
{/* Stats bar */}
<StatsBar stats={stats} />

{/* View mode toggle */}
<div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' }}>
```

- [ ] **Step 3: 타입 오류 확인**

```bash
bun run typecheck 2>&1 | grep "progress/page"
```

Expected: 출력 없음.

- [ ] **Step 4: 커밋**

```bash
git add app/admin/progress/page.tsx
git commit -m "[AX-1] feat: admin progress StatsBar 컴포넌트 추가"
```

---

### Task 3: SubmissionBadge + HomeworkGroup 업데이트

**Files:**
- Modify: `app/admin/progress/page.tsx` — `SubmissionBadge` 컴포넌트 추가, `HomeworkGroup` props 확장, `ChampionSection` props 확장

- [ ] **Step 1: `SubmissionBadge` 컴포넌트 추가**

`StatsBar` 컴포넌트 바로 아래(Task 2에서 추가한 코드 아래)에 추가:

```typescript
function SubmissionBadge({ status }: { status: SubmissionStatusOrNull }) {
  const config: Record<SubmissionStatusOrNull, { label: string; color: string; bg: string }> = {
    accepted:      { label: '합격',   color: '#22c55e',             bg: 'rgba(34,197,94,0.15)' },
    pending:       { label: '검토중', color: '#f59e0b',             bg: 'rgba(245,158,11,0.15)' },
    declined:      { label: '불합격', color: '#f87171',             bg: 'rgba(248,113,113,0.15)' },
    not_submitted: { label: '미제출', color: 'var(--text-disabled)', bg: 'rgba(148,163,184,0.12)' },
  }
  const { label, color, bg } = config[status]
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 7px',
      borderRadius: '4px', background: bg, color,
    }}>
      {label}
    </span>
  )
}
```

- [ ] **Step 2: `HomeworkGroup` props에 `subStatus` 추가**

`HomeworkGroup` 함수 시그니처(line ~323)를 교체:

```typescript
// 기존
function HomeworkGroup({
  hwId, hwTitle, milestones, charters, onCharterClick,
}: {
  hwId: number | null
  hwTitle: string | null
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {

// 변경 후
function HomeworkGroup({
  hwId, hwTitle, milestones, charters, onCharterClick, subStatus,
}: {
  hwId: number | null
  hwTitle: string | null
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
  subStatus?: SubmissionStatusOrNull
}) {
```

- [ ] **Step 3: `HomeworkGroup` 헤더에 뱃지 삽입**

`HomeworkGroup` 내부 헤더 `<div>`를 교체:

```tsx
// 기존
<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>{label}</span>
  {overdueCount > 0 && <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--error)' }}>⚠️ {overdueCount}건 지연</span>}
  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
</div>

// 변경 후
<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.03em' }}>{label}</span>
  {subStatus !== undefined && <SubmissionBadge status={subStatus} />}
  {overdueCount > 0 && <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--error)' }}>⚠️ {overdueCount}건 지연</span>}
  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
</div>
```

- [ ] **Step 4: `ChampionSection` props에 `subStatusMap` 추가**

`ChampionSection` 함수 시그니처(line ~352)를 교체:

```typescript
// 기존
function ChampionSection({
  user, milestones, charters, onCharterClick,
}: {
  user: User
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {

// 변경 후
function ChampionSection({
  user, milestones, charters, onCharterClick, subStatusMap,
}: {
  user: User
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
  subStatusMap: Map<string, SubmissionStatusOrNull>
}) {
```

- [ ] **Step 5: `ChampionSection` 내 `HomeworkGroup` 호출에 `subStatus` 전달**

`ChampionSection` 내부 `<HomeworkGroup .../>` JSX를 교체:

```tsx
// 기존
<HomeworkGroup
  key={key}
  hwId={hwId}
  hwTitle={hwTitle}
  milestones={groupMilestones}
  charters={groupCharters}
  onCharterClick={onCharterClick}
/>

// 변경 후
<HomeworkGroup
  key={key}
  hwId={hwId}
  hwTitle={hwTitle}
  milestones={groupMilestones}
  charters={groupCharters}
  onCharterClick={onCharterClick}
  subStatus={hwId !== null ? subStatusMap.get(`${user.id}|${hwId}`) : undefined}
/>
```

- [ ] **Step 6: 메인 페이지 JSX에서 `ChampionSection`에 `subStatusMap` 전달**

메인 JSX의 `<ChampionSection ... />` 호출을 교체:

```tsx
// 기존
byUser.map(({ user, milestones: ums, charters: ucs }) => (
  <ChampionSection
    key={user.id}
    user={user}
    milestones={ums}
    charters={ucs}
    onCharterClick={setSelectedCharter}
  />
))

// 변경 후
byUser.map(({ user, milestones: ums, charters: ucs }) => (
  <ChampionSection
    key={user.id}
    user={user}
    milestones={ums}
    charters={ucs}
    onCharterClick={setSelectedCharter}
    subStatusMap={subStatusMap}
  />
))
```

- [ ] **Step 7: 타입 오류 확인**

```bash
bun run typecheck 2>&1 | grep "progress/page"
```

Expected: 출력 없음.

- [ ] **Step 8: 커밋**

```bash
git add app/admin/progress/page.tsx
git commit -m "[AX-1] feat: admin progress HomeworkGroup 제출 상태 뱃지 추가"
```

---

### Task 4: UserSubSection + HomeworkSection 업데이트 + 최종 검증

**Files:**
- Modify: `app/admin/progress/page.tsx` — `UserSubSection` props 확장, `HomeworkSection` props 확장

- [ ] **Step 1: `UserSubSection` props에 `subStatus` 추가**

`UserSubSection` 함수 시그니처(line ~419)를 교체:

```typescript
// 기존
function UserSubSection({
  user, milestones, charters, onCharterClick,
}: {
  user: User
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {

// 변경 후
function UserSubSection({
  user, milestones, charters, onCharterClick, subStatus,
}: {
  user: User
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
  subStatus?: SubmissionStatusOrNull
}) {
```

- [ ] **Step 2: `UserSubSection` 헤더에 뱃지 삽입**

`UserSubSection` 내부 헤더 `<div>`를 교체:

```tsx
// 기존
<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
  <UserAvatar user={user} size={22} />
  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</span>
  <OverdueBadge count={overdueCount} />
  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
  <span style={{ fontSize: '10px', color: 'var(--text-disabled)', flexShrink: 0 }}>{milestones.length}개 마일스톤</span>
</div>

// 변경 후
<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
  <UserAvatar user={user} size={22} />
  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</span>
  {subStatus !== undefined && <SubmissionBadge status={subStatus} />}
  <OverdueBadge count={overdueCount} />
  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
  <span style={{ fontSize: '10px', color: 'var(--text-disabled)', flexShrink: 0 }}>{milestones.length}개 마일스톤</span>
</div>
```

- [ ] **Step 3: `HomeworkSection` props에 `subStatusMap` 추가**

`HomeworkSection` 함수 시그니처(line ~448)를 교체:

```typescript
// 기존
function HomeworkSection({
  hwId, hwTitle, milestones, charters, onCharterClick,
}: {
  hwId: number | null
  hwTitle: string | null
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
}) {

// 변경 후
function HomeworkSection({
  hwId, hwTitle, milestones, charters, onCharterClick, subStatusMap,
}: {
  hwId: number | null
  hwTitle: string | null
  milestones: MilestoneWithUser[]
  charters: CharterWithUser[]
  onCharterClick: (c: CharterWithUser) => void
  subStatusMap: Map<string, SubmissionStatusOrNull>
}) {
```

- [ ] **Step 4: `HomeworkSection` 내 `UserSubSection` 호출에 `subStatus` 전달**

`HomeworkSection` 내부 `byUser.map` JSX를 교체:

```tsx
// 기존
{byUser.map(({ user, milestones: ums, charters: ucs }) => (
  <UserSubSection key={user.id} user={user} milestones={ums} charters={ucs} onCharterClick={onCharterClick} />
))}

// 변경 후
{byUser.map(({ user, milestones: ums, charters: ucs }) => (
  <UserSubSection
    key={user.id}
    user={user}
    milestones={ums}
    charters={ucs}
    onCharterClick={onCharterClick}
    subStatus={hwId !== null ? subStatusMap.get(`${user.id}|${hwId}`) : undefined}
  />
))}
```

- [ ] **Step 5: 메인 JSX에서 `HomeworkSection`에 `subStatusMap` 전달**

메인 JSX의 `<HomeworkSection ... />` 호출을 교체:

```tsx
// 기존
byHomework.map(({ key, hwId, hwTitle, milestones: hms, charters: hcs }) => (
  <HomeworkSection key={key} hwId={hwId} hwTitle={hwTitle} milestones={hms} charters={hcs} onCharterClick={setSelectedCharter} />
))

// 변경 후
byHomework.map(({ key, hwId, hwTitle, milestones: hms, charters: hcs }) => (
  <HomeworkSection
    key={key}
    hwId={hwId}
    hwTitle={hwTitle}
    milestones={hms}
    charters={hcs}
    onCharterClick={setSelectedCharter}
    subStatusMap={subStatusMap}
  />
))
```

- [ ] **Step 6: 최종 타입 오류 확인**

```bash
bun run typecheck 2>&1 | head -20
```

Expected: 출력 없음.

- [ ] **Step 7: dev 서버 기동 + 수동 확인**

```bash
bun run dev
```

`http://localhost:3000/admin/progress` 접속 후 확인:
1. 상단에 합격/검토중/불합격/미제출/지연 마일스톤 수 숫자 표시
2. 챔피언 필터 체크박스 토글 시 통계 숫자 실시간 변경
3. 챔피언별 뷰 → 각 과제 그룹 헤더에 제출 상태 뱃지 표시
4. 과제별 뷰 → 각 유저 서브섹션 헤더에 제출 상태 뱃지 표시
5. `homework_id = null`인 독립 WBS 그룹은 뱃지 없음

- [ ] **Step 8: 최종 커밋**

```bash
git add app/admin/progress/page.tsx
git commit -m "[AX-1] feat: admin progress UserSubSection 제출 상태 뱃지 + HomeworkSection subStatusMap 완성"
```
