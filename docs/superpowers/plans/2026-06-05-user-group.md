# User Group Permission Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Champion-view 사용자를 `champion` / `partner` / `admin` 세 그룹으로 구분하고, `champion`에게만 과제 추적을 적용하며, admin이 그룹을 변경할 수 있는 "유저 권한 관리" 페이지를 추가한다.

**Architecture:** `users` 테이블에 `user_group TEXT DEFAULT 'champion'` 컬럼을 추가한다. `admin` 그룹은 Supabase Auth `user_metadata.is_admin`에서 런타임 파생 (DB 저장 안 함). 새 admin API 2개(`GET/PATCH /api/admin/users/[userId]`)를 추가하고, 챔피언 목록 API 2개에 `user_group = 'champion'` 필터를 추가한다. Admin 사이드바에 메뉴를 추가하고 `/admin/users` 페이지를 신규 생성한다.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (PostgreSQL + Auth Admin API), React (useState/useEffect), Tailwind CSS / inline styles (기존 admin 페이지 패턴 동일)

---

### Task 1: Supabase migration — `users.user_group` 컬럼 추가

**Files:**
- Create: `supabase/migrations/20260605000000_add_user_group.sql`

---

- [ ] **Step 1: migration 파일 작성**

```sql
-- supabase/migrations/20260605000000_add_user_group.sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS user_group TEXT NOT NULL DEFAULT 'champion'
  CHECK (user_group IN ('champion', 'partner'));

COMMENT ON COLUMN public.users.user_group IS
  'champion = 과제 추적 대상 | partner = 과제 불필요. admin 여부는 auth.users.user_metadata.is_admin 에서 파생.';
```

- [ ] **Step 2: 로컬 Supabase에 migration 적용 (또는 Supabase Dashboard SQL Editor에서 직접 실행)**

```bash
# Option A — Supabase CLI가 설정된 경우:
supabase db push

# Option B — Supabase Dashboard > SQL Editor에서 아래 SQL 직접 실행:
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS user_group TEXT NOT NULL DEFAULT 'champion'
  CHECK (user_group IN ('champion', 'partner'));
```

예상 결과: 에러 없이 완료. 기존 users rows 전체에 `user_group = 'champion'` 자동 적용됨.

- [ ] **Step 3: TypeScript 타입 확인 후 커밋**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
npx tsc --noEmit
```

에러 없으면:

```bash
git add supabase/migrations/20260605000000_add_user_group.sql
git commit -m "[AX-1] feat: users.user_group 컬럼 추가 (champion/partner)"
```

---

### Task 2: `lib/types.ts` — `UserGroup` 타입 추가

**Files:**
- Modify: `lib/types.ts`

---

- [ ] **Step 1: `UserGroup` 타입과 `UserManagementEntry` 인터페이스 추가**

`lib/types.ts` 파일 끝에 추가:

```ts
// ─── User Group ──────────────────────────────────────────────────────────────

export type UserGroup = 'champion' | 'partner' | 'admin'

export interface UserManagementEntry {
  id: string
  name: string
  displayName: string
  department: string
  email: string
  userGroup: UserGroup
  createdAt: string
}
```

- [ ] **Step 2: TypeScript 빌드 확인 후 커밋**

```bash
npx tsc --noEmit
git add lib/types.ts
git commit -m "[AX-1] feat: UserGroup 타입 및 UserManagementEntry 인터페이스 추가"
```

---

### Task 3: `GET /api/admin/users` — 전체 유저 목록 API

**Files:**
- Create: `app/api/admin/users/route.ts`

---

이 API는 `users` 테이블과 Supabase Auth Admin API를 조인해 모든 champion-view 사용자 + `is_admin` 여부를 반환한다.

- [ ] **Step 1: route 파일 생성**

```ts
// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import type { UserManagementEntry } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const [
    { data: users, error: usersErr },
    { data: authData, error: authErr },
  ] = await Promise.all([
    supabase.from('users').select('id, name, user_group, created_at').order('created_at', { ascending: true }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ])

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const authMap = new Map<string, { email: string; isAdmin: boolean }>()
  for (const u of authData.users) {
    authMap.set(u.id, {
      email: u.email ?? '',
      isAdmin: !!u.user_metadata?.is_admin,
    })
  }

  const result: UserManagementEntry[] = (users ?? []).map(u => {
    const auth = authMap.get(u.id)
    const { displayName, department } = parseName(u.name)
    return {
      id: u.id,
      name: u.name,
      displayName,
      department,
      email: auth?.email ?? '',
      userGroup: auth?.isAdmin ? 'admin' : (u.user_group as 'champion' | 'partner'),
      createdAt: u.created_at,
    }
  })

  return NextResponse.json(result)
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

```bash
npx tsc --noEmit
```

에러 없으면 계속.

- [ ] **Step 3: 커밋**

```bash
git add app/api/admin/users/route.ts
git commit -m "[AX-1] feat: GET /api/admin/users — 유저 목록 (user_group + is_admin 조합)"
```

---

### Task 4: `PATCH /api/admin/users/[userId]` — 그룹 변경 API

**Files:**
- Create: `app/api/admin/users/[userId]/route.ts`

---

- [ ] **Step 1: route 파일 생성**

```ts
// app/api/admin/users/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = params
  const body = await req.json() as { userGroup: string }
  const { userGroup } = body

  if (!['champion', 'partner'].includes(userGroup)) {
    return NextResponse.json(
      { error: 'admin 그룹은 이 API로 변경할 수 없습니다' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  // is_admin 유저는 변경 불가
  const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(userId)
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })
  if (authUser.user?.user_metadata?.is_admin) {
    return NextResponse.json(
      { error: 'admin 유저의 그룹은 변경할 수 없습니다' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('users')
    .update({ user_group: userGroup })
    .eq('id', userId)
    .select('id, name, user_group')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 2: TypeScript 빌드 확인 후 커밋**

```bash
npx tsc --noEmit
git add "app/api/admin/users/[userId]/route.ts"
git commit -m "[AX-1] feat: PATCH /api/admin/users/[userId] — user_group 변경"
```

---

### Task 5: 챔피언 목록 / Gantt API에 `user_group = 'champion'` 필터 추가

**Files:**
- Modify: `app/api/champions/route.ts` (line 25)
- Modify: `app/api/champions/gantt/route.ts` (line 37)

---

- [ ] **Step 1: `app/api/champions/route.ts` 수정**

line 25의 users 쿼리를:
```ts
supabase.from('users').select('id, name'),
```

아래로 변경:
```ts
supabase.from('users').select('id, name').eq('user_group', 'champion'),
```

- [ ] **Step 2: `app/api/champions/gantt/route.ts` 수정**

line 37의 users 쿼리를:
```ts
supabase.from('users').select('id, name'),
```

아래로 변경:
```ts
supabase.from('users').select('id, name').eq('user_group', 'champion'),
```

- [ ] **Step 3: TypeScript 빌드 확인 후 커밋**

```bash
npx tsc --noEmit
git add app/api/champions/route.ts app/api/champions/gantt/route.ts
git commit -m "[AX-1] feat: 챔피언 리스트/Gantt API — champion 그룹만 반환"
```

---

### Task 6: Admin 사이드바에 "유저 권한 관리" 메뉴 추가

**Files:**
- Modify: `app/admin/layout.tsx` (line 7, NAV 배열 ~line 12)

---

- [ ] **Step 1: import에 `UserCog` 추가**

`app/admin/layout.tsx` 상단 import 줄을 수정:

```ts
// Before:
import { LayoutDashboard, Layers, AlertTriangle, FileText, BarChart2, LogOut, Menu, X, Users } from 'lucide-react'

// After:
import { LayoutDashboard, Layers, AlertTriangle, FileText, BarChart2, LogOut, Menu, X, Users, UserCog } from 'lucide-react'
```

- [ ] **Step 2: NAV 배열에 항목 추가**

```ts
// Before:
const NAV = [
  { icon: LayoutDashboard, label: '대시보드', href: '/admin' },
  { icon: Users, label: '챔피언 리스트', href: '/admin/champions' },
  { icon: Layers, label: '제출 현황', href: '/admin/kanban' },
  { icon: AlertTriangle, label: '지연 신고', href: '/admin/delay-reports' },
  { icon: FileText, label: '주간 리포트', href: '/admin/reports' },
]

// After:
const NAV = [
  { icon: LayoutDashboard, label: '대시보드', href: '/admin' },
  { icon: Users, label: '챔피언 리스트', href: '/admin/champions' },
  { icon: UserCog, label: '유저 권한 관리', href: '/admin/users' },
  { icon: Layers, label: '제출 현황', href: '/admin/kanban' },
  { icon: AlertTriangle, label: '지연 신고', href: '/admin/delay-reports' },
  { icon: FileText, label: '주간 리포트', href: '/admin/reports' },
]
```

- [ ] **Step 3: TypeScript 빌드 확인 후 커밋**

```bash
npx tsc --noEmit
git add app/admin/layout.tsx
git commit -m "[AX-1] feat: admin 사이드바에 '유저 권한 관리' 메뉴 추가"
```

---

### Task 7: `/admin/users` 페이지 — 유저 권한 관리 UI

**Files:**
- Create: `app/admin/users/page.tsx`

---

이 페이지는 전체 champion-view 사용자를 테이블로 표시하고, `champion` ↔ `partner` 드롭다운으로 즉시 변경할 수 있다. `admin` 그룹 사용자는 배지만 표시하고 드롭다운 비활성화.

- [ ] **Step 1: 페이지 파일 생성**

```tsx
// app/admin/users/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { UserGroup, UserManagementEntry } from '@/lib/types'

const GROUP_LABEL: Record<UserGroup, string> = {
  champion: 'CHAMPION',
  partner: 'PARTNER',
  admin: 'ADMIN',
}

const GROUP_COLOR: Record<UserGroup, { bg: string; color: string }> = {
  champion: { bg: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' },
  partner:  { bg: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' },
  admin:    { bg: 'rgba(124,58,237,0.1)', color: '#7c3aed' },
}

function GroupBadge({ group }: { group: UserGroup }) {
  const style = GROUP_COLOR[group]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: style.bg, color: style.color, letterSpacing: '0.04em',
    }}>
      {GROUP_LABEL[group]}
    </span>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserManagementEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [changing, setChanging] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<UserManagementEntry[]>('/api/admin/users')
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleGroupChange(userId: string, newGroup: 'champion' | 'partner') {
    setChanging(userId)
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ userGroup: newGroup }),
      })
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, userGroup: newGroup } : u
      ))
    } catch (e) {
      console.error(e)
    } finally {
      setChanging(null)
    }
  }

  const thStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-secondary)', textAlign: 'left',
    borderBottom: '1px solid var(--border-subtle)',
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    padding: '10px 12px', fontSize: 13,
    borderBottom: '1px solid var(--border-faint)',
    color: 'var(--text-primary)',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>유저 권한 관리</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Champion view에 가입한 전체 사용자. champion 그룹만 과제 추적 대상입니다.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : (
        <div style={{
          border: '1px solid var(--border-subtle)', borderRadius: 8,
          background: 'var(--surface-primary)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-secondary)' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>부서</th>
                <th style={thStyle}>이메일</th>
                <th style={thStyle}>가입일</th>
                <th style={thStyle}>권한</th>
                <th style={thStyle}>변경</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isAdmin = u.userGroup === 'admin'
                const isChanging = changing === u.id
                return (
                  <tr key={u.id} style={{ background: 'var(--background)' }}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{u.displayName}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>{u.department || '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>{u.email}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>
                      {new Date(u.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </td>
                    <td style={tdStyle}><GroupBadge group={u.userGroup} /></td>
                    <td style={tdStyle}>
                      {isAdmin ? (
                        <span style={{ fontSize: 12, color: 'var(--text-disabled)' }}>변경 불가</span>
                      ) : (
                        <select
                          value={u.userGroup}
                          disabled={isChanging}
                          onChange={e => handleGroupChange(u.id, e.target.value as 'champion' | 'partner')}
                          style={{
                            fontSize: 12, padding: '3px 6px', borderRadius: 4,
                            border: '1px solid var(--border)', background: 'var(--surface-primary)',
                            color: 'var(--text-primary)', cursor: isChanging ? 'not-allowed' : 'pointer',
                            opacity: isChanging ? 0.5 : 1,
                          }}
                        >
                          <option value="champion">champion</option>
                          <option value="partner">partner</option>
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-disabled)', padding: '32px' }}>
                    사용자가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 빌드 확인**

```bash
npx tsc --noEmit
```

에러 없으면 계속.

- [ ] **Step 3: 커밋**

```bash
git add app/admin/users/page.tsx
git commit -m "[AX-1] feat: /admin/users — 유저 권한 관리 페이지"
```

---

### Task 8: 문서 업데이트 — ERD + PRD-KO

**Files:**
- Modify: `docs/ERD.md`
- Modify: `docs/PRD-KO.md`

---

- [ ] **Step 1: `docs/ERD.md` 업데이트**

`users` 테이블 표에 `user_group` 행을 추가한다:

```markdown
<!-- 기존 users 테이블 -->
| Column | Type | Notes |
|---|---|---|
| 🔑 id | uuid PK | = Supabase auth.users.id |
| email | text | from Google OAuth |
| name | text | from Google OAuth |
| avatar_url | text | from Google OAuth |
| created_at | timestamptz | |
| user_group | text | `champion`(default) \| `partner` — CHECK constraint. `admin`은 `auth.users.user_metadata.is_admin`에서 런타임 파생 |
```

또한 ERD 상단 버전 주석을 업데이트:
```markdown
# Entity Relationship Diagram — v4
> ax-homework-submission · Supabase PostgreSQL · Updated 2026-06-05
```

- [ ] **Step 2: `docs/PRD-KO.md` 업데이트**

**2.1 페르소나 섹션** (`## 2. 대상 사용자` 아래) 에 `파트너` 페르소나를 추가한다:

```markdown
### 2.3 페르소나 C — 파트너 (참관자·협력자)

| 항목 | 내용 |
|---|---|
| 목표 | AX 프로그램 현황 파악 및 협력 |
| 특징 | 과제 제출 의무 없음. 챔피언뷰 로그인 가능하나 과제 추적 대상에서 제외 |
| 주요 행동 | 로그인 후 자체 일정 관리 (옵션) |
```

**진척도 테이블** (`### 현재 진척도`) 에 새 항목 추가:

```markdown
| 유저 그룹 권한 관리 (champion/partner/admin) | ✅ 완료 |
```

전체 기능 완성도 업데이트: `17개 영역 중 17개 완료 (100%)` → 또는 진척도 카운트에 맞게 조정.

- [ ] **Step 3: 커밋**

```bash
git add docs/ERD.md docs/PRD-KO.md
git commit -m "[AX-1] docs: ERD v4 + PRD — user_group 컬럼 및 파트너 페르소나 반영"
```

---

### Task 9: 수동 검증

- [ ] **Step 1: TypeScript 최종 빌드 확인**

```bash
npx tsc --noEmit
```

에러 없어야 함.

- [ ] **Step 2: 로컬 서버 기동 후 시나리오 검증**

```bash
bun run dev
```

**시나리오 1 — 유저 권한 관리 페이지:**
1. `/admin` 로그인 → 사이드바에 "유저 권한 관리" 메뉴 확인
2. `/admin/users` 진입 → 전체 사용자 테이블 렌더링 확인
3. admin 유저: 배지 `ADMIN` + "변경 불가" 텍스트 확인 (드롭다운 없음)
4. champion 유저: 드롭다운에서 `partner`로 변경 → 즉시 배지 `PARTNER`로 바뀌는지 확인
5. 같은 사용자를 다시 `champion`으로 변경 → DB에 반영되는지 확인

**시나리오 2 — 챔피언 리스트/대시보드 필터링:**
1. partner로 변경한 사용자가 `/admin/champions` 리스트에서 **사라지는지** 확인
2. `/admin` 대시보드 Gantt에서도 해당 사용자 **사라지는지** 확인
3. 다시 champion으로 변경 → 두 페이지에 **다시 등장하는지** 확인

**시나리오 3 — PATCH 에러 케이스:**
- 브라우저 개발자 도구 또는 curl로 `PATCH /api/admin/users/{adminUserId}` 시도 → 400 응답 확인

- [ ] **Step 3: 최종 커밋 (변경사항이 있을 경우)**

```bash
git add -A
git commit -m "[AX-1] chore: user group 기능 검증 완료"
```
