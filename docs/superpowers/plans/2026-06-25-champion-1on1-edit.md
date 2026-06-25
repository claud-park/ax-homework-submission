# Champion 1-on-1 미팅 노트·액션 아이템 편집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챔피언이 자신의 weekly 1-on-1(check-up session)에서 미팅 노트를 편집하고 액션 아이템을 생성·수정·삭제할 수 있게 한다.

**Architecture:** mutation API 라우트(service client, RLS 우회)가 실질 권한 게이트. 권한 판정을 공통 헬퍼(`resolveSessionRole`) + 순수 함수(허용 필드 화이트리스트)로 추출하고, admin/champion 분기를 통일. 클라이언트는 액션 아이템·노트 편집 로직을 공통 훅으로 추출해 admin/champion 두 컴포넌트가 함께 소비. RLS 정책은 보조 방어선으로 추가.

**Tech Stack:** Next.js App Router, TypeScript, Supabase(service role + RLS), React client hooks, vitest, bun.

## Global Constraints

- 권한 판정은 **API 라우트 로직**이 1차 게이트(라우트는 `createServiceClient()`로 RLS 우회). RLS는 보조 방어선.
- champion 허용 범위: 세션은 `notes`만, 액션 아이템은 `body` + `is_completed`(생성·삭제 포함). `title`/`session_date`/`display_order`는 admin 전용.
- admin 기존 동작은 회귀 없이 **동일하게 유지**.
- 테스트 러너: `bun run test` (vitest). 순수 함수 테스트는 `test/lib/`에 둔다(기존 관례).
- 커밋 메시지 prefix: `[AX-1]`. 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 마이그레이션 파일명: `supabase/migrations/20260625000000_champion_session_edit.sql`.

---

### Task 1: 권한 허용 필드 순수 함수 + 테스트

**Files:**
- Create: `lib/sessions/permissions.ts`
- Test: `test/lib/session-permissions.test.ts`

**Interfaces:**
- Produces: `type SessionRole = 'admin' | 'owner'`; `allowedSessionUpdateFields(role: SessionRole): readonly string[]`; `allowedActionItemUpdateFields(role: SessionRole): readonly string[]`

- [ ] **Step 1: Write the failing test**

`test/lib/session-permissions.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { allowedSessionUpdateFields, allowedActionItemUpdateFields } from '@/lib/sessions/permissions'

describe('allowedSessionUpdateFields', () => {
  it('admin은 title/notes/session_date 모두 허용', () => {
    expect(allowedSessionUpdateFields('admin')).toEqual(['title', 'notes', 'session_date'])
  })
  it('owner(champion)는 notes만 허용', () => {
    expect(allowedSessionUpdateFields('owner')).toEqual(['notes'])
  })
})

describe('allowedActionItemUpdateFields', () => {
  it('admin은 body/display_order/is_completed 허용', () => {
    expect(allowedActionItemUpdateFields('admin')).toEqual(['body', 'display_order', 'is_completed'])
  })
  it('owner(champion)는 body/is_completed만 허용(reorder 제외)', () => {
    expect(allowedActionItemUpdateFields('owner')).toEqual(['body', 'is_completed'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test test/lib/session-permissions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sessions/permissions'`.

- [ ] **Step 3: Write minimal implementation**

`lib/sessions/permissions.ts`:
```ts
export type SessionRole = 'admin' | 'owner'

/** 세션(check_up_sessions) UPDATE 시 role별 허용 컬럼 화이트리스트 */
export function allowedSessionUpdateFields(role: SessionRole): readonly string[] {
  return role === 'admin' ? ['title', 'notes', 'session_date'] : ['notes']
}

/** 액션 아이템 UPDATE 시 role별 허용 컬럼 화이트리스트 (champion은 reorder 불가) */
export function allowedActionItemUpdateFields(role: SessionRole): readonly string[] {
  return role === 'admin' ? ['body', 'display_order', 'is_completed'] : ['body', 'is_completed']
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test test/lib/session-permissions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/permissions.ts test/lib/session-permissions.test.ts
git commit -m "$(printf '%s\n' '[AX-1] feat(sessions): role별 허용 필드 순수 함수 + 테스트' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: 세션 역할 판정 헬퍼

**Files:**
- Create: `lib/sessions/access.ts`

**Interfaces:**
- Consumes: `SessionRole` from `lib/sessions/permissions.ts`
- Produces: `resolveSessionRole(supabase, sessionId, user): Promise<SessionRole | null>` — admin이면 `'admin'`, 세션 소유 champion이면 `'owner'`, 아니면 `null`.

- [ ] **Step 1: Write implementation**

`lib/sessions/access.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionRole } from './permissions'

type AuthUser = { id: string; user_metadata?: { is_admin?: boolean } }

/**
 * 세션에 대한 호출자의 역할을 판정한다.
 * - admin(user_metadata.is_admin) → 'admin'
 * - 세션의 champion 본인 → 'owner'
 * - 그 외 → null (라우트에서 403 처리)
 */
export async function resolveSessionRole(
  supabase: SupabaseClient,
  sessionId: string,
  user: AuthUser,
): Promise<SessionRole | null> {
  if (user.user_metadata?.is_admin) return 'admin'

  const { data } = await supabase
    .from('check_up_sessions')
    .select('champion_user_id')
    .eq('id', sessionId)
    .single()

  if (data && (data as { champion_user_id: string }).champion_user_id === user.id) return 'owner'
  return null
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/sessions/access.ts
git commit -m "$(printf '%s\n' '[AX-1] feat(sessions): resolveSessionRole 헬퍼 추가' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: 세션 PATCH 라우트 — champion 노트 편집 허용

**Files:**
- Modify: `app/api/sessions/[sessionId]/route.ts` (PATCH 함수, lines 55-86)

**Interfaces:**
- Consumes: `resolveSessionRole` (Task 2), `allowedSessionUpdateFields` (Task 1)

- [ ] **Step 1: Update imports**

`app/api/sessions/[sessionId]/route.ts` line 1-3 변경 — `verifyAdmin` import는 GET/DELETE에서 더 이상 PATCH에 안 쓰지만 DELETE에서 계속 사용하므로 유지. 헬퍼 import 추가:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSessionRole } from '@/lib/sessions/access'
import { allowedSessionUpdateFields } from '@/lib/sessions/permissions'
```

- [ ] **Step 2: Replace PATCH handler**

기존 PATCH(lines 55-86) 전체를 아래로 교체:
```ts
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const role = await resolveSessionRole(supabase, params.sessionId, user)
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedSessionUpdateFields(role)) {
    if (key in body) updates[key] = body[key]
  }

  let query = supabase
    .from('check_up_sessions')
    .update(updates)
    .eq('id', params.sessionId)
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)

  const { data, error } = await query.select()
  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  if (!data || data.length === 0) {
    if (expectedUpdatedAt) {
      return NextResponse.json(
        { error: '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  return NextResponse.json(data[0])
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/sessions/[sessionId]/route.ts
git commit -m "$(printf '%s\n' '[AX-1] feat(sessions): PATCH 세션 노트 champion 편집 허용' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 4: 액션 아이템 라우트 — champion 생성/본문수정/삭제 허용

**Files:**
- Modify: `app/api/sessions/[sessionId]/action-items/route.ts` (POST)
- Modify: `app/api/sessions/[sessionId]/action-items/[itemId]/route.ts` (PATCH, DELETE)

**Interfaces:**
- Consumes: `resolveSessionRole` (Task 2), `allowedActionItemUpdateFields` (Task 1)

- [ ] **Step 1: Replace `action-items/route.ts` (POST)**

파일 전체를 아래로 교체:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSessionRole } from '@/lib/sessions/access'

type Params = { params: { sessionId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const role = await resolveSessionRole(supabase, params.sessionId, user)
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { body, display_order } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const { data, error } = await supabase
    .from('session_action_items')
    .insert({ session_id: params.sessionId, body: body.trim(), display_order: display_order ?? 0 })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Replace `action-items/[itemId]/route.ts` (PATCH + DELETE)**

파일 전체를 아래로 교체:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSessionRole } from '@/lib/sessions/access'
import { allowedActionItemUpdateFields } from '@/lib/sessions/permissions'

type Params = { params: { sessionId: string; itemId: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const role = await resolveSessionRole(supabase, params.sessionId, user)
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // 아이템이 이 세션 소속인지 확인
  const { data: item } = await supabase
    .from('session_action_items')
    .select('id, session_id')
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)
    .single()
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }
  let touched = false
  for (const key of allowedActionItemUpdateFields(role)) {
    if (!(key in body)) continue
    if (key === 'is_completed') {
      updates.is_completed = body.is_completed
      updates.completed_at = body.is_completed ? now : null
    } else if (key === 'body') {
      updates.body = body.body?.trim()
    } else if (key === 'display_order') {
      updates.display_order = body.display_order
    }
    touched = true
  }
  if (!touched) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('session_action_items')
    .update(updates)
    .eq('id', params.itemId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const role = await resolveSessionRole(supabase, params.sessionId, user)
  if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase
    .from('session_action_items')
    .delete()
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/sessions/[sessionId]/action-items/route.ts app/api/sessions/[sessionId]/action-items/[itemId]/route.ts
git commit -m "$(printf '%s\n' '[AX-1] feat(sessions): 액션 아이템 champion 생성/본문수정/삭제 허용' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 5: RLS 마이그레이션 (보조 방어선)

**Files:**
- Create: `supabase/migrations/20260625000000_champion_session_edit.sql`

- [ ] **Step 1: Write migration**

```sql
-- champion이 본인 1-on-1 세션의 노트/액션 아이템을 편집할 수 있도록 RLS 정책 추가.
-- (mutation은 service client로 RLS를 우회하므로 보조 방어선 — 필드 단위 제한은 API가 담당)

-- check_up_sessions: champion이 본인 세션 UPDATE 허용
CREATE POLICY "checkup_champion_update" ON check_up_sessions
  FOR UPDATE USING (auth.uid() = champion_user_id)
  WITH CHECK (auth.uid() = champion_user_id);

-- session_action_items: champion이 본인 세션의 아이템 INSERT/DELETE 허용
-- (UPDATE는 기존 action_items_champion_toggle 정책이 소유 행을 이미 허용)
CREATE POLICY "action_items_champion_insert" ON session_action_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM check_up_sessions WHERE id = session_id AND champion_user_id = auth.uid())
  );

CREATE POLICY "action_items_champion_delete" ON session_action_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM check_up_sessions WHERE id = session_id AND champion_user_id = auth.uid())
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260625000000_champion_session_edit.sql
git commit -m "$(printf '%s\n' '[AX-1] feat(sessions): champion 세션 편집 RLS 정책 추가' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 6: `useSessionActionItems` 훅 추출 + AdminSessionDetail 리팩터

**Files:**
- Create: `components/sessions/useSessionActionItems.ts`
- Modify: `components/sessions/AdminSessionDetail.tsx`

**Interfaces:**
- Produces: `useSessionActionItems(sessionId: string)` 반환:
  `{ actionItems, setActionItems, newItemBody, setNewItemBody, addingItem, editingItemId, editingItemBody, setEditingItemBody, addItem, toggleItem, deleteItem, startEdit, cancelEdit, saveItemBody }`

- [ ] **Step 1: Create hook**

`components/sessions/useSessionActionItems.ts`:
```ts
import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { SessionActionItem } from '@/lib/types'

/** 세션 액션 아이템 CRUD 상태/핸들러 — admin·champion 디테일이 공유 */
export function useSessionActionItems(sessionId: string) {
  const [actionItems, setActionItems] = useState<SessionActionItem[]>([])
  const [newItemBody, setNewItemBody] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemBody, setEditingItemBody] = useState('')

  async function addItem() {
    if (!newItemBody.trim()) return
    setAddingItem(true)
    try {
      const item = await apiFetch<SessionActionItem>(`/api/sessions/${sessionId}/action-items`, {
        method: 'POST',
        body: JSON.stringify({ body: newItemBody.trim(), display_order: actionItems.length }),
      })
      setActionItems(v => [...v, item])
      setNewItemBody('')
    } catch { toast.error('추가 실패') } finally { setAddingItem(false) }
  }

  async function toggleItem(item: SessionActionItem) {
    try {
      const updated = await apiFetch<SessionActionItem>(
        `/api/sessions/${sessionId}/action-items/${item.id}`,
        { method: 'PATCH', body: JSON.stringify({ is_completed: !item.is_completed }) }
      )
      setActionItems(v => v.map(i => i.id === item.id ? updated : i))
    } catch { toast.error('업데이트 실패') }
  }

  async function deleteItem(itemId: string) {
    try {
      await apiFetch(`/api/sessions/${sessionId}/action-items/${itemId}`, { method: 'DELETE' })
      setActionItems(v => v.filter(i => i.id !== itemId))
    } catch { toast.error('삭제 실패') }
  }

  function startEdit(item: SessionActionItem) {
    setEditingItemId(item.id)
    setEditingItemBody(item.body)
  }

  function cancelEdit() { setEditingItemId(null) }

  async function saveItemBody(itemId: string) {
    try {
      const updated = await apiFetch<SessionActionItem>(`/api/sessions/${sessionId}/action-items/${itemId}`, {
        method: 'PATCH', body: JSON.stringify({ body: editingItemBody.trim() }),
      })
      setActionItems(v => v.map(i => i.id === itemId ? updated : i))
      setEditingItemId(null)
    } catch { toast.error('수정 실패') }
  }

  return {
    actionItems, setActionItems,
    newItemBody, setNewItemBody, addingItem,
    editingItemId, editingItemBody, setEditingItemBody,
    addItem, toggleItem, deleteItem, startEdit, cancelEdit, saveItemBody,
  }
}
```

- [ ] **Step 2: Refactor AdminSessionDetail to consume the hook**

`components/sessions/AdminSessionDetail.tsx`:
1. import 추가: `import { useSessionActionItems } from '@/components/sessions/useSessionActionItems'`
2. 아래 로컬 state 선언 삭제(현재 lines 23, 31-32, 38-39): `actionItems`, `newItemBody`/`addingItem`, `editingItemId`/`editingItemBody`.
3. 컴포넌트 상단에 추가:
```ts
const {
  actionItems, setActionItems,
  newItemBody, setNewItemBody, addingItem,
  editingItemId, editingItemBody, setEditingItemBody,
  addItem, toggleItem, deleteItem, startEdit, cancelEdit, saveItemBody,
} = useSessionActionItems(sessionId)
```
4. 로컬 핸들러 함수 삭제(현재 lines 111-149): `addItem`, `toggleItem`, `deleteItem`, `saveItemBody`. (`load()`의 `setActionItems(data.action_items ?? [])`는 그대로 둔다 — 훅의 setter 사용.)
5. 액션 아이템 편집 시작 버튼이 인라인으로 `setEditingItemId(item.id); setEditingItemBody(item.body)`를 호출하던 부분은 `startEdit(item)`으로, 취소는 `cancelEdit()`로 교체(JSX lines 418-503 영역). 나머지 JSX는 동일.

- [ ] **Step 3: Typecheck + 빌드 확인**

Run: `bun run typecheck`
Expected: PASS. 미사용 변수/함수 경고 없을 것.

- [ ] **Step 4: Manual smoke (admin 회귀 없음)**

검증: admin 세션 디테일에서 액션 아이템 추가/토글/본문수정/삭제가 이전과 동일하게 동작하는지 수동 확인(빌드 후). (자동 테스트는 client라 생략 — 순수 함수는 Task 1에서 커버.)

- [ ] **Step 5: Commit**

```bash
git add components/sessions/useSessionActionItems.ts components/sessions/AdminSessionDetail.tsx
git commit -m "$(printf '%s\n' '[AX-1] refactor(sessions): 액션 아이템 로직 useSessionActionItems 훅 추출' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 7: `useSessionNotes` 훅 추출 + AdminSessionDetail 리팩터

**Files:**
- Create: `components/sessions/useSessionNotes.ts`
- Modify: `components/sessions/AdminSessionDetail.tsx`

**Interfaces:**
- Produces: `useSessionNotes(sessionId, session, setSession, onConflictReload)` 반환:
  `{ notes, setNotes, isEditingNotes, setIsEditingNotes, saving, saveNotes }`

- [ ] **Step 1: Create hook**

`components/sessions/useSessionNotes.ts`:
```ts
import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { CheckUpSession } from '@/lib/types'

/**
 * 세션 미팅 노트 편집 상태/저장 — admin·champion 디테일이 공유.
 * notes/isEditingNotes 초기화는 소비 컴포넌트의 load()에서 setter로 수행한다.
 * onConflictReload: 409 등 저장 실패 시 최신 데이터 재조회 콜백.
 */
export function useSessionNotes(
  sessionId: string,
  session: CheckUpSession | null,
  setSession: (s: CheckUpSession) => void,
  onConflictReload: () => void,
) {
  const [notes, setNotes] = useState('')
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [saving, setSaving] = useState(false)

  async function saveNotes() {
    setSaving(true)
    try {
      const updated = await apiFetch<CheckUpSession>(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes, expectedUpdatedAt: session?.updated_at }),
      })
      setSession(updated)
      setNotes(updated.notes ?? '')
      toast.success('저장되었습니다.')
      setIsEditingNotes(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
      onConflictReload()
    } finally {
      setSaving(false)
    }
  }

  return { notes, setNotes, isEditingNotes, setIsEditingNotes, saving, saveNotes }
}
```

- [ ] **Step 2: Refactor AdminSessionDetail to consume the hook**

`components/sessions/AdminSessionDetail.tsx`:
1. import 추가: `import { useSessionNotes } from '@/components/sessions/useSessionNotes'`
2. 로컬 state 선언 삭제: `notes`(line 27), `saving`(line 28), `isEditingNotes`(line 36).
3. `session` state 선언 직후에 추가:
```ts
const {
  notes, setNotes, isEditingNotes, setIsEditingNotes, saving, saveNotes,
} = useSessionNotes(sessionId, session, setSession, load)
```
   (`load`는 같은 컴포넌트에 이미 정의됨 — hoisting된 function 선언이므로 참조 가능.)
4. 로컬 `saveNotes` 함수 삭제(lines 81-99).
5. `load()` 내부의 `setNotes(data.notes ?? '')`와 `setIsEditingNotes(!(data.notes ?? '').trim())`는 훅 setter를 그대로 호출하므로 변경 없음.
6. JSX의 노트 편집 영역(lines 395-416)은 동일하게 동작.

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual smoke (admin 노트 회귀 없음)**

검증: admin에서 노트 수정/저장, 첫 세션 자동 편집 뷰, 409 충돌 메시지 동작 확인.

- [ ] **Step 5: Commit**

```bash
git add components/sessions/useSessionNotes.ts components/sessions/AdminSessionDetail.tsx
git commit -m "$(printf '%s\n' '[AX-1] refactor(sessions): 노트 편집 로직 useSessionNotes 훅 추출' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 8: ChampionSessionDetail — 미팅 노트 편집 UI

**Files:**
- Modify: `components/sessions/ChampionSessionDetail.tsx`

**Interfaces:**
- Consumes: `useSessionNotes` (Task 7), `SessionNotesEditor` 컴포넌트(`@/components/sessions/SessionNotesEditor`)

- [ ] **Step 1: Wire the hook + load 초기화**

`ChampionSessionDetail.tsx`:
1. import 추가:
```ts
import { Pencil } from 'lucide-react'
import { SessionNotesEditor } from '@/components/sessions/SessionNotesEditor'
import { useSessionNotes } from '@/components/sessions/useSessionNotes'
```
2. `session` state 직후 훅 추가. champion은 단발 `useEffect` 로드를 쓰므로 재조회 콜백은 페이지 새로고침 안내 대신 간단히 무시(혹은 재조회 함수). 여기선 충돌 시 토스트만 띄우도록 빈 콜백 전달:
```ts
const { notes, setNotes, isEditingNotes, setIsEditingNotes, saving, saveNotes } =
  useSessionNotes(sessionId, session, setSession, () => { /* champion은 새로고침 안내로 충분 */ })
```
3. 기존 `useEffect`의 `.then(data => { ... })` 안에 노트 초기화 추가:
```ts
setSession(data)
setNotes(data.notes ?? '')
setIsEditingNotes(false)   // champion은 항상 read-only 진입, [수정]으로 편집
setActionItems(data.action_items ?? [])
setComments(data.comments ?? [])
setMilestones(data.milestones ?? [])
```

- [ ] **Step 2: Replace meeting-notes section JSX**

기존 미팅 노트 섹션(lines 134-140)을 아래로 교체 — 노트가 없어도 섹션을 노출해 작성 가능:
```tsx
{/* Meeting notes */}
<section className={sectionClass} style={sectionBorder}>
  <div className="flex items-center justify-between mb-3">
    <h2 className={labelClass} style={{ ...labelStyle, marginBottom: 0 }}>미팅 노트</h2>
    {!isEditingNotes && (
      <button
        onClick={() => setIsEditingNotes(true)}
        className="flex items-center gap-1 text-xs"
        style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <Pencil className="h-3 w-3" /> 수정
      </button>
    )}
  </div>
  {isEditingNotes ? (
    <div>
      <SessionNotesEditor value={notes} onChange={setNotes} />
      <div className="flex gap-1.5 mt-2">
        <button
          onClick={() => { setNotes(session.notes ?? ''); setIsEditingNotes(false) }}
          className="text-xs px-2.5 py-1 rounded-md"
          style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
        >취소</button>
        <button
          onClick={saveNotes}
          disabled={saving}
          className="text-xs px-2.5 py-1 rounded-md font-semibold disabled:opacity-50"
          style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >{saving ? '저장 중…' : '저장'}</button>
      </div>
    </div>
  ) : session.notes?.trim() ? (
    <MarkdownView markdown={session.notes} />
  ) : (
    <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>아직 노트가 없어요. [수정]을 눌러 작성할 수 있어요.</p>
  )}
</section>
```

- [ ] **Step 3: Verify `SessionNotesEditor` props**

Run: `grep -n "export function SessionNotesEditor\|value\|onChange" components/sessions/SessionNotesEditor.tsx | head`
Expected: `value: string` / `onChange: (v: string) => void` props 확인. 다르면 호출부를 실제 시그니처에 맞춘다.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/sessions/ChampionSessionDetail.tsx
git commit -m "$(printf '%s\n' '[AX-1] feat(sessions): champion 미팅 노트 편집 UI' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 9: ChampionSessionDetail — 액션 아이템 CRUD UI

**Files:**
- Modify: `components/sessions/ChampionSessionDetail.tsx`

**Interfaces:**
- Consumes: `useSessionActionItems` (Task 6)

- [ ] **Step 1: Wire the hook**

`ChampionSessionDetail.tsx`:
1. import 추가: `import { Trash2 } from 'lucide-react'` (기존 lucide import 라인에 병합), `import { useSessionActionItems } from '@/components/sessions/useSessionActionItems'`
2. 기존 로컬 `actionItems` state(line 21)와 `toggleItem` 함수(lines 43-51) 삭제.
3. 훅 추가:
```ts
const {
  actionItems, setActionItems,
  newItemBody, setNewItemBody, addingItem,
  editingItemId, editingItemBody, setEditingItemBody,
  addItem, toggleItem, deleteItem, startEdit, cancelEdit, saveItemBody,
} = useSessionActionItems(sessionId)
```
4. `useEffect` 로드의 `setActionItems(data.action_items ?? [])`는 훅 setter를 그대로 호출하므로 변경 없음(Task 8 Step 1에서 이미 포함).

- [ ] **Step 2: Replace action-items section JSX**

기존 액션 아이템 섹션(lines 142-169)을 아래로 교체 — 항상 노출(빈 목록이어도 추가 가능), 항목별 수정/삭제 + 추가 입력:
```tsx
{/* Action items */}
<section className={sectionClass} style={sectionBorder}>
  <h2 className={labelClass} style={labelStyle}>내 액션 아이템</h2>
  <div className="flex flex-col">
    {actionItems.map(item => (
      <div key={item.id} className="flex items-start gap-2.5 py-1.5 group">
        <input
          type="checkbox"
          checked={item.is_completed}
          onChange={() => toggleItem(item)}
          className="mt-0.5 h-4 w-4 cursor-pointer flex-shrink-0"
          style={{ accentColor: 'var(--blue-600)' }}
        />
        {editingItemId === item.id ? (
          <div className="flex-1">
            <input
              type="text"
              value={editingItemBody}
              onChange={e => setEditingItemBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveItemBody(item.id); if (e.key === 'Escape') cancelEdit() }}
              autoFocus
              className="w-full text-sm py-1"
              style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', borderRadius: 0 }}
            />
            <div className="flex gap-1.5 mt-1">
              <button onClick={cancelEdit} className="text-xs px-2 py-0.5 rounded"
                style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>취소</button>
              <button onClick={() => saveItemBody(item.id)} className="text-xs px-2 py-0.5 rounded font-semibold"
                style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}>저장</button>
            </div>
          </div>
        ) : (
          <>
            <span
              className="text-sm leading-relaxed flex-1 cursor-text"
              onClick={() => startEdit(item)}
              style={{
                color: item.is_completed ? 'var(--text-disabled)' : 'var(--text-primary)',
                textDecoration: item.is_completed ? 'line-through' : 'none',
              }}
            >
              {item.body}
            </span>
            <button
              onClick={() => deleteItem(item.id)}
              aria-label="삭제"
              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              style={{ color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    ))}
  </div>

  {/* 추가 입력 */}
  <div className="flex items-center gap-2 mt-2 pt-1">
    <input
      type="text"
      value={newItemBody}
      onChange={e => setNewItemBody(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') addItem() }}
      placeholder="액션 아이템 추가..."
      className="flex-1 text-sm py-2"
      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', borderRadius: 0 }}
    />
    <button
      onClick={addItem}
      disabled={addingItem || !newItemBody.trim()}
      className="text-xs font-semibold px-2.5 py-1 rounded-md disabled:opacity-30"
      style={{ background: 'transparent', color: 'var(--blue-600)', border: 'none', cursor: 'pointer', flexShrink: 0 }}
    >추가</button>
  </div>
</section>
```

- [ ] **Step 3: Typecheck**

Run: `bun run typecheck`
Expected: PASS. 미사용 import(`setActionItems` 등) 경고 없을 것 — 사용처 확인.

- [ ] **Step 4: Manual smoke (champion 전체 플로우)**

검증(빌드/실행 후, champion 계정):
1. 미팅 노트 [수정] → 편집 → 저장 → 반영.
2. 액션 아이템 추가 → 본문 클릭해 수정 → 저장 → 삭제(휴지통).
3. 완료 체크박스 토글 유지.
4. 타 champion 세션 직접 URL 접근 시 403(서버 가드).

- [ ] **Step 5: Commit**

```bash
git add components/sessions/ChampionSessionDetail.tsx
git commit -m "$(printf '%s\n' '[AX-1] feat(sessions): champion 액션 아이템 생성/수정/삭제 UI' '' 'Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## 최종 검증

- [ ] `bun run typecheck` — 전체 PASS
- [ ] `bun run test` — 전체 PASS (신규 session-permissions 포함)
- [ ] `bun run build` — 빌드 성공
- [ ] 수동: admin 회귀 없음 + champion 노트·액션 아이템 편집 동작 + 타 세션 403
