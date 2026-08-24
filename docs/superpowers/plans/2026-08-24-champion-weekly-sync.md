# Champion Weekly 미팅 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AX Champion Weekly 미팅 노트(Obsidian)의 "챔피언별 활동 공유" 섹션을 Supabase에 동기화해, 관리자가 챔피언별 주간 진척도를 시간순으로 조회할 수 있게 한다.

**Architecture:** 기존 `ax-sessions` MCP 서버(`app/api/mcp/route.ts`)에 3개 도구를 추가하고, 새 테이블 2개(`champion_weekly_sessions`, `weekly_champion_updates`, 둘 다 admin-only RLS)를 만든다. 관리자 UI는 `/api/weekly-updates` REST 라우트를 새로 만들어 기존 챔피언 상세 페이지에 탭으로 추가한다. 인증은 기존 관리자 PAT(`admt_`)를 그대로 재사용 — 새 인증 로직 없음.

**Tech Stack:** Next.js (App Router), Supabase(Postgres + RLS), `mcp-handler`/`zod`(MCP 도구 스키마), `vitest`(테스트), `react-markdown`(UI 렌더링, 기존 `MarkdownView` 재사용).

**Spec:** `docs/superpowers/specs/2026-08-24-champion-weekly-sync-design.md`

## Global Constraints

- 관리자 전용 기능이다 — 챔피언 PAT/챔피언 로그인 세션은 새 테이블·새 도구 어디에도 접근할 수 없다 (spec §2, §3).
- RLS admin 판정은 반드시 `raw_app_meta_data->>'is_admin' = 'true'` 사용 — `raw_user_meta_data`는 금지된 옛 패턴이다 (PR #52 보안 수정 이후).
- `sync_champion_updates`는 항목을 절대 삭제하지 않는다 — 배치에서 빠진 기존 항목은 그대로 둔다 (spec §4, 기존 `sync_action_items`와 동일 원칙).
- 새 인증 스코프/PAT를 만들지 않는다 — 기존 `admt_` 관리자 PAT를 그대로 재사용한다.
- **로컬 `main`은 이 기능이 의존하는 `app/api/mcp/route.ts`, `lib/mcp/auth.ts` 등을 아직 포함하지 않고 있다(origin/main 대비 22커밋 뒤처짐).** Task 0에서 반드시 `origin/main` 기준으로 워크트리를 만든다 — 로컬 `main`에서 브랜치를 따면 빌드가 깨진다.

---

### Task 0: 작업 워크트리 준비

**Files:** 없음 (git 작업만)

**Interfaces:** 없음

- [ ] **Step 1: origin/main 기준 워크트리 생성**

```bash
git fetch origin
git worktree add ../ax-homework-submission-weekly-sync origin/main -b feat/champion-weekly-sync
cd ../ax-homework-submission-weekly-sync
```

- [ ] **Step 2: 의존성 설치 및 기존 테스트 통과 확인 (베이스라인)**

```bash
bun install
bun run test
```

Expected: 기존 테스트 전부 PASS (이 커밋에서 시작한다는 베이스라인 확인). 실패하는 테스트가 이미 있다면 이 작업과 무관한 기존 문제이니 기록만 해두고 진행한다.

---

### Task 1: DB 마이그레이션 — `champion_weekly_sessions`, `weekly_champion_updates`

**Files:**
- Create: `supabase/migrations/20260824000000_champion_weekly_sync.sql`

**Interfaces:**
- Produces: 테이블 `champion_weekly_sessions(id, session_date, session_time, title, notes, admin_user_id, created_at, updated_at)`, `weekly_champion_updates(id, weekly_session_id, champion_user_id, project_label, summary, display_order, created_at, updated_at)`.이후 모든 태스크가 이 컬럼명을 그대로 참조한다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260824000000_champion_weekly_sync.sql

-- 1. champion_weekly_sessions
CREATE TABLE champion_weekly_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date  DATE NOT NULL,
  session_time  TIME,
  title         TEXT NOT NULL,
  notes         TEXT,
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weekly_sessions_date ON champion_weekly_sessions(session_date DESC);

ALTER TABLE champion_weekly_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_sessions_admin_all" ON champion_weekly_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );

-- 2. weekly_champion_updates
CREATE TABLE weekly_champion_updates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_session_id UUID NOT NULL REFERENCES champion_weekly_sessions(id) ON DELETE CASCADE,
  champion_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_label     TEXT,
  summary           TEXT NOT NULL,
  display_order     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weekly_updates_session ON weekly_champion_updates(weekly_session_id, display_order);
CREATE INDEX idx_weekly_updates_champion ON weekly_champion_updates(champion_user_id, created_at DESC);

ALTER TABLE weekly_champion_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_updates_admin_all" ON weekly_champion_updates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );
```

- [ ] **Step 2: 마이그레이션 적용 (로컬/스테이징 Supabase 프로젝트)**

```bash
supabase db push
```

Expected: 두 테이블과 인덱스, RLS 정책이 에러 없이 생성됨. `supabase db push`가 이 프로젝트에 설정돼 있지 않다면, 대상 Supabase 프로젝트의 SQL Editor에 파일 내용을 그대로 붙여넣어 실행한다.

- [ ] **Step 3: RLS 수동 검증**

Supabase SQL Editor에서 관리자가 아닌 세션으로(또는 `SET request.jwt.claims`로 non-admin 흉내) 두 테이블에 `SELECT`를 시도해 0건이 반환되는지 확인. 관리자 계정으로는 정상 조회되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260824000000_champion_weekly_sync.sql
git commit -m "[AX-1] feat(db): champion_weekly_sessions/weekly_champion_updates 테이블 추가"
```

---

### Task 2: MCP 도구 3개 — `get_weekly_session`, `upsert_weekly_session`, `sync_champion_updates`

**Files:**
- Modify: `app/api/mcp/route.ts` (기존 `sync_action_items` 도구 블록 뒤, `createMcpHandler` 콜백을 닫는 `})` 앞에 3개 도구 삽입)

**Interfaces:**
- Consumes: `getAuthenticatedIdentity(ctx): McpIdentity`(`@/lib/mcp/auth`, `{userId: string, isAdmin: boolean}`), `createServiceClient()`(`@/lib/supabase/server`)
- Produces: MCP 도구 `get_weekly_session`/`upsert_weekly_session`/`sync_champion_updates` — Task 6(스킬 문서)이 이 이름·입력 스키마를 그대로 참조한다.

- [ ] **Step 1: `app/api/mcp/route.ts`에 3개 도구 추가**

`sync_action_items`의 `server.registerTool(...)` 블록이 끝나는 지점(파일 맨 끝 `})` 바로 앞)에 아래를 삽입한다:

```typescript
  server.registerTool(
    'get_weekly_session',
    {
      title: 'Get Weekly Session',
      description:
        'Looks up an AX Champion Weekly meeting by date — admin-only. Returns null if none exists, or an error listing candidates if multiple sessions share the date.',
      inputSchema: z.object({
        date: z.string().describe('Meeting date, YYYY-MM-DD'),
      }),
    },
    async (args, ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      if (!identity.isAdmin) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'admin_required' }) }], isError: true }
      }
      const { date } = args
      const supabase = createServiceClient()
      const { data: sessions, error: lookupError } = await supabase
        .from('champion_weekly_sessions')
        .select('*')
        .eq('session_date', date)
        .order('session_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (lookupError) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: lookupError.message }) }], isError: true }
      }
      if (sessions.length > 1) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'multiple_sessions_on_date',
              sessions: sessions.map((s) => ({ id: s.id, session_time: s.session_time, title: s.title })),
            }),
          }],
          isError: true,
        }
      }
      const session = sessions[0] ?? null
      if (!session) return { content: [{ type: 'text', text: JSON.stringify(null) }] }

      const { data: updates } = await supabase
        .from('weekly_champion_updates')
        .select('*')
        .eq('weekly_session_id', session.id)
        .order('display_order', { ascending: true })

      return {
        content: [{ type: 'text', text: JSON.stringify({ ...session, champion_updates: updates ?? [] }) }],
      }
    },
  )

  server.registerTool(
    'upsert_weekly_session',
    {
      title: 'Upsert Weekly Session',
      description:
        'Creates an AX Champion Weekly meeting for a date if none exists, or updates title/notes on an existing one — admin-only.',
      inputSchema: z.object({
        date: z.string().describe('Meeting date, YYYY-MM-DD'),
        title: z.string().optional(),
        notes: z.string().optional().describe('Markdown meeting notes (condensed summary)'),
        expected_updated_at: z
          .string()
          .optional()
          .describe('Pass the updated_at value from a prior get_weekly_session call to detect concurrent edits.'),
      }),
    },
    async (args, ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      if (!identity.isAdmin) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'admin_required' }) }], isError: true }
      }
      const { date, title, notes, expected_updated_at } = args
      const supabase = createServiceClient()
      const { data: sessions, error: lookupError } = await supabase
        .from('champion_weekly_sessions')
        .select('*')
        .eq('session_date', date)
        .order('session_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (lookupError) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: lookupError.message }) }], isError: true }
      }
      if (sessions.length > 1) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'multiple_sessions_on_date',
              sessions: sessions.map((s) => ({ id: s.id, session_time: s.session_time, title: s.title })),
            }),
          }],
          isError: true,
        }
      }
      const existing = sessions[0] ?? null

      if (!existing) {
        const { data: created, error } = await supabase
          .from('champion_weekly_sessions')
          .insert({
            admin_user_id: identity.userId,
            session_date: date,
            title: title?.trim() || `${date} AX Champion Weekly`,
            notes: notes ?? null,
          })
          .select()
          .single()
        if (error || !created) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: error?.message ?? 'create failed' }) }], isError: true }
        }
        return { content: [{ type: 'text', text: JSON.stringify(created) }] }
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (title !== undefined) updates.title = title.trim()
      if (notes !== undefined) updates.notes = notes

      let updateQuery = supabase.from('champion_weekly_sessions').update(updates).eq('id', existing.id)
      if (expected_updated_at) updateQuery = updateQuery.eq('updated_at', expected_updated_at)

      const { data: updatedRows, error } = await updateQuery.select()
      if (error) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true }
      }
      if (!updatedRows || updatedRows.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'conflict', message: '다른 사용자가 먼저 수정했습니다. get_weekly_session으로 다시 조회 후 재시도하세요.' }),
          }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(updatedRows[0]) }] }
    },
  )

  server.registerTool(
    'sync_champion_updates',
    {
      title: 'Sync Champion Weekly Updates',
      description:
        'Batch create/update per-champion progress updates for a Weekly meeting — admin-only. Items with an id are updated (project_label, summary); items without an id are created and their new id is returned so the caller can write it back into the Obsidian file. Never deletes.',
      inputSchema: z.object({
        weekly_session_id: z.string(),
        items: z.array(
          z.object({
            id: z.string().optional(),
            champion_user_id: z.string().describe('Required for new items; ignored (kept as-is) when updating an existing item'),
            project_label: z.string().optional(),
            summary: z.string(),
          }),
        ),
      }),
    },
    async (args, ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      if (!identity.isAdmin) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'admin_required' }) }], isError: true }
      }
      const { weekly_session_id, items } = args
      const supabase = createServiceClient()
      const results: Array<{ index: number; status: 'created' | 'updated' | 'not_found' | 'error'; item?: Record<string, unknown>; error?: string }> = []
      const now = new Date().toISOString()

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.id) {
          const updates: Record<string, unknown> = { updated_at: now, summary: item.summary.trim() }
          if (item.project_label !== undefined) updates.project_label = item.project_label
          const { data, error } = await supabase
            .from('weekly_champion_updates')
            .update(updates)
            .eq('id', item.id)
            .eq('weekly_session_id', weekly_session_id)
            .select()
            .maybeSingle()
          if (error) results.push({ index: i, status: 'error', error: error.message })
          else if (!data) results.push({ index: i, status: 'not_found' })
          else results.push({ index: i, status: 'updated', item: data })
        } else if (!item.champion_user_id) {
          results.push({ index: i, status: 'error', error: 'champion_user_id required for new items' })
        } else {
          const { data, error } = await supabase
            .from('weekly_champion_updates')
            .insert({
              weekly_session_id,
              champion_user_id: item.champion_user_id,
              project_label: item.project_label ?? null,
              summary: item.summary.trim(),
              display_order: i,
            })
            .select()
            .single()
          if (error || !data) results.push({ index: i, status: 'error', error: error?.message ?? 'insert failed' })
          else results.push({ index: i, status: 'created', item: data })
        }
      }

      const hasFailure = results.some((r) => r.status === 'error' || r.status === 'not_found')
      return { content: [{ type: 'text', text: JSON.stringify(results) }], isError: hasFailure }
    },
  )
```

- [ ] **Step 2: 타입체크로 삽입 위치·문법 확인**

```bash
bun run typecheck
```

Expected: 에러 없음. (`z`, `getAuthenticatedIdentity`, `createServiceClient`는 파일 상단에 이미 import돼 있으므로 추가 import 불필요.)

- [ ] **Step 3: 로컬에서 MCP 서버 기동 후 수동 스모크 테스트**

```bash
bun run dev
```

다른 터미널에서, 이미 페어링된 관리자 PAT로 (`~/.claude.json`의 `ax-sessions` 항목에서 토큰을 꺼내) 아래 curl로 3개 도구가 각각 정상 응답하는지 확인:

```bash
curl -sS -X POST "http://localhost:3000/api/mcp" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <admt_ 토큰>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_weekly_session","arguments":{"date":"2099-01-01"}}}'
```

Expected: `null`을 담은 JSON-RPC 응답(SSE `data:` 라인). 존재하지 않는 미래 날짜라 `null`이 정상.

- [ ] **Step 4: 커밋**

```bash
git add app/api/mcp/route.ts
git commit -m "[AX-1] feat(mcp): get_weekly_session/upsert_weekly_session/sync_champion_updates 도구 추가"
```

---

### Task 3: 타입 정의 + 관리자 조회용 REST 라우트

**Files:**
- Modify: `lib/types.ts` (파일 끝에 타입 추가)
- Create: `app/api/weekly-updates/route.ts`
- Modify: `test/smoke.test.ts` (route export 회귀 가드 추가)

**Interfaces:**
- Consumes: `requireAdmin(req): Promise<User | NextResponse>`(`@/lib/api/guard`), `createServiceClient()`(`@/lib/supabase/server`)
- Produces: `GET /api/weekly-updates?championUserId=<uuid>` → `WeeklyChampionUpdateWithSession[]`. Task 4(UI)가 이 응답 타입을 그대로 소비한다.

- [ ] **Step 1: `lib/types.ts`에 타입 추가**

파일 끝에 추가:

```typescript
export interface ChampionWeeklySession {
  id: string
  session_date: string
  session_time: string | null
  title: string
  notes: string | null
  admin_user_id: string | null
  created_at: string
  updated_at: string
}

export interface WeeklyChampionUpdate {
  id: string
  weekly_session_id: string
  champion_user_id: string
  project_label: string | null
  summary: string
  display_order: number
  created_at: string
  updated_at: string
}

export interface WeeklyChampionUpdateWithSession extends WeeklyChampionUpdate {
  weekly_session: { session_date: string; title: string }
}
```

- [ ] **Step 2: REST 라우트 작성**

`app/api/weekly-updates/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin

  const championUserId = req.nextUrl.searchParams.get('championUserId')
  if (!championUserId) {
    return NextResponse.json({ error: 'championUserId required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('weekly_champion_updates')
    .select('*, weekly_session:champion_weekly_sessions(session_date, title)')
    .eq('champion_user_id', championUserId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 3: route export 회귀 가드를 `test/smoke.test.ts`에 추가**

`test/smoke.test.ts` 상단 import에 추가:

```typescript
import { GET as weeklyUpdatesGet } from '@/app/api/weekly-updates/route'
```

기존 `describe('milestone route contracts (regression guard)', ...)` 블록 뒤에 추가:

```typescript
describe('weekly-updates route contract (regression guard)', () => {
  it('exports GET for the champion weekly progress UI', () => {
    expect(typeof weeklyUpdatesGet).toBe('function')
  })
})
```

- [ ] **Step 4: 테스트 실행**

```bash
bun run test test/smoke.test.ts
```

Expected: 모든 테스트 PASS, 새로 추가한 `weekly-updates route contract` 케이스 포함.

- [ ] **Step 5: 커밋**

```bash
git add lib/types.ts app/api/weekly-updates/route.ts test/smoke.test.ts
git commit -m "[AX-1] feat(api): weekly_champion_updates 조회 라우트 + 타입 추가"
```

---

### Task 4: 관리자 UI — "Weekly 진척도" 탭

**Files:**
- Create: `components/weekly/AdminWeeklyProgressList.tsx`
- Modify: `app/admin/champions/[userId]/page.tsx`

**Interfaces:**
- Consumes: `WeeklyChampionUpdateWithSession`(Task 3), `apiFetch<T>(path, options?)`(`@/lib/api-client`), `MarkdownView`(`@/components/MarkdownView`)

- [ ] **Step 1: 리스트 컴포넌트 작성**

`components/weekly/AdminWeeklyProgressList.tsx`:

```tsx
'use client'
import type { WeeklyChampionUpdateWithSession } from '@/lib/types'
import { MarkdownView } from '@/components/MarkdownView'

interface Props {
  updates: WeeklyChampionUpdateWithSession[]
}

export function AdminWeeklyProgressList({ updates }: Props) {
  if (updates.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>
        아직 동기화된 Weekly 진척도가 없습니다.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {updates.map((u) => (
        <div
          key={u.id}
          className="rounded-lg border p-3"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}
        >
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {u.weekly_session.session_date}
            </span>
            <span className="text-xs truncate" style={{ color: 'var(--text-disabled)' }}>
              {u.weekly_session.title}
            </span>
          </div>
          {u.project_label && (
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              {u.project_label}
            </p>
          )}
          <MarkdownView markdown={u.summary} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 챔피언 상세 페이지에 탭 추가**

`app/admin/champions/[userId]/page.tsx`에서:

1. Import 추가 (기존 `AdminSessionDetail` import 다음 줄):

```typescript
import { AdminWeeklyProgressList } from '@/components/weekly/AdminWeeklyProgressList'
import type { WeeklyChampionUpdateWithSession } from '@/lib/types'
```

2. `activeMainTab` state 선언부(`const [activeMainTab, setActiveMainTab] = useState<'submissions' | 'charter' | 'milestones' | 'sessions'>('charter')`)를 아래로 교체:

```typescript
const [activeMainTab, setActiveMainTab] = useState<'submissions' | 'charter' | 'milestones' | 'sessions' | 'weekly'>('charter')
const [weeklyUpdates, setWeeklyUpdates] = useState<WeeklyChampionUpdateWithSession[]>([])
```

3. 탭 바 배열(`{ key: 'sessions', label: '1-on-1 세션' }` 다음)에 항목 추가:

```typescript
{ key: 'weekly', label: 'Weekly 진척도' },
```

4. 같은 탭 버튼의 `onClick` 안, `if (tab.key === 'sessions') { ... }` 블록 뒤에 분기 추가:

```typescript
if (tab.key === 'weekly') {
  apiFetch<WeeklyChampionUpdateWithSession[]>(`/api/weekly-updates?championUserId=${userId}`)
    .then(setWeeklyUpdates)
    .catch(() => {})
}
```

5. 파일 맨 끝, `{activeMainTab === 'sessions' && ( ... )}` 블록 뒤에 추가:

```tsx
{activeMainTab === 'weekly' && (
  <section className="mb-8">
    <AdminWeeklyProgressList updates={weeklyUpdates} />
  </section>
)}
```

- [ ] **Step 3: 타입체크 + 빌드 확인**

```bash
bun run typecheck
bun run build
```

Expected: 에러 없음.

- [ ] **Step 4: 수동 UI 확인**

```bash
bun run dev
```

브라우저에서 관리자로 로그인 → 아무 챔피언 상세 페이지 → "Weekly 진척도" 탭 클릭 → (Task 5의 스킬로 실제 데이터를 넣기 전이므로) 빈 상태 문구("아직 동기화된 Weekly 진척도가 없습니다.")가 뜨는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add components/weekly/AdminWeeklyProgressList.tsx "app/admin/champions/[userId]/page.tsx"
git commit -m "[AX-1] feat(admin): 챔피언 상세 페이지에 Weekly 진척도 탭 추가"
```

---

### Task 5: `obsidian-session-sync` 스킬 문서에 Weekly 동기화 절차 추가

**Files:**
- Modify: `skills/obsidian-session-sync/SKILL.md`

**Interfaces:**
- Consumes: Task 2에서 만든 MCP 도구 이름·입력 스키마(`get_weekly_session`, `upsert_weekly_session`, `sync_champion_updates`), 기존 `list_champions`

- [ ] **Step 1: frontmatter 트리거 문구에 Weekly 언급 추가**

파일 최상단 description 라인(`Use when an admin (usually) or champion wants to sync 1-on-1 check-up session notes...`)의 트리거 문구에 `"Weekly 진척도 동기화"`, `"weekly sync"`를 추가한다.

- [ ] **Step 2: "Direction C: Weekly 미팅 동기화" 섹션 추가**

"## Direction B: App → Obsidian (export)" 섹션 뒤, "## Notes" 섹션 앞에 삽입:

```markdown
## Direction C: Weekly 미팅 동기화 (Obsidian → App, 관리자 전용)

**목적은 순수 관리자용 기록·검색이다.** 1:1과 달리 챔피언 본인이 보는 화면은 없다 — 관리자만
`get_weekly_session`/`upsert_weekly_session`/`sync_champion_updates` 세 도구를 호출할 수 있고,
챔피언 PAT로 호출하면 `admin_required` 에러가 돌아온다.

1. **노트를 식별한다.** 파일명/제목에 "Weekly"가 들어간 노트(예: `[11층 하와이] AX Champion
   Weekly.md`)를 대상으로 한다. 1:1과 마찬가지로 첫 동기화 시엔 HTML 주석 ID가 없는 게 정상이다.

2. **`## 🤖 챔피언별 활동 공유` 섹션을 파싱한다.** 이 섹션 아래 `### 이름 — 프로젝트명`
   형태의 서브섹션이 챔피언 한 명당 하나씩 있다. 각 서브섹션에서:
   - "이름"을 `list_champions` 결과와 매칭한다(1:1 스킬과 동일한 매칭 규칙 — 닉네임 우선).
   - **매칭 실패 시(예: `### 화자6 (미상) — 정산서 자동화`) 해당 서브섹션은 건너뛰고
     목록으로 사람에게 보고한다 — 추측으로 아무 챔피언에게나 매핑하지 않는다.**
   - `—` 뒤 텍스트를 `project_label`로, 그 아래 불릿 전체를 `summary`로 삼는다.
   - `🏆 우수 사례·인사이트`, `🤨 질문·건의 사항`, `✅ 액션 아이템`, 전체 전사록은
     이 동기화 대상이 아니다 — 저장하지 않는다.

3. **미팅 자체를 조회한다.** `get_weekly_session`을 노트 날짜로 호출한다.
   - `null`이면 신규 생성 대상.
   - 세션 객체가 오면 갱신 대상 — `champion_updates` 배열을 노트의 파싱 결과와 비교한다.
   - `{error: "multiple_sessions_on_date", sessions: [...]}`이면 같은 날짜에 여러 Weekly가
     있다는 뜻(예: 층별 별도 회의) — 사람에게 어느 것인지 확인받는다.

4. **diff를 보여주고 확인받는다.** 미팅 노트(`notes` — 요약/논의 조건화, 1:1과 동일 스타일)와
   챔피언별 업데이트 각각에 대해 신규/갱신 여부를 명확히 보여준 뒤, 명시적 yes 없이는 쓰지 않는다.

5. **쓴다.**
   - `upsert_weekly_session(date, title, notes[, expected_updated_at])`으로 미팅 레코드 생성/갱신.
   - `sync_champion_updates(weekly_session_id, items)`로 챔피언별 업데이트 배치 생성/갱신.
     `id`가 있는 항목은 갱신, 없는 항목은 생성되고 새 id가 응답으로 돌아온다. **삭제되지 않는다** —
     노트에서 빠진 기존 항목이 있어도 그대로 둔다.

6. **ID를 파일에 백필한다.** 성공 후 미팅 H1 아래 `<!-- weekly_session_id: ... -->`, 각
   `### 이름 — 프로젝트명` 서브섹션 아래 `<!-- weekly_update_id: ... -->`를 적어 넣는다.

7. **보고한다.** "✅ 노트 갱신, 챔피언 3명 업데이트(신규 1·갱신 2), 매칭 실패 1명(화자6)
   건너뜀" 같은 한 줄 요약. 매칭 실패가 있었다면 반드시 언급한다.
```

- [ ] **Step 3: 로컬 스킬 사본에도 동기화(선택 — 이 세션에서 바로 쓰려면 필요)**

```bash
cp skills/obsidian-session-sync/SKILL.md /Users/claud_01/.claude/skills/obsidian-session-sync/SKILL.md
```

- [ ] **Step 4: 커밋**

```bash
git add skills/obsidian-session-sync/SKILL.md
git commit -m "[AX-1] docs(skill): obsidian-session-sync에 Weekly 동기화(Direction C) 절차 추가"
```

---

### Task 6: 브랜치 통합

**Files:** 없음 (git/PR 작업)

- [ ] **Step 1: 전체 테스트 + 빌드 최종 확인**

```bash
bun run test
bun run typecheck
bun run build
```

Expected: 전부 PASS.

- [ ] **Step 2: PR 생성 (superpowers:finishing-a-development-branch 스킬 사용)**

이 태스크는 별도 스킬(`superpowers:finishing-a-development-branch`)로 진행한다 — 커밋 히스토리를 보고 PR 설명을 작성하고, 사용자에게 병합 방식을 확인받는다.
