# Multi-Charter per Champion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 한 Champion이 2개 이상의 Charter를 병행 개발할 수 있도록 데이터 모델·API·UI를 전면 재설계한다.

**Architecture:** `milestones`에 `charter_submission_id` FK를 추가해 Champion → Charter(1:N) → Milestone(1:N) 계층을 확립한다. API는 upsert 대신 신규 생성을 허용하도록 변경하고, UI는 Charter 셀렉터 드롭다운으로 컨텍스트를 전환하는 방식으로 재설계한다.

**Tech Stack:** Next.js 14 App Router, Supabase PostgreSQL, TypeScript, Tailwind CSS, gantt-task-react

---

## Global Constraints

- 기존 챔피언 데이터를 손실 없이 마이그레이션해야 한다
- `charter_submission_id`가 NULL인 milestone은 레거시로 허용하되 UI에서 안내 표시
- Champion의 checkin/milestone 흐름에서 charter 컨텍스트는 URL param `?charter_id=xxx`로 관리
- Admin의 기존 comment 시스템은 `charter_submission_id` 기반이므로 변경 최소화
- 기존 단일 charter 흐름과의 하위 호환성 유지 (charter 1개인 경우 셀렉터 없이 바로 진입)

---

## 1. 데이터 모델 변경

### 1-1. `milestones` 테이블 — `charter_submission_id` FK 추가

```sql
-- Migration: 20260617100000_milestones_charter_fk.sql
ALTER TABLE milestones
  ADD COLUMN charter_submission_id uuid REFERENCES charter_submissions(id) ON DELETE SET NULL;

-- 기존 milestone을 해당 user의 가장 최근 charter에 귀속
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

- `charter_submission_id`는 nullable: charter가 없는 champion의 milestone 허용
- `ON DELETE SET NULL`: charter 삭제 시 milestone은 고아(orphan)로 남음

### 1-2. `charter_submissions` — title 컬럼 추가

```sql
-- Migration: 20260617100001_charter_title.sql
ALTER TABLE charter_submissions
  ADD COLUMN title text;

-- 기존 charter에 기본 title 부여
UPDATE charter_submissions
SET title = COALESCE(project_name, 'Charter')
WHERE title IS NULL;
```

- `title`: Charter 목록/탭/셀렉터에서 식별자로 사용 (예: "AI 헬스케어", "B2B SaaS")
- `project_name`은 charter 내용 안의 과제명으로 유지, `title`은 UI 식별용 짧은 이름

### 1-3. `project_charters` (working draft) — charter별 분리

```sql
-- Migration: 20260617100002_project_charters_charter_fk.sql
ALTER TABLE project_charters
  DROP CONSTRAINT project_charters_user_id_key;  -- unique constraint 제거

ALTER TABLE project_charters
  ADD COLUMN charter_submission_id uuid REFERENCES charter_submissions(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX project_charters_charter_id_key
  ON project_charters(charter_submission_id)
  WHERE charter_submission_id IS NOT NULL;
```

---

## 2. 타입 시스템 변경 (`lib/types.ts`)

```typescript
// CharterSubmission에 title 추가
export interface CharterSubmission {
  id: string
  user_id: string
  title: string | null          // 신규: Charter 식별용 짧은 이름
  project_name: string | null
  content: { ... }
  submitted_at: string
  updated_at: string
  publish_status: PublishStatus
  admin_approved_at: string | null
}

// Milestone에 charter FK 추가
export interface Milestone {
  ...
  charter_submission_id: string | null  // 신규
}

// ChampionProject — charter 복수형으로 변경
export interface ChampionProject {
  user: User
  charters: (CharterSubmission & { comments: CharterComment[] })[]  // charter → charters
  milestones: Milestone[]
  latestSubmission: Submission | null
}

// Gantt용 타입 변경
export interface GanttChampion {
  userId: string
  name: string
  department: string
  charters: {                           // charter → charters
    id: string
    title: string | null
    projectName: string | null
    charterSubmissionId: string
    milestones: GanttMilestone[]
  }[]
}

// ChampionSummary — charter 복수형
export interface ChampionSummary {
  ...
  charterCount: number                  // hasCharter boolean 대신
  approvedCharterCount: number
  charterSubmissionIds: string[]
}
```

---

## 3. API 변경

### 3-1. `POST /api/charter/submissions` — insert 전환

```typescript
// 현재: upsert with onConflict: 'user_id'
// 변경: INSERT 신규 생성

// body에 title 추가
const { title, project_name, content, publish_status } = body

const { data, error } = await supabase
  .from('charter_submissions')
  .insert({ user_id, title, project_name, content, publish_status })
  .select()
  .single()
```

### 3-2. `GET /api/charter/submissions` — 목록 반환

```typescript
// 현재: 최신 1개
// 변경: 전체 목록 (submitted_at desc)

const { data } = await supabase
  .from('charter_submissions')
  .select('*')
  .eq('user_id', user.id)
  .order('submitted_at', { ascending: false })
// limit(1) 제거
```

### 3-3. `GET/PUT /api/charter` (working draft) — charter별 분리

```typescript
// ?charter_id=xxx 쿼리 파라미터로 charter별 draft 관리
const charter_id = searchParams.get('charter_id')

// GET: charter별 draft 조회
const { data } = await supabase
  .from('project_charters')
  .select('*')
  .eq('charter_submission_id', charter_id)
  .single()

// PUT: charter별 upsert (charter_submission_id 기준)
await supabase
  .from('project_charters')
  .upsert({ charter_submission_id: charter_id, user_id, ...body },
           { onConflict: 'charter_submission_id' })
```

### 3-4. Milestone Routes — `charter_submission_id` 컨텍스트 추가

**`POST /api/milestones`**
```typescript
// body에 charter_submission_id required (champion), optional (admin)
const { charter_submission_id, ...rest } = body
// charter 소유권 검증: charter_submissions.user_id === current_user.id
```

**`GET /api/milestones`**
```typescript
// ?charter_id=xxx 필터 추가
const charter_id = searchParams.get('charter_id')
if (charter_id) {
  query = query.eq('charter_submission_id', charter_id)
}
```

**`POST /api/milestones/generate`**, **`/batch`**, **`/refine`**
```typescript
// request body에 charter_submission_id 포함
// generate된 milestone 저장 시 charter_submission_id 자동 설정
```

### 3-5. `GET /api/champions/gantt` — charter별 그룹핑

```typescript
// 현재: GanttChampion { milestones[] }
// 변경: GanttChampion { charters: { id, title, milestones[] }[] }

// charter별로 milestone 그룹핑
const charterMilestones = new Map<string, GanttMilestone[]>()
milestones.forEach(m => {
  const key = m.charter_submission_id ?? '__orphan__'
  if (!charterMilestones.has(key)) charterMilestones.set(key, [])
  charterMilestones.get(key)!.push(m)
})
```

### 3-6. `app/admin/champions/[userId]/page.tsx` Server Component — charters 배열 조회

별도 API route 없이 Server Component가 Supabase를 직접 조회. 단일 charter fetch → 복수로 변경:

```typescript
// 현재: .single() 또는 첫 번째 charter만
// 변경: 전체 charter 목록 조회
const { data: charters } = await supabase
  .from('charter_submissions')
  .select(`*, comments:charter_comments(*, replies:charter_comments!parent_id(*))`)
  .eq('user_id', userId)
  .order('submitted_at', { ascending: false })

// ChampionProject.charter → ChampionProject.charters 로 변경
```

---

## 4. Champion UI 변경

### 4-1. `my-project/charter/page.tsx` — Charter 목록 화면

**신규 Charter 목록 컴포넌트** (`CharterListClient.tsx`):
```
┌─────────────────────────────────────┐
│  내 과제정의서              [+ 새로 만들기] │
├─────────────────────────────────────┤
│  ● AI 헬스케어  · 게시됨 · 승인됨  [편집] │
│  ○ B2B SaaS    · 초안              [편집] │
└─────────────────────────────────────┘
```

- Charter가 1개이면 목록 없이 바로 편집기 진입 (하위 호환)
- `[+ 새로 만들기]` → 제목 입력 모달 → `POST /api/charter/submissions` → 편집기로 이동
- Charter 편집기 URL: `/my-project/charter/[id]` (현재 단일 라우트에서 dynamic route로 변경)

### 4-2. `my-project/charter/[id]/page.tsx` — Charter별 편집기

- 기존 `CharterClient.tsx` 재사용 (content editing 로직 변경 없음)
- `charter_id`를 받아 해당 charter의 draft 로드 (`/api/charter?charter_id=xxx`)
- 상단에 Charter 제목 표시 + 편집 가능

### 4-3. `my-project/milestones/page.tsx` — Charter 셀렉터 추가

```
┌─────────────────────────────────────────┐
│  [AI 헬스케어 ▾]  ← Charter 셀렉터      │
├─────────────────────────────────────────┤
│  선택된 Charter의 마일스톤...            │
└─────────────────────────────────────────┘
```

- URL: `/my-project/milestones?charter_id=xxx`
- Charter가 1개면 셀렉터 숨김 (하위 호환)
- Charter가 없으면 "먼저 과제정의서를 작성하세요" 안내
- `MilestonesClient`에 `charterId` prop 추가, milestone fetch/create 시 전달

### 4-4. `CheckinTab.tsx` — charter 컨텍스트 수신

- `charterId?: string` prop 추가
- milestone 생성/patch 시 `charter_submission_id` 자동 포함

---

## 5. Admin UI 변경

### 5-1. `admin/champions/[userId]/page.tsx` — Charter 탭

```
┌──────────────────────────────────────────┐
│  제출 이력  │  [AI 헬스케어]  [B2B SaaS]  │  ← Charter 탭
├──────────────────────────────────────────┤
│  ┌─────────────────┬────────────────┐   │
│  │  Charter 내용   │  코멘트 패널    │   │  ← 기존 2-column 유지
│  └─────────────────┴────────────────┘   │
│  마일스톤 (해당 Charter 귀속분만)         │
└──────────────────────────────────────────┘
```

- 탭은 client-side state로 관리 (`useState<string>(charters[0].id)`)
- 각 탭 전환 시 charter 내용 + 해당 charter의 milestones 함께 전환
- 승인 버튼, 코멘트는 charter별 독립

### 5-2. `ChampionGanttView.tsx` — 3단계 계층

```
▼ 김철수               ━━━━━━━━━━━━━  (champion row, 기존)
  ▼ AI 헬스케어        ━━━━━━━━━━━   (charter row, 신규)
    ▼ 기획 완료        ━━━━━━━        (depth-0 milestone)
        리서치         ━━             (depth-1 milestone)
  ▼ B2B SaaS          ━━━━━━━━━━━━━  (charter row, 신규)
    ▼ MVP 개발         ━━━━━━━━━      (depth-0 milestone)
```

`toTasks()` 수정:
```typescript
// champion row 아래, milestone row 위에 charter row 삽입
tasks.push({
  id: `charter-${charter.id}`,
  type: 'task',           // 또는 'project' (collapse 지원)
  project: champId,
  name: charter.title ?? charter.projectName ?? 'Charter',
  start: ...,             // charter 내 milestone 최소 start_date
  end: ...,               // charter 내 milestone 최대 due_date
})
// 이후 milestone의 project를 `charter-${charter.id}`로 설정
```

### 5-3. `admin/kanban/page.tsx` — hasCharter 재정의

```typescript
// 현재: hasCharter: boolean
// 변경: charterCount, approvedCharterCount로 교체

const charterInfo = charters.filter(c => c.user_id === userId)
return {
  charterCount: charterInfo.length,
  approvedCharterCount: charterInfo.filter(c => c.admin_approved_at).length,
}
```

카드에 Charter 수 뱃지 표시:
```
Charter 2개 · 1개 승인
```

### 5-4. `admin/mobile/charters/page.tsx` — champion별 묶음

- champion당 N행 (charter별)
- champion 이름은 첫 번째 행에만 표시, 이후 행은 들여쓰기

### 5-5. `admin/progress/page.tsx` — Charter별 집계

- champion + charter title 조합으로 행 구성
- 마일스톤 완료율은 charter별로 계산

### 5-6. `lib/data/champions.ts` — charterMap 1:N 변경

```typescript
// 현재 (1:1)
const charterMap = new Map<string, CharterSubmission>()
charters.forEach(c => charterMap.set(c.user_id, c))

// 변경 후 (1:N)
const charterMap = new Map<string, CharterSubmission[]>()
charters.forEach(c => {
  if (!charterMap.has(c.user_id)) charterMap.set(c.user_id, [])
  charterMap.get(c.user_id)!.push(c)
})
```

---

## 6. 데이터 마이그레이션 전략

### 기존 데이터 처리 규칙

| 상황 | 처리 |
|---|---|
| Champion에 published charter 1개 + milestones | milestone → 해당 charter에 귀속 |
| Champion에 published charter 여러 개 | milestone → 가장 최근 charter에 귀속 |
| Champion에 charter 없음 + milestones | milestone은 `charter_submission_id = NULL` 유지 |
| Champion에 draft charter만 있음 | milestone → draft charter에 귀속 |

### 롤아웃 순서

1. **DB 마이그레이션** (3개 파일) 적용
2. **API 변경** 배포 (하위 호환 유지: charter_id 없는 요청은 기존 동작)
3. **Champion UI** 배포 (charter가 1개면 기존 UX 유지)
4. **Admin UI** 배포

---

## 변경 파일 목록

| 파일 | 유형 | 변경 규모 |
|---|---|---|
| `supabase/migrations/20260617100000_milestones_charter_fk.sql` | 신규 | 소 |
| `supabase/migrations/20260617100001_charter_title.sql` | 신규 | 소 |
| `supabase/migrations/20260617100002_project_charters_charter_fk.sql` | 신규 | 소 |
| `lib/types.ts` | 수정 | 소 |
| `app/api/charter/route.ts` | 수정 | 중 |
| `app/api/charter/submissions/route.ts` | 수정 | 중 |
| `app/api/milestones/route.ts` | 수정 | 소 |
| `app/api/milestones/generate/route.ts` | 수정 | 소 |
| `app/api/milestones/batch/route.ts` | 수정 | 소 |
| `app/api/milestones/refine/route.ts` | 수정 | 소 |
| `app/api/champions/gantt/route.ts` | 수정 | 중 |
| `app/(champion)/my-project/charter/page.tsx` | 수정 | 대 |
| `app/(champion)/my-project/charter/[id]/page.tsx` | 신규 | 중 |
| `app/(champion)/my-project/charter/CharterListClient.tsx` | 신규 | 중 |
| `app/(champion)/my-project/charter/CharterClient.tsx` | 수정 | 소 |
| `app/(champion)/my-project/milestones/page.tsx` | 수정 | 중 |
| `app/(champion)/my-project/milestones/MilestonesClient.tsx` | 수정 | 중 |
| `components/CheckinTab.tsx` | 수정 | 소 |
| `app/admin/champions/[userId]/page.tsx` | 수정 | 대 |
| `components/ChampionGanttView.tsx` | 수정 | 대 |
| `app/admin/kanban/page.tsx` | 수정 | 중 |
| `app/admin/mobile/charters/page.tsx` | 수정 | 중 |
| `app/admin/progress/page.tsx` | 수정 | 중 |
| `lib/data/champions.ts` | 수정 | 중 |

**총 24개 파일, 예상 개발 기간: 2~3주**
