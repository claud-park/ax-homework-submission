# Admin 계정 분리 + 세션 동시성 가드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공유 admin 계정을 admin-alex/claud/jennifer 3개로 분리하는 스크립트를 제공하고, 같은 세션을 두 admin이 동시에 처리·수정할 때의 데이터 손상을 막는 핵심 가드를 추가한다.

**Architecture:** (1) `scripts/create-admins.ts` — service role로 3계정 생성/보정 + 기존 공유 계정 ban. 순수 설정 파싱은 분리해 단위 테스트. (2) `lib/sessions/lock.ts` — `processing_status` 조건부 UPDATE로 원자적 클레임, process/reprocess 라우트에서 사용해 in-flight면 409. (3) PATCH 세션에 `updated_at` 기반 낙관적 동시성 → notes 덮어쓰기 시 409. 클라이언트는 409 메시지 노출.

**Tech Stack:** Next.js App Router, Supabase (`@supabase/supabase-js`, service role), TypeScript, vitest, bun.

## Global Constraints

- 기계적 구현 작업 모델 하한: Sonnet(`claude-sonnet-4-6`).
- 민감값(비번 등) 하드코딩 금지 — 전부 env 주입. 로그에 비번 출력 금지.
- 앱 동작 변경 시 `bun run typecheck` · `bun run lint` 통과 필수.
- in-flight 상태값: `'uploading' | 'transcribing' | 'summarizing'` (정확히 이 세 개).
- 기존 공유 계정은 **삭제 아님** — ban + `is_admin=false`로 비활성화 (과거 `admin_user_id` FK 보존).
- 테스트 파일 위치: `test/lib/...`, 실행 `bun run test`.

---

### Task 1: create-admins 스크립트 — 설정 파싱 (순수 로직 + 테스트)

**Files:**
- Create: `lib/admin/adminConfig.ts`
- Test: `test/lib/admin-config.test.ts`

**Interfaces:**
- Produces:
  - `interface AdminAccountConfig { key: 'alex'|'claud'|'jennifer'; email: string; password: string; name: string }`
  - `interface AdminProvisionConfig { accounts: AdminAccountConfig[]; oldAdminEmail: string | null }`
  - `function parseAdminConfig(env: Record<string, string | undefined>): AdminProvisionConfig`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// test/lib/admin-config.test.ts
import { describe, it, expect } from 'vitest'
import { parseAdminConfig } from '@/lib/admin/adminConfig'

describe('parseAdminConfig', () => {
  it('완전한 env에서 3계정 + old admin을 파싱한다', () => {
    const cfg = parseAdminConfig({
      ADMIN_ALEX_EMAIL: 'alex@x.io', ADMIN_ALEX_PASSWORD: 'pw1',
      ADMIN_CLAUD_EMAIL: 'claud@x.io', ADMIN_CLAUD_PASSWORD: 'pw2',
      ADMIN_JENNIFER_EMAIL: 'jen@x.io', ADMIN_JENNIFER_PASSWORD: 'pw3',
      OLD_ADMIN_EMAIL: 'old@x.io',
    })
    expect(cfg.accounts).toHaveLength(3)
    expect(cfg.accounts[0]).toEqual({ key: 'alex', email: 'alex@x.io', password: 'pw1', name: 'Alex' })
    expect(cfg.accounts[2].name).toBe('Jennifer')
    expect(cfg.oldAdminEmail).toBe('old@x.io')
  })

  it('email/password 한쪽만 있으면 그 계정은 제외한다', () => {
    const cfg = parseAdminConfig({ ADMIN_ALEX_EMAIL: 'alex@x.io' })
    expect(cfg.accounts).toHaveLength(0)
    expect(cfg.oldAdminEmail).toBeNull()
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test test/lib/admin-config.test.ts`
Expected: FAIL — `parseAdminConfig` 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// lib/admin/adminConfig.ts
export interface AdminAccountConfig {
  key: 'alex' | 'claud' | 'jennifer'
  email: string
  password: string
  name: string
}
export interface AdminProvisionConfig {
  accounts: AdminAccountConfig[]
  oldAdminEmail: string | null
}

const SPECS: { key: AdminAccountConfig['key']; name: string; envPrefix: string }[] = [
  { key: 'alex', name: 'Alex', envPrefix: 'ADMIN_ALEX' },
  { key: 'claud', name: 'Claud', envPrefix: 'ADMIN_CLAUD' },
  { key: 'jennifer', name: 'Jennifer', envPrefix: 'ADMIN_JENNIFER' },
]

export function parseAdminConfig(env: Record<string, string | undefined>): AdminProvisionConfig {
  const accounts: AdminAccountConfig[] = []
  for (const spec of SPECS) {
    const email = env[`${spec.envPrefix}_EMAIL`]?.trim()
    const password = env[`${spec.envPrefix}_PASSWORD`]
    if (email && password) {
      accounts.push({ key: spec.key, email, password, name: spec.name })
    }
  }
  const oldAdminEmail = env.OLD_ADMIN_EMAIL?.trim() || null
  return { accounts, oldAdminEmail }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test test/lib/admin-config.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/admin/adminConfig.ts test/lib/admin-config.test.ts
git commit -m "[AX-1] feat(admin): admin 계정 프로비저닝 설정 파서"
```

---

### Task 2: create-admins 스크립트 — 실행부 (IO)

**Files:**
- Create: `scripts/create-admins.ts`
- Modify: `package.json` (scripts에 `create-admins` 추가)

**Interfaces:**
- Consumes: `parseAdminConfig`, `AdminProvisionConfig` (Task 1)
- Produces: `bun run create-admins` 실행 가능한 스크립트 (테스트 없음 — 외부 IO, 수동 검증)

- [ ] **Step 1: 스크립트 작성**

```ts
// scripts/create-admins.ts
import { createClient } from '@supabase/supabase-js'
import { parseAdminConfig } from '../lib/admin/adminConfig'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
    process.exit(1)
  }

  const { accounts, oldAdminEmail } = parseAdminConfig(process.env)
  if (accounts.length === 0) {
    console.warn('생성할 admin 계정 env가 없습니다. (ADMIN_<NAME>_EMAIL/_PASSWORD 확인)')
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  // helper: email으로 기존 유저 조회 (admin API는 페이지네이션, 소규모라 1페이지 가정)
  async function findUserByEmail(email: string) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error
    return data.users.find(u => u.email?.toLowerCase() === email.toLowerCase()) ?? null
  }

  for (const acc of accounts) {
    const existing = await findUserByEmail(acc.email)
    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        password: acc.password,
        user_metadata: { ...existing.user_metadata, is_admin: true, name: acc.name },
      })
      console.log(`updated: ${acc.email} (${acc.name})`)
    } else {
      const { error } = await supabase.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { is_admin: true, name: acc.name },
      })
      if (error) { console.error(`create 실패 ${acc.email}: ${error.message}`); continue }
      console.log(`created: ${acc.email} (${acc.name})`)
    }
  }

  if (oldAdminEmail) {
    const old = await findUserByEmail(oldAdminEmail)
    if (old) {
      await supabase.auth.admin.updateUserById(old.id, {
        ban_duration: '876000h', // ~100년: 사실상 영구 비활성화
        user_metadata: { ...old.user_metadata, is_admin: false },
      })
      console.log(`deactivated(old shared): ${oldAdminEmail}`)
    } else {
      console.warn(`OLD_ADMIN_EMAIL 계정을 찾지 못함: ${oldAdminEmail}`)
    }
  }

  console.log('done.')
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: package.json 스크립트 추가**

`"scripts"` 블록에 추가:

```json
    "create-admins": "bun --bun scripts/create-admins.ts",
```

- [ ] **Step 3: 타입체크**

Run: `bun run typecheck`
Expected: 통과 (에러 없음)

- [ ] **Step 4: 커밋**

```bash
git add scripts/create-admins.ts package.json
git commit -m "[AX-1] feat(admin): 3계정 생성 + 기존 공유계정 비활성화 스크립트"
```

> **운영 실행(코드 아님):** `.env`에 `ADMIN_ALEX_EMAIL/PASSWORD` 등 6개 + `OLD_ADMIN_EMAIL` 설정 후 `bun run create-admins` 실행. 멱등 — 재실행 안전.

---

### Task 3: 처리 락 헬퍼 (순수 로직 + 테스트)

**Files:**
- Create: `lib/sessions/lock.ts`
- Test: `test/lib/session-lock.test.ts`

**Interfaces:**
- Produces: `async function claimSessionForProcessing(supabase: SupabaseLike, sessionId: string): Promise<boolean>`
  - `type SupabaseLike = { from: (t: string) => any }`
  - 동작: `check_up_sessions`에서 `processing_status NOT IN (in-flight)`인 행을 `'transcribing'`으로 UPDATE, 영향 행 ≥1이면 `true`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// test/lib/session-lock.test.ts
import { describe, it, expect, vi } from 'vitest'
import { claimSessionForProcessing } from '@/lib/sessions/lock'

function fakeSupabase(returnedRows: { id: string }[]) {
  const select = vi.fn().mockResolvedValue({ data: returnedRows, error: null })
  const not = vi.fn(() => ({ select }))
  const eq = vi.fn(() => ({ not }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { client: { from }, spies: { from, update, eq, not, select } }
}

describe('claimSessionForProcessing', () => {
  it('영향 행이 있으면 true (클레임 성공)', async () => {
    const { client } = fakeSupabase([{ id: 's1' }])
    expect(await claimSessionForProcessing(client, 's1')).toBe(true)
  })
  it('영향 행이 없으면 false (이미 처리 중)', async () => {
    const { client } = fakeSupabase([])
    expect(await claimSessionForProcessing(client, 's1')).toBe(false)
  })
  it('in-flight 상태를 NOT IN으로 제외한다', async () => {
    const { client, spies } = fakeSupabase([{ id: 's1' }])
    await claimSessionForProcessing(client, 's1')
    expect(spies.not).toHaveBeenCalledWith('processing_status', 'in', '(uploading,transcribing,summarizing)')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test test/lib/session-lock.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 구현**

```ts
// lib/sessions/lock.ts
import type { SupabaseClient } from '@supabase/supabase-js'

const IN_FLIGHT = ['uploading', 'transcribing', 'summarizing'] as const

/**
 * 세션을 처리용으로 원자적 클레임. processing_status가 in-flight가 아닐 때만
 * 'transcribing'으로 전환하고 true 반환. 이미 다른 처리가 진행 중이면 false.
 */
export async function claimSessionForProcessing(
  supabase: Pick<SupabaseClient, 'from'>,
  sessionId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('check_up_sessions')
    .update({ processing_status: 'transcribing' })
    .eq('id', sessionId)
    .not('processing_status', 'in', `(${IN_FLIGHT.join(',')})`)
    .select('id')
  return (data?.length ?? 0) > 0
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test test/lib/session-lock.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/sessions/lock.ts test/lib/session-lock.test.ts
git commit -m "[AX-1] feat(sessions): 처리 락 헬퍼 (원자적 status 클레임)"
```

---

### Task 4: process / reprocess 라우트에 락 적용

**Files:**
- Modify: `app/api/sessions/[sessionId]/process/route.ts`
- Modify: `app/api/sessions/[sessionId]/reprocess/route.ts`

**Interfaces:**
- Consumes: `claimSessionForProcessing` (Task 3)

- [ ] **Step 1: process 라우트 수정**

`process/route.ts` 상단 import에 추가:

```ts
import { claimSessionForProcessing } from '@/lib/sessions/lock'
```

기존 `try {` 블록 시작부의 audio_file_path 업데이트 **직전**에 클레임을 넣는다. 즉 아래 블록을:

```ts
  try {
    await supabase
      .from('check_up_sessions')
      .update({ audio_file_path: audioPath, recording_duration_sec: recordingDurationSec })
      .eq('id', params.sessionId)

    const result = await processSessionAudio(supabase, params.sessionId, audioPath, recordingDurationSec)
    return NextResponse.json(result)
```

다음으로 교체:

```ts
  try {
    const claimed = await claimSessionForProcessing(supabase, params.sessionId)
    if (!claimed) {
      return NextResponse.json(
        { error: '이미 처리 중인 세션입니다. 잠시 후 다시 시도하세요.' },
        { status: 409 }
      )
    }

    await supabase
      .from('check_up_sessions')
      .update({ audio_file_path: audioPath, recording_duration_sec: recordingDurationSec })
      .eq('id', params.sessionId)

    const result = await processSessionAudio(supabase, params.sessionId, audioPath, recordingDurationSec)
    return NextResponse.json(result)
```

- [ ] **Step 2: reprocess 라우트 수정**

`reprocess/route.ts` 상단 import에 추가:

```ts
import { claimSessionForProcessing } from '@/lib/sessions/lock'
```

기존 `try {` 내부의 `const durationSec = ...` **직전**에 클레임 추가:

```ts
  try {
    const claimed = await claimSessionForProcessing(supabase, params.sessionId)
    if (!claimed) {
      return NextResponse.json(
        { error: '이미 처리 중인 세션입니다. 잠시 후 다시 시도하세요.' },
        { status: 409 }
      )
    }

    const durationSec = session.recording_duration_sec ?? 0
    const result = await processSessionAudio(supabase, params.sessionId, session.audio_file_path, durationSec)
    return NextResponse.json(result)
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `bun run typecheck && bun run lint`
Expected: 통과 (변경 파일 신규 경고 없음)

- [ ] **Step 4: 커밋**

```bash
git add app/api/sessions/[sessionId]/process/route.ts app/api/sessions/[sessionId]/reprocess/route.ts
git commit -m "[AX-1] feat(sessions): process/reprocess 중복 처리 락 (409)"
```

---

### Task 5: notes 낙관적 동시성 (PATCH 라우트)

**Files:**
- Modify: `app/api/sessions/[sessionId]/route.ts:55-76` (PATCH 핸들러)

**Interfaces:**
- Produces: PATCH가 body의 `expectedUpdatedAt`(선택)을 받으면 `updated_at` 일치 시에만 수정, 불일치 시 409.

- [ ] **Step 1: PATCH 핸들러 교체**

기존 PATCH 본문(`const body = await req.json()` ~ `return NextResponse.json(data)`)을 다음으로 교체:

```ts
  const body = await req.json()
  const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null
  const allowed = ['title', 'notes', 'session_date'] as const
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const supabase = createServiceClient()
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
        { error: '다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
  return NextResponse.json(data[0])
```

- [ ] **Step 2: 타입체크**

Run: `bun run typecheck`
Expected: 통과

- [ ] **Step 3: 커밋**

```bash
git add app/api/sessions/[sessionId]/route.ts
git commit -m "[AX-1] feat(sessions): notes 저장 낙관적 동시성 (updated_at, 409)"
```

---

### Task 6: 클라이언트 — saveNotes 동시성 처리

**Files:**
- Modify: `components/sessions/AdminSessionDetail.tsx:59-68` (saveNotes)

**Interfaces:**
- Consumes: PATCH의 `expectedUpdatedAt` 계약 (Task 5). `session.updated_at` 사용.

- [ ] **Step 1: saveNotes 교체**

기존 `saveNotes`를 다음으로 교체:

```ts
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
    } catch (e) {
      // 409 등 서버 메시지를 그대로 노출하고 최신 데이터로 갱신
      toast.error(e instanceof Error ? e.message : '저장 실패')
      load()
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `bun run typecheck && bun run lint`
Expected: 통과 (해당 파일 신규 경고 없음)

- [ ] **Step 3: 전체 테스트**

Run: `bun run test`
Expected: 기존 + 신규 테스트 모두 PASS

- [ ] **Step 4: 커밋**

```bash
git add components/sessions/AdminSessionDetail.tsx
git commit -m "[AX-1] feat(sessions): notes 저장 충돌(409) 사용자 안내 + 리로드"
```

---

## 운영/한계 메모

- 스크립트 실행 후 3명에게 계정/비번 전달, 기존 공유 비번 폐기.
- 과거 세션 `admin_user_id`는 공유 계정 UUID로 남음(소급 분리 불가) — 신규 세션부터 개별 귀속.
- 처리 락 한계: 처리 중 프로세스가 비정상 종료되면 `processing_status`가 `'transcribing'`에 멈춰 해당 세션 재처리가 막힐 수 있음(기존에도 존재하던 리스크). 필요 시 운영자가 DB에서 상태를 `'error'`/`'idle'`로 리셋. 자동 타임아웃 해제는 범위 밖.
