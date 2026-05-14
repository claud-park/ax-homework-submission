# AX Homework Submission — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-layer web app — homework submission/review layer + project management layer (charter, WBS, Gantt) — with strict server-side-only DB access via Next.js API routes and Supabase.

**Architecture:** Next.js 14 App Router (all pages CSR via `'use client'`). Browser holds only a Supabase Auth JWT; all DB/storage operations go through Next.js API routes that use the Supabase service key. RLS is DENY ALL on all tables as a backstop.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (Auth + PostgreSQL + Storage), @supabase/ssr, TipTap, react-markdown, gantt-task-react, @dnd-kit/core + @dnd-kit/sortable, jsPDF + html2canvas, docx + file-saver.

---

## File Map

```
ax-homework-submission/
├── .env.local.example
├── middleware.ts
├── next.config.ts
├── tailwind.config.ts
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── lib/
│   ├── types.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── auth.ts
│   └── api-client.ts
└── app/
    ├── globals.css
    ├── layout.tsx                        (root — Pretendard font)
    ├── login/
    │   └── page.tsx
    ├── auth/
    │   └── callback/
    │       └── route.ts
    ├── (champion)/
    │   ├── layout.tsx                    (sidebar nav)
    │   ├── page.tsx                      (homework list + board toggle)
    │   ├── homework/
    │   │   └── [id]/
    │   │       └── page.tsx
    │   ├── charter/
    │   │   └── page.tsx
    │   ├── milestones/
    │   │   └── page.tsx
    │   └── progress/
    │       └── page.tsx
    ├── admin/
    │   ├── login/
    │   │   └── page.tsx
    │   ├── layout.tsx                    (admin sidebar nav)
    │   ├── page.tsx                      (dashboard)
    │   ├── homework/
    │   │   ├── new/
    │   │   │   └── page.tsx
    │   │   └── [id]/
    │   │       ├── page.tsx
    │   │       └── [userId]/
    │   │           └── page.tsx
    │   ├── kanban/
    │   │   └── page.tsx
    │   ├── progress/
    │   │   └── page.tsx
    │   ├── requests/
    │   │   └── page.tsx
    │   └── reports/
    │       └── page.tsx
    └── api/
        ├── auth/
        │   └── callback/
        │       └── route.ts
        ├── homeworks/
        │   ├── route.ts
        │   └── [id]/
        │       └── route.ts
        ├── submissions/
        │   ├── route.ts
        │   └── mine/
        │       ├── route.ts
        │       └── [homeworkId]/
        │           └── route.ts
        ├── charter/
        │   └── route.ts
        ├── milestones/
        │   ├── route.ts
        │   └── [id]/
        │       ├── route.ts
        │       └── deliverables/
        │           └── route.ts
        ├── deadline-requests/
        │   └── route.ts
        └── admin/
            ├── homeworks/
            │   ├── route.ts
            │   └── [id]/
            │       └── submissions/
            │           ├── route.ts
            │           └── [userId]/
            │               └── route.ts
            ├── submissions/
            │   └── [id]/
            │       ├── route.ts
            │       └── comments/
            │           └── route.ts
            ├── kanban/
            │   └── route.ts
            ├── storage/
            │   └── [submissionId]/
            │       └── download/
            │           └── route.ts
            ├── milestones/
            │   └── route.ts
            ├── deadline-requests/
            │   ├── route.ts
            │   └── [id]/
            │       └── route.ts
            └── reports/
                └── [weekNumber]/
                    └── route.ts
```

---

### Task 1: Initialize Project + Install Dependencies

**Files:**
- Create: `package.json` (via npx)
- Create: `next.config.ts`

- [ ] **Step 1: Scaffold Next.js project**

```bash
npx create-next-app@latest ax-homework-submission \
  --typescript --tailwind --eslint --app --src-dir=no \
  --import-alias="@/*"
cd ax-homework-submission
```

- [ ] **Step 2: Install all dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr \
  @tiptap/react @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-underline @tiptap/extension-text-align \
  react-markdown \
  gantt-task-react \
  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities \
  jspdf html2canvas \
  docx file-saver \
  dompurify
npm install --save-dev @types/dompurify @types/file-saver
```

- [ ] **Step 3: Update `next.config.ts`**

```typescript
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  images: { domains: ['lh3.googleusercontent.com'] },
}
export default nextConfig
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: initialize Next.js 14 project with all dependencies"
```

---

### Task 2: Database Schema + Storage Buckets

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type submission_status as enum ('pending', 'accepted', 'declined');
create type milestone_status as enum ('not_started', 'in_progress', 'completed', 'delayed');
create type request_status as enum ('pending', 'approved', 'rejected');

-- ============================================================
-- TABLES
-- ============================================================

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table homeworks (
  id serial primary key,
  title text not null,
  description text,
  due_date date not null,
  created_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  homework_id int not null references homeworks(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  status submission_status not null default 'pending',
  attempt_number int not null default 1,
  submitted_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default uuid_generate_v4(),
  submission_id uuid not null references submissions(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table project_charters (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references users(id) on delete cascade,
  project_name text,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  week_number int not null,
  title text not null,
  description text,
  start_date date not null,
  due_date date not null,
  status milestone_status not null default 'not_started',
  is_manual_progress boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table milestone_deliverables (
  id uuid primary key default uuid_generate_v4(),
  milestone_id uuid not null references milestones(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_at timestamptz not null default now()
);

create table deadline_change_requests (
  id uuid primary key default uuid_generate_v4(),
  milestone_id uuid not null references milestones(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  original_due_date date not null,
  requested_due_date date not null,
  reason text not null,
  status request_status not null default 'pending',
  reviewed_by uuid references users(id),
  support_assignee uuid references users(id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS — DENY ALL (service key bypasses RLS)
-- ============================================================
alter table users enable row level security;
alter table homeworks enable row level security;
alter table submissions enable row level security;
alter table comments enable row level security;
alter table project_charters enable row level security;
alter table milestones enable row level security;
alter table milestone_deliverables enable row level security;
alter table deadline_change_requests enable row level security;
-- No policies created: all direct client access denied

-- ============================================================
-- STORAGE BUCKETS (run in Supabase dashboard or via API)
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('submissions', 'submissions', false);
-- insert into storage.buckets (id, name, public) values ('milestone-deliverables', 'milestone-deliverables', false);
-- Storage RLS: deny all policies (no policies = deny by default for private buckets)
```

- [ ] **Step 2: Apply migration via Supabase dashboard**

Paste the SQL into the Supabase SQL Editor and run. Create the two storage buckets manually in the Storage tab with **public = false**.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema with RLS deny-all"
```

---

### Task 3: Core Library Files

**Files:**
- Create: `lib/types.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/auth.ts`
- Create: `lib/api-client.ts`

- [ ] **Step 1: Create `.env.local.example`**

```bash
cat > .env.local.example << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
EOF
```

Copy to `.env.local` and fill in real values from Supabase project settings.

- [ ] **Step 2: Create `lib/types.ts`**

```typescript
export type SubmissionStatus = 'pending' | 'accepted' | 'declined'
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface Homework {
  id: number
  title: string
  description: string | null
  due_date: string
  created_at: string
}

export interface Submission {
  id: string
  user_id: string
  homework_id: number
  file_path: string
  file_name: string
  status: SubmissionStatus
  attempt_number: number
  submitted_at: string
  comments?: Comment[]
  user?: User
}

export interface Comment {
  id: string
  submission_id: string
  body: string
  created_at: string
}

export interface ProjectCharter {
  id: string
  user_id: string
  project_name: string | null
  content: {
    problem_definition?: string
    goal?: string
    scope_in?: string
    scope_out?: string
    expected_outcomes?: string
    risks?: string
  }
  updated_at: string
  created_at: string
}

export interface Milestone {
  id: string
  user_id: string
  week_number: number
  title: string
  description: string | null
  start_date: string
  due_date: string
  status: MilestoneStatus
  is_manual_progress: boolean
  display_order: number
  created_at: string
  updated_at: string
  deliverables?: MilestoneDeliverable[]
}

export interface MilestoneDeliverable {
  id: string
  milestone_id: string
  file_path: string
  file_name: string
  uploaded_at: string
}

export interface DeadlineChangeRequest {
  id: string
  milestone_id: string
  user_id: string
  original_due_date: string
  requested_due_date: string
  reason: string
  status: RequestStatus
  reviewed_by: string | null
  support_assignee: string | null
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  milestone?: Milestone
  user?: User
}

export interface HomeworkWithCount extends Homework {
  submission_count: number
  user_count: number
}

export interface KanbanData {
  pending: (Submission & { user: User })[]
  accepted: (Submission & { user: User })[]
  declined: (Submission & { user: User })[]
  not_submitted: User[]
}
```

- [ ] **Step 3: Create `lib/supabase/server.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

- [ ] **Step 4: Create `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 5: Create `lib/auth.ts`**

```typescript
import { createServiceClient } from './supabase/server'
import { NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

export async function verifyJWT(req: NextRequest): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const supabase = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser(token)
  return user ?? null
}

export async function verifyAdmin(req: NextRequest): Promise<User | null> {
  const user = await verifyJWT(req)
  if (!user?.user_metadata?.is_admin) return null
  return user
}
```

- [ ] **Step 6: Create `lib/api-client.ts`**

```typescript
import { createSupabaseBrowserClient } from './supabase/client'

const supabase = createSupabaseBrowserClient()

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return session.access_token
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'API error')
  }
  return res.json()
}

export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  const token = await getToken()
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'Upload error')
  }
  return res.json()
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/ .env.local.example
git commit -m "feat: add core lib types, supabase clients, auth helpers, api-client"
```

---

### Task 4: Tailwind Config + Global CSS + Root Layout

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        'surface-primary': 'var(--surface-primary)',
        'surface-secondary': 'var(--surface-secondary)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-disabled': 'var(--text-disabled)',
        'blue-accent': 'var(--blue-600)',
        'border-subtle': 'var(--border-subtle)',
        error: 'var(--error)',
        success: 'var(--success)',
      },
      fontFamily: {
        sans: ['Pretendard', 'Apple SD Gothic Neo', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 2: Replace `app/globals.css`**

```css
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #141414;
  --surface-primary: #1a1a1a;
  --surface-secondary: #111111;
  --text-primary: #f5f5f5;
  --text-secondary: #888888;
  --text-disabled: #555555;
  --blue-600: #2563eb;
  --border-subtle: #2a2a2a;
  --error: #f87171;
  --success: #4ade80;
  --amber: #fbbf24;
}

* { box-sizing: border-box; }
html, body { background: var(--background); color: var(--text-primary); font-family: Pretendard, 'Apple SD Gothic Neo', system-ui, sans-serif; }
```

- [ ] **Step 3: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AX Homework',
  description: 'AX Homework Submission System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.ts app/globals.css app/layout.tsx
git commit -m "feat: add FLO design system tokens, Pretendard font, root layout"
```

---

### Task 5: Middleware + Route Protection

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Already-authenticated redirects for login pages
  if (path === '/login' && user && !user.user_metadata?.is_admin)
    return NextResponse.redirect(new URL('/', request.url))
  if (path === '/admin/login' && user?.user_metadata?.is_admin)
    return NextResponse.redirect(new URL('/admin', request.url))

  // Protect champion routes
  const championRoutes = ['/', '/homework', '/charter', '/milestones', '/progress']
  const isChampionRoute = championRoutes.some(r => path === r || path.startsWith(r + '/'))
  if (isChampionRoute && !user)
    return NextResponse.redirect(new URL('/login', request.url))

  // Protect admin routes
  if (path.startsWith('/admin') && !path.startsWith('/admin/login')) {
    if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))
    if (!user.user_metadata?.is_admin)
      return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add middleware route protection for champion and admin routes"
```

---

### Task 6: Champion Login Page + OAuth Callback

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Create `app/login/page.tsx`**

```tsx
'use client'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient()

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>AX Homework</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>챔피언 로그인</p>
        <button
          onClick={handleGoogleLogin}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ background: 'var(--blue-600)', color: '#fff' }}
        >
          Google로 계속하기
        </button>
        <p className="text-center mt-6 text-xs" style={{ color: 'var(--text-disabled)' }}>
          관리자는 <a href="/admin/login" style={{ color: 'var(--blue-600)' }}>여기서 로그인</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/auth/callback/route.ts`**

```typescript
import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/login?error=no_code`)

  const supabase = createServiceClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  const user = data.user
  await supabase.from('users').upsert({
    id: user.id,
    email: user.email ?? '',
    name: user.user_metadata?.full_name ?? user.email ?? '',
    avatar_url: user.user_metadata?.avatar_url ?? null,
  }, { onConflict: 'id' })

  return NextResponse.redirect(`${origin}/`)
}
```

- [ ] **Step 3: Enable Google OAuth in Supabase**

In Supabase dashboard → Authentication → Providers → Google: enable and add Client ID + Secret from Google Cloud Console. Add `{origin}/auth/callback` to the allowed redirect URLs.

- [ ] **Step 4: Commit**

```bash
git add app/login/ app/auth/
git commit -m "feat: add champion Google OAuth login and callback route"
```

---

### Task 7: Admin Login Page

**Files:**
- Create: `app/admin/login/page.tsx`

- [ ] **Step 1: Create `app/admin/login/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError || !data.user?.user_metadata?.is_admin) {
      setError('관리자 계정이 아니거나 비밀번호가 틀렸습니다.')
      await supabase.auth.signOut()
      return
    }
    router.push('/admin')
  }

  const inputStyle = {
    background: 'var(--surface-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>관리자 로그인</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>AX Homework Admin</p>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="py-3 rounded-xl font-semibold text-sm mt-2 disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Provision admin account**

In Supabase dashboard → Authentication → Users → "Add user". After creating, run in SQL editor:

```sql
update auth.users
set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{is_admin}', 'true')
where email = 'admin@example.com';
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/login/
git commit -m "feat: add admin email/password login page"
```

---

### Task 8: Champion Layout (Sidebar Nav)

**Files:**
- Create: `app/(champion)/layout.tsx`

- [ ] **Step 1: Create champion layout with sidebar**

```tsx
'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const NAV = [
  { label: '📋 과제', href: '/' },
  { label: '📄 제정의서', href: '/charter' },
  { label: '📅 WBS', href: '/milestones' },
  { label: '📊 진척도', href: '/progress' },
]

export default function ChampionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--background)' }}>
      <aside className="w-44 flex-shrink-0 flex flex-col gap-1 p-4 border-r" style={{ background: 'var(--background)', borderColor: 'var(--border-subtle)' }}>
        <span className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>AX Homework</span>
        {NAV.map(item => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              className="text-xs px-3 py-2 rounded-lg font-medium transition-colors"
              style={{
                background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: active ? '#7dd3fc' : 'var(--text-secondary)',
              }}
            >
              {item.label}
            </a>
          )
        })}
        <div className="mt-auto">
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-2 rounded-lg w-full text-left"
            style={{ color: 'var(--text-disabled)' }}
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(champion\)/
git commit -m "feat: add champion sidebar layout"
```

---

### Task 9: Homework List API + Page (List + Board Toggle)

**Files:**
- Create: `app/api/homeworks/route.ts`
- Create: `app/api/submissions/mine/route.ts`
- Create: `app/(champion)/page.tsx`

- [ ] **Step 1: Create `app/api/homeworks/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .select('*')
    .order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create `app/api/submissions/mine/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*, comments(*)')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create `app/(champion)/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Homework, Submission, SubmissionStatus } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}
const BOARD_COLS: { key: SubmissionStatus | 'none'; label: string }[] = [
  { key: 'none', label: '미제출' },
  { key: 'pending', label: '검토 중' },
  { key: 'accepted', label: '합격' },
  { key: 'declined', label: '불합격' },
]

export default function HomeworkListPage() {
  const [homeworks, setHomeworks] = useState<Homework[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [view, setView] = useState<'list' | 'board'>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('hw-view') as 'list' | 'board' ?? 'list') : 'list'
  )

  useEffect(() => {
    apiFetch<Homework[]>('/api/homeworks').then(setHomeworks)
    apiFetch<Submission[]>('/api/submissions/mine').then(setSubmissions)
  }, [])

  function setViewMode(v: 'list' | 'board') {
    setView(v)
    localStorage.setItem('hw-view', v)
  }

  function latestSubmission(hwId: number) {
    return submissions.filter(s => s.homework_id === hwId).sort((a, b) =>
      b.attempt_number - a.attempt_number
    )[0]
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>과제 목록</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{homeworks.length}개 과제</p>
        </div>
        <div className="flex gap-2">
          {(['list', 'board'] as const).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{
                background: view === v ? 'var(--blue-600)' : 'var(--surface-primary)',
                color: view === v ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {v === 'list' ? '☰ 목록' : '⊞ 보드'}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <div className="flex flex-col gap-3">
          {homeworks.map(hw => {
            const sub = latestSubmission(hw.id)
            return (
              <a
                key={hw.id}
                href={`/homework/${hw.id}`}
                className="flex items-center justify-between p-4 rounded-xl border transition-colors hover:border-blue-500"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <div>
                  <span className="text-xs font-semibold mr-3" style={{ color: 'var(--text-secondary)' }}>
                    # {String(hw.id).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{hw.title}</span>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>마감: {hw.due_date}</p>
                </div>
                {sub ? (
                  <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}>
                    {STATUS_LABEL[sub.status]}
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ color: 'var(--text-disabled)', background: 'rgba(85,85,85,0.2)' }}>미제출</span>
                )}
              </a>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {BOARD_COLS.map(col => (
            <div key={col.key}>
              <h3 className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{col.label}</h3>
              <div className="flex flex-col gap-2">
                {homeworks
                  .filter(hw => {
                    const sub = latestSubmission(hw.id)
                    if (col.key === 'none') return !sub
                    return sub?.status === col.key
                  })
                  .map(hw => {
                    const sub = latestSubmission(hw.id)
                    return (
                      <div
                        key={hw.id}
                        className="p-3 rounded-xl border"
                        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
                      >
                        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>#{String(hw.id).padStart(2, '0')}</p>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{hw.title}</p>
                        {sub?.status === 'declined' && (
                          <a href={`/homework/${hw.id}`} className="text-xs mt-2 inline-block" style={{ color: 'var(--blue-600)' }}>재제출 →</a>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/homeworks/route.ts app/api/submissions/mine/route.ts "app/(champion)/page.tsx"
git commit -m "feat: homework list API and champion list/board view page"
```

---

### Task 10: Homework Detail API + Page

**Files:**
- Create: `app/api/homeworks/[id]/route.ts`
- Create: `app/api/submissions/mine/[homeworkId]/route.ts`
- Create: `app/(champion)/homework/[id]/page.tsx`

- [ ] **Step 1: Create `app/api/homeworks/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .select('*')
    .eq('id', parseInt(params.id))
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create `app/api/submissions/mine/[homeworkId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { homeworkId: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*, comments(*)')
    .eq('user_id', user.id)
    .eq('homework_id', parseInt(params.homeworkId))
    .order('attempt_number', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create `app/(champion)/homework/[id]/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Homework, Submission } from '@/lib/types'
import DOMPurify from 'dompurify'

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

export default function HomeworkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [homework, setHomework] = useState<Homework | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Homework>(`/api/homeworks/${id}`).then(setHomework)
    apiFetch<Submission[]>(`/api/submissions/mine/${id}`).then(setSubmissions)
  }, [id])

  const latest = submissions[0]
  const canSubmit = !latest || latest.status === 'declined'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('homework_id', id)
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body,
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const updated = await apiFetch<Submission[]>(`/api/submissions/mine/${id}`)
      setSubmissions(updated)
      setFile(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      {homework && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              # {String(homework.id).padStart(2, '0')}
            </span>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{homework.title}</h1>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>마감: {homework.due_date}</p>
          {homework.description && (
            <div
              className="text-sm rounded-xl p-4 border prose prose-invert max-w-none"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(homework.description) }}
            />
          )}
        </div>
      )}

      {canSubmit && (
        <form onSubmit={handleSubmit} className="mb-8 p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            {latest?.status === 'declined' ? '재제출' : '제출하기'}
          </p>
          <input
            type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="text-sm mb-3 block"
            style={{ color: 'var(--text-secondary)' }}
          />
          {error && <p className="text-xs mb-2" style={{ color: 'var(--error)' }}>{error}</p>}
          <button
            type="submit"
            disabled={!file || uploading}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            {uploading ? '업로드 중...' : '제출'}
          </button>
        </form>
      )}

      <div>
        <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>제출 이력</h2>
        <div className="flex flex-col gap-3">
          {submissions.map(sub => (
            <div key={sub.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>시도 #{sub.attempt_number} · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}>
                  {STATUS_LABEL[sub.status]}
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
              {sub.comments && sub.comments.length > 0 && (
                <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  {sub.comments.map(c => (
                    <p key={c.id} className="text-xs" style={{ color: 'var(--text-secondary)' }}>💬 {c.body}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {submissions.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>아직 제출 이력이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/homeworks/ app/api/submissions/mine/ "app/(champion)/homework/"
git commit -m "feat: homework detail API and champion submission history page"
```

---

### Task 11: File Submission API

**Files:**
- Create: `app/api/submissions/route.ts`

- [ ] **Step 1: Create `app/api/submissions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const homeworkId = formData.get('homework_id') as string | null

  if (!file || !homeworkId)
    return NextResponse.json({ error: 'Missing file or homework_id' }, { status: 400 })

  const supabase = createServiceClient()

  // Determine attempt number
  const { count } = await supabase
    .from('submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('homework_id', parseInt(homeworkId))
  const attemptNumber = (count ?? 0) + 1

  // Upload file
  const filePath = `${user.id}/${homeworkId}/${attemptNumber}/${file.name}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('submissions')
    .upload(filePath, arrayBuffer, { contentType: file.type, upsert: false })
  if (uploadError)
    return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // Create submission record
  const { data, error } = await supabase
    .from('submissions')
    .insert({
      user_id: user.id,
      homework_id: parseInt(homeworkId),
      file_path: filePath,
      file_name: file.name,
      status: 'pending',
      attempt_number: attemptNumber,
    })
    .select()
    .single()
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/submissions/route.ts
git commit -m "feat: file submission API with Supabase Storage upload"
```

---

### Task 12: Admin Layout

**Files:**
- Create: `app/admin/layout.tsx`

- [ ] **Step 1: Create `app/admin/layout.tsx`**

```tsx
'use client'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

const NAV = [
  { label: '📋 대시보드', href: '/admin' },
  { label: '📦 제출 현황', href: '/admin/kanban' },
  { label: '📊 진척도', href: '/admin/progress' },
  { label: '📅 기한 요청', href: '/admin/requests' },
  { label: '📄 주간 리포트', href: '/admin/reports' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  if (pathname === '/admin/login') return <>{children}</>

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--background)' }}>
      <aside className="w-44 flex-shrink-0 flex flex-col gap-1 p-4 border-r" style={{ background: 'var(--background)', borderColor: 'var(--border-subtle)' }}>
        <span className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>관리자</span>
        {NAV.map(item => {
          const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              className="text-xs px-3 py-2 rounded-lg font-medium"
              style={{
                background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: active ? '#7dd3fc' : 'var(--text-secondary)',
              }}
            >
              {item.label}
            </a>
          )
        })}
        <div className="mt-auto">
          <button onClick={handleLogout} className="text-xs px-3 py-2 rounded-lg w-full text-left" style={{ color: 'var(--text-disabled)' }}>
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat: add admin sidebar layout"
```

---

### Task 13: Admin Dashboard + Homework APIs

**Files:**
- Create: `app/api/admin/homeworks/route.ts`
- Create: `app/api/admin/homeworks/[id]/submissions/route.ts`
- Create: `app/admin/page.tsx`
- Create: `app/admin/homework/[id]/page.tsx`

- [ ] **Step 1: Create `app/api/admin/homeworks/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()

  const { data: homeworks, error } = await supabase
    .from('homeworks')
    .select('*')
    .order('id', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: users } = await supabase.from('users').select('id')
  const userCount = users?.length ?? 0

  const enriched = await Promise.all(homeworks.map(async hw => {
    const { count } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('homework_id', hw.id)
      .in('status', ['pending', 'accepted', 'declined'])
    return { ...hw, submission_count: count ?? 0, user_count: userCount }
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { title, description, due_date } = body
  if (!title || !due_date)
    return NextResponse.json({ error: 'title and due_date required' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('homeworks')
    .insert({ title, description, due_date })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/admin/homeworks/[id]/submissions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*, users(*), comments(*)')
    .eq('homework_id', parseInt(params.id))
    .order('submitted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create `app/admin/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { HomeworkWithCount } from '@/lib/types'

export default function AdminDashboard() {
  const [homeworks, setHomeworks] = useState<HomeworkWithCount[]>([])

  useEffect(() => {
    apiFetch<HomeworkWithCount[]>('/api/admin/homeworks').then(setHomeworks)
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>대시보드</h1>
        <a href="/admin/homework/new">
          <button className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>
            + 과제 만들기
          </button>
        </a>
      </div>
      <div className="flex flex-col gap-3">
        {homeworks.map(hw => (
          <a
            key={hw.id}
            href={`/admin/homework/${hw.id}`}
            className="flex items-center justify-between p-4 rounded-xl border hover:border-blue-500 transition-colors"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
          >
            <div>
              <span className="text-xs font-bold mr-2" style={{ color: 'var(--text-secondary)' }}>#{String(hw.id).padStart(2, '0')}</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{hw.title}</span>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>마감: {hw.due_date}</p>
            </div>
            <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
              {hw.submission_count} / {hw.user_count} 제출
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/admin/homework/[id]/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Submission, User } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

export default function AdminHomeworkSubmissionsPage() {
  const { id } = useParams<{ id: string }>()
  const [submissions, setSubmissions] = useState<(Submission & { user: User })[]>([])

  useEffect(() => {
    apiFetch<(Submission & { user: User })[]>(`/api/admin/homeworks/${id}/submissions`).then(setSubmissions)
  }, [id])

  // Group by user — show latest attempt per user
  const byUser = submissions.reduce<Record<string, (Submission & { user: User })[]>>((acc, s) => {
    if (!acc[s.user_id]) acc[s.user_id] = []
    acc[s.user_id].push(s)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 대시보드</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>과제 #{String(id).padStart(2, '0')} 제출 현황</h1>
      </div>
      <div className="flex flex-col gap-3">
        {Object.values(byUser).map(userSubs => {
          const latest = userSubs.sort((a, b) => b.attempt_number - a.attempt_number)[0]
          return (
            <a
              key={latest.user_id}
              href={`/admin/homework/${id}/${latest.user_id}`}
              className="flex items-center justify-between p-4 rounded-xl border hover:border-blue-500 transition-colors"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-3">
                {latest.user.avatar_url && <img src={latest.user.avatar_url} className="w-7 h-7 rounded-full" alt="" />}
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{latest.user.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{userSubs.length}회 시도</p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: STATUS_COLOR[latest.status], background: `${STATUS_COLOR[latest.status]}20` }}>
                {STATUS_LABEL[latest.status]}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/homeworks/ app/admin/page.tsx app/admin/homework/
git commit -m "feat: admin dashboard, homework list/submissions APIs and pages"
```

---

### Task 14: Admin Submission Review (Download + Preview + Review Panel)

**Files:**
- Create: `app/api/admin/homeworks/[id]/submissions/[userId]/route.ts`
- Create: `app/api/admin/submissions/[id]/route.ts`
- Create: `app/api/admin/submissions/[id]/comments/route.ts`
- Create: `app/api/admin/storage/[submissionId]/download/route.ts`
- Create: `app/admin/homework/[id]/[userId]/page.tsx`

- [ ] **Step 1: Create `app/api/admin/homeworks/[id]/submissions/[userId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .select('*, comments(*)')
    .eq('homework_id', parseInt(params.id))
    .eq('user_id', params.userId)
    .order('attempt_number', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create `app/api/admin/submissions/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { status } = body
  if (!['pending', 'accepted', 'declined'].includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('submissions')
    .update({ status })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create `app/api/admin/submissions/[id]/comments/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { body: commentBody } = await req.json()
  if (!commentBody?.trim())
    return NextResponse.json({ error: 'Comment body required' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('comments')
    .insert({ submission_id: params.id, body: commentBody.trim() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/admin/storage/[submissionId]/download/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { submissionId: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()
  const { data: submission, error } = await supabase
    .from('submissions')
    .select('file_path')
    .eq('id', params.submissionId)
    .single()
  if (error || !submission)
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  const { data: signedData, error: signError } = await supabase.storage
    .from('submissions')
    .createSignedUrl(submission.file_path, 60)
  if (signError || !signedData)
    return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 })
  return NextResponse.redirect(signedData.signedUrl)
}
```

- [ ] **Step 5: Create `app/admin/homework/[id]/[userId]/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { Submission, Comment } from '@/lib/types'
import ReactMarkdown from 'react-markdown'

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

function FilePreview({ submission, downloadUrl }: { submission: Submission; downloadUrl: string }) {
  const ext = submission.file_name.split('.').pop()?.toLowerCase()
  const [mdContent, setMdContent] = useState<string | null>(null)

  useEffect(() => {
    if (ext === 'md') {
      fetch(downloadUrl).then(r => r.text()).then(setMdContent)
    }
  }, [downloadUrl, ext])

  return (
    <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      {ext === 'md' && mdContent !== null ? (
        <div className="p-4 prose prose-invert max-w-none text-sm" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>
          <ReactMarkdown>{mdContent}</ReactMarkdown>
        </div>
      ) : ext === 'pdf' ? (
        <iframe src={downloadUrl} className="w-full" style={{ height: '500px', background: '#fff' }} title="PDF preview" />
      ) : (
        <div className="p-4 text-center" style={{ background: 'var(--surface-secondary)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>미리보기를 지원하지 않는 파일 형식입니다.</p>
        </div>
      )}
      <div className="p-3 border-t" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <a href={downloadUrl} download={submission.file_name}>
          <button className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>
            ⬇ 다운로드 ({submission.file_name})
          </button>
        </a>
      </div>
    </div>
  )
}

export default function SubmissionReviewPage() {
  const { id, userId } = useParams<{ id: string; userId: string }>()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [activeSubId, setActiveSubId] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Submission[]>(`/api/admin/homeworks/${id}/submissions/${userId}`).then(subs => {
      setSubmissions(subs)
      if (subs.length > 0) setActiveSubId(subs[0].id)
      subs.forEach(sub => {
        apiFetch<{ url: string }>(`/api/admin/storage/${sub.id}/download`).then(d => {
          setDownloadUrls(prev => ({ ...prev, [sub.id]: d.url }))
        }).catch(() => {
          // Generate URL via redirect — use the route directly
          setDownloadUrls(prev => ({ ...prev, [sub.id]: `/api/admin/storage/${sub.id}/download` }))
        })
      })
    })
  }, [id, userId])

  async function handleStatus(subId: string, status: string) {
    setSaving(true)
    await apiFetch(`/api/admin/submissions/${subId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: status as Submission['status'] } : s))
    setSaving(false)
  }

  async function handleComment(subId: string) {
    if (!comment.trim()) return
    setSaving(true)
    const newComment = await apiFetch<Comment>(`/api/admin/submissions/${subId}/comments`, {
      method: 'POST', body: JSON.stringify({ body: comment }),
    })
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, comments: [...(s.comments ?? []), newComment] } : s))
    setComment('')
    setSaving(false)
  }

  const activeSub = submissions.find(s => s.id === activeSubId)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <a href={`/admin/homework/${id}`} className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 목록으로</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>제출 검토</h1>
      </div>

      {/* Attempt selector */}
      {submissions.length > 1 && (
        <div className="flex gap-2 mb-4">
          {submissions.map(sub => (
            <button
              key={sub.id}
              onClick={() => setActiveSubId(sub.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{
                background: activeSubId === sub.id ? 'var(--blue-600)' : 'var(--surface-primary)',
                color: activeSubId === sub.id ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              시도 #{sub.attempt_number}
            </button>
          ))}
        </div>
      )}

      {activeSub && (
        <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{activeSub.file_name}</p>
            <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: STATUS_COLOR[activeSub.status], background: `${STATUS_COLOR[activeSub.status]}20` }}>
              {STATUS_LABEL[activeSub.status]}
            </span>
          </div>

          {downloadUrls[activeSub.id] && (
            <FilePreview submission={activeSub} downloadUrl={downloadUrls[activeSub.id]} />
          )}

          {/* Review actions */}
          <div className="mt-4 flex gap-2">
            <button onClick={() => handleStatus(activeSub.id, 'accepted')} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>
              ✓ 합격
            </button>
            <button onClick={() => handleStatus(activeSub.id, 'declined')} disabled={saving}
              className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
              ✗ 불합격
            </button>
          </div>

          {/* Comment */}
          <div className="mt-4">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="코멘트 입력..."
              rows={3}
              className="w-full text-sm rounded-lg p-3 resize-none"
              style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <button
              onClick={() => handleComment(activeSub.id)}
              disabled={saving || !comment.trim()}
              className="mt-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}
            >
              코멘트 저장
            </button>
          </div>

          {/* Existing comments */}
          {activeSub.comments && activeSub.comments.length > 0 && (
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              {activeSub.comments.map(c => (
                <div key={c.id} className="mb-2 p-2 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-disabled)' }}>{new Date(c.created_at).toLocaleString('ko-KR')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/submissions/ app/api/admin/storage/ "app/api/admin/homeworks/[id]/submissions/[userId]/" "app/admin/homework/[id]/[userId]/"
git commit -m "feat: admin submission review with file preview, accept/decline, comments, signed download"
```

---

### Task 15: Admin Create Homework (TipTap Editor)

**Files:**
- Create: `app/admin/homework/new/page.tsx`

- [ ] **Step 1: Create `app/admin/homework/new/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { apiFetch } from '@/lib/api-client'

function TipTapEditor({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btnStyle = (active: boolean) => ({
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 700,
    background: active ? 'var(--blue-600)' : 'var(--surface-secondary)',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
  })
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex gap-1 p-2 border-b" style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}>
        {[
          { label: 'B', cmd: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
          { label: 'I', cmd: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
          { label: 'U', cmd: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline') },
          { label: 'H2', cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }) },
          { label: '•', cmd: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
        ].map(b => (
          <button key={b.label} onMouseDown={e => { e.preventDefault(); b.cmd() }} style={btnStyle(b.active)}>{b.label}</button>
        ))}
      </div>
      <EditorContent editor={editor} className="p-3 min-h-32 text-sm prose prose-invert max-w-none" />
    </div>
  )
}

export default function CreateHomeworkPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !dueDate) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/admin/homeworks', {
        method: 'POST',
        body: JSON.stringify({ title, description: editor?.getHTML() ?? '', due_date: dueDate }),
      })
      router.push('/admin')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 대시보드</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>새 과제 만들기</h1>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input type="text" placeholder="과제 제목" value={title} onChange={e => setTitle(e.target.value)} required style={inputStyle} />
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required style={inputStyle} />
        <div>
          <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>과제 설명</p>
          <TipTapEditor editor={editor} />
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
        <button type="submit" disabled={saving} className="py-3 rounded-xl font-semibold text-sm disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>
          {saving ? '저장 중...' : '과제 만들기'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/homework/new/
git commit -m "feat: admin create homework with TipTap WYSIWYG editor"
```

---

### Task 16: Admin Kanban Board (Drag-and-Drop)

**Files:**
- Create: `app/api/admin/kanban/route.ts`
- Create: `app/admin/kanban/page.tsx`

- [ ] **Step 1: Create `app/api/admin/kanban/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const homeworkId = searchParams.get('homework_id')

  const supabase = createServiceClient()

  let query = supabase.from('submissions').select('*, users(*)').order('submitted_at', { ascending: false })
  if (homeworkId) query = query.eq('homework_id', parseInt(homeworkId))

  const { data: submissions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: allUsers } = await supabase.from('users').select('*')
  const submittedUserIds = new Set((submissions ?? []).map((s: { user_id: string }) => s.user_id))
  const notSubmitted = (allUsers ?? []).filter((u: { id: string }) => !submittedUserIds.has(u.id))

  return NextResponse.json({
    pending: (submissions ?? []).filter((s: { status: string }) => s.status === 'pending'),
    accepted: (submissions ?? []).filter((s: { status: string }) => s.status === 'accepted'),
    declined: (submissions ?? []).filter((s: { status: string }) => s.status === 'declined'),
    not_submitted: homeworkId ? notSubmitted : [],
  })
}
```

- [ ] **Step 2: Create `app/admin/kanban/page.tsx`**

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { apiFetch } from '@/lib/api-client'
import type { Submission, User, Homework, KanbanData } from '@/lib/types'

type KanbanCard = Submission & { user: User }
type ColumnKey = 'not_submitted' | 'pending' | 'accepted' | 'declined'

const COLS: { key: ColumnKey; label: string }[] = [
  { key: 'not_submitted', label: '미제출' },
  { key: 'pending', label: '검토 중' },
  { key: 'accepted', label: '합격' },
  { key: 'declined', label: '불합격' },
]
const COL_COLOR: Record<ColumnKey, string> = {
  not_submitted: 'var(--text-disabled)',
  pending: 'var(--amber)',
  accepted: 'var(--success)',
  declined: 'var(--error)',
}

function DroppableColumn({ col, children }: { col: typeof COLS[0]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })
  return (
    <div
      ref={setNodeRef}
      className="flex-1 min-w-0 rounded-xl p-3 transition-colors"
      style={{
        background: isOver ? 'rgba(37,99,235,0.08)' : 'var(--surface-primary)',
        border: `1px solid ${isOver ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
        minHeight: '200px',
      }}
    >
      <h3 className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: COL_COLOR[col.key] }}>{col.label}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function DraggableCard({ card, draggable }: { card: KanbanCard; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled: !draggable })
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className="p-3 rounded-xl border text-xs"
      style={{
        background: 'var(--surface-secondary)',
        borderColor: 'var(--border-subtle)',
        opacity: isDragging ? 0.4 : 1,
        cursor: draggable ? 'grab' : 'default',
      }}
    >
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{card.user.name}</p>
      <p style={{ color: 'var(--text-secondary)' }}>#{card.homework_id} · 시도 {card.attempt_number}</p>
      <p className="mt-1 truncate" style={{ color: 'var(--text-disabled)' }}>{card.file_name}</p>
    </div>
  )
}

function NotSubmittedCard({ user }: { user: User }) {
  return (
    <div className="p-3 rounded-xl border text-xs" style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}>
      <p className="font-semibold" style={{ color: 'var(--text-disabled)' }}>{user.name}</p>
    </div>
  )
}

export default function AdminKanbanPage() {
  const [homeworks, setHomeworks] = useState<Homework[]>([])
  const [selectedHw, setSelectedHw] = useState<string>('')
  const [data, setData] = useState<KanbanData>({ pending: [], accepted: [], declined: [], not_submitted: [] })
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const fetchKanban = useCallback(() => {
    const url = selectedHw ? `/api/admin/kanban?homework_id=${selectedHw}` : '/api/admin/kanban'
    apiFetch<KanbanData>(url).then(setData)
  }, [selectedHw])

  useEffect(() => {
    apiFetch<Homework[]>('/api/admin/homeworks').then(setHomeworks)
  }, [])

  useEffect(() => { fetchKanban() }, [fetchKanban])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function onDragStart(event: DragStartEvent) {
    const card = data.pending.find(c => c.id === event.active.id) ?? null
    setActiveCard(card)
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over || !active) return
    const cardId = active.id as string
    const targetCol = over.id as ColumnKey
    if (targetCol === 'not_submitted') return

    const newStatus = targetCol === 'pending' ? 'pending' : targetCol === 'accepted' ? 'accepted' : 'declined'

    // Optimistic update
    const card = data.pending.find(c => c.id === cardId)
    if (!card) return
    setData(prev => ({
      ...prev,
      pending: prev.pending.filter(c => c.id !== cardId),
      [targetCol]: [...prev[targetCol as keyof Pick<KanbanData, 'pending' | 'accepted' | 'declined'>], { ...card, status: newStatus }],
    }))

    try {
      await apiFetch(`/api/admin/submissions/${cardId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
    } catch {
      showToast('상태 변경 실패. 되돌립니다.')
      fetchKanban()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>제출 현황 (Kanban)</h1>
        <select
          value={selectedHw}
          onChange={e => setSelectedHw(e.target.value)}
          className="text-sm rounded-lg px-3 py-2"
          style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        >
          <option value="">전체 과제</option>
          {homeworks.map(hw => (
            <option key={hw.id} value={hw.id}>#{String(hw.id).padStart(2, '0')} {hw.title}</option>
          ))}
        </select>
      </div>

      {toast && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
          {toast}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4">
          {COLS.map(col => (
            <DroppableColumn key={col.key} col={col}>
              {col.key === 'not_submitted'
                ? data.not_submitted.map(u => <NotSubmittedCard key={u.id} user={u} />)
                : data[col.key as keyof Pick<KanbanData, 'pending' | 'accepted' | 'declined'>].map(card => (
                  <DraggableCard key={card.id} card={card} draggable={col.key === 'pending'} />
                ))
              }
            </DroppableColumn>
          ))}
        </div>
        <DragOverlay>
          {activeCard && <DraggableCard card={activeCard} draggable={false} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/kanban/ app/admin/kanban/
git commit -m "feat: admin Kanban board with dnd-kit drag-and-drop and optimistic UI"
```

---

### Task 17: Charter Page (TipTap + Auto-save + PDF/DOCX Export)

**Files:**
- Create: `app/api/charter/route.ts`
- Create: `app/(champion)/charter/page.tsx`

- [ ] **Step 1: Create `app/api/charter/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data } = await supabase.from('project_charters').select('*').eq('user_id', user.id).single()
  return NextResponse.json(data ?? null)
}

export async function PUT(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('project_charters')
    .upsert({ user_id: user.id, project_name: body.project_name, content: body.content, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create `app/(champion)/charter/page.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { apiFetch } from '@/lib/api-client'
import type { ProjectCharter } from '@/lib/types'

type SectionKey = 'problem_definition' | 'goal' | 'scope_in' | 'scope_out' | 'expected_outcomes' | 'risks'
const SECTIONS: { key: SectionKey; label: string; required?: boolean }[] = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)', required: true },
  { key: 'goal', label: '목표 (TO-BE)', required: true },
  { key: 'scope_in', label: '범위 In (Scope In)', required: true },
  { key: 'scope_out', label: '범위 Out (Scope Out)', required: true },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
]

function SectionEditor({ label, required, content, onBlur }: {
  label: string; required?: boolean; content: string; onBlur: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content,
    onBlur: ({ editor }) => onBlur(editor.getHTML()),
  })

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <span className="text-xs font-semibold" style={{ color: '#ccc' }}>{label}</span>
        {required && <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>}
      </div>
      <div style={{ background: 'var(--surface-secondary)' }}>
        <EditorContent editor={editor} className="p-3 min-h-16 text-sm prose prose-invert max-w-none" />
      </div>
    </div>
  )
}

export default function CharterPage() {
  const [charter, setCharter] = useState<ProjectCharter | null>(null)
  const [projectName, setProjectName] = useState('')
  const [content, setContent] = useState<ProjectCharter['content']>({})
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    apiFetch<ProjectCharter | null>('/api/charter').then(c => {
      if (c) {
        setCharter(c)
        setProjectName(c.project_name ?? '')
        setContent(c.content ?? {})
      }
    })
  }, [])

  async function save(newContent: ProjectCharter['content'], name: string) {
    setSaving(true)
    await apiFetch('/api/charter', { method: 'PUT', body: JSON.stringify({ project_name: name, content: newContent }) })
    setLastSaved(new Date())
    setSaving(false)
  }

  function handleSectionBlur(key: SectionKey, html: string) {
    const updated = { ...content, [key]: html }
    setContent(updated)
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => save(updated, projectName), 800)
  }

  function handleNameBlur() {
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => save(content, projectName), 800)
  }

  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf')
    const { default: html2canvas } = await import('html2canvas')
    const el = document.getElementById('charter-content')!
    const canvas = await html2canvas(el, { backgroundColor: '#141414', scale: 2 })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
    pdf.save(`제정의서_${projectName || 'charter'}.pdf`)
  }

  async function exportDocx() {
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx')
    const { saveAs } = await import('file-saver')
    const sections = SECTIONS.map(s => [
      new Paragraph({ text: s.label, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: stripHtml(content[s.key] ?? ''), break: 1 })] }),
    ]).flat()
    const doc = new Document({
      sections: [{ children: [new Paragraph({ text: projectName || '제정의서', heading: HeadingLevel.HEADING_1 }), ...sections] }],
    })
    const blob = await Packer.toBlob(doc)
    saveAs(blob, `제정의서_${projectName || 'charter'}.docx`)
  }

  function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, '').trim()
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>제정의서</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {saving ? '저장 중...' : lastSaved ? `마지막 저장: ${lastSaved.toLocaleTimeString('ko-KR')}` : '자동 저장'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportDocx} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(125,211,252,0.1)', color: '#7dd3fc', border: '1px solid #7dd3fc' }}>
            📄 DOCX
          </button>
          <button onClick={exportPdf} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}>
            📕 PDF
          </button>
        </div>
      </div>

      <div id="charter-content" className="flex flex-col gap-3">
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
            <span className="text-xs font-semibold" style={{ color: '#ccc' }}>프로젝트명</span>
            <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>
          </div>
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="프로젝트명을 입력하세요"
            className="w-full p-3 text-sm"
            style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)', outline: 'none', border: 'none' }}
          />
        </div>
        {SECTIONS.map(s => (
          <SectionEditor
            key={s.key}
            label={s.label}
            required={s.required}
            content={content[s.key] ?? ''}
            onBlur={html => handleSectionBlur(s.key, html)}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/charter/ "app/(champion)/charter/"
git commit -m "feat: charter page with TipTap sections, auto-save, PDF and DOCX export"
```

---

### Task 18: Milestones / WBS Page

**Files:**
- Create: `app/api/milestones/route.ts`
- Create: `app/api/milestones/[id]/route.ts`
- Create: `app/api/milestones/[id]/deliverables/route.ts`
- Create: `app/api/deadline-requests/route.ts`
- Create: `app/(champion)/milestones/page.tsx`

- [ ] **Step 1: Create `app/api/milestones/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .select('*, milestone_deliverables(*)')
    .eq('user_id', user.id)
    .order('week_number').order('display_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { week_number, title, start_date, due_date, description } = body
  if (!week_number || !title || !start_date || !due_date)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .insert({ user_id: user.id, week_number, title, start_date, due_date, description })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/milestones/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

function computeStatus(milestone: { due_date: string; is_manual_progress: boolean }, hasDeliverable: boolean) {
  if (hasDeliverable) return 'completed'
  if (milestone.is_manual_progress) return 'in_progress'
  if (new Date(milestone.due_date) < new Date()) return 'delayed'
  return 'not_started'
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const supabase = createServiceClient()

  const { data: existing } = await supabase.from('milestones').select('*').eq('id', params.id).eq('user_id', user.id).single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count: deliverableCount } = await supabase
    .from('milestone_deliverables')
    .select('*', { count: 'exact', head: true })
    .eq('milestone_id', params.id)

  const merged = { ...existing, ...body }
  const status = computeStatus(merged, (deliverableCount ?? 0) > 0)

  const { data, error } = await supabase
    .from('milestones')
    .update({ ...body, status, updated_at: new Date().toISOString() })
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
  const { error } = await supabase.from('milestones').delete().eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create `app/api/milestones/[id]/deliverables/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: milestone } = await supabase.from('milestones').select('id').eq('id', params.id).eq('user_id', user.id).single()
  if (!milestone) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })

  const filePath = `${user.id}/${params.id}/${file.name}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage.from('milestone-deliverables').upload(filePath, arrayBuffer, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  await supabase.from('milestone_deliverables').insert({ milestone_id: params.id, file_path: filePath, file_name: file.name })
  await supabase.from('milestones').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', params.id)

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/deadline-requests/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { milestone_id, requested_due_date, reason } = await req.json()
  if (!milestone_id || !requested_due_date || !reason)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const supabase = createServiceClient()
  const { data: ms } = await supabase.from('milestones').select('due_date').eq('id', milestone_id).eq('user_id', user.id).single()
  if (!ms) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })
  const { data, error } = await supabase
    .from('deadline_change_requests')
    .insert({ milestone_id, user_id: user.id, original_due_date: ms.due_date, requested_due_date, reason })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 5: Create `app/(champion)/milestones/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch, apiUpload } from '@/lib/api-client'
import type { Milestone } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--amber)',
  completed: 'var(--success)', delayed: 'var(--error)',
}

interface NewMilestone { week_number: string; title: string; start_date: string; due_date: string }

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewMilestone>({ week_number: '1', title: '', start_date: '', due_date: '' })
  const [deadlineModal, setDeadlineModal] = useState<{ id: string; due_date: string } | null>(null)
  const [reqForm, setReqForm] = useState({ requested_due_date: '', reason: '' })

  useEffect(() => {
    apiFetch<Milestone[]>('/api/milestones').then(setMilestones)
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const created = await apiFetch<Milestone>('/api/milestones', {
      method: 'POST',
      body: JSON.stringify({ ...form, week_number: parseInt(form.week_number) }),
    })
    setMilestones(prev => [...prev, created])
    setShowForm(false)
    setForm({ week_number: '1', title: '', start_date: '', due_date: '' })
  }

  async function handleUpload(id: string, file: File) {
    const body = new FormData()
    body.append('file', file)
    await apiUpload(`/api/milestones/${id}/deliverables`, body)
    const updated = await apiFetch<Milestone[]>('/api/milestones')
    setMilestones(updated)
  }

  async function handleMarkProgress(id: string) {
    const updated = await apiFetch<Milestone>(`/api/milestones/${id}`, {
      method: 'PATCH', body: JSON.stringify({ is_manual_progress: true }),
    })
    setMilestones(prev => prev.map(m => m.id === id ? updated : m))
  }

  async function handleDeadlineRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!deadlineModal) return
    await apiFetch('/api/deadline-requests', {
      method: 'POST',
      body: JSON.stringify({ milestone_id: deadlineModal.id, ...reqForm }),
    })
    setDeadlineModal(null)
    setReqForm({ requested_due_date: '', reason: '' })
  }

  const inputStyle = { background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)', padding: '8px 12px', fontSize: '13px' }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>주차별 WBS</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{milestones.length}개 마일스톤</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>
          + 마일스톤 추가
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-6 p-4 rounded-xl border flex flex-col gap-3" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="주차" value={form.week_number} onChange={e => setForm(f => ({ ...f, week_number: e.target.value }))} min="1" required style={inputStyle} />
            <input type="text" placeholder="마일스톤 이름" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} />
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required style={inputStyle} />
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} required style={inputStyle} />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg text-xs font-semibold self-start" style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
        </form>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ background: 'var(--surface-secondary)' }}>
              {['주차', '마일스톤', '기간', '상태', '액션'].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wide" style={{ color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {milestones.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="px-3 py-3">
                  <span className="px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(37,99,235,0.15)', color: '#7dd3fc' }}>{m.week_number}주차</span>
                </td>
                <td className="px-3 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{m.title}</td>
                <td className="px-3 py-3" style={{ color: 'var(--text-secondary)' }}>{m.start_date} – {m.due_date}</td>
                <td className="px-3 py-3">
                  <span style={{ color: STATUS_COLOR[m.status] }}>
                    {STATUS_LABEL[m.status]}{m.status === 'delayed' ? ' ⚠️' : ''}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2 flex-wrap">
                    {m.status !== 'completed' && (
                      <label className="cursor-pointer px-2 py-1 rounded font-semibold" style={{ background: 'rgba(74,222,128,0.1)', color: 'var(--success)', border: '1px solid var(--success)' }}>
                        📤 업로드
                        <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) handleUpload(m.id, e.target.files[0]) }} />
                      </label>
                    )}
                    {m.status === 'not_started' || m.status === 'delayed' ? (
                      <button onClick={() => handleMarkProgress(m.id)} className="px-2 py-1 rounded font-semibold" style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>
                        ▶ 진행 중
                      </button>
                    ) : null}
                    {(m.status === 'delayed' || m.status === 'in_progress') && (
                      <button onClick={() => setDeadlineModal({ id: m.id, due_date: m.due_date })} className="px-2 py-1 rounded font-semibold" style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid #fb923c' }}>
                        📅 기한 변경
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {milestones.length === 0 && (
          <p className="p-6 text-center text-sm" style={{ color: 'var(--text-disabled)' }}>아직 마일스톤이 없습니다. 추가해보세요.</p>
        )}
      </div>

      {/* Deadline request modal */}
      {deadlineModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <form onSubmit={handleDeadlineRequest} className="w-full max-w-sm p-6 rounded-2xl" style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: 'var(--text-primary)' }}>기한 변경 요청</h3>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>현재 마감일: {deadlineModal.due_date}</p>
                <input type="date" value={reqForm.requested_due_date} onChange={e => setReqForm(r => ({ ...r, requested_due_date: e.target.value }))} required style={{ ...inputStyle, width: '100%' }} />
              </div>
              <textarea value={reqForm.reason} onChange={e => setReqForm(r => ({ ...r, reason: e.target.value }))} placeholder="변경 사유" rows={3} required style={{ ...inputStyle, resize: 'none', width: '100%' }} />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="submit" className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--blue-600)', color: '#fff' }}>요청 보내기</button>
              <button type="button" onClick={() => setDeadlineModal(null)} className="flex-1 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/milestones/ app/api/deadline-requests/ "app/(champion)/milestones/"
git commit -m "feat: milestones WBS page with deliverable upload, progress marking, deadline requests"
```

---

### Task 19: Personal Gantt Chart

**Files:**
- Create: `app/(champion)/progress/page.tsx`

- [ ] **Step 1: Create `app/(champion)/progress/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone } from '@/lib/types'

const STATUS_COLOR: Record<string, string> = {
  not_started: '#444',
  in_progress: '#fbbf24',
  completed: '#4ade80',
  delayed: '#f87171',
}
const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}

export default function ProgressPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [GanttComponent, setGanttComponent] = useState<React.ComponentType<unknown> | null>(null)

  useEffect(() => {
    apiFetch<Milestone[]>('/api/milestones').then(setMilestones)
    import('gantt-task-react').then(m => setGanttComponent(() => m.Gantt))
  }, [])

  const delayed = milestones.filter(m => m.status === 'delayed')
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const tasks = milestones.map(m => ({
    id: m.id,
    name: m.title,
    start: new Date(m.start_date),
    end: new Date(m.due_date),
    type: 'task' as const,
    progress: m.status === 'completed' ? 100 : m.status === 'in_progress' ? 50 : 0,
    styles: {
      progressColor: STATUS_COLOR[m.status],
      progressSelectedColor: STATUS_COLOR[m.status],
      backgroundColor: STATUS_COLOR[m.status] + '40',
      backgroundSelectedColor: STATUS_COLOR[m.status] + '60',
    },
    isDisabled: true,
    project: `${m.week_number}주차`,
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>내 진척도</h1>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>오늘: {todayStr}</p>
      </div>

      {delayed.length > 0 && (
        <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid var(--error)' }}>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--error)' }}>⚠️ 지연된 마일스톤</p>
          {delayed.map(m => (
            <p key={m.id} className="text-xs" style={{ color: 'var(--text-secondary)' }}>• {m.week_number}주차 · {m.title} (마감: {m.due_date})</p>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: STATUS_COLOR[key] }} />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      {GanttComponent && tasks.length > 0 ? (
        <div className="rounded-xl border overflow-auto" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}>
          {/* @ts-expect-error gantt-task-react types */}
          <GanttComponent
            tasks={tasks}
            viewMode="Week"
            locale="ko"
            listCellWidth=""
            columnWidth={60}
            ganttHeight={300}
            todayColor="rgba(37,99,235,0.15)"
          />
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>
          {milestones.length === 0 ? 'WBS에서 마일스톤을 추가하면 여기에 표시됩니다.' : '차트를 불러오는 중...'}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(champion)/progress/"
git commit -m "feat: personal Gantt chart with delay alerts and status color-coding"
```

---

### Task 20: Admin Multi-Champion Progress + Deadline Requests

**Files:**
- Create: `app/api/admin/milestones/route.ts`
- Create: `app/api/admin/deadline-requests/route.ts`
- Create: `app/api/admin/deadline-requests/[id]/route.ts`
- Create: `app/admin/progress/page.tsx`
- Create: `app/admin/requests/page.tsx`

- [ ] **Step 1: Create `app/api/admin/milestones/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .select('*, users(*), milestone_deliverables(*)')
    .order('user_id').order('week_number').order('display_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Create `app/api/admin/deadline-requests/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('deadline_change_requests')
    .select('*, milestones(*), users!deadline_change_requests_user_id_fkey(*)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Create `app/api/admin/deadline-requests/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { status, review_note, support_assignee } = await req.json()
  if (!['approved', 'rejected'].includes(status))
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: req_ } = await supabase.from('deadline_change_requests').select('*').eq('id', params.id).single()
  if (!req_) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('deadline_change_requests')
    .update({ status, review_note, support_assignee, reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (status === 'approved') {
    await supabase.from('milestones').update({ due_date: req_.requested_due_date }).eq('id', req_.milestone_id)
  }

  return NextResponse.json(data)
}
```

- [ ] **Step 4: Create `app/admin/progress/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone, User } from '@/lib/types'

type MilestoneWithUser = Milestone & { users: User }

const STATUS_COLOR: Record<string, string> = {
  not_started: '#444', in_progress: '#fbbf24', completed: '#4ade80', delayed: '#f87171',
}

export default function AdminProgressPage() {
  const [milestones, setMilestones] = useState<MilestoneWithUser[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

  useEffect(() => {
    apiFetch<MilestoneWithUser[]>('/api/admin/milestones').then(data => {
      setMilestones(data)
      setSelectedUsers(new Set(data.map(m => m.user_id)))
    })
  }, [])

  const users = Array.from(new Map(milestones.map(m => [m.user_id, m.users])).values())
  const filtered = milestones.filter(m => selectedUsers.has(m.user_id))
  const byUser = users.filter(u => selectedUsers.has(u.id)).map(u => ({
    user: u,
    milestones: filtered.filter(m => m.user_id === u.id),
  }))

  function toggleUser(userId: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>챔피언 진척도 비교</h1>
      <div className="flex gap-2 flex-wrap mb-6">
        {users.map(u => (
          <label key={u.id} className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border text-xs" style={{ background: selectedUsers.has(u.id) ? 'rgba(37,99,235,0.15)' : 'var(--surface-primary)', borderColor: selectedUsers.has(u.id) ? 'var(--blue-600)' : 'var(--border-subtle)', color: selectedUsers.has(u.id) ? '#7dd3fc' : 'var(--text-secondary)' }}>
            <input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => toggleUser(u.id)} className="hidden" />
            {u.name}
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        {byUser.map(({ user, milestones: ums }) => {
          const delayed = ums.filter(m => m.status === 'delayed')
          return (
            <div key={user.id} className="rounded-xl border p-4" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-2 mb-3">
                {user.avatar_url && <img src={user.avatar_url} className="w-6 h-6 rounded-full" alt="" />}
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                {delayed.length > 0 && <span className="text-xs" style={{ color: 'var(--error)' }}>⚠️ {delayed.length}개 지연</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {ums.map(m => (
                  <div key={m.id} className="flex-1 min-w-28 p-2 rounded-lg" style={{ background: STATUS_COLOR[m.status] + '20', border: `1px solid ${STATUS_COLOR[m.status]}40` }}>
                    <p className="text-xs font-semibold" style={{ color: STATUS_COLOR[m.status] }}>{m.week_number}주차</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>~{m.due_date}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `app/admin/requests/page.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { DeadlineChangeRequest } from '@/lib/types'

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', approved: 'var(--success)', rejected: 'var(--error)',
}
const STATUS_LABEL: Record<string, string> = { pending: '검토 중', approved: '승인됨', rejected: '반려됨' }

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])

  useEffect(() => {
    apiFetch<DeadlineChangeRequest[]>('/api/admin/deadline-requests').then(setRequests)
  }, [])

  async function handleReview(id: string, status: 'approved' | 'rejected', review_note?: string) {
    const updated = await apiFetch<DeadlineChangeRequest>(`/api/admin/deadline-requests/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status, review_note }),
    })
    setRequests(prev => prev.map(r => r.id === id ? updated : r))
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>기한 변경 요청</h1>
      <div className="flex flex-col gap-3">
        {requests.map(req => (
          <div key={req.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {(req.user as unknown as { name: string })?.name} · {(req.milestone as unknown as { title: string })?.title}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {req.original_due_date} → {req.requested_due_date}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>사유: {req.reason}</p>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: STATUS_COLOR[req.status], background: `${STATUS_COLOR[req.status]}20` }}>
                {STATUS_LABEL[req.status]}
              </span>
            </div>
            {req.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => handleReview(req.id, 'approved')} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>
                  ✓ 승인
                </button>
                <button onClick={() => handleReview(req.id, 'rejected')} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
                  ✗ 반려
                </button>
              </div>
            )}
          </div>
        ))}
        {requests.length === 0 && <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>기한 변경 요청이 없습니다.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/milestones/ app/api/admin/deadline-requests/ app/admin/progress/ app/admin/requests/
git commit -m "feat: admin multi-champion progress view and deadline request review"
```

---

### Task 21: Admin Weekly Reports

**Files:**
- Create: `app/api/admin/reports/[weekNumber]/route.ts`
- Create: `app/admin/reports/page.tsx`

- [ ] **Step 1: Create `app/api/admin/reports/[weekNumber]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { weekNumber: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const weekNumber = parseInt(params.weekNumber)
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .select('*, users(*), milestone_deliverables(*)')
    .eq('week_number', weekNumber)
    .order('user_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ week_number: weekNumber, milestones: data })
}
```

- [ ] **Step 2: Create `app/admin/reports/page.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { Milestone, User } from '@/lib/types'

type ReportMilestone = Milestone & { users: User }
interface ReportData { week_number: number; milestones: ReportMilestone[] }

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--amber)',
  completed: 'var(--success)', delayed: 'var(--error)',
}

export default function AdminReportsPage() {
  const [weekNumber, setWeekNumber] = useState('1')
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  async function generateReport() {
    setLoading(true)
    const data = await apiFetch<ReportData>(`/api/admin/reports/${weekNumber}`)
    setReport(data)
    setLoading(false)
  }

  async function exportPdf() {
    if (!reportRef.current) return
    const { default: jsPDF } = await import('jspdf')
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(reportRef.current, { backgroundColor: '#141414', scale: 2 })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
    pdf.save(`주간리포트_${weekNumber}주차.pdf`)
  }

  const byUser = report
    ? Object.values(
        report.milestones.reduce<Record<string, { user: User; milestones: ReportMilestone[] }>>((acc, m) => {
          if (!acc[m.user_id]) acc[m.user_id] = { user: m.users, milestones: [] }
          acc[m.user_id].milestones.push(m)
          return acc
        }, {})
      )
    : []

  return (
    <div>
      <h1 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>주간 리포트</h1>
      <div className="flex items-center gap-3 mb-6">
        <input
          type="number"
          value={weekNumber}
          onChange={e => setWeekNumber(e.target.value)}
          min="1"
          placeholder="주차"
          className="w-24 px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        />
        <button onClick={generateReport} disabled={loading} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>
          {loading ? '생성 중...' : '리포트 생성'}
        </button>
        {report && (
          <button onClick={exportPdf} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}>
            📕 PDF 다운로드
          </button>
        )}
      </div>

      {report && (
        <div ref={reportRef} className="rounded-xl border p-6" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <h2 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{report.week_number}주차 진척도 리포트</h2>
          <p className="text-xs mb-6" style={{ color: 'var(--text-secondary)' }}>생성일: {new Date().toLocaleDateString('ko-KR')}</p>
          <div className="flex flex-col gap-4">
            {byUser.map(({ user, milestones }) => (
              <div key={user.id} className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{user.name}</p>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {['마일스톤', '기간', '상태'].map(h => (
                        <th key={h} className="text-left pb-2 font-semibold" style={{ color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map(m => (
                      <tr key={m.id}>
                        <td className="py-2" style={{ color: 'var(--text-primary)' }}>{m.title}</td>
                        <td className="py-2" style={{ color: 'var(--text-secondary)' }}>{m.start_date} – {m.due_date}</td>
                        <td className="py-2 font-semibold" style={{ color: STATUS_COLOR[m.status] }}>
                          {STATUS_LABEL[m.status]}{m.status === 'delayed' ? ' ⚠️' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {byUser.length === 0 && <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>이 주차에 등록된 마일스톤이 없습니다.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/reports/ app/admin/reports/
git commit -m "feat: admin weekly progress report generation and PDF export"
```

---

## Self-Review

### 1. Spec Coverage

| Spec requirement | Task |
|---|---|
| Google OAuth login for champions | Task 6 |
| Admin email/password login | Task 7 |
| Middleware route protection | Task 5 |
| Supabase service key server-side only | Tasks 3, 11 |
| RLS DENY ALL | Task 2 |
| Private storage + signed URLs | Tasks 2, 14 |
| Homework list with status (list + board toggle) | Task 9 |
| Homework detail + full submission history | Task 10 |
| File submission with attempt numbering | Task 11 |
| Admin dashboard with submission counts | Task 13 |
| Admin submission review (preview, accept/decline, comment) | Task 14 |
| Admin create homework with TipTap | Task 15 |
| Admin Kanban drag-and-drop | Task 16 |
| Charter page with TipTap + PDF/DOCX export | Task 17 |
| Milestones/WBS page with deliverable upload + deadline request | Task 18 |
| Personal Gantt chart | Task 19 |
| Multi-champion progress comparison | Task 20 |
| Deadline request review (approve/reject) | Task 20 |
| Weekly report generation + PDF export | Task 21 |

All spec sections covered. No gaps found.

### 2. Placeholder Scan

No "TBD", "TODO", or "similar to above" patterns present. All code blocks are complete.

### 3. Type Consistency

- `Submission` type uses `status: SubmissionStatus` throughout — consistent.
- `Milestone` type uses `status: MilestoneStatus` — consistent across Tasks 18, 19, 20.
- `verifyAdmin` / `verifyJWT` signatures consistent across all API routes (Tasks 6–21).
- `apiFetch<T>` / `apiUpload<T>` used consistently in all client components.
- `createServiceClient()` used in all API routes — never in page components.
