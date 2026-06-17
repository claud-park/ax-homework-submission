# Multi-Charter per Champion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 Champion이 2개 이상의 Charter를 병행 개발·제출할 수 있도록 DB → API → Champion UI → Admin UI 전 레이어를 순차적으로 재설계한다.

**Architecture:** `milestones` 테이블에 `charter_submission_id` FK를 추가해 Champion → Charter(1:N) → Milestone(1:N) 계층을 확립한다. `charter_submissions`의 upsert-on-`user_id`를 INSERT로 전환하고, working draft(`project_charters`)를 `charter_submission_id` 기준으로 분리한다. Champion UI는 Charter 셀렉터 드롭다운(+URL param `?charter_id=xxx`)으로 컨텍스트를 전환하고, Admin UI는 Charter 탭으로 구조화한다.

**Tech Stack:** Next.js 14 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS, gantt-task-react

## Global Constraints

- 기존 챔피언 데이터 손실 없이 마이그레이션해야 한다 (NULL charter FK 허용)
- Champion의 charter/milestone 흐름에서 charter 컨텍스트는 URL param `?charter_id=xxx`로 관리
- Charter가 1개인 경우 셀렉터 없이 기존과 동일한 UX 유지 (하위 호환)
- Admin comment 시스템(`charter_comments`)은 이미 `charter_submission_id` 기반이므로 변경 없음
- 커밋 메시지 형식: `[AX-1] <type>: <설명>` (commitlint 강제)

---

## File Map

| 파일 | 유형 | Task |
|---|---|---|
| `supabase/migrations/20260617100000_milestones_charter_fk.sql` | 신규 | 1 |
| `supabase/migrations/20260617100001_charter_title.sql` | 신규 | 1 |
| `supabase/migrations/20260617100002_project_charters_charter_fk.sql` | 신규 | 1 |
| `lib/types.ts` | 수정 | 2 |
| `app/api/charter/submissions/route.ts` | 수정 | 3 |
| `app/api/charter/route.ts` | 수정 | 4 |
| `app/api/milestones/route.ts` | 수정 | 5 |
| `app/api/milestones/generate/route.ts` | 수정 | 5 |
| `app/api/milestones/batch/route.ts` | 수정 | 5 |
| `app/api/milestones/refine/route.ts` | 수정 | 5 |
| `app/api/champions/gantt/route.ts` | 수정 | 6 |
| `lib/data/champions.ts` | 수정 | 6 |
| `app/(champion)/my-project/charter/page.tsx` | 수정 | 7 |
| `app/(champion)/my-project/charter/[id]/page.tsx` | 신규 | 7 |
| `app/(champion)/my-project/charter/CharterListClient.tsx` | 신규 | 7 |
| `app/(champion)/my-project/charter/CharterClient.tsx` | 수정 | 7 |
| `app/(champion)/my-project/milestones/page.tsx` | 수정 | 8 |
| `app/(champion)/my-project/milestones/MilestonesClient.tsx` | 수정 | 8 |
| `components/CheckinTab.tsx` | 수정 | 8 |
| `app/admin/champions/[userId]/page.tsx` | 수정 | 9 |
| `components/ChampionGanttView.tsx` | 수정 | 10 |
| `app/admin/kanban/page.tsx` | 수정 | 11 |
| `app/admin/mobile/charters/page.tsx` | 수정 | 11 |
| `app/admin/progress/page.tsx` | 수정 | 11 |

---

## Task 1: DB 마이그레이션 3종

**Files:**
- Create: `supabase/migrations/20260617100000_milestones_charter_fk.sql`
- Create: `supabase/migrations/20260617100001_charter_title.sql`
- Create: `supabase/migrations/20260617100002_project_charters_charter_fk.sql`

**Interfaces:**
- Produces: `milestones.charter_submission_id uuid NULL`, `charter_submissions.title text NULL`, `project_charters.charter_submission_id uuid NULL` (unique index)

- [ ] **Step 1: 마이그레이션 파일 1 — milestones FK 추가**

```sql
-- supabase/migrations/20260617100000_milestones_charter_fk.sql
ALTER TABLE milestones
  ADD COLUMN charter_submission_id uuid REFERENCES charter_submissions(id) ON DELETE SET NULL;

-- 기존 milestone → 해당 user의 가장 최근 published charter에 귀속
UPDATE milestones m
SET charter_submission_id = (
  SELECT id FROM charter_submissions cs
  WHERE cs.user_id = m.user_id
    AND cs.publish_status = 'published'
  ORDER BY cs.submitted_at DESC
  LIMIT 1
)
WHERE m.charter_submission_id IS NULL;
```

- [ ] **Step 2: 마이그레이션 파일 2 — charter_submissions title 컬럼**

```sql
-- supabase/migrations/20260617100001_charter_title.sql
ALTER TABLE charter_submissions
  ADD COLUMN title text;

-- 기존 charter에 기본 title 부여 (UI 식별용)
UPDATE charter_submissions
SET title = COALESCE(project_name, 'Charter')
WHERE title IS NULL;
```

- [ ] **Step 3: 마이그레이션 파일 3 — project_charters charter별 분리**

```sql
-- supabase/migrations/20260617100002_project_charters_charter_fk.sql

-- 기존 user_id unique constraint 제거 (1:1 → 1:N)
ALTER TABLE project_charters
  DROP CONSTRAINT IF EXISTS project_charters_user_id_key;

-- charter별 draft FK 추가
ALTER TABLE project_charters
  ADD COLUMN charter_submission_id uuid REFERENCES charter_submissions(id) ON DELETE CASCADE;

-- 기존 draft를 해당 user의 최신 charter에 연결
UPDATE project_charters pc
SET charter_submission_id = (
  SELECT id FROM charter_submissions cs
  WHERE cs.user_id = pc.user_id
  ORDER BY cs.submitted_at DESC
  LIMIT 1
)
WHERE pc.charter_submission_id IS NULL;

-- charter별 unique index (charter_submission_id가 있는 경우만)
CREATE UNIQUE INDEX project_charters_charter_id_key
  ON project_charters(charter_submission_id)
  WHERE charter_submission_id IS NOT NULL;
```

- [ ] **Step 4: 마이그레이션 적용**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
npx supabase db push
```

Expected: 3개 migration이 순서대로 적용되고 "Migration successful" 출력

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "[AX-1] feat: multi-charter DB migration - milestones FK, charter title, project_charters 분리"
```

---

## Task 2: 타입 시스템 업데이트

**Files:**
- Modify: `lib/types.ts:41-163`

**Interfaces:**
- Produces: `CharterSubmission.title`, `Milestone.charter_submission_id`, `ChampionProject.charters[]`, `KanbanCard.charterCount/approvedCharterCount`

- [ ] **Step 1: CharterSubmission에 title 추가**

`lib/types.ts` line 41-59 를 다음으로 교체:

```typescript
export interface CharterSubmission {
  id: string
  user_id: string
  title: string | null          // Charter 목록/탭에서 쓰는 짧은 이름
  project_name: string | null
  content: {
    summary?: string
    problem?: string
    user?: string
    goal?: string
    solution?: string
    build?: string
    timeline?: string
    closing?: string
  }
  submitted_at: string
  updated_at: string
  publish_status: PublishStatus
  admin_approved_at: string | null
}
```

- [ ] **Step 2: ProjectCharter에 charter_submission_id 추가**

`lib/types.ts` line 61-68 의 `ProjectCharter` 인터페이스에 필드 추가:

```typescript
export interface ProjectCharter {
  id: string
  user_id: string
  charter_submission_id: string | null   // 신규
  project_name: string | null
  content: CharterSubmission['content']
  updated_at: string
  created_at: string
}
```

- [ ] **Step 3: Milestone에 charter_submission_id 추가**

`lib/types.ts` line 70-93 의 `Milestone` 인터페이스에 필드 추가 (publish_status 앞):

```typescript
export interface Milestone {
  id: string
  user_id: string
  charter_submission_id: string | null   // 신규
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
  note: string | null
  parent_milestone_id: string | null
  display_order: number
  source: MilestoneSource
  created_at: string
  updated_at: string
  publish_status: PublishStatus
  children?: Milestone[]
}
```

- [ ] **Step 4: ChampionProject를 복수 charter 구조로 변경**

`lib/types.ts` line 137-142 의 `ChampionProject`를 교체:

```typescript
export interface ChampionProject {
  user: User
  charters: (CharterSubmission & { comments: CharterComment[] })[]  // 단수 → 복수
  milestones: Milestone[]
  latestSubmission: Submission | null
}
```

- [ ] **Step 5: KanbanCard의 hasCharter를 charterCount로 교체**

`lib/types.ts` line 144-159 의 `KanbanCard`에서 `hasCharter: boolean`을 교체:

```typescript
export interface KanbanCard {
  userId: string
  user: User
  latestSubmission: {
    id: string
    status: SubmissionStatus
    attemptNumber: number
    fileName: string | null
    linkUrl: string | null
    submittedAt: string
  } | null
  milestoneTotal: number
  milestoneCompleted: number
  charterCount: number           // hasCharter boolean 대신
  approvedCharterCount: number   // 신규
  pendingDeadlineRequests: number
}
```

- [ ] **Step 6: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: 에러 발생 (아직 consumers를 업데이트 안 했으므로 정상). 다음 Task에서 순차적으로 수정.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts
git commit -m "[AX-1] feat: types - CharterSubmission title, Milestone charter FK, ChampionProject 복수 charters"
```

---

## Task 3: POST /api/charter/submissions — INSERT 전환

**Files:**
- Modify: `app/api/charter/submissions/route.ts`

**Interfaces:**
- Consumes: `CharterSubmission` (Task 2)
- Produces: `POST /api/charter/submissions` body에 `title?: string` 추가, upsert → insert

현재 코드 (`app/api/charter/submissions/route.ts`):
- POST 51-78행: `upsert({...}, { onConflict: 'user_id' })` — 항상 1개만 존재
- GET 18-48행: 전체 목록 반환 (이미 올바름, limit 없음) ✓

- [ ] **Step 1: POST 핸들러를 INSERT로 전환**

`app/api/charter/submissions/route.ts` line 54-78 을 다음으로 교체:

```typescript
export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { title, project_name, content, publish_status } = await req.json()
  const status = publish_status === 'published' ? 'published' : 'draft'

  if (status === 'published') {
    const fields = validateCharter(content ?? {}, project_name)
    if (fields.length > 0) return NextResponse.json({ error: 'validation_failed', fields }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .insert({
      user_id: user.id,
      title: title ?? null,
      project_name: project_name ?? null,
      content: content ?? {},
      publish_status: status,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: 로컬 동작 검증**

```bash
# 개발 서버 실행 후 curl로 신규 charter 생성 테스트
curl -s -X POST http://localhost:3000/api/charter/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT>" \
  -d '{"title":"테스트 Charter","publish_status":"draft","content":{}}'
```

Expected: `{"id":"...", "title":"테스트 Charter", "publish_status":"draft", ...}` — 기존 charter와 별개로 생성됨

- [ ] **Step 3: Commit**

```bash
git add app/api/charter/submissions/route.ts
git commit -m "[AX-1] feat: charter submissions POST - upsert→insert, title 파라미터 추가"
```

---

## Task 4: GET/PUT /api/charter — charter별 working draft

**Files:**
- Modify: `app/api/charter/route.ts`

**Interfaces:**
- Consumes: `ProjectCharter.charter_submission_id` (Task 2)
- Produces: `GET /api/charter?charter_id=xxx`, `PUT /api/charter?charter_id=xxx` (charter별 draft 관리)

현재 코드: GET/PUT 모두 `user_id` 기준 single row upsert

- [ ] **Step 1: GET을 charter_id 기반으로 변경**

`app/api/charter/route.ts` line 5-11 의 GET 핸들러를 교체:

```typescript
export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const charter_id = req.nextUrl.searchParams.get('charter_id')
  const supabase = createServiceClient()

  if (charter_id) {
    // charter별 draft 조회
    const { data } = await supabase
      .from('project_charters')
      .select('*')
      .eq('charter_submission_id', charter_id)
      .single()
    return NextResponse.json(data ?? null)
  }

  // 하위 호환: charter_id 없으면 user_id 기준 최신 draft
  const { data } = await supabase
    .from('project_charters')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return NextResponse.json(data ?? null)
}
```

- [ ] **Step 2: PUT을 charter_id 기반으로 변경**

`app/api/charter/route.ts` line 13-24 의 PUT 핸들러를 교체:

```typescript
export async function PUT(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const charter_id = req.nextUrl.searchParams.get('charter_id')
  const body = await req.json()
  const supabase = createServiceClient()

  if (charter_id) {
    // charter별 draft upsert (charter_submission_id unique index 활용)
    const { data, error } = await supabase
      .from('project_charters')
      .upsert(
        {
          user_id: user.id,
          charter_submission_id: charter_id,
          project_name: body.project_name,
          content: body.content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'charter_submission_id' }
      )
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // 하위 호환: charter_id 없으면 user_id 기준 upsert
  const { data, error } = await supabase
    .from('project_charters')
    .upsert(
      { user_id: user.id, project_name: body.project_name, content: body.content, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | grep "charter/route"
```

Expected: 이 파일에 대한 에러 없음

- [ ] **Step 4: Commit**

```bash
git add app/api/charter/route.ts
git commit -m "[AX-1] feat: working draft API - charter_id 기반 GET/PUT, 하위 호환 유지"
```

---

## Task 5: Milestone Routes — charter_submission_id 컨텍스트

**Files:**
- Modify: `app/api/milestones/route.ts:65-98` (POST)
- Modify: `app/api/milestones/route.ts:37-63` (GET)
- Modify: `app/api/milestones/generate/route.ts:28-38` (charter 조회 부분)
- Modify: `app/api/milestones/batch/route.ts:20-58` (insert 부분)
- Modify: `app/api/milestones/refine/route.ts` (body 파싱 부분)

**Interfaces:**
- Consumes: `Milestone.charter_submission_id` (Task 2)
- Produces: `POST /api/milestones` body `charter_submission_id?: string`, `GET /api/milestones?charter_id=xxx`

- [ ] **Step 1: GET /api/milestones에 charter_id 필터 추가**

`app/api/milestones/route.ts` line 37-63 의 GET 핸들러에서 `if (isAdmin && targetUserId)` 줄 앞에 추가:

```typescript
// GET handler 내 (effectiveUserId 결정 후, query 빌드 전)
const charter_id = req.nextUrl.searchParams.get('charter_id')

let query = supabase
  .from('milestones')
  .select('*')
  .eq('user_id', effectiveUserId)
  .order('display_order')
  .order('start_date', { ascending: true, nullsFirst: false })

if (isAdmin && targetUserId) query = query.eq('publish_status', 'published')
if (charter_id) query = query.eq('charter_submission_id', charter_id)
```

- [ ] **Step 2: POST /api/milestones에 charter_submission_id 추가**

`app/api/milestones/route.ts` line 68-93 의 POST 핸들러 body 파싱 및 insert를 수정:

```typescript
export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { title, start_date, due_date, description, publish_status, parent_milestone_id, charter_submission_id } = body
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
      charter_submission_id: charter_submission_id ?? null,
      title: title ?? '',
      start_date: start_date ?? null,
      due_date: due_date ?? null,
      description: description ?? null,
      publish_status: status,
      parent_milestone_id: parent_milestone_id ?? null,
      source: 'manual',
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const parentUpdated = parent_milestone_id
    ? await syncParentDates(supabase, parent_milestone_id, user.id)
    : null
  return NextResponse.json({ milestone: data, parentUpdated }, { status: 201 })
}
```

- [ ] **Step 3: generate route — charter_id로 특정 charter content 조회**

`app/api/milestones/generate/route.ts` line 28-38 을 교체:

```typescript
  let charter: CharterContent = {}
  if (useCharter) {
    const charter_id: string | undefined = body?.charter_id
    const supabase = createServiceClient()
    let charterQuery = supabase
      .from('charter_submissions')
      .select('content')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
    if (charter_id) charterQuery = charterQuery.eq('id', charter_id)
    const { data } = await charterQuery.limit(1).maybeSingle()
    charter = (data?.content as CharterContent) ?? {}
  }
```

- [ ] **Step 4: batch route — charter_submission_id 포함 insert**

`app/api/milestones/batch/route.ts` line 10-11 에서 body 파싱 수정:

```typescript
  const body = await req.json().catch(() => ({}))
  const charter_submission_id: string | null = body?.charter_submission_id ?? null
  const result = normalizeBatch((body?.milestones ?? []) as BatchInput[])
```

그리고 line 22-33 의 parent insert와 line 43-52 의 child insert 모두에 `charter_submission_id` 추가:

```typescript
      // parent insert (line 22-35 영역)
      const { data: p, error: pErr } = await supabase
        .from('milestones')
        .insert({
          user_id: user.id,
          charter_submission_id,
          title: parent.title,
          description: parent.description ?? null,
          start_date: parent.start_date ?? null,
          due_date: parent.due_date ?? null,
          source: parent.source,
          publish_status: 'published',
          parent_milestone_id: null,
        })
        .select()
        .single()

      // child insert (line 43-52 영역)
      const { data: c, error: cErr } = await supabase
        .from('milestones')
        .insert({
          user_id: user.id,
          charter_submission_id,
          title: child.title,
          description: child.description ?? null,
          start_date: child.start_date ?? null,
          due_date: child.due_date ?? null,
          source: child.source,
          publish_status: 'published',
          parent_milestone_id: p.id,
        })
        .select()
        .single()
```

- [ ] **Step 5: refine route — body에서 charter_id 전달 (refine은 DB 저장 없이 AI 추천만 반환하므로 변경 최소)**

`app/api/milestones/refine/route.ts` — 이 route는 DB를 직접 쓰지 않으므로 변경 불필요. 단, refine 결과를 batch route로 저장할 때 client에서 `charter_submission_id`를 포함해 전달하면 된다. 이 route 자체는 패스.

- [ ] **Step 6: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | grep "milestones"
```

Expected: 이 파일들에 대한 에러 없음

- [ ] **Step 7: Commit**

```bash
git add app/api/milestones/route.ts app/api/milestones/generate/route.ts app/api/milestones/batch/route.ts
git commit -m "[AX-1] feat: milestone API - charter_submission_id 컨텍스트 추가 (GET filter, POST/batch insert)"
```

---

## Task 6: Gantt API & Data Layer — 1:N charterMap

**Files:**
- Modify: `app/api/champions/gantt/route.ts:7-89`
- Modify: `lib/data/champions.ts`

**Interfaces:**
- Consumes: `Milestone.charter_submission_id` (Task 2), `CharterSubmission.title` (Task 2)
- Produces:
  ```typescript
  // GanttChampion (app/api/champions/gantt/route.ts)
  interface GanttCharter {
    id: string
    title: string | null
    projectName: string | null
    milestones: GanttMilestone[]
  }
  interface GanttChampion {
    userId: string
    name: string
    department: string
    charters: GanttCharter[]    // milestones[] → charters[].milestones[]
  }
  ```

- [ ] **Step 1: GanttChampion 타입 변경**

`app/api/champions/gantt/route.ts` line 7-25 의 타입 정의를 교체:

```typescript
export interface GanttMilestone {
  id: string
  title: string
  start_date: string | null
  due_date: string | null
  status: MilestoneStatus
  week_number: number | null
  parent_milestone_id: string | null
  display_order: number | null
  charter_submission_id: string | null
}

export interface GanttCharter {
  id: string
  title: string | null
  projectName: string | null
  milestones: GanttMilestone[]
}

export interface GanttChampion {
  userId: string
  name: string
  department: string
  charters: GanttCharter[]
}
```

- [ ] **Step 2: gantt route GET 핸들러 — charter별 그룹핑으로 변경**

`app/api/champions/gantt/route.ts` line 27-89 의 GET 핸들러에서 charters 쿼리에 `title` 추가, charterMap 및 result 구성 변경:

```typescript
export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: charters, error: chartersErr },
    { data: milestones, error: msErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name').eq('user_group', 'champion'),
    supabase
      .from('charter_submissions')
      .select('user_id, id, project_name, title'),
    supabase
      .from('milestones')
      .select('id, user_id, charter_submission_id, title, start_date, due_date, status, week_number, parent_milestone_id, display_order')
      .eq('publish_status', 'published')
      .order('week_number', { nullsFirst: false })
      .order('display_order'),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (chartersErr) return NextResponse.json({ error: chartersErr.message }, { status: 500 })
  if (msErr) return NextResponse.json({ error: msErr.message }, { status: 500 })

  // user_id → charter[]
  const chartersByUser = new Map<string, typeof charters[0][]>()
  for (const c of charters ?? []) {
    if (!chartersByUser.has(c.user_id)) chartersByUser.set(c.user_id, [])
    chartersByUser.get(c.user_id)!.push(c)
  }

  // charter_id → milestone[]
  const msByCharter = new Map<string, GanttMilestone[]>()
  const orphanMsByUser = new Map<string, GanttMilestone[]>()
  for (const m of milestones ?? []) {
    const ms: GanttMilestone = {
      id: m.id,
      title: m.title,
      start_date: m.start_date,
      due_date: m.due_date,
      status: m.status as MilestoneStatus,
      week_number: m.week_number,
      parent_milestone_id: m.parent_milestone_id ?? null,
      display_order: m.display_order ?? null,
      charter_submission_id: m.charter_submission_id ?? null,
    }
    if (m.charter_submission_id) {
      if (!msByCharter.has(m.charter_submission_id)) msByCharter.set(m.charter_submission_id, [])
      msByCharter.get(m.charter_submission_id)!.push(ms)
    } else {
      // charter FK 없는 레거시 milestone: user_id로 첫 번째 charter에 귀속
      if (!orphanMsByUser.has(m.user_id)) orphanMsByUser.set(m.user_id, [])
      orphanMsByUser.get(m.user_id)!.push(ms)
    }
  }

  const result: GanttChampion[] = (users ?? []).map(u => {
    const { displayName, department } = parseName(u.name)
    const userCharters = chartersByUser.get(u.id) ?? []
    const orphans = orphanMsByUser.get(u.id) ?? []

    const charterRows: GanttCharter[] = userCharters.map((c, idx) => ({
      id: c.id,
      title: c.title ?? null,
      projectName: c.project_name ?? null,
      milestones: [
        ...msByCharter.get(c.id) ?? [],
        ...(idx === 0 ? orphans : []), // 레거시 orphan milestone은 첫 번째 charter에 귀속
      ],
    }))

    // charter가 없는 champion에게도 orphan milestone이 있으면 빈 charter row 생성
    if (charterRows.length === 0 && orphans.length > 0) {
      charterRows.push({ id: '__orphan__' + u.id, title: null, projectName: null, milestones: orphans })
    }

    return { userId: u.id, name: displayName, department, charters: charterRows }
  })

  return NextResponse.json(result)
}
```

- [ ] **Step 3: lib/data/champions.ts — charterMap 1:N 변경**

`lib/data/champions.ts`를 읽어 `charterMap` 패턴을 찾아 1:N으로 변경. 이 파일은 `fetchGanttData`와 `fetchSummaryData` 두 함수에서 `charterMap.get(userId)` 패턴으로 단일 charter를 가져옴. 아래 패턴을 적용:

```typescript
// 변경 전
const charterMap = new Map<string, CharterType>()
charters.forEach(c => charterMap.set(c.user_id, c))
// 사용: charterMap.get(u.id)

// 변경 후
const chartersByUser = new Map<string, CharterType[]>()
charters.forEach(c => {
  if (!chartersByUser.has(c.user_id)) chartersByUser.set(c.user_id, [])
  chartersByUser.get(c.user_id)!.push(c)
})
// 사용: chartersByUser.get(u.id) ?? []  (첫 번째: chartersByUser.get(u.id)?.[0])
```

`ChampionSummary` 빌드 부분에서 `charterStatus`, `charterSubmissionId` 필드는 현재 첫 번째 charter 기준으로 유지 (향후 확장 가능).

- [ ] **Step 4: TypeScript 컴파일 확인**

```bash
npx tsc --noEmit 2>&1 | grep -E "gantt|champions\.ts"
```

Expected: 에러 없음

- [ ] **Step 5: Commit**

```bash
git add app/api/champions/gantt/route.ts lib/data/champions.ts
git commit -m "[AX-1] feat: gantt API & data layer - GanttChampion 1:N charters 구조로 변경"
```

---

## Task 7: Champion Charter UI — 목록 + dynamic [id] 라우트

**Files:**
- Modify: `app/(champion)/my-project/charter/page.tsx`
- Create: `app/(champion)/my-project/charter/CharterListClient.tsx`
- Create: `app/(champion)/my-project/charter/[id]/page.tsx`
- Modify: `app/(champion)/my-project/charter/CharterClient.tsx` (charter_id prop 추가)

**Interfaces:**
- Consumes: `CharterSubmission.title` (Task 2), `POST /api/charter/submissions` (Task 3), `GET/PUT /api/charter?charter_id=xxx` (Task 4)
- Produces: Charter 목록 화면 + `/my-project/charter/[id]` 편집기 라우트

- [ ] **Step 1: charter/page.tsx — 목록 페이지로 변경**

`app/(champion)/my-project/charter/page.tsx` 전체를 교체:

```typescript
import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import type { CharterSubmission } from '@/lib/types'
import { CharterListClient } from './CharterListClient'

export default async function CharterPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: submissions } = await serviceClient
    .from('charter_submissions')
    .select('*')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })

  const charters = (submissions ?? []) as CharterSubmission[]

  // charter가 정확히 1개이면 기존과 동일하게 바로 편집기로 리다이렉트 (하위 호환)
  if (charters.length === 1) {
    redirect(`/my-project/charter/${charters[0].id}`)
  }

  return <CharterListClient initialCharters={charters} />
}
```

- [ ] **Step 2: CharterListClient.tsx 신규 생성**

```typescript
// app/(champion)/my-project/charter/CharterListClient.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { CharterSubmission } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  published: '제출됨',
}

export function CharterListClient({ initialCharters }: { initialCharters: CharterSubmission[] }) {
  const router = useRouter()
  const [charters, setCharters] = useState(initialCharters)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showModal, setShowModal] = useState(false)

  async function handleCreate() {
    if (!newTitle.trim()) {
      toast.error('Charter 제목을 입력해주세요.')
      return
    }
    setCreating(true)
    try {
      const data = await apiFetch<CharterSubmission>('/api/charter/submissions', {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim(), publish_status: 'draft', content: {} }),
      })
      setShowModal(false)
      setNewTitle('')
      router.push(`/my-project/charter/${data.id}`)
    } catch {
      toast.error('Charter 생성에 실패했습니다.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>내 과제정의서</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          + 새로 만들기
        </button>
      </div>

      {charters.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-tertiary)' }}>
          <p>아직 작성된 과제정의서가 없습니다.</p>
          <p style={{ marginTop: 8, fontSize: 14 }}>"새로 만들기"를 눌러 첫 번째 Charter를 시작하세요.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {charters.map(charter => (
            <div
              key={charter.id}
              onClick={() => router.push(`/my-project/charter/${charter.id}`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderRadius: 12, background: 'var(--surface-primary)',
                border: '1.5px solid var(--border-subtle)', cursor: 'pointer',
                boxShadow: 'var(--shadow-s)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                  {charter.title ?? charter.project_name ?? 'Untitled Charter'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {STATUS_LABEL[charter.publish_status] ?? charter.publish_status}
                  {charter.admin_approved_at ? ' · 승인됨' : ''}
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 500 }}>편집 →</span>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--surface-primary)', borderRadius: 16, padding: 32, width: 400, maxWidth: '90vw',
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
              새 Charter 만들기
            </h2>
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Charter 제목 (예: AI 헬스케어)"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 15,
                border: '1.5px solid var(--border-subtle)', outline: 'none', marginBottom: 20,
                background: 'var(--surface-secondary)', color: 'var(--text-primary)',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowModal(false); setNewTitle('') }}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 14, border: '1.5px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, background: 'var(--primary)', color: '#fff', border: 'none', cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}
              >
                {creating ? '생성 중...' : '만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: charter/[id]/page.tsx 신규 생성**

```typescript
// app/(champion)/my-project/charter/[id]/page.tsx
import { redirect } from 'next/navigation'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import type { CharterSubmission } from '@/lib/types'
import { CharterClient } from '../CharterClient'

export default async function CharterDetailPage({ params }: { params: { id: string } }) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: submission } = await serviceClient
    .from('charter_submissions')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)  // 본인 charter만 접근 가능
    .single()

  if (!submission) redirect('/my-project/charter')

  return <CharterClient
    initialSubmission={submission as CharterSubmission}
    charterId={params.id}
  />
}
```

- [ ] **Step 4: CharterClient.tsx에 charterId prop 추가**

`app/(champion)/my-project/charter/CharterClient.tsx`를 읽어 `initialSubmission` prop 근처에 `charterId?: string` 추가. API 호출 시 `/api/charter?charter_id=${charterId}` 형태로 변경.

CharterClient가 현재 `/api/charter`를 어떻게 호출하는지 확인 후 수정:

```bash
grep -n "api/charter" /Users/claud_01/Documents/flo/AX/ax-homework-submission/app/\(champion\)/my-project/charter/CharterClient.tsx
```

찾은 fetch 호출에 `?charter_id=${charterId}` 쿼리 파라미터 추가. GET, PUT 모두 수정.

- [ ] **Step 5: 브라우저에서 Charter 목록 화면 확인**

개발 서버 실행 후 `/my-project/charter` 접속:
1. Charter가 0개: 빈 안내 화면 + "새로 만들기" 버튼
2. Charter가 1개: `/my-project/charter/{id}`로 자동 리다이렉트 (하위 호환)
3. Charter가 2개 이상: 목록 화면 표시, 각 항목 클릭 시 `/my-project/charter/{id}` 이동

- [ ] **Step 6: Commit**

```bash
git add "app/(champion)/my-project/charter/"
git commit -m "[AX-1] feat: champion charter UI - 목록 화면 + dynamic [id] 라우트 + CharterListClient"
```

---

## Task 8: Champion Milestones + Checkin — charter 컨텍스트

**Files:**
- Modify: `app/(champion)/my-project/milestones/page.tsx`
- Modify: `app/(champion)/my-project/milestones/MilestonesClient.tsx`
- Modify: `components/CheckinTab.tsx`

**Interfaces:**
- Consumes: `GET /api/milestones?charter_id=xxx` (Task 5), `POST /api/milestones` body `charter_submission_id` (Task 5)
- Produces: Charter 셀렉터 드롭다운 (charter 2개 이상 시 표시), URL `?charter_id=xxx` 상태

- [ ] **Step 1: milestones/page.tsx — charter 목록 + charter_id searchParam 처리**

`app/(champion)/my-project/milestones/page.tsx` 전체를 교체:

```typescript
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Milestone, CharterSubmission } from '@/lib/types'
import { MilestonesClient } from './MilestonesClient'

export default async function WorkStatusPage({
  searchParams,
}: {
  searchParams: { charter_id?: string }
}) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const [{ data: milestonesData }, { data: chartersData }] = await Promise.all([
    serviceClient
      .from('milestones')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order')
      .order('start_date', { ascending: true, nullsFirst: false }),
    serviceClient
      .from('charter_submissions')
      .select('id, title, project_name, admin_approved_at')
      .eq('user_id', user.id)
      .order('submitted_at', { ascending: false }),
  ])

  const charters = (chartersData ?? []) as Pick<CharterSubmission, 'id' | 'title' | 'project_name' | 'admin_approved_at'>[]
  const charterId = searchParams.charter_id ?? charters[0]?.id ?? null

  const milestones = (milestonesData ?? []).filter(m =>
    charterId ? m.charter_submission_id === charterId : true
  ) as Milestone[]

  const charterApproved = charters.some(c => !!c.admin_approved_at)

  return (
    <MilestonesClient
      initialMilestones={milestones}
      charterApproved={charterApproved}
      charters={charters}
      currentCharterId={charterId}
    />
  )
}
```

- [ ] **Step 2: MilestonesClient에 charterId prop 전달 및 milestone 생성 시 포함**

`app/(champion)/my-project/milestones/MilestonesClient.tsx`를 읽어 다음을 적용:

1. Props 타입에 추가:
```typescript
charters: Pick<CharterSubmission, 'id' | 'title' | 'project_name' | 'admin_approved_at'>[]
currentCharterId: string | null
```

2. Charter 셀렉터 UI 추가 (charters.length > 1 일 때만 표시):
```typescript
{charters.length > 1 && (
  <div style={{ marginBottom: 16 }}>
    <select
      value={currentCharterId ?? ''}
      onChange={e => {
        const url = new URL(window.location.href)
        url.searchParams.set('charter_id', e.target.value)
        window.location.href = url.toString()
      }}
      style={{
        padding: '8px 12px', borderRadius: 8, fontSize: 14,
        border: '1.5px solid var(--border-subtle)', background: 'var(--surface-secondary)',
        color: 'var(--text-primary)', cursor: 'pointer',
      }}
    >
      {charters.map(c => (
        <option key={c.id} value={c.id}>
          {c.title ?? c.project_name ?? 'Charter'}
        </option>
      ))}
    </select>
  </div>
)}
```

3. `POST /api/milestones` 호출 시 `charter_submission_id: currentCharterId` 포함

- [ ] **Step 3: CheckinTab.tsx — charterId prop 추가**

`components/CheckinTab.tsx`를 읽어 다음을 적용:

1. Props에 `charterId?: string` 추가
2. milestone 생성/업데이트 fetch 시 `charter_submission_id: charterId` 포함

- [ ] **Step 4: 브라우저 검증**

1. Charter 1개 상태: 셀렉터 없이 기존과 동일
2. Charter 2개 이상 상태: 드롭다운 표시, 선택 시 해당 charter milestone 필터링
3. 새 milestone 생성 시 현재 선택된 charter에 귀속되는지 확인

- [ ] **Step 5: Commit**

```bash
git add "app/(champion)/my-project/milestones/" components/CheckinTab.tsx
git commit -m "[AX-1] feat: milestone UI - charter 셀렉터 드롭다운 + charter_submission_id 컨텍스트"
```

---

## Task 9: Admin Champion Detail — Charter 탭

**Files:**
- Modify: `app/admin/champions/[userId]/page.tsx`

**Interfaces:**
- Consumes: `ChampionProject.charters[]` (Task 2), `Milestone.charter_submission_id` (Task 2)
- Produces: Charter 탭 UI (선택된 charter의 내용 + milestone 필터링)

현재 이 파일은 `'use client'` Client Component이며 `ChampionProject.charter` (단수)를 사용한다.

- [ ] **Step 1: page.tsx 읽기 후 charter 관련 state/fetch 파악**

```bash
grep -n "charter\|Charter" /Users/claud_01/Documents/flo/AX/ax-homework-submission/app/admin/champions/\[userId\]/page.tsx | head -40
```

- [ ] **Step 2: charter 단수를 복수로 변경**

`ChampionProject` 타입 변경에 따라 `project.charter` → `project.charters[0]` 패턴을 일괄 수정. 구체적으로:

1. `project.charter` 참조를 모두 찾아 첫 번째 charter 로직을 유지하되 `activeCharterIndex` state를 추가
2. charter 탭 UI 추가 (charters 2개 이상 시 표시):

```typescript
const [activeCharterId, setActiveCharterId] = useState<string | null>(project?.charters[0]?.id ?? null)
const activeCharter = project?.charters.find(c => c.id === activeCharterId) ?? project?.charters[0] ?? null
const activeCharterMilestones = milestones.filter(m =>
  activeCharterId ? m.charter_submission_id === activeCharterId : true
)
```

탭 컴포넌트:
```typescript
{(project?.charters?.length ?? 0) > 1 && (
  <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1.5px solid var(--border-subtle)', paddingBottom: 0 }}>
    {project!.charters.map(c => (
      <button
        key={c.id}
        onClick={() => setActiveCharterId(c.id)}
        style={{
          padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
          fontSize: 14, fontWeight: activeCharterId === c.id ? 700 : 400,
          color: activeCharterId === c.id ? 'var(--primary)' : 'var(--text-secondary)',
          borderBottom: activeCharterId === c.id ? '2px solid var(--primary)' : '2px solid transparent',
          marginBottom: -1.5,
        }}
      >
        {c.title ?? c.project_name ?? 'Charter'}
      </button>
    ))}
  </div>
)}
```

3. charter 내용 렌더링, 코멘트 패널, 승인 버튼을 `activeCharter` 기준으로 통일

- [ ] **Step 3: data fetch 수정 — charters 복수 fetch**

현재 page.tsx에서 charter를 fetch하는 API 호출을 확인해 복수로 변경. (Server Component 방식이면 Supabase 직접 쿼리, Client Component 방식이면 `apiFetch`)

- [ ] **Step 4: 브라우저 검증**

1. Admin에서 charter 1개 champion 조회: 탭 없이 기존 UI 유지
2. Admin에서 charter 2개 champion 조회: 탭 표시, 전환 시 내용과 milestone 변경

- [ ] **Step 5: Commit**

```bash
git add "app/admin/champions/[userId]/page.tsx"
git commit -m "[AX-1] feat: admin champion detail - charter 탭 UI, 복수 charter 지원"
```

---

## Task 10: ChampionGanttView — 3단계 계층

**Files:**
- Modify: `components/ChampionGanttView.tsx`

**Interfaces:**
- Consumes: `GanttChampion.charters[]` (Task 6)
- Produces: champion → charter → milestone 3단계 gantt 계층

현재 `toTasks()` 함수는 champion row → milestone rows 2단계 구조. `GanttChampion.milestones[]` → `GanttChampion.charters[].milestones[]`로 변경됨에 따라 수정 필요.

- [ ] **Step 1: ChampionGanttView.tsx 전체 읽기 및 toTasks 함수 파악**

```bash
grep -n "toTasks\|GanttChampion\|milestones" /Users/claud_01/Documents/flo/AX/ax-homework-submission/components/ChampionGanttView.tsx | head -30
```

- [ ] **Step 2: GanttChampion 타입 import 수정**

`GanttChampion` import 경로 및 구조 변경에 따른 타입 참조 업데이트:

```typescript
import type { GanttChampion, GanttCharter, GanttMilestone } from '@/app/api/champions/gantt/route'
```

- [ ] **Step 3: toTasks 함수에 charter row 계층 삽입**

현재 `toTasks()` 내부 패턴 (champion 아래 바로 milestone) → charter row를 중간에 삽입:

```typescript
function toTasks(champions: GanttChampion[]): Task[] {
  const tasks: Task[] = []
  for (const champ of champions) {
    const champId = `champ-${champ.userId}`

    // charter가 없는 champion은 milestone이 없음 (또는 legacy orphan)
    const allMs = champ.charters.flatMap(c => c.milestones)
    const champStart = allMs.map(m => m.start_date).filter(Boolean).sort()[0] ?? new Date().toISOString().slice(0, 10)
    const champEnd = allMs.map(m => m.due_date).filter(Boolean).sort().at(-1) ?? champStart

    tasks.push({
      id: champId,
      type: 'project',
      name: champ.name,
      start: new Date(champStart),
      end: new Date(champEnd),
      hideChildren: false,
      styles: { /* champion row 스타일 — 기존 유지 */ },
    } as Task)

    for (const charter of champ.charters) {
      const charterId = `charter-${charter.id}`
      const charterMs = charter.milestones
      const cStart = charterMs.map(m => m.start_date).filter(Boolean).sort()[0] ?? champStart
      const cEnd = charterMs.map(m => m.due_date).filter(Boolean).sort().at(-1) ?? cStart

      // charter row (champion의 child)
      tasks.push({
        id: charterId,
        type: 'project',
        project: champId,
        name: charter.title ?? charter.projectName ?? 'Charter',
        start: new Date(cStart),
        end: new Date(cEnd),
        hideChildren: false,
        styles: { /* charter row 스타일: 더 옅은 색 */ },
      } as Task)

      // milestone rows (charter의 child)
      const rootMs = charterMs.filter(m => !m.parent_milestone_id)
      for (const m of rootMs) {
        addMilestoneTask(tasks, m, charterId, charterMs)
      }
    }
  }
  return tasks
}
```

`addMilestoneTask`는 기존 재귀 milestone 추가 헬퍼를 리팩토링해 분리.

- [ ] **Step 4: filteredChampions 계산 수정**

현재 `filteredChampions`가 `champion.milestones.length`로 필터링하는 부분을 `champion.charters.flatMap(c => c.milestones).length`로 변경.

- [ ] **Step 5: 브라우저 검증 (Admin Dashboard)**

1. champion chip on/off가 정상 동작
2. charter가 1개인 champion: champion → milestone 2단계 (charter row 표시하나 1개만 있으므로 시각적으로 비슷)
3. charter가 2개인 champion: champion → charter1 → milestones, charter2 → milestones 3단계 표시

- [ ] **Step 6: Commit**

```bash
git add components/ChampionGanttView.tsx
git commit -m "[AX-1] feat: gantt chart - 3단계 계층 (champion → charter → milestone)"
```

---

## Task 11: Admin 부가 화면 — Kanban, Mobile, Progress

**Files:**
- Modify: `app/admin/kanban/page.tsx`
- Modify: `app/admin/mobile/charters/page.tsx`
- Modify: `app/admin/progress/page.tsx`

**Interfaces:**
- Consumes: `KanbanCard.charterCount/approvedCharterCount` (Task 2)
- Produces: Kanban 카드에 charter 수 뱃지, Mobile charters 페이지 champion별 N행, Progress 페이지 charter별 집계

- [ ] **Step 1: kanban/page.tsx — hasCharter → charterCount**

```bash
grep -n "hasCharter\|charter" /Users/claud_01/Documents/flo/AX/ax-homework-submission/app/admin/kanban/page.tsx | head -20
```

`hasCharter: boolean` 계산 부분을 찾아 교체:

```typescript
// 변경 전
const hasCharter = charters.some(c => c.user_id === userId)

// 변경 후
const userCharters = charters.filter(c => c.user_id === userId)
const charterCount = userCharters.length
const approvedCharterCount = userCharters.filter(c => c.admin_approved_at).length
```

카드 렌더링에서 `hasCharter`를 사용하는 부분을 `charterCount > 0` 등으로 변경. charter 수 뱃지 표시:

```typescript
{charterCount > 0 && (
  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
    Charter {charterCount}개{approvedCharterCount > 0 ? ` · ${approvedCharterCount}개 승인` : ''}
  </span>
)}
```

- [ ] **Step 2: mobile/charters/page.tsx — champion별 N행**

```bash
cat -n /Users/claud_01/Documents/flo/AX/ax-homework-submission/app/admin/mobile/charters/page.tsx | head -60
```

현재 구조를 파악 후 charter 복수 지원:
- champion당 N행 (charter별)
- champion 이름은 첫 번째 행에만 표시
- 각 행에 charter title 표시

- [ ] **Step 3: progress/page.tsx — charter별 milestone 집계**

```bash
cat -n /Users/claud_01/Documents/flo/AX/ax-homework-submission/app/admin/progress/page.tsx | head -60
```

현재 champion별 1행 → champion+charter별 행으로 확장:
- champion 이름 + charter title 조합
- 완료율은 charter별 milestone 기준

- [ ] **Step 4: TypeScript 최종 컴파일 확인**

```bash
npx tsc --noEmit 2>&1
```

Expected: 에러 없음

- [ ] **Step 5: Commit**

```bash
git add app/admin/kanban/page.tsx app/admin/mobile/charters/page.tsx app/admin/progress/page.tsx
git commit -m "[AX-1] feat: admin UI - kanban charterCount 뱃지, mobile charters N행, progress charter별 집계"
```

---

## Task 12: 최종 통합 검증 및 배포

**Files:** 없음 (검증 및 배포)

- [ ] **Step 1: TypeScript 전체 컴파일**

```bash
npx tsc --noEmit 2>&1
```

Expected: 에러 없음

- [ ] **Step 2: 핵심 플로우 브라우저 검증**

체크리스트:
1. Champion — 새 Charter 생성 (목록 화면 → "새로 만들기" → 편집기)
2. Champion — Charter 편집 + 저장 (working draft 자동저장)
3. Champion — 마일스톤 생성 시 현재 charter에 귀속
4. Admin — champion 상세 페이지에서 charter 탭 전환
5. Admin — Gantt에서 champion 펼치면 charter별 계층 표시
6. Admin — Kanban 카드에 charter 수 표시
7. 기존 champion (charter 1개) — 기존 UX와 동일하게 동작

- [ ] **Step 3: Vercel 배포**

```bash
vercel --prod
```

- [ ] **Step 4: 배포 후 Supabase 마이그레이션 확인**

Supabase Dashboard에서:
- `milestones.charter_submission_id` 컬럼 존재 확인
- `charter_submissions.title` 컬럼 존재 확인
- `project_charters.charter_submission_id` 컬럼 + unique index 존재 확인
