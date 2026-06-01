# Sub-tasks (하위과제) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챔피언 프로젝트 안에 하위과제(sub_task) 개념을 추가하여 마일스톤을 그룹핑할 수 있게 한다.

**Architecture:** 새 `sub_tasks` 테이블을 추가하고 `milestones.sub_task_id` FK로 연결. 챔피언이 CRUD 가능하며, 하위과제별 foldable 섹션으로 WBS·체크인 탭에 표시. 어드민은 읽기 전용.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL), TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-05-29-sub-tasks-design.md`

---

## File Map

| Action | Path | 역할 |
|---|---|---|
| Create | `supabase/migrations/017_sub_tasks.sql` | DB 스키마 변경 |
| Modify | `lib/types.ts` | SubTask 타입 추가, Milestone·ChampionProject 수정 |
| Create | `app/api/sub-tasks/route.ts` | GET list + POST create |
| Create | `app/api/sub-tasks/[id]/route.ts` | PATCH update + DELETE |
| Modify | `app/api/milestones/route.ts` | POST body에 sub_task_id 추가 |
| Modify | `app/api/milestones/[id]/route.ts` | PATCH body에 sub_task_id 추가 |
| Modify | `app/api/champions/[userId]/route.ts` | sub_tasks 배열 포함 |
| Modify | `app/api/champions/gantt/route.ts` | sub_task_id, sub_task_title 포함 |
| Modify | `app/(champion)/my-project/milestones/page.tsx` | 하위과제 CRUD + foldable 그룹 UI |
| Modify | `app/(champion)/checkin/page.tsx` | 하위과제별 foldable 그룹 |
| Modify | `components/ChampionGanttView.tsx` | sub_task 행 그룹 레이블 |
| Modify | `app/admin/champions/[userId]/page.tsx` | 하위과제 읽기 전용 표시 |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/017_sub_tasks.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- 017_sub_tasks.sql
-- sub_tasks 테이블 신규 생성 + milestones.sub_task_id 컬럼 추가

CREATE TABLE sub_tasks (
  id            uuid            PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         text            NOT NULL,
  description   text,
  display_order int             NOT NULL DEFAULT 0,
  publish_status publish_status NOT NULL DEFAULT 'draft',
  created_at    timestamptz     NOT NULL DEFAULT now(),
  updated_at    timestamptz     NOT NULL DEFAULT now()
);

ALTER TABLE sub_tasks ENABLE ROW LEVEL SECURITY;
-- No policies: service key bypasses RLS

ALTER TABLE milestones
  ADD COLUMN sub_task_id uuid REFERENCES sub_tasks(id) ON DELETE SET NULL;

CREATE INDEX sub_tasks_user_id ON sub_tasks(user_id);
CREATE INDEX milestones_sub_task_id ON milestones(sub_task_id) WHERE sub_task_id IS NOT NULL;
```

- [ ] **Step 2: Supabase 대시보드 SQL 에디터에서 실행**

Supabase 프로젝트 → SQL Editor → 위 SQL 붙여넣고 실행.  
성공 시 `sub_tasks` 테이블과 `milestones.sub_task_id` 컬럼이 생성됨.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_sub_tasks.sql
git commit -m "[AX-1] feat(db): sub_tasks 테이블 및 milestones.sub_task_id 마이그레이션"
```

---

## Task 2: TypeScript 타입

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: SubTask 타입 추가 및 기존 타입 수정**

`lib/types.ts` 에서 `Milestone` 인터페이스와 `ChampionProject` 인터페이스를 수정하고 `SubTask`를 새로 추가한다.

`Milestone` 인터페이스 끝(`:` `bottleneck_reviewed_at` 줄 뒤)에 아래 줄 추가:

```ts
  sub_task_id: string | null
```

`ChampionProject` 인터페이스를 아래로 교체:

```ts
export interface ChampionProject {
  user: User
  charter: (CharterSubmission & { comments: CharterComment[] }) | null
  sub_tasks: SubTask[]
  milestones: Milestone[]
  latestSubmission: Submission | null
}
```

파일 끝(또는 `ChampionProject` 정의 바로 앞)에 추가:

```ts
export interface SubTask {
  id: string
  user_id: string
  title: string
  description: string | null
  display_order: number
  publish_status: PublishStatus
  created_at: string
  updated_at: string
  milestones?: Milestone[]
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음 (또는 기존 에러만 유지)

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "[AX-1] feat(types): SubTask 인터페이스 추가, Milestone·ChampionProject 업데이트"
```

---

## Task 3: /api/sub-tasks GET + POST

**Files:**
- Create: `app/api/sub-tasks/route.ts`

- [ ] **Step 1: 라우트 파일 생성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('sub_tasks')
    .select('*, milestones(*)')
    .eq('user_id', user.id)
    .order('display_order')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (data ?? []).map(({ milestones, ...rest }: any) => ({
    ...rest,
    milestones: milestones ?? [],
  }))
  return NextResponse.json(normalized)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description } = body

  if (!title?.trim()) {
    return NextResponse.json(
      { error: 'validation_failed', fields: [{ field: 'title', message: '필수 항목입니다.' }] },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // display_order = current max + 1
  const { count } = await supabase
    .from('sub_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  const { data, error } = await supabase
    .from('sub_tasks')
    .insert({
      user_id: user.id,
      title: title.trim(),
      description: description?.trim() ?? null,
      display_order: count ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, milestones: [] }, { status: 201 })
}
```

- [ ] **Step 2: 수동 검증**

서버 실행 후 curl 또는 브라우저 개발자도구:
```bash
# GET (토큰 필요 — 브라우저 콘솔에서 apiFetch('/api/sub-tasks') 로 확인)
# POST
curl -X POST http://localhost:3000/api/sub-tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"테스트 하위과제"}'
# Expected: 401 Unauthorized (인증 없이)
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sub-tasks/route.ts
git commit -m "[AX-1] feat(api): /api/sub-tasks GET·POST 엔드포인트 추가"
```

---

## Task 4: /api/sub-tasks/[id] PATCH + DELETE

**Files:**
- Create: `app/api/sub-tasks/[id]/route.ts`

- [ ] **Step 1: 라우트 파일 생성**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('sub_tasks')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) {
    if (!body.title?.trim()) {
      return NextResponse.json(
        { error: 'validation_failed', fields: [{ field: 'title', message: '필수 항목입니다.' }] },
        { status: 400 }
      )
    }
    patch.title = body.title.trim()
  }
  if (body.description !== undefined) patch.description = body.description?.trim() ?? null
  if (body.display_order !== undefined) patch.display_order = body.display_order
  if (body.publish_status !== undefined) patch.publish_status = body.publish_status

  const { data, error } = await supabase
    .from('sub_tasks')
    .update(patch)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('sub_tasks')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // milestones.sub_task_id는 ON DELETE SET NULL이므로 DB가 자동 처리
  const { error } = await supabase
    .from('sub_tasks')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sub-tasks/[id]/route.ts
git commit -m "[AX-1] feat(api): /api/sub-tasks/[id] PATCH·DELETE 엔드포인트 추가"
```

---

## Task 5: milestones API — sub_task_id 지원

**Files:**
- Modify: `app/api/milestones/route.ts`
- Modify: `app/api/milestones/[id]/route.ts`

- [ ] **Step 1: POST /api/milestones — sub_task_id 수용**

`app/api/milestones/route.ts`의 POST 핸들러에서 body 구조 분해에 `sub_task_id` 추가:

```ts
// 변경 전
const { title, start_date, due_date, description, publish_status } = body

// 변경 후
const { title, start_date, due_date, description, publish_status, sub_task_id } = body
```

`supabase.from('milestones').insert({...})` 블록에 `sub_task_id` 추가:

```ts
const { data, error } = await supabase
  .from('milestones')
  .insert({
    user_id: user.id,
    title: title ?? '',
    start_date: start_date ?? null,
    due_date: due_date ?? null,
    description: description ?? null,
    publish_status: status,
    sub_task_id: sub_task_id ?? null,   // ← 추가
  })
  .select()
  .single()
```

- [ ] **Step 2: PATCH /api/milestones/[id] — sub_task_id 수용**

`app/api/milestones/[id]/route.ts`의 `patch` 객체 구성 부분에 아래 추가 (기존 `delete patch.publish_status` 이전):

```ts
// sub_task_id 재배치 허용 — 명시적으로 null 전달하면 최상위로 이동
if ('sub_task_id' in body) {
  patch.sub_task_id = body.sub_task_id ?? null
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/milestones/route.ts app/api/milestones/[id]/route.ts
git commit -m "[AX-1] feat(api): milestones POST·PATCH에 sub_task_id 지원 추가"
```

---

## Task 6: champions API — sub_tasks 포함

**Files:**
- Modify: `app/api/champions/[userId]/route.ts`
- Modify: `app/api/champions/gantt/route.ts`

- [ ] **Step 1: GET /api/champions/[userId] — sub_tasks 포함**

`app/api/champions/[userId]/route.ts`에서 Promise.all 쿼리 배열에 sub_tasks 쿼리 추가.  
**중요:** sub_tasks 쿼리에서 nested milestones를 직접 fetch하지 않고, 이미 publish_status=published 필터로 가져온 `normalized`를 재활용해 붙인다. (draft 마일스톤 노출 방지)

```ts
const [
  { data: userRow, error: userErr },
  { data: charterRows, error: charterErr },
  { data: milestones, error: msErr },
  { data: submissions, error: subErr },
  { data: subTaskRows, error: stErr },          // ← 추가
] = await Promise.all([
  supabase.from('users').select('*').eq('id', userId).single(),
  supabase
    .from('charter_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1),
  supabase
    .from('milestones')
    .select('*, milestone_deliverables(*)')
    .eq('user_id', userId)
    .eq('publish_status', 'published')
    .order('week_number')
    .order('display_order'),
  supabase
    .from('submissions')
    .select('*')
    .eq('user_id', userId)
    .order('attempt_number', { ascending: false })
    .limit(1),
  supabase                                       // ← 추가 (milestones는 별도로 안 가져옴)
    .from('sub_tasks')
    .select('*')
    .eq('user_id', userId)
    .order('display_order'),
])
```

에러 체크 추가:
```ts
if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 })
```

`result` 구성 시 `sub_tasks` 포함 및 `milestones` 분리:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalized = (milestones ?? []).map(({ milestone_deliverables, ...rest }: any) => ({
  ...rest,
  deliverables: milestone_deliverables,
}))

// 이미 published 필터된 normalized 마일스톤을 sub_task별로 분류
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msBySubTask = new Map<string, any[]>()
for (const m of normalized) {
  if (m.sub_task_id) {
    if (!msBySubTask.has(m.sub_task_id)) msBySubTask.set(m.sub_task_id, [])
    msBySubTask.get(m.sub_task_id)!.push(m)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizedSubTasks = (subTaskRows ?? []).map((st: any) => ({
  ...st,
  milestones: msBySubTask.get(st.id) ?? [],
}))

const result: ChampionProject = {
  user: userRow,
  charter: charterWithComments,
  sub_tasks: normalizedSubTasks,                                                           // ← 추가
  milestones: normalized.filter((m: { sub_task_id: string | null }) => !m.sub_task_id),   // top-level only
  latestSubmission: submissions?.[0] ?? null,
}
```

- [ ] **Step 2: GET /api/champions/gantt — sub_task_id, sub_task_title 포함**

`app/api/champions/gantt/route.ts`에서 `GanttMilestone` 인터페이스 수정:

```ts
export interface GanttMilestone {
  id: string
  title: string
  start_date: string
  due_date: string
  status: MilestoneStatus
  week_number: number
  sub_task_id: string | null      // ← 추가
  sub_task_title: string | null   // ← 추가
}
```

Promise.all 에 sub_tasks 쿼리 추가:

```ts
const [
  { data: users, error: usersErr },
  { data: charters, error: chartersErr },
  { data: milestones, error: msErr },
  { data: subTasks, error: stErr },    // ← 추가
] = await Promise.all([
  supabase.from('users').select('id, name'),
  supabase.from('charter_submissions').select('user_id, id, project_name'),
  supabase
    .from('milestones')
    .select('id, user_id, title, start_date, due_date, status, week_number, sub_task_id')
    .eq('publish_status', 'published')
    .not('start_date', 'is', null)
    .not('due_date', 'is', null)
    .order('week_number')
    .order('display_order'),
  supabase.from('sub_tasks').select('id, title'),  // ← 추가
])

if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 })
```

sub_task 타이틀 맵 구성 후 milestones 매핑에 포함:

```ts
const subTaskTitleMap = new Map<string, string>()
for (const st of subTasks ?? []) subTaskTitleMap.set(st.id, st.title)

// msMap.get(m.user_id)!.push({ ... }) 부분 수정
msMap.get(m.user_id)!.push({
  id: m.id,
  title: m.title,
  start_date: m.start_date,
  due_date: m.due_date,
  status: m.status as MilestoneStatus,
  week_number: m.week_number,
  sub_task_id: m.sub_task_id ?? null,                           // ← 추가
  sub_task_title: m.sub_task_id ? (subTaskTitleMap.get(m.sub_task_id) ?? null) : null,  // ← 추가
})
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/champions/[userId]/route.ts app/api/champions/gantt/route.ts
git commit -m "[AX-1] feat(api): champions 엔드포인트에 sub_tasks 정보 포함"
```

---

## Task 7: WBS 탭 UI — 하위과제 CRUD + foldable 그룹

**Files:**
- Modify: `app/(champion)/my-project/milestones/page.tsx`

이 파일이 크므로 변경 포인트를 정확히 지정한다.

- [ ] **Step 1: import 및 상태 추가**

파일 상단 import에 아이콘 추가 (`lucide-react`에서):
```ts
import { ListTodo, ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react'
```

`MilestonesPage` 컴포넌트 안 기존 상태 선언들 뒤에 아래 상태 추가:

```ts
import type { Milestone, DeadlineChangeRequest, CharterSubmission, SubTask } from '@/lib/types'

// ... 기존 상태들 ...

const [subTasks, setSubTasks] = useState<SubTask[]>([])
const [collapsedSubTasks, setCollapsedSubTasks] = useState<Set<string>>(new Set())

// 하위과제 생성 폼
const [showSubTaskForm, setShowSubTaskForm] = useState(false)
const [subTaskForm, setSubTaskForm] = useState({ title: '', description: '' })
const [subTaskFormError, setSubTaskFormError] = useState<string | null>(null)

// 하위과제 수정
const [editingSubTask, setEditingSubTask] = useState<SubTask | null>(null)
const [editSubTaskForm, setEditSubTaskForm] = useState({ title: '', description: '' })

// 마일스톤 생성 폼의 sub_task_id
// (기존 form 상태에 sub_task_id 필드 추가)
```

기존 `NewMilestone` 인터페이스 수정:
```ts
interface NewMilestone { title: string; start_date: string; due_date: string; description: string; sub_task_id: string }
```

기존 `useState<NewMilestone>` 초기값에 `sub_task_id: ''` 추가:
```ts
const [form, setForm] = useState<NewMilestone>({ title: '', start_date: '', due_date: '', description: '', sub_task_id: '' })
```

- [ ] **Step 2: useEffect에 sub_tasks 페치 추가**

기존 `useEffect` 의 `Promise.all` 배열에 추가:

```ts
useEffect(() => {
  Promise.all([
    apiFetch<Milestone[]>('/api/milestones').then(setMilestones),
    apiFetch<SubTask[]>('/api/sub-tasks').then(setSubTasks),
    apiFetch<DeadlineChangeRequest[]>('/api/deadline-requests').then(setRequests),
    apiFetch<CharterSubmission[]>('/api/charter/submissions')
      .then(subs => setCharterApproved(subs.some(s => !!s.admin_approved_at))),
  ])
    .catch((e: Error) => toast.error('로드 실패: ' + e.message))
    .finally(() => setLoading(false))
}, [])
```

- [ ] **Step 3: 하위과제 CRUD 핸들러 추가**

`submitNew` 함수 아래에 아래 함수들 추가:

```ts
function toggleSubTask(id: string) {
  setCollapsedSubTasks(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}

async function handleCreateSubTask() {
  setSubTaskFormError(null)
  if (!subTaskForm.title.trim()) {
    setSubTaskFormError('제목을 입력해주세요.')
    return
  }
  try {
    const created = await apiFetch<SubTask>('/api/sub-tasks', {
      method: 'POST',
      body: JSON.stringify(subTaskForm),
    })
    setSubTasks(prev => [...prev, created])
    setShowSubTaskForm(false)
    setSubTaskForm({ title: '', description: '' })
    toast.success('하위과제가 추가되었습니다.')
  } catch {
    setSubTaskFormError('저장에 실패했습니다.')
  }
}

async function handleUpdateSubTask() {
  if (!editingSubTask) return
  try {
    const updated = await apiFetch<SubTask>(`/api/sub-tasks/${editingSubTask.id}`, {
      method: 'PATCH',
      body: JSON.stringify(editSubTaskForm),
    })
    setSubTasks(prev => prev.map(st => st.id === updated.id ? { ...updated, milestones: st.milestones } : st))
    setEditingSubTask(null)
    toast.success('하위과제가 수정되었습니다.')
  } catch {
    toast.error('수정에 실패했습니다.')
  }
}

async function handleDeleteSubTask(id: string) {
  if (!confirm('하위과제를 삭제하면 소속 마일스톤은 그룹 없이 이동됩니다. 삭제할까요?')) return
  try {
    await apiFetch(`/api/sub-tasks/${id}`, { method: 'DELETE' })
    setSubTasks(prev => prev.filter(st => st.id !== id))
    setMilestones(prev => prev.map(m => m.sub_task_id === id ? { ...m, sub_task_id: null } : m))
    toast.success('하위과제가 삭제되었습니다.')
  } catch {
    toast.error('삭제에 실패했습니다.')
  }
}

async function handleMoveMilestone(milestoneId: string, targetSubTaskId: string | null) {
  try {
    const updated = await apiFetch<Milestone>(`/api/milestones/${milestoneId}`, {
      method: 'PATCH',
      body: JSON.stringify({ sub_task_id: targetSubTaskId }),
    })
    setMilestones(prev => prev.map(m => m.id === updated.id ? updated : m))
  } catch {
    toast.error('마일스톤 이동에 실패했습니다.')
  }
}
```

- [ ] **Step 4: 마일스톤 목록 렌더링을 하위과제 그룹으로 교체**

기존 `visibleMilestones`를 그룹화하는 `useMemo` 추가:

```ts
const groupedMilestones = useMemo(() => {
  const filtered = filter === 'all' ? milestones : milestones.filter(m => m.publish_status === filter)
  const topLevel = filtered.filter(m => !m.sub_task_id)
  const bySubTask = new Map<string, Milestone[]>()
  for (const st of subTasks) bySubTask.set(st.id, [])
  for (const m of filtered) {
    if (m.sub_task_id && bySubTask.has(m.sub_task_id)) {
      bySubTask.get(m.sub_task_id)!.push(m)
    }
  }
  return { topLevel, bySubTask }
}, [milestones, subTasks, filter])
```

기존 마일스톤 목록 렌더링 부분(좌측 패널)을 아래 구조로 교체.  
기존에 `visibleMilestones.map(...)` 이던 곳을 아래처럼 변경:

```tsx
{/* 하위과제 없는 마일스톤 */}
{groupedMilestones.topLevel.map(m => (
  <MilestoneRow key={m.id} m={m} /* 기존 props 그대로 */ />
))}

{/* 하위과제별 섹션 */}
{subTasks.map(st => {
  const isCollapsed = collapsedSubTasks.has(st.id)
  const stMilestones = groupedMilestones.bySubTask.get(st.id) ?? []
  return (
    <div key={st.id} style={{ marginTop: 12 }}>
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
        style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}
      >
        <button onClick={() => toggleSubTask(st.id)} style={{ color: 'var(--text-secondary)', lineHeight: 1 }}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-primary)' }} onClick={() => toggleSubTask(st.id)}>
          {st.title}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>{stMilestones.length}개</span>
        <button
          onClick={() => { setEditingSubTask(st); setEditSubTaskForm({ title: st.title, description: st.description ?? '' }) }}
          style={{ color: 'var(--text-secondary)' }}
        >
          <Pencil size={12} />
        </button>
        <button onClick={() => handleDeleteSubTask(st.id)} style={{ color: 'var(--error)' }}>
          <Trash2 size={12} />
        </button>
        <button
          onClick={() => { setForm(f => ({ ...f, sub_task_id: st.id })); openForm() }}
          style={{ color: 'var(--blue-600)' }}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* 접힌 상태에서는 마일스톤 숨김 */}
      {!isCollapsed && stMilestones.map(m => (
        <MilestoneRow key={m.id} m={m} /* 기존 props 그대로 */ />
      ))}
    </div>
  )
})}

{/* 하위과제 추가 버튼 */}
<button
  onClick={() => setShowSubTaskForm(true)}
  className="flex items-center gap-1 text-xs mt-3"
  style={{ color: 'var(--text-secondary)' }}
>
  <Plus size={12} /> 하위과제 추가
</button>
```

> `MilestoneRow`는 현재 파일 안의 마일스톤 행 렌더링 블록을 별도 함수로 추출하거나 인라인 JSX를 반복. 코드 중복을 피하려면 내부 함수로 추출 권장.

- [ ] **Step 5: 마일스톤 생성 폼에 sub_task_id 셀렉터 추가**

기존 마일스톤 생성 폼(`showForm` 조건 내)에서 `title` 입력 바로 아래에 추가:

```tsx
<div>
  <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>하위과제</label>
  <select
    value={form.sub_task_id}
    onChange={e => setForm(f => ({ ...f, sub_task_id: e.target.value }))}
    style={{
      background: 'var(--surface-secondary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '8px',
      color: 'var(--text-primary)',
      padding: '8px 12px',
      fontSize: '13px',
      width: '100%',
    }}
  >
    <option value="">없음 (최상위)</option>
    {subTasks.map(st => (
      <option key={st.id} value={st.id}>{st.title}</option>
    ))}
  </select>
</div>
```

`submitNew` 함수에서 body에 `sub_task_id` 포함:

```ts
body: JSON.stringify({
  ...form,
  start_date: form.start_date || null,
  due_date: form.due_date || null,
  sub_task_id: form.sub_task_id || null,   // ← 추가
  publish_status: publishStatus,
}),
```

- [ ] **Step 6: 하위과제 생성/수정 모달 추가**

기존 모달들 뒤에 추가:

```tsx
{/* 하위과제 생성 모달 */}
<Dialog open={showSubTaskForm} onOpenChange={setShowSubTaskForm}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>하위과제 추가</DialogTitle>
    </DialogHeader>
    <div className="flex flex-col gap-3 py-2">
      <div>
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>제목 *</label>
        <input
          value={subTaskForm.title}
          onChange={e => setSubTaskForm(f => ({ ...f, title: e.target.value }))}
          placeholder="하위과제 제목"
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '8px 12px',
            fontSize: '13px',
            width: '100%',
          }}
        />
      </div>
      <div>
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>설명</label>
        <textarea
          value={subTaskForm.description}
          onChange={e => setSubTaskForm(f => ({ ...f, description: e.target.value }))}
          placeholder="선택 입력"
          rows={3}
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '8px 12px',
            fontSize: '13px',
            width: '100%',
            resize: 'vertical',
          }}
        />
      </div>
      {subTaskFormError && <p className="text-xs" style={{ color: 'var(--error)' }}>{subTaskFormError}</p>}
    </div>
    <DialogFooter>
      <button onClick={() => setShowSubTaskForm(false)} className="text-xs px-4 py-2" style={{ color: 'var(--text-secondary)' }}>취소</button>
      <button onClick={handleCreateSubTask} className="text-xs px-4 py-2 rounded-lg font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>추가</button>
    </DialogFooter>
  </DialogContent>
</Dialog>

{/* 하위과제 수정 모달 */}
<Dialog open={!!editingSubTask} onOpenChange={open => !open && setEditingSubTask(null)}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>하위과제 수정</DialogTitle>
    </DialogHeader>
    <div className="flex flex-col gap-3 py-2">
      <div>
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>제목 *</label>
        <input
          value={editSubTaskForm.title}
          onChange={e => setEditSubTaskForm(f => ({ ...f, title: e.target.value }))}
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '8px 12px',
            fontSize: '13px',
            width: '100%',
          }}
        />
      </div>
      <div>
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>설명</label>
        <textarea
          value={editSubTaskForm.description}
          onChange={e => setEditSubTaskForm(f => ({ ...f, description: e.target.value }))}
          rows={3}
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            padding: '8px 12px',
            fontSize: '13px',
            width: '100%',
            resize: 'vertical',
          }}
        />
      </div>
    </div>
    <DialogFooter>
      <button onClick={() => setEditingSubTask(null)} className="text-xs px-4 py-2" style={{ color: 'var(--text-secondary)' }}>취소</button>
      <button onClick={handleUpdateSubTask} className="text-xs px-4 py-2 rounded-lg font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 7: 타입 체크 및 수동 검증**

```bash
npx tsc --noEmit
```

브라우저에서 `/my-project/milestones` 접속:
- 하위과제 추가 버튼 클릭 → 생성 모달
- 하위과제 섹션 헤더 클릭 → fold/unfold
- 마일스톤 생성 폼에서 하위과제 선택 가능

- [ ] **Step 8: Commit**

```bash
git add app/\(champion\)/my-project/milestones/page.tsx
git commit -m "[AX-1] feat(ui): WBS 탭에 하위과제 foldable 그룹 및 CRUD 기능 추가"
```

---

## Task 8: 체크인 탭 — 하위과제별 foldable 그룹

**Files:**
- Modify: `app/(champion)/checkin/page.tsx`

- [ ] **Step 1: sub_tasks 상태 및 페치 추가**

`CheckinPage` 컴포넌트에 상태 추가:

```ts
import type { Milestone, DeadlineChangeRequest, BottleneckType, CharterSubmission, SubTask } from '@/lib/types'

// 기존 상태들 뒤에 추가
const [subTasks, setSubTasks] = useState<SubTask[]>([])
const [collapsedSubTasks, setCollapsedSubTasks] = useState<Set<string>>(new Set())
```

기존 `useEffect` Promise.all에 추가:

```ts
apiFetch<SubTask[]>('/api/sub-tasks').then(setSubTasks),
```

- [ ] **Step 2: 하위과제 그룹화 렌더링 추가**

`CheckinPage` 렌더링 부분에서 `<CheckinTab>` 를 감싸는 구조로 변경.  
기존에 단일 `<CheckinTab milestones={milestones} ...>` 이던 곳을 아래로 교체:

```tsx
{/* 하위과제 없는 마일스톤 */}
{milestones.some(m => !m.sub_task_id) && (
  <CheckinTab
    milestones={milestones.filter(m => !m.sub_task_id)}
    requests={requests}
    charterApproved={charterApproved}
    onComplete={handleCheckinComplete}
    onDelayReport={handleDelayReport}
    onInProgress={handleInProgress}
    onDeadlineExtension={(m) => setDeadlineModal({ id: m.id, due_date: m.due_date })}
  />
)}

{/* 하위과제별 섹션 */}
{subTasks.map(st => {
  const stMilestones = milestones.filter(m => m.sub_task_id === st.id)
  if (stMilestones.length === 0) return null
  const isCollapsed = collapsedSubTasks.has(st.id)
  return (
    <div key={st.id} style={{ marginTop: 16 }}>
      <button
        onClick={() => setCollapsedSubTasks(prev => {
          const next = new Set(prev)
          if (next.has(st.id)) next.delete(st.id)
          else next.add(st.id)
          return next
        })}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg mb-2"
        style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}
      >
        {isCollapsed
          ? <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
          : <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />}
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{st.title}</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-disabled)' }}>{stMilestones.length}개</span>
      </button>
      {!isCollapsed && (
        <CheckinTab
          milestones={stMilestones}
          requests={requests}
          charterApproved={charterApproved}
          onComplete={handleCheckinComplete}
          onDelayReport={handleDelayReport}
          onInProgress={handleInProgress}
          onDeadlineExtension={(m) => setDeadlineModal({ id: m.id, due_date: m.due_date })}
        />
      )}
    </div>
  )
})}
```

import에 아이콘 추가:

```ts
import { ChevronDown, ChevronRight } from 'lucide-react'
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/\(champion\)/checkin/page.tsx
git commit -m "[AX-1] feat(ui): 체크인 탭에 하위과제별 foldable 그룹 추가"
```

---

## Task 9: Gantt 뷰 — 하위과제 행 그룹 레이블

**Files:**
- Modify: `components/ChampionGanttView.tsx`

- [ ] **Step 1: toTasks 함수에 sub_task 그룹 행 삽입**

`ChampionGanttView.tsx`의 `toTasks` 함수 내 챔피언별 마일스톤 처리 루프를 수정.  
기존에 챔피언 project 행 → milestone bar 행 순서였다면, 이제 sub_task별 project 행을 중간에 추가.

`GanttMilestone` 타입 import 부분에서 `sub_task_id`, `sub_task_title` 가 포함된 버전을 쓰므로 별도 수정 불필요 (Task 6에서 이미 route.ts 수정함).

`toTasks` 함수에서 챔피언 루프 내부를 아래처럼 수정:

```ts
function toTasks(champions: GanttChampion[]): Task[] {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const tasks: Task[] = []
  for (const c of champions) {
    if (c.milestones.length === 0) continue
    const startStr = c.milestones[0].start_date
    const endStr = c.milestones[c.milestones.length - 1].due_date
    const champId = `champ-${c.userId}`

    // 챔피언 프로젝트 행
    tasks.push({
      id: champId,
      name: c.name,
      start: new Date(startStr),
      end: new Date(endStr),
      progress: 0,
      type: 'project',
      hideChildren: false,
      displayOrder: tasks.length + 1,
    })

    // sub_task 그룹별로 묶기
    const subTaskIds = [...new Set(c.milestones.map(m => m.sub_task_id).filter(Boolean))] as string[]
    const subTaskTitles = new Map<string, string>()
    for (const m of c.milestones) {
      if (m.sub_task_id && m.sub_task_title) subTaskTitles.set(m.sub_task_id, m.sub_task_title)
    }

    // sub_task 없는 마일스톤 먼저
    const topLevelMs = c.milestones.filter(m => !m.sub_task_id)
    for (const m of topLevelMs) {
      const isFuture = m.start_date > todayStr
      const isPast = m.due_date < todayStr
      tasks.push({
        id: m.id,
        name: m.title,
        start: new Date(m.start_date),
        end: new Date(m.due_date),
        progress: STATUS_PROGRESS[m.status],
        type: 'task',
        project: champId,
        styles: {
          progressColor: isFuture ? '#cbd5e1' : STATUS_COLOR[m.status],
          progressSelectedColor: isFuture ? '#94a3b8' : STATUS_COLOR[m.status],
          backgroundColor: isPast && m.status !== 'completed' ? 'rgba(239,68,68,0.15)' : undefined,
        },
        displayOrder: tasks.length + 1,
      })
    }

    // sub_task별 그룹 행 + 소속 마일스톤
    for (const stId of subTaskIds) {
      const stTitle = subTaskTitles.get(stId) ?? '하위과제'
      const stMs = c.milestones.filter(m => m.sub_task_id === stId)
      if (stMs.length === 0) continue

      const stStart = stMs[0].start_date
      const stEnd = stMs[stMs.length - 1].due_date
      const stRowId = `subtask-${stId}`

      tasks.push({
        id: stRowId,
        name: stTitle,
        start: new Date(stStart),
        end: new Date(stEnd),
        progress: 0,
        type: 'project',
        project: champId,
        hideChildren: false,
        displayOrder: tasks.length + 1,
      })

      for (const m of stMs) {
        const isFuture = m.start_date > todayStr
        const isPast = m.due_date < todayStr
        tasks.push({
          id: m.id,
          name: m.title,
          start: new Date(m.start_date),
          end: new Date(m.due_date),
          progress: STATUS_PROGRESS[m.status],
          type: 'task',
          project: stRowId,
          styles: {
            progressColor: isFuture ? '#cbd5e1' : STATUS_COLOR[m.status],
            progressSelectedColor: isFuture ? '#94a3b8' : STATUS_COLOR[m.status],
            backgroundColor: isPast && m.status !== 'completed' ? 'rgba(239,68,68,0.15)' : undefined,
          },
          displayOrder: tasks.length + 1,
        })
      }
    }
  }
  return tasks
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/ChampionGanttView.tsx
git commit -m "[AX-1] feat(ui): Gantt 뷰에 하위과제 행 그룹 레이블 추가"
```

---

## Task 10: 어드민 챔피언 상세 — 하위과제 읽기 전용

**Files:**
- Modify: `app/admin/champions/[userId]/page.tsx`

- [ ] **Step 1: sub_tasks 상태 추가 및 ChampionProject 타입 활용**

`AdminChampionPage` 컴포넌트는 이미 `apiFetch<ChampionProject>` 로 데이터를 받는다.  
Task 6에서 `ChampionProject` 에 `sub_tasks` 가 추가되었으므로, `data.sub_tasks` 로 접근 가능.

마일스톤 목록 렌더링 부분 위에 하위과제별 그룹 표시 추가:

```tsx
{/* 하위과제 그룹 (읽기 전용) */}
{(data.sub_tasks ?? []).length > 0 && (
  <div style={{ marginBottom: 16 }}>
    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>하위과제</p>
    <div className="flex flex-col gap-2">
      {(data.sub_tasks ?? []).map(st => (
        <div
          key={st.id}
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            padding: '8px 12px',
            background: 'var(--surface-secondary)',
          }}
        >
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{st.title}</p>
          {st.description && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{st.description}</p>
          )}
          <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>
            마일스톤 {(st.milestones ?? []).length}개
          </p>
        </div>
      ))}
    </div>
  </div>
)}
```

마일스톤 섹션에서도 `sub_task_title` 표시 (선택 사항):  
마일스톤 목록에서 각 마일스톤 항목 렌더링 시 `sub_task_id`가 있으면 소속 하위과제명 표시:

```tsx
{m.sub_task_id && (
  <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
    {data.sub_tasks?.find(st => st.id === m.sub_task_id)?.title ?? ''}
  </span>
)}
```

단, 어드민 상세 페이지에서 `data.milestones`는 현재 `ChampionProject.milestones`(sub_task_id=null 것만)를 받는다.  
하위과제 소속 마일스톤도 보여주려면, API 응답의 `sub_tasks[].milestones`를 합쳐서 렌더링:

```ts
const allMilestones = useMemo(() => {
  if (!data) return []
  const fromSubTasks = (data.sub_tasks ?? []).flatMap(st => st.milestones ?? [])
  return [...data.milestones, ...fromSubTasks]
    .sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0) || a.display_order - b.display_order)
}, [data])
```

기존 `data.milestones.map(...)` 을 `allMilestones.map(...)` 으로 교체.

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/champions/\[userId\]/page.tsx
git commit -m "[AX-1] feat(admin): 챔피언 상세에 하위과제 읽기 전용 표시 추가"
```

---

## Task 11: 메모리 업데이트 및 최종 정리

- [ ] **Step 1: 전체 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: 개발 서버 실행 후 골든 패스 검증**

```bash
npm run dev
```

검증 항목:
1. `/my-project/milestones` → 하위과제 추가/수정/삭제, 마일스톤 생성 시 하위과제 선택, 섹션 fold/unfold
2. `/checkin` → 하위과제별 그룹화, fold/unfold
3. `/admin/progress` (Gantt) → 하위과제 행 그룹 레이블 표시
4. `/admin/champions/[userId]` → 하위과제 읽기 전용 표시

- [ ] **Step 3: 최종 커밋 (변경 누락 파일 있을 경우)**

```bash
git status
git add <누락된 파일>
git commit -m "[AX-1] chore: sub-tasks 브레이킹 체인지 구현 마무리"
```
