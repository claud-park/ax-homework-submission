# Milestone Tree (parent_milestone_id) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sub_tasks` 테이블을 제거하고 `milestones.parent_milestone_id`로 2-depth 트리 구조로 전환. `milestone_deliverables`도 완전 제거.

**Architecture:** 단일 `milestones` 테이블. `parent_milestone_id = null` → depth-0 (그룹 헤더). `parent_milestone_id != null` → depth-1 (작업 항목). 두 레벨 모두 "마일스톤"으로 표시. 산출물(deliverables) 개념 제거.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL), TypeScript, Tailwind CSS

---

## File Map

| Action | Path | 역할 |
|---|---|---|
| Create | `supabase/migrations/018_parent_milestone_id.sql` | DB 구조 전환 |
| Modify | `lib/types.ts` | SubTask 제거, Milestone 업데이트 |
| Delete | `app/api/sub-tasks/route.ts` | sub-tasks API 제거 |
| Delete | `app/api/sub-tasks/[id]/route.ts` | sub-tasks API 제거 |
| Delete | `app/api/milestones/[id]/deliverables/route.ts` | deliverables API 제거 |
| Delete | `app/api/milestones/[id]/deliverables/download/route.ts` | deliverables download API 제거 |
| Modify | `app/api/milestones/route.ts` | GET/POST 업데이트 |
| Modify | `app/api/milestones/[id]/route.ts` | PATCH 업데이트 |
| Modify | `app/api/champions/[userId]/route.ts` | sub_tasks 제거, flat milestones |
| Modify | `app/api/champions/gantt/route.ts` | parent_milestone_id 기반 그룹핑 |
| Modify | `app/(champion)/my-project/milestones/page.tsx` | WBS UI 전면 개편 |
| Modify | `app/(champion)/checkin/page.tsx` | parent_milestone 그룹핑 |
| Modify | `components/ChampionGanttView.tsx` | parent_milestone 그룹 행 |
| Modify | `app/admin/champions/[userId]/page.tsx` | 마일스톤 트리 표시 |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/018_parent_milestone_id.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- 018_parent_milestone_id.sql
-- sub_tasks 테이블을 milestones.parent_milestone_id로 대체
-- milestone_deliverables 완전 제거

-- 1. parent_milestone_id 컬럼 추가
ALTER TABLE milestones
  ADD COLUMN parent_milestone_id uuid REFERENCES milestones(id) ON DELETE SET NULL;

-- 2. 기존 sub_tasks → depth-0 milestones로 마이그레이션
INSERT INTO milestones (id, user_id, title, description, display_order, publish_status, created_at, updated_at)
SELECT id, user_id, title, description, display_order, publish_status, created_at, updated_at
FROM sub_tasks
ON CONFLICT (id) DO NOTHING;

-- 3. milestones.sub_task_id → parent_milestone_id 연결
UPDATE milestones
SET parent_milestone_id = sub_task_id
WHERE sub_task_id IS NOT NULL;

-- 4. sub_task_id 컬럼 제거
ALTER TABLE milestones DROP COLUMN sub_task_id;

-- 5. sub_tasks 테이블 제거
DROP TABLE sub_tasks;

-- 6. milestone_deliverables 제거
DROP TABLE milestone_deliverables;

-- 7. 인덱스 생성
CREATE INDEX milestones_parent_milestone_id
  ON milestones(parent_milestone_id)
  WHERE parent_milestone_id IS NOT NULL;
```

- [ ] **Step 2: Supabase 대시보드 SQL 에디터에서 실행** (개발자가 직접 실행)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_parent_milestone_id.sql
git commit -m "[AX-1] feat(db): milestone 트리 구조로 전환 (parent_milestone_id, deliverables 제거)"
```

---

## Task 2: TypeScript 타입

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: 타입 업데이트**

`Milestone` 인터페이스에서:
- `sub_task_id: string | null` 줄 제거
- `deliverables?: MilestoneDeliverable[]` 줄 제거
- 아래 두 줄 추가 (기존 필드 이후):

```ts
  parent_milestone_id: string | null
  children?: Milestone[]
```

`MilestoneDeliverable` 인터페이스 전체 삭제.

`ChampionProject` 인터페이스에서:
- `sub_tasks: SubTask[]` 줄 제거

`SubTask` 인터페이스 전체 삭제.

최종 `Milestone`:
```ts
export interface Milestone {
  id: string
  user_id: string
  week_number: number | null
  title: string
  description: string | null
  start_date: string
  due_date: string
  status: MilestoneStatus
  is_manual_progress: boolean
  is_manual_completed: boolean
  bottleneck_type: BottleneckType | null
  bottleneck_note: string | null
  bottleneck_admin_comment: string | null
  bottleneck_reviewed_at: string | null
  parent_milestone_id: string | null
  display_order: number
  created_at: string
  updated_at: string
  publish_status: PublishStatus
  children?: Milestone[]
}
```

최종 `ChampionProject`:
```ts
export interface ChampionProject {
  user: User
  charter: (CharterSubmission & { comments: CharterComment[] }) | null
  milestones: Milestone[]
  latestSubmission: Submission | null
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 있음 (삭제된 타입 참조들 — 이후 Task에서 수정)

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "[AX-1] refactor(types): SubTask·MilestoneDeliverable 제거, Milestone에 parent_milestone_id 추가"
```

---

## Task 3: 폐기 API 삭제

**Files:**
- Delete: `app/api/sub-tasks/route.ts`
- Delete: `app/api/sub-tasks/[id]/route.ts`
- Delete: `app/api/milestones/[id]/deliverables/route.ts`
- Delete: `app/api/milestones/[id]/deliverables/download/route.ts`

- [ ] **Step 1: 파일 삭제**

```bash
rm app/api/sub-tasks/route.ts
rm app/api/sub-tasks/[id]/route.ts
rm app/api/milestones/[id]/deliverables/route.ts
rm app/api/milestones/[id]/deliverables/download/route.ts
# 빈 디렉토리도 정리
rmdir app/api/sub-tasks/[id] app/api/sub-tasks 2>/dev/null || true
rmdir app/api/milestones/[id]/deliverables/download app/api/milestones/[id]/deliverables 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "[AX-1] feat(api): sub-tasks API 및 milestone deliverables API 제거"
```

---

## Task 4: milestones API 업데이트

**Files:**
- Modify: `app/api/milestones/route.ts`
- Modify: `app/api/milestones/[id]/route.ts`

- [ ] **Step 1: GET /api/milestones 업데이트**

`app/api/milestones/route.ts` GET 핸들러에서:
- `select('*, milestone_deliverables(*)')` → `select('*')` 로 변경
- normalized 블록 제거 (deliverables 변환 로직 삭제)
- 직접 `return NextResponse.json(data ?? [])` 반환

```ts
export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const targetUserId = req.nextUrl.searchParams.get('user_id')
  const effectiveUserId = isAdmin && targetUserId ? targetUserId : user.id

  const supabase = createServiceClient()
  let query = supabase
    .from('milestones')
    .select('*')
    .eq('user_id', effectiveUserId)
    .order('display_order')
    .order('start_date', { ascending: true, nullsFirst: false })

  if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 2: POST /api/milestones 업데이트**

`app/api/milestones/route.ts` POST 핸들러에서:
- `sub_task_id` → `parent_milestone_id` 로 교체
- 검증 완화: publish 시 title만 필수 (start_date, due_date는 선택)

```ts
export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { title, start_date, due_date, description, publish_status, parent_milestone_id } = body
  const status = publish_status === 'published' ? 'published' : 'draft'

  if (status === 'published' && !title) {
    return NextResponse.json(
      { error: 'validation_failed', fields: [{ field: 'title', message: '필수 항목입니다.' }] },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .insert({
      user_id: user.id,
      title: title ?? '',
      start_date: start_date ?? null,
      due_date: due_date ?? null,
      description: description ?? null,
      publish_status: status,
      parent_milestone_id: parent_milestone_id ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 3: PATCH /api/milestones/[id] 업데이트**

`app/api/milestones/[id]/route.ts`에서:

`computeStatus` 함수 수정 — `hasDeliverable` 파라미터 제거:
```ts
function computeStatus(
  milestone: {
    due_date: string
    is_manual_progress: boolean
    is_manual_completed: boolean
    bottleneck_type: string | null
  },
): MilestoneStatus {
  if (milestone.is_manual_completed) return 'completed'
  if (milestone.bottleneck_type) return 'delayed'
  if (milestone.is_manual_progress) return 'in_progress'
  if (milestone.due_date && new Date(milestone.due_date) < new Date()) return 'delayed'
  return 'not_started'
}
```

PATCH 핸들러에서 deliverableCount 블록 제거:
```ts
// 제거: deliverableCount 쿼리 전체
const { count: deliverableCount } = await supabase
  .from('milestone_deliverables')
  ...
```

computeStatus 호출 수정:
```ts
// 변경 전
const computedStatus = nextStatus === 'published'
  ? computeStatus(merged, (deliverableCount ?? 0) > 0)
  : existing.status

// 변경 후
const computedStatus = nextStatus === 'published' && merged.due_date
  ? computeStatus(merged)
  : existing.status
```

`sub_task_id` 블록을 `parent_milestone_id` 로 교체:
```ts
// 변경 전
if ('sub_task_id' in body) {
  patch.sub_task_id = body.sub_task_id ?? null
}

// 변경 후
if ('parent_milestone_id' in body) {
  patch.parent_milestone_id = body.parent_milestone_id ?? null
}
```

검증도 완화 (publish 시 title만 필수):
```ts
// 변경 전
if (!eff.title) fields.push(...)
if (!eff.start_date) fields.push(...)
if (!eff.due_date) fields.push(...)

// 변경 후
if (!eff.title) fields.push({ field: 'title', message: '필수 항목입니다.' })
```

- [ ] **Step 4: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add app/api/milestones/route.ts app/api/milestones/[id]/route.ts
git commit -m "[AX-1] feat(api): milestones API에 parent_milestone_id 지원, deliverables 제거"
```

---

## Task 5: champions API 업데이트

**Files:**
- Modify: `app/api/champions/[userId]/route.ts`
- Modify: `app/api/champions/gantt/route.ts`

- [ ] **Step 1: GET /api/champions/[userId] 업데이트**

`app/api/champions/[userId]/route.ts`에서:
- `Promise.all`에서 sub_tasks 쿼리 제거
- milestones select에서 `milestone_deliverables(*)` 제거 → `*, parent_milestone_id` (이미 * 안에 포함)
- normalized 블록 간소화 (deliverables 변환 제거)
- result에서 `sub_tasks` 필드 제거

```ts
// Promise.all에서 4개로 줄임
const [
  { data: userRow, error: userErr },
  { data: charterRows, error: charterErr },
  { data: milestones, error: msErr },
  { data: submissions, error: subErr },
] = await Promise.all([
  supabase.from('users').select('*').eq('id', userId).single(),
  supabase
    .from('charter_submissions')
    .select('*, charter_comments(*)')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1),
  supabase
    .from('milestones')
    .select('*')
    .eq('user_id', userId)
    .eq('publish_status', 'published')
    .order('display_order')
    .order('start_date', { ascending: true, nullsFirst: false }),
  supabase
    .from('submissions')
    .select('*')
    .eq('user_id', userId)
    .order('attempt_number', { ascending: false })
    .limit(1),
])
```

stErr 에러 체크 제거 (4개로 줄어들었으므로).

result 구성:
```ts
const result: ChampionProject = {
  user: userRow,
  charter: charterWithComments,
  milestones: milestones ?? [],
  latestSubmission: submissions?.[0] ?? null,
}
```

- [ ] **Step 2: GET /api/champions/gantt 업데이트**

`app/api/champions/gantt/route.ts`에서:
- `GanttMilestone` 인터페이스: `sub_task_id`, `sub_task_title` 제거 → `parent_milestone_id` 추가
- sub_tasks 쿼리 제거
- milestones select에서 `sub_task_id` 제거 → `parent_milestone_id` 추가
- push 블록에서 `sub_task_id`, `sub_task_title` 제거 → `parent_milestone_id` 추가

```ts
export interface GanttMilestone {
  id: string
  title: string
  start_date: string
  due_date: string
  status: MilestoneStatus
  week_number: number
  parent_milestone_id: string | null
}
```

Promise.all에서 sub_tasks 쿼리 제거, milestones select 수정:
```ts
supabase
  .from('milestones')
  .select('id, user_id, title, start_date, due_date, status, week_number, parent_milestone_id')
  .eq('publish_status', 'published')
  .not('start_date', 'is', null)
  .not('due_date', 'is', null)
  .order('display_order')
```

push 블록 수정:
```ts
msMap.get(m.user_id)!.push({
  id: m.id,
  title: m.title,
  start_date: m.start_date,
  due_date: m.due_date,
  status: m.status as MilestoneStatus,
  week_number: m.week_number,
  parent_milestone_id: m.parent_milestone_id ?? null,
})
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add app/api/champions/[userId]/route.ts app/api/champions/gantt/route.ts
git commit -m "[AX-1] feat(api): champions API에서 sub_tasks 제거, parent_milestone_id 기반으로 전환"
```

---

## Task 6: WBS 탭 UI 전면 개편

**Files:**
- Modify: `app/(champion)/my-project/milestones/page.tsx`

이 파일은 대규모 변경이다. 현재 934줄 파일을 읽고 변경 포인트를 정확히 파악할 것.

**핵심 변경사항:**
1. deliverables 관련 state, handler, UI 전체 제거
2. subTasks state → parentMilestones (depth-0 마일스톤) 으로 교체
3. 하위과제 CRUD 모달 → 마일스톤 생성/수정 모달로 통합 (기존 milestone edit modal 사용)
4. 마일스톤 생성 폼에 `parent_milestone_id` 셀렉터 (depth-0 마일스톤만 선택 가능)

**렌더링 구조:**
```
[depth-0 마일스톤들] (parent=null, 항상 섹션 헤더로 표시)
  각 섹션 헤더: 제목 | 날짜(있으면) | 상태(있으면) | 편집 | 삭제 | +
  섹션 안: depth-1 마일스톤 테이블 (기존 renderMilestoneRow 재사용)
```

- [ ] **Step 1: import 및 state 정리**

제거:
- `apiFetch`, `apiUpload` 중 `apiUpload` 제거 (deliverables 업로드용)
- `linkInputId`, `linkInputVal`, `resubmitInputRefs` 관련 state 제거
- subTasks, collapsedSubTasks 등 hoist sub_task 관련 state 제거
- showSubTaskForm, subTaskForm, subTaskFormError, editingSubTask, editSubTaskForm 제거

추가:
```ts
const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
```

`NewMilestone` 인터페이스 수정:
```ts
interface NewMilestone { title: string; start_date: string; due_date: string; description: string; parent_milestone_id: string }
```

form 초기값 수정:
```ts
const [form, setForm] = useState<NewMilestone>({ title: '', start_date: '', due_date: '', description: '', parent_milestone_id: '' })
```

- [ ] **Step 2: useEffect 수정**

`/api/sub-tasks` fetch 제거. milestones 하나만 fetch:
```ts
useEffect(() => {
  Promise.all([
    apiFetch<Milestone[]>('/api/milestones').then(setMilestones),
    apiFetch<DeadlineChangeRequest[]>('/api/deadline-requests').then(setRequests),
    apiFetch<CharterSubmission[]>('/api/charter/submissions')
      .then(subs => setCharterApproved(subs.some(s => !!s.admin_approved_at))),
  ])
    .catch((e: Error) => toast.error('로드 실패: ' + e.message))
    .finally(() => setLoading(false))
}, [])
```

- [ ] **Step 3: deliverables 핸들러 전부 제거**

제거 대상:
- `handleUpload` 함수 전체
- `handleLinkUpload` 함수 전체
- `handleDownload` 함수 전체
- `handleMoveMilestone` (이미 없음)
- sub_task CRUD 핸들러 전체 (handleCreateSubTask, handleUpdateSubTask, handleDeleteSubTask)

추가:
```ts
function toggleGroup(id: string) {
  setCollapsedGroups(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
}
```

- [ ] **Step 4: submitNew 수정**

`sub_task_id` → `parent_milestone_id`:
```ts
const created = await apiFetch<Milestone>('/api/milestones', {
  method: 'POST',
  body: JSON.stringify({
    ...form,
    start_date: form.start_date || null,
    due_date: form.due_date || null,
    parent_milestone_id: form.parent_milestone_id || null,
    publish_status: publishStatus,
  }),
})
setMilestones(prev => [...prev, created])
setShowForm(false)
setForm({ title: '', start_date: '', due_date: '', description: '', parent_milestone_id: '' })
```

- [ ] **Step 5: groupedMilestones useMemo 수정**

```ts
const groupedMilestones = useMemo(() => {
  const filtered = filter === 'all' ? milestones : milestones.filter(m => m.publish_status === filter)
  const depth0 = milestones.filter(m => !m.parent_milestone_id)  // 항상 전체 (필터 무관)
  const byParent = new Map<string, Milestone[]>()
  for (const g of depth0) byParent.set(g.id, [])
  for (const m of filtered) {
    if (m.parent_milestone_id && byParent.has(m.parent_milestone_id)) {
      byParent.get(m.parent_milestone_id)!.push(m)
    }
  }
  return { depth0, byParent }
}, [milestones, filter])
```

- [ ] **Step 6: renderMilestoneRow 간소화**

deliverables 관련 UI 전체 제거. 행은 아래만:
- 마일스톤 이름 + DraftBadge + 편집 버튼
- 기간 + 기한 변경 요청 버튼 + 요청 상태 뱃지
- 상태 + 과제 시작 버튼

```ts
function renderMilestoneRow(m: Milestone) {
  const milestoneReqs = requests.filter(r => r.milestone_id === m.id)
  return (
    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <td className="px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
        <div className="flex items-center gap-1.5">
          <span>{m.title || '(제목 없음)'}</span>
          {m.publish_status === 'draft' && <DraftBadge />}
          <button
            type="button"
            onClick={() => openEdit(m)}
            title="편집"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', fontSize: '12px', padding: '2px 3px', lineHeight: 1 }}
          >
            ✏
          </button>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1.5">
          <span style={{ color: 'var(--text-secondary)' }}>{m.start_date} ~ {m.due_date}</span>
          {m.publish_status === 'published' && (m.status === 'delayed' || m.status === 'in_progress') && (
            <button
              onClick={() => {
                const existing = milestoneReqs[0]
                setDeadlineModal({ id: m.id, due_date: m.due_date, existingReqId: existing?.id })
                setReqForm({ requested_due_date: existing?.requested_due_date ?? '', reason: existing?.reason ?? '' })
              }}
              className="text-xs self-start underline"
              style={{ color: 'var(--text-disabled)' }}
            >
              {milestoneReqs.length > 0 ? '기한 변경 요청 수정' : '기한 변경 요청'}
            </button>
          )}
          {m.publish_status === 'published' && (() => {
            const pending = milestoneReqs.find(r => r.status === 'pending')
            const resolved = milestoneReqs.find(r => r.status === 'approved' || r.status === 'rejected')
            const toShow = [pending, resolved].filter(Boolean) as typeof milestoneReqs
            if (toShow.length === 0) return null
            return (
              <div className="flex flex-col gap-1">
                {toShow.map(r => (
                  <div key={r.id} className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: REQ_COLOR[r.status], background: `${REQ_COLOR[r.status]}18`, border: `1px solid ${REQ_COLOR[r.status]}40` }}>
                      {REQ_LABEL[r.status]}
                    </span>
                    <span style={{ color: 'var(--text-disabled)' }}>→ {r.requested_due_date}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1.5">
          <span style={{ color: STATUS_COLOR[m.status] }}>
            {STATUS_LABEL[m.status]}{m.status === 'delayed' ? ' ⚠️' : ''}
          </span>
          {m.publish_status === 'published' && (m.status === 'not_started' || m.status === 'delayed') && (
            charterApproved ? (
              <button onClick={() => handleMarkProgress(m.id)} className="px-2 py-1 rounded font-semibold self-start" style={{ color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}>
                ▶ 과제 시작
              </button>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-semibold self-start" style={{ color: 'var(--text-disabled)', background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                과제 정의서 검토중
              </span>
            )
          )}
        </div>
      </td>
    </tr>
  )
}
```

COL_WIDTHS도 3컬럼으로 수정:
```ts
const COL_WIDTHS = ['35%', '40%', '25%']
```

- [ ] **Step 7: 렌더링 구조 교체**

기존 마일스톤 목록 렌더링 영역을 아래로 교체.
depth-0 마일스톤이 없는 경우 EmptyState 표시.

```tsx
{groupedMilestones.depth0.length === 0 ? (
  <EmptyState icon={ListTodo} title="마일스톤이 없습니다" description="+ 마일스톤 추가를 눌러 첫 마일스톤을 만들어보세요." />
) : (
  <div className="flex flex-col gap-0">
    {groupedMilestones.depth0.map(g => {
      const isCollapsed = collapsedGroups.has(g.id)
      const children = groupedMilestones.byParent.get(g.id) ?? []
      return (
        <div key={g.id} style={{ marginTop: 12 }}>
          {/* 섹션 헤더 */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}
          >
            <button onClick={() => toggleGroup(g.id)} style={{ color: 'var(--text-secondary)', lineHeight: 1 }}>
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
            <span
              className="text-xs font-semibold flex-1 cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
              onClick={() => toggleGroup(g.id)}
            >
              {g.title}
            </span>
            {g.start_date && (
              <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                {g.start_date} ~ {g.due_date}
              </span>
            )}
            {g.publish_status === 'published' && g.status !== 'not_started' && (
              <span className="text-xs" style={{ color: STATUS_COLOR[g.status] }}>{STATUS_LABEL[g.status]}</span>
            )}
            <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>{children.length}개</span>
            <button
              onClick={() => openEdit(g)}
              style={{ color: 'var(--text-secondary)' }}
              title="편집"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => handleDelete(g.id)}
              style={{ color: 'var(--error)' }}
              title="삭제"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={() => { setForm(f => ({ ...f, parent_milestone_id: g.id })); openForm() }}
              style={{ color: 'var(--blue-600)' }}
              title="하위 마일스톤 추가"
            >
              <Plus size={12} />
            </button>
          </div>
          {/* 자식 마일스톤 */}
          {!isCollapsed && children.length > 0 && (
            <div className="rounded-xl border overflow-hidden mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
              <table className="w-full text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
                <colgroup>{COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <tbody>
                  {children.map(m => renderMilestoneRow(m))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )
    })}

    {/* + 마일스톤 추가 (depth-0 그룹 추가) */}
    <button
      onClick={() => { setForm(f => ({ ...f, parent_milestone_id: '' })); openForm() }}
      className="flex items-center gap-1 text-xs mt-3"
      style={{ color: 'var(--text-secondary)' }}
    >
      <Plus size={12} /> 마일스톤 추가
    </button>
  </div>
)}
```

> **주의:** 헤더 "마일스톤 추가" 버튼(상단)은 `openForm()`만 호출 — parent_milestone_id 세팅 없음 (depth-0 생성).

- [ ] **Step 8: 마일스톤 생성 폼 수정**

기존 `하위과제 select`를 `상위 마일스톤 select`로 교체.
depth-0 마일스톤만 선택 가능:

```tsx
<div>
  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>상위 마일스톤</label>
  <select
    value={form.parent_milestone_id}
    onChange={e => setForm(f => ({ ...f, parent_milestone_id: e.target.value }))}
    style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '13px', width: '100%' }}
  >
    <option value="">없음 (최상위 마일스톤)</option>
    {groupedMilestones.depth0.map(g => (
      <option key={g.id} value={g.id}>{g.title}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 9: 하위과제 모달 2개 제거, 기존 모달들 정리**

- "하위과제 생성 모달" Dialog 제거
- "하위과제 수정 모달" Dialog 제거
- "파일 재제출 확인 Dialog" 제거 (confirmResubmitId 관련)
- resubmitInputRefs 제거

- [ ] **Step 10: 타입 체크 및 수동 검증**

```bash
npx tsc --noEmit
```

- [ ] **Step 11: Commit**

```bash
git add "app/(champion)/my-project/milestones/page.tsx"
git commit -m "[AX-1] feat(ui): WBS 탭 - parent_milestone 트리 구조, deliverables UI 제거"
```

---

## Task 7: 체크인 탭 업데이트

**Files:**
- Modify: `app/(champion)/checkin/page.tsx`

- [ ] **Step 1: sub_tasks state → parent_milestone 그룹핑으로 교체**

`/api/sub-tasks` fetch 제거. `/api/milestones`에서 받은 flat milestones를 직접 그룹핑:

```ts
const [subTasks, setSubTasks] = useState<SubTask[]>([])  // 제거
// ↓
// subTasks state 불필요 — milestones에서 파생
```

useMemo로 depth-0 그룹 계산:
```ts
const groups = useMemo(() => {
  const depth0 = milestones.filter(m => !m.parent_milestone_id)
  const byParent = new Map<string, Milestone[]>()
  for (const g of depth0) byParent.set(g.id, [])
  for (const m of milestones) {
    if (m.parent_milestone_id && byParent.has(m.parent_milestone_id)) {
      byParent.get(m.parent_milestone_id)!.push(m)
    }
  }
  return { depth0, byParent }
}, [milestones])
```

- [ ] **Step 2: 렌더링 교체**

기존 subTasks.map(...) 을 groups.depth0.map(...)으로 교체:

```tsx
{groups.depth0.map(g => {
  const gMilestones = groups.byParent.get(g.id) ?? []
  if (gMilestones.length === 0) return null
  const isCollapsed = collapsedSubTasks.has(g.id)
  return (
    <div key={g.id} style={{ marginTop: 16 }}>
      <button
        onClick={() => setCollapsedSubTasks(prev => {
          const next = new Set(prev)
          if (next.has(g.id)) next.delete(g.id)
          else next.add(g.id)
          return next
        })}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg mb-2"
        style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}
      >
        {isCollapsed
          ? <ChevronRight size={14} style={{ color: 'var(--text-secondary)' }} />
          : <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />}
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{g.title}</span>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-disabled)' }}>{gMilestones.length}개</span>
      </button>
      {!isCollapsed && (
        <CheckinTab
          milestones={gMilestones}
          requests={requests}
          charterApproved={charterApproved}
          onComplete={handleCheckinComplete}
          onDelayReport={handleCheckinDelayReport}
          onInProgress={handleCheckinInProgress}
          onDeadlineExtension={openDeadlineForCheckin}
        />
      )}
    </div>
  )
})}
```

SubTask import 제거.

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(champion)/checkin/page.tsx"
git commit -m "[AX-1] feat(ui): 체크인 탭 - parent_milestone 기반 그룹핑으로 전환"
```

---

## Task 8: Gantt 뷰 업데이트

**Files:**
- Modify: `components/ChampionGanttView.tsx`

- [ ] **Step 1: toTasks 함수 수정**

`GanttMilestone`에서 `sub_task_id`, `sub_task_title` 제거 → `parent_milestone_id` 사용.

`toTasks` 내부에서 `sub_task_id` 기준 그룹핑을 `parent_milestone_id` 기반으로 교체:

```ts
// 챔피언 루프 안에서
const topLevelMs = c.milestones.filter(m => !m.parent_milestone_id)
const childMs = c.milestones.filter(m => !!m.parent_milestone_id)

// depth-0 마일스톤(parent=null)을 project 행으로
const depth0Ids = [...new Set(c.milestones.map(m => m.parent_milestone_id ?? m.id))]
// 실제로는 parent=null인 마일스톤들이 project 행이 됨

// top-level milestones (부모 없는 것) → project 행
for (const m of topLevelMs) {
  const stRowId = `group-${m.id}`
  const stMs = childMs.filter(cm => cm.parent_milestone_id === m.id)
  
  // 그룹 행
  tasks.push({
    id: stRowId,
    name: m.title,
    start: new Date(m.start_date ?? stMs[0]?.start_date ?? m.due_date),
    end: new Date(m.due_date ?? stMs[stMs.length-1]?.due_date ?? m.start_date),
    progress: 0,
    type: 'project',
    project: champId,
    hideChildren: false,
    displayOrder: tasks.length + 1,
  })
  
  // 자식 마일스톤
  for (const cm of stMs) {
    const isFuture = cm.start_date > todayStr
    const isPast = cm.due_date < todayStr
    tasks.push({
      id: cm.id,
      name: cm.title,
      start: new Date(cm.start_date),
      end: new Date(cm.due_date),
      progress: STATUS_PROGRESS[cm.status],
      type: 'task',
      project: stRowId,
      styles: {
        progressColor: isFuture ? '#cbd5e1' : STATUS_COLOR[cm.status],
        progressSelectedColor: isFuture ? '#94a3b8' : STATUS_COLOR[cm.status],
        backgroundColor: isPast && cm.status !== 'completed' ? 'rgba(239,68,68,0.15)' : undefined,
      },
      displayOrder: tasks.length + 1,
    })
  }
}
```

> **주의:** depth-0 마일스톤의 start_date/due_date가 null일 경우, 자식 중 첫/마지막 날짜로 fallback 처리 필요.

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/ChampionGanttView.tsx
git commit -m "[AX-1] feat(ui): Gantt - parent_milestone_id 기반 그룹핑으로 전환"
```

---

## Task 9: 어드민 챔피언 상세 업데이트

**Files:**
- Modify: `app/admin/champions/[userId]/page.tsx`

- [ ] **Step 1: sub_tasks 표시 → parent_milestone 트리로 교체**

`data.sub_tasks` 참조 제거.

`allMilestones` useMemo 수정 — `ChampionProject.milestones`가 이제 flat 전체 목록:
```ts
const allMilestones = useMemo(() => {
  if (!data) return []
  return [...(data.milestones ?? [])]
    .sort((a, b) =>
      (a.start_date ?? '').localeCompare(b.start_date ?? '') ||
      a.display_order - b.display_order
    )
}, [data])
```

기존 하위과제 섹션 (sub_tasks 카드들)을 depth-0 마일스톤 기반으로 교체:
```tsx
{(() => {
  const depth0 = (data.milestones ?? []).filter(m => !m.parent_milestone_id)
  if (depth0.length === 0) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>마일스톤 그룹</p>
      <div className="flex flex-col gap-2">
        {depth0.map(g => {
          const children = (data.milestones ?? []).filter(m => m.parent_milestone_id === g.id)
          return (
            <div key={g.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-secondary)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{g.title}</p>
              {g.start_date && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{g.start_date} ~ {g.due_date}</p>
              )}
              <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>하위 마일스톤 {children.length}개</p>
            </div>
          )
        })}
      </div>
    </div>
  )
})()}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "app/admin/champions/[userId]/page.tsx"
git commit -m "[AX-1] feat(admin): 챔피언 상세 - parent_milestone 트리 구조로 표시 전환"
```

---

## Task 10: 최종 검증

- [ ] **Step 1: 전체 타입 체크**

```bash
npx tsc --noEmit
```

Expected: 에러 없음

- [ ] **Step 2: Supabase SQL 실행 확인**

`018_parent_milestone_id.sql`이 실행됐는지 확인. 아직이면 개발자에게 알림.

- [ ] **Step 3: 개발 서버 골든 패스 검증**

```bash
npm run dev
```

검증:
1. `/my-project/milestones` → 마일스톤 추가 (depth-0), "+" 버튼으로 자식 추가, fold/unfold
2. `/checkin` → depth-0 그룹핑 표시
3. `/admin/progress` (Gantt) → 마일스톤 그룹 행
4. `/admin/champions/[userId]` → 마일스톤 그룹 읽기 전용

- [ ] **Step 4: 최종 커밋 (누락 파일 있을 경우)**

```bash
git status
git add <누락된 파일>
git commit -m "[AX-1] chore: milestone tree 전환 마무리"
```
