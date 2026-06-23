# Check-up Session Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin ↔ Champion 주간 1:1 체크업 세션을 기록·관리하는 기능 — 브라우저 녹음 + AI 자동 요약, 액션아이템 체크, 챔피언 댓글을 포함한다.

**Architecture:** Supabase에 3개 테이블 신규 생성 + RLS. 9개 API route (Next.js App Router). 브라우저 MediaRecorder → XHR 업로드 → Whisper STT → Claude 요약 동기 처리. Admin champion detail page에 탭 추가, Champion sidebar에 새 탭 추가.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Storage + RLS), `@ai-sdk/anthropic` (Claude), `openai` npm (Whisper STT), TypeScript, Tailwind CSS + CSS variables (기존 design system)

## Global Constraints

- 커밋 메시지 형식: `[AX-1] type(scope): description` (commitlint 설정)
- CSS: 기존 CSS 변수 사용 (`var(--text-primary)`, `var(--surface-primary)`, `var(--blue-600)`, etc.) — Tailwind arbitrary values 최소화
- API auth: `verifyJWT` / `verifyAdmin` from `@/lib/auth`
- DB client: `createServiceClient()` from `@/lib/supabase/server`
- Client fetching: `apiFetch<T>` / `apiUpload<T>` from `@/lib/api-client`
- AI: `generateText` + `anthropic(MODEL)` from `ai` + `@ai-sdk/anthropic`
- 모델: `claude-sonnet-4-6` (기존 milestones/generate 패턴과 동일하게)
- Toast 알림: `import { toast } from 'sonner'`

---

## File Map

**신규 생성:**
- `supabase/migrations/20260623000000_check_up_sessions.sql`
- `app/api/sessions/route.ts` — POST (생성), GET (목록)
- `app/api/sessions/[sessionId]/route.ts` — GET (상세), PATCH (수정), DELETE
- `app/api/sessions/[sessionId]/process/route.ts` — POST (오디오 업로드+STT+요약)
- `app/api/sessions/[sessionId]/action-items/route.ts` — POST (생성)
- `app/api/sessions/[sessionId]/action-items/[itemId]/route.ts` — PATCH, DELETE
- `app/api/sessions/[sessionId]/comments/route.ts` — POST (생성)
- `app/api/sessions/[sessionId]/comments/[commentId]/route.ts` — PATCH, DELETE
- `components/SessionMiniGantt.tsx` — 경량 Gantt (SVG 없이 div 기반)
- `components/sessions/RecordingPanel.tsx` — 녹음 + Progress UI
- `components/sessions/AdminSessionList.tsx` — Admin 세션 목록
- `components/sessions/AdminSessionDetail.tsx` — Admin 세션 상세
- `components/sessions/ChampionSessionDetail.tsx` — Champion 세션 상세
- `app/(champion)/my-project/sessions/page.tsx` — Champion 세션 목록 (Server Component)
- `app/(champion)/my-project/sessions/[sessionId]/page.tsx` — Champion 세션 상세 (Server Component)

**수정:**
- `lib/types.ts` — 타입 추가
- `app/admin/champions/[userId]/page.tsx` — "체크업 세션" 탭 추가
- `app/(champion)/ChampionSidebar.tsx` — NAV + MOBILE_TABS에 체크업 세션 항목 추가

---

## Task 1: DB Migration + Types

**Files:**
- Create: `supabase/migrations/20260623000000_check_up_sessions.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `CheckUpSession`, `SessionActionItem`, `SessionComment`, `SessionProcessingStatus` types

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260623000000_check_up_sessions.sql

-- 1. check_up_sessions
CREATE TABLE check_up_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_date            DATE NOT NULL,
  title                   TEXT NOT NULL,
  notes                   TEXT,
  audio_file_path         TEXT,
  recording_duration_sec  INT,
  processing_status       TEXT NOT NULL DEFAULT 'idle'
                            CHECK (processing_status IN ('idle','uploading','transcribing','summarizing','done','error')),
  raw_transcript          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkup_champion ON check_up_sessions(champion_user_id, session_date DESC);

ALTER TABLE check_up_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checkup_champion_own" ON check_up_sessions
  FOR SELECT USING (auth.uid() = champion_user_id);

CREATE POLICY "checkup_admin_all" ON check_up_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- 2. session_action_items
CREATE TABLE session_action_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES check_up_sessions(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  is_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_action_items_session ON session_action_items(session_id, display_order);

ALTER TABLE session_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_items_champion_read" ON session_action_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_up_sessions
      WHERE id = session_id AND champion_user_id = auth.uid()
    )
  );

CREATE POLICY "action_items_champion_toggle" ON session_action_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM check_up_sessions
      WHERE id = session_id AND champion_user_id = auth.uid()
    )
  )
  WITH CHECK (true);

CREATE POLICY "action_items_admin_all" ON session_action_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- 3. session_comments
CREATE TABLE session_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES check_up_sessions(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  author_id   UUID NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('admin','champion')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_comments_session ON session_comments(session_id, created_at);

ALTER TABLE session_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_comments_champion_read" ON session_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_up_sessions
      WHERE id = session_id AND champion_user_id = auth.uid()
    )
  );

CREATE POLICY "session_comments_champion_own" ON session_comments
  FOR ALL USING (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM check_up_sessions
      WHERE id = session_id AND champion_user_id = auth.uid()
    )
  );

CREATE POLICY "session_comments_admin_all" ON session_comments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- 4. Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('check-up-sessions', 'check-up-sessions', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "checkup_audio_admin_all" ON storage.objects
  FOR ALL USING (
    bucket_id = 'check-up-sessions'
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
npx supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Add types to `lib/types.ts`**

파일 끝에 추가:

```typescript
export type SessionProcessingStatus = 'idle' | 'uploading' | 'transcribing' | 'summarizing' | 'done' | 'error'

export interface CheckUpSession {
  id: string
  champion_user_id: string
  admin_user_id: string
  session_date: string
  title: string
  notes: string | null
  audio_file_path: string | null
  recording_duration_sec: number | null
  processing_status: SessionProcessingStatus
  raw_transcript: string | null
  created_at: string
  updated_at: string
  action_items?: SessionActionItem[]
  comments?: SessionComment[]
  milestones?: Milestone[]
  champion?: User
}

export interface SessionActionItem {
  id: string
  session_id: string
  body: string
  is_completed: boolean
  completed_at: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface SessionComment {
  id: string
  session_id: string
  body: string
  author_id: string
  author_role: 'admin' | 'champion'
  created_at: string
  updated_at: string
  author?: User
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260623000000_check_up_sessions.sql lib/types.ts
git commit -m "[AX-1] feat(sessions): add check_up_sessions migration and types"
```

---

## Task 2: Session CRUD API Routes

**Files:**
- Create: `app/api/sessions/route.ts`
- Create: `app/api/sessions/[sessionId]/route.ts`

**Interfaces:**
- Consumes: `verifyJWT`, `verifyAdmin`, `createServiceClient`, `CheckUpSession` type
- Produces:
  - `POST /api/sessions` → `CheckUpSession`
  - `GET /api/sessions?championId=<id>` → `CheckUpSession[]`
  - `GET /api/sessions/[sessionId]` → `CheckUpSession & { action_items, comments, milestones }`
  - `PATCH /api/sessions/[sessionId]` → `CheckUpSession`
  - `DELETE /api/sessions/[sessionId]` → 204

- [ ] **Step 1: Create `app/api/sessions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const isAdmin = !!user.user_metadata?.is_admin
  const championId = req.nextUrl.searchParams.get('championId')

  let query = supabase
    .from('check_up_sessions')
    .select('*')
    .order('session_date', { ascending: false })

  if (isAdmin && championId) {
    query = query.eq('champion_user_id', championId)
  } else {
    // Champion: only own sessions regardless of param
    query = query.eq('champion_user_id', user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { champion_user_id, session_date, title } = await req.json()
  if (!champion_user_id || !session_date || !title?.trim()) {
    return NextResponse.json({ error: 'champion_user_id, session_date, title required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('check_up_sessions')
    .insert({
      champion_user_id,
      admin_user_id: admin.id,
      session_date,
      title: title.trim(),
    })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/sessions/[sessionId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { sessionId: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const isAdmin = !!user.user_metadata?.is_admin

  const { data: session, error } = await supabase
    .from('check_up_sessions')
    .select('*, action_items:session_action_items(* order by display_order asc), comments:session_comments(*, author:users(id,name,email))')
    .eq('id', params.sessionId)
    .single()

  if (error || !session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Champion can only access own session
  if (!isAdmin && session.champion_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch milestones for the champion (for SessionMiniGantt)
  const { data: milestones } = await supabase
    .from('milestones')
    .select('*')
    .eq('user_id', session.champion_user_id)
    .eq('publish_status', 'published')

  return NextResponse.json({ ...session, milestones: milestones ?? [] })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const allowed = ['title', 'notes', 'session_date'] as const
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('check_up_sessions')
    .update(updates)
    .eq('id', params.sessionId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('check_up_sessions')
    .delete()
    .eq('id', params.sessionId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/
git commit -m "[AX-1] feat(sessions): add session CRUD API routes"
```

---

## Task 3: Action Items + Comments API Routes

**Files:**
- Create: `app/api/sessions/[sessionId]/action-items/route.ts`
- Create: `app/api/sessions/[sessionId]/action-items/[itemId]/route.ts`
- Create: `app/api/sessions/[sessionId]/comments/route.ts`
- Create: `app/api/sessions/[sessionId]/comments/[commentId]/route.ts`

**Interfaces:**
- Consumes: `verifyJWT`, `verifyAdmin`, `createServiceClient`
- Produces: action-item and comment CRUD endpoints

- [ ] **Step 1: Create `app/api/sessions/[sessionId]/action-items/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { sessionId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { body, display_order } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('session_action_items')
    .insert({ session_id: params.sessionId, body: body.trim(), display_order: display_order ?? 0 })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/sessions/[sessionId]/action-items/[itemId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { sessionId: string; itemId: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const body = await req.json()
  const supabase = createServiceClient()

  // Verify the action item belongs to this session
  const { data: item } = await supabase
    .from('session_action_items')
    .select('id, session_id')
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)
    .single()
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (isAdmin) {
    // Admin can update everything
    if ('body' in body) updates.body = body.body?.trim()
    if ('display_order' in body) updates.display_order = body.display_order
    if ('is_completed' in body) {
      updates.is_completed = body.is_completed
      updates.completed_at = body.is_completed ? new Date().toISOString() : null
    }
  } else {
    // Champion can only toggle is_completed
    if ('is_completed' in body) {
      // Verify champion owns the session
      const { data: session } = await supabase
        .from('check_up_sessions')
        .select('champion_user_id')
        .eq('id', params.sessionId)
        .single()
      if (!session || session.champion_user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      updates.is_completed = body.is_completed
      updates.completed_at = body.is_completed ? new Date().toISOString() : null
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

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
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('session_action_items')
    .delete()
    .eq('id', params.itemId)
    .eq('session_id', params.sessionId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create `app/api/sessions/[sessionId]/comments/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { sessionId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const supabase = createServiceClient()

  // For champion: verify they own the session
  if (!isAdmin) {
    const { data: session } = await supabase
      .from('check_up_sessions')
      .select('champion_user_id')
      .eq('id', params.sessionId)
      .single()
    if (!session || session.champion_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('session_comments')
    .insert({
      session_id: params.sessionId,
      body: body.trim(),
      author_id: user.id,
      author_role: isAdmin ? 'admin' : 'champion',
    })
    .select('*, author:users(id,name,email)')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/sessions/[sessionId]/comments/[commentId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

type Params = { params: { sessionId: string; commentId: string } }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('session_comments')
    .select('id, author_id')
    .eq('id', params.commentId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.author_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('session_comments')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', params.commentId)
    .select('*, author:users(id,name,email)')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('session_comments')
    .select('id, author_id')
    .eq('id', params.commentId)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!isAdmin && existing.author_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('session_comments')
    .delete()
    .eq('id', params.commentId)

  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/
git commit -m "[AX-1] feat(sessions): add action-items and comments API routes"
```

---

## Task 4: Recording + AI Processing API

**Files:**
- Create: `app/api/sessions/[sessionId]/process/route.ts`

**Interfaces:**
- Consumes: `verifyAdmin`, `createServiceClient`, Supabase Storage, OpenAI Whisper API, `@ai-sdk/anthropic` Claude
- Produces: `POST /api/sessions/[sessionId]/process` → `{ notes: string, actionItems: { body: string }[] }`

- [ ] **Step 1: Install `openai` package**

```bash
cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
npm install openai
```

Expected: `openai` added to `package.json`.

- [ ] **Step 2: Add `OPENAI_API_KEY` to `.env.local.example`**

`.env.local.example`에 추가:
```
OPENAI_API_KEY=
```

- [ ] **Step 3: Create `app/api/sessions/[sessionId]/process/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import OpenAI from 'openai'
import { toFile } from 'openai'

const MODEL = 'claude-sonnet-4-6'
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type Params = { params: { sessionId: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  // Get session
  const { data: session } = await supabase
    .from('check_up_sessions')
    .select('id, champion_user_id')
    .eq('id', params.sessionId)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Parse multipart form data
  const formData = await req.formData()
  const audioFile = formData.get('audio') as File | null
  const durationStr = formData.get('recordingDurationSec') as string | null
  if (!audioFile) return NextResponse.json({ error: 'audio file required' }, { status: 400 })

  const recordingDurationSec = durationStr ? parseInt(durationStr, 10) : null

  try {
    // 1. Update status: uploading
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'uploading', recording_duration_sec: recordingDurationSec })
      .eq('id', params.sessionId)

    // 2. Upload audio to Supabase Storage
    const audioBuffer = await audioFile.arrayBuffer()
    const filePath = `sessions/${params.sessionId}/audio.webm`
    const { error: uploadError } = await supabase.storage
      .from('check-up-sessions')
      .upload(filePath, audioBuffer, {
        contentType: 'audio/webm',
        upsert: true,
      })
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

    // 3. Update status: transcribing
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'transcribing', audio_file_path: filePath })
      .eq('id', params.sessionId)

    // 4. Whisper STT
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' })
    const whisperFile = await toFile(audioBlob, 'audio.webm', { type: 'audio/webm' })
    const transcription = await openai.audio.transcriptions.create({
      file: whisperFile,
      model: 'whisper-1',
      language: 'ko',
    })
    const transcript = transcription.text

    // 5. Update status: summarizing
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'summarizing', raw_transcript: transcript })
      .eq('id', params.sessionId)

    // 6. Claude summarization
    const prompt = `당신은 1:1 미팅 노트 작성 전문가입니다.
아래는 Admin과 Champion 간의 체크업 세션 전사 내용입니다.

다음 두 가지를 JSON으로 반환하세요:
1. "notes": 미팅 주요 내용 요약 (plain text, 한국어, 3~5문단)
2. "actionItems": 액션 아이템 배열 (각 항목은 { "body": string } 형식)

전사 내용:
${transcript}

JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.`

    const { text } = await generateText({
      model: anthropic(MODEL),
      prompt,
    })

    let notes = ''
    let actionItems: { body: string }[] = []
    try {
      const parsed = JSON.parse(text.trim())
      notes = parsed.notes ?? ''
      actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems : []
    } catch {
      // If JSON parsing fails, use the raw text as notes
      notes = text
    }

    // 7. Save results
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'done', notes, updated_at: new Date().toISOString() })
      .eq('id', params.sessionId)

    if (actionItems.length > 0) {
      await supabase.from('session_action_items').insert(
        actionItems.map((item, idx) => ({
          session_id: params.sessionId,
          body: item.body,
          display_order: idx,
        }))
      )
    }

    return NextResponse.json({ notes, actionItems })
  } catch (err) {
    await supabase
      .from('check_up_sessions')
      .update({ processing_status: 'error' })
      .eq('id', params.sessionId)
    const message = err instanceof Error ? err.message : 'Processing failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/sessions/[sessionId]/process/ package.json package-lock.json .env.local.example
git commit -m "[AX-1] feat(sessions): add recording process API with Whisper STT and Claude summarization"
```

---

## Task 5: SessionMiniGantt Component

**Files:**
- Create: `components/SessionMiniGantt.tsx`

**Interfaces:**
- Consumes: `Milestone` type from `@/lib/types`
- Produces: `<SessionMiniGantt milestones={Milestone[]} sessionDate="2026-06-18" />`

- [ ] **Step 1: Create `components/SessionMiniGantt.tsx`**

```typescript
'use client'
import type { Milestone, MilestoneStatus } from '@/lib/types'

const STATUS_COLOR: Record<MilestoneStatus, string> = {
  not_started: '#94a3b8',
  in_progress: '#3b82f6',
  completed: '#22c55e',
  delayed: '#ef4444',
}
const STATUS_BG: Record<MilestoneStatus, string> = {
  not_started: 'rgba(148,163,184,0.3)',
  in_progress: 'rgba(59,130,246,0.25)',
  completed: 'rgba(34,197,94,0.25)',
  delayed: 'rgba(239,68,68,0.25)',
}
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_started: '미시작',
  in_progress: '진행 중',
  completed: '완료',
  delayed: '지연',
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

function fmt(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

interface Props {
  milestones: Milestone[]
  sessionDate: string
}

export function SessionMiniGantt({ milestones, sessionDate }: Props) {
  const windowStart = addDays(sessionDate, -3)
  const windowEnd = addDays(sessionDate, 3)
  const totalDays = 7

  const active = milestones.filter(m => {
    const start = m.start_date ?? m.due_date
    const end = m.due_date ?? m.start_date
    if (!start || !end) return false
    return start <= windowEnd && end >= windowStart
  })

  if (active.length === 0) return null

  // Date header labels: windowStart + 0..6 days
  const headerDates = Array.from({ length: totalDays }, (_, i) => addDays(windowStart, i))

  // Position of session date within window (0-100%)
  const sessionPct = (daysBetween(windowStart, sessionDate) / (totalDays - 1)) * 100

  return (
    <div
      className="mb-4 rounded-xl border p-3"
      style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
    >
      <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
        마일스톤 현황 ({fmt(windowStart)} ~ {fmt(windowEnd)})
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        {/* Label column */}
        <div style={{ width: 120, flexShrink: 0 }}>
          {/* Header spacer */}
          <div style={{ height: 20 }} />
          {active.map(m => (
            <div
              key={m.id}
              style={{
                height: 28,
                display: 'flex',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <span
                className="text-xs truncate"
                style={{ color: 'var(--text-primary)', maxWidth: 118 }}
                title={m.title}
              >
                {m.title}
              </span>
            </div>
          ))}
        </div>

        {/* Timeline column */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {/* Date header */}
          <div style={{ display: 'flex', height: 20, marginBottom: 0 }}>
            {headerDates.map((d, i) => (
              <div
                key={d}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 10,
                  color: d === sessionDate ? 'var(--blue-600)' : 'var(--text-disabled)',
                  fontWeight: d === sessionDate ? 700 : 400,
                }}
              >
                {fmt(d)}
              </div>
            ))}
          </div>

          {/* Session date vertical line */}
          <div
            style={{
              position: 'absolute',
              top: 20,
              bottom: 0,
              left: `${sessionPct}%`,
              width: 1,
              background: 'var(--blue-600)',
              opacity: 0.5,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          {/* Milestone bars */}
          {active.map(m => {
            const mStart = m.start_date ?? m.due_date!
            const mEnd = m.due_date ?? m.start_date!

            // Clamp to window
            const clampedStart = mStart < windowStart ? windowStart : mStart
            const clampedEnd = mEnd > windowEnd ? windowEnd : mEnd

            const leftPct = (daysBetween(windowStart, clampedStart) / (totalDays - 1)) * 100
            const rightPct = (daysBetween(windowStart, clampedEnd) / (totalDays - 1)) * 100
            const widthPct = Math.max(rightPct - leftPct, 100 / totalDays)

            return (
              <div
                key={m.id}
                style={{ height: 28, marginBottom: 4, position: 'relative' }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    height: 16,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    background: STATUS_BG[m.status],
                    border: `1.5px solid ${STATUS_COLOR[m.status]}`,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 4,
                    overflow: 'hidden',
                  }}
                  title={`${m.title} — ${STATUS_LABEL[m.status]}`}
                >
                  <span style={{ fontSize: 9, color: STATUS_COLOR[m.status], fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/SessionMiniGantt.tsx
git commit -m "[AX-1] feat(sessions): add SessionMiniGantt lightweight component"
```

---

## Task 6: RecordingPanel Component

**Files:**
- Create: `components/sessions/RecordingPanel.tsx`

**Interfaces:**
- Produces: `<RecordingPanel sessionId={string} recordingDurationSec={number|null} processingStatus={SessionProcessingStatus} onProcessed={(notes, actionItems) => void} />`

- [ ] **Step 1: Create `components/sessions/RecordingPanel.tsx`**

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Square, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { SessionActionItem, SessionProcessingStatus } from '@/lib/types'

interface Props {
  sessionId: string
  onProcessed: (notes: string, actionItems: SessionActionItem[]) => void
}

type Phase = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'summarizing' | 'done' | 'error'

const PHASE_LABELS: Record<Phase, string> = {
  idle: '대기',
  recording: '녹음 중',
  uploading: '파일 업로드 중',
  transcribing: '음성 전사 중 (Whisper AI)',
  summarizing: 'AI 요약 생성 중 (Claude)',
  done: '완료',
  error: '오류 발생',
}

const PHASE_ORDER: Phase[] = ['idle', 'recording', 'uploading', 'transcribing', 'summarizing', 'done']

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function RecordingPanel({ sessionId, onProcessed }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)      // recording elapsed seconds
  const [progress, setProgress] = useState(0)    // 0-100
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartRef = useRef<number>(0)
  const progressStartRef = useRef<number>(0)
  const estimatedTotalRef = useRef<number>(0)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(1000)
      mediaRecorderRef.current = recorder
      recordingStartRef.current = Date.now()
      setPhase('recording')
      setElapsed(0)
      elapsedIntervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - recordingStartRef.current) / 1000))
      }, 1000)
    } catch {
      toast.error('마이크 접근 권한이 필요합니다.')
    }
  }

  async function stopAndProcess() {
    if (!mediaRecorderRef.current) return

    const recorder = mediaRecorderRef.current
    const durationSec = Math.floor((Date.now() - recordingStartRef.current) / 1000)

    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)

    await new Promise<void>(resolve => {
      recorder.onstop = () => resolve()
      recorder.stop()
      recorder.stream.getTracks().forEach(t => t.stop())
    })

    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })

    // Estimate total processing time
    // Upload: 30s estimate | STT: durationSec * 0.08 | Summarize: 15s
    const uploadEstimate = 30
    const sttEstimate = Math.round(durationSec * 0.08)
    const summarizeEstimate = 15
    estimatedTotalRef.current = uploadEstimate + sttEstimate + summarizeEstimate

    setPhase('uploading')
    setProgress(0)
    progressStartRef.current = Date.now()

    // Start progress simulation via XHR
    await processWithXHR(audioBlob, durationSec, uploadEstimate, sttEstimate, summarizeEstimate)
  }

  function startProgressTimer(fromPct: number, toPct: number, durationMs: number, onDone?: () => void) {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    const startTime = Date.now()
    const range = toPct - fromPct
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const frac = Math.min(elapsed / durationMs, 1)
      const current = fromPct + range * frac
      setProgress(Math.round(current))

      // Remaining time based on overall progress
      const overallPct = current
      if (overallPct > 5) {
        const elapsedSec = (Date.now() - progressStartRef.current) / 1000
        const rate = overallPct / elapsedSec
        const remaining = Math.round((100 - overallPct) / rate)
        setRemainingSec(remaining > 10 ? remaining : null)
      }

      if (frac >= 1) {
        clearInterval(progressIntervalRef.current!)
        onDone?.()
      }
    }, 200)
  }

  async function processWithXHR(
    blob: Blob,
    durationSec: number,
    uploadEstimate: number,
    sttEstimate: number,
    summarizeEstimate: number
  ) {
    const supabase = createSupabaseBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPhase('error'); setErrorMsg('인증 오류'); return }

    const formData = new FormData()
    formData.append('audio', blob, 'audio.webm')
    formData.append('recordingDurationSec', String(durationSec))

    return new Promise<void>(resolve => {
      const xhr = new XMLHttpRequest()

      // Upload progress (0 → 20%)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const uploadPct = (e.loaded / e.total) * 20
          setProgress(Math.round(uploadPct))
        }
      }

      // Upload complete → start STT simulation (20 → 80%)
      xhr.upload.onload = () => {
        setPhase('transcribing')
        startProgressTimer(20, 80, sttEstimate * 1000, () => {
          // STT done → start summarize simulation (80 → 95%)
          setPhase('summarizing')
          startProgressTimer(80, 95, summarizeEstimate * 1000)
        })
      }

      xhr.onload = () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
        if (xhr.status >= 200 && xhr.status < 300) {
          setProgress(100)
          setRemainingSec(null)
          setPhase('done')
          try {
            const result = JSON.parse(xhr.responseText)
            onProcessed(result.notes ?? '', result.actionItems ?? [])
          } catch {
            onProcessed('', [])
          }
        } else {
          setPhase('error')
          try {
            const err = JSON.parse(xhr.responseText)
            setErrorMsg(err.error ?? '처리 실패')
          } catch {
            setErrorMsg('처리 실패')
          }
        }
        resolve()
      }

      xhr.onerror = () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
        setPhase('error')
        setErrorMsg('네트워크 오류')
        resolve()
      }

      xhr.open('POST', `/api/sessions/${sessionId}/process`)
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
      xhr.send(formData)
    })
  }

  function reset() {
    setPhase('idle')
    setProgress(0)
    setElapsed(0)
    setRemainingSec(null)
    setErrorMsg(null)
  }

  const isProcessing = ['uploading', 'transcribing', 'summarizing'].includes(phase)

  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
    >
      <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>녹음</p>

      {phase === 'idle' && (
        <button
          onClick={startRecording}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Mic className="h-4 w-4" />
          녹음 시작
        </button>
      )}

      {phase === 'recording' && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{
                background: '#ef4444',
                animation: 'pulse 1.2s cubic-bezier(0.4,0,0.6,1) infinite',
              }}
            />
            <span className="text-sm font-mono font-semibold" style={{ color: 'var(--error)' }}>
              REC {formatTime(elapsed)}
            </span>
          </div>
          <button
            onClick={stopAndProcess}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--error)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <Square className="h-4 w-4" />
            녹음 종료 & 처리
          </button>
        </div>
      )}

      {isProcessing && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              세션 처리 중...
            </span>
            {remainingSec && remainingSec > 10 ? (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                남은 시간 {formatTime(remainingSec)}
              </span>
            ) : remainingSec !== null ? (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>거의 완료 중...</span>
            ) : null}
          </div>

          {/* Progress bar */}
          <div
            className="w-full rounded-full h-2 mb-4"
            style={{ background: 'var(--border-subtle)' }}
          >
            <div
              className="h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: 'var(--blue-600)' }}
            />
          </div>
          <div className="text-right text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            {progress}%
          </div>

          {/* Stage list */}
          <div className="flex flex-col gap-1.5">
            {(['uploading', 'transcribing', 'summarizing', 'done'] as Phase[]).map((p) => {
              const phaseIdx = PHASE_ORDER.indexOf(p)
              const currentIdx = PHASE_ORDER.indexOf(phase)
              const isDone = phaseIdx < currentIdx
              const isCurrent = p === phase
              return (
                <div key={p} className="flex items-center gap-2 text-xs">
                  {isDone ? (
                    <span style={{ color: 'var(--success)' }}>✅</span>
                  ) : isCurrent ? (
                    <span style={{ color: 'var(--blue-600)', animation: 'pulse 1s infinite' }}>🔄</span>
                  ) : (
                    <span style={{ color: 'var(--text-disabled)' }}>⬜</span>
                  )}
                  <span style={{ color: isCurrent ? 'var(--text-primary)' : isDone ? 'var(--text-secondary)' : 'var(--text-disabled)', fontWeight: isCurrent ? 600 : 400 }}>
                    {PHASE_LABELS[p]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--success)' }}>
          <span>✅</span>
          <span className="font-semibold">처리 완료! 아래 내용을 확인하고 수정하세요.</span>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--error)' }}>
            <span>❌</span>
            <span>{errorMsg ?? '처리 중 오류가 발생했습니다.'}</span>
          </div>
          <button
            onClick={reset}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <RefreshCw className="h-3 w-3" />
            다시 시도
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/sessions/RecordingPanel.tsx
git commit -m "[AX-1] feat(sessions): add RecordingPanel with progress UI"
```

---

## Task 7: Admin Session UI

**Files:**
- Create: `components/sessions/AdminSessionList.tsx`
- Create: `components/sessions/AdminSessionDetail.tsx`
- Modify: `app/admin/champions/[userId]/page.tsx`

**Interfaces:**
- Consumes: `CheckUpSession`, `SessionActionItem`, `SessionComment`, `SessionMiniGantt`, `RecordingPanel`
- Produces: Admin session list/detail views, integrated as a new tab in the champion detail page

- [ ] **Step 1: Create `components/sessions/AdminSessionList.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { CheckUpSession } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  idle: '미처리',
  uploading: '업로드 중',
  transcribing: '전사 중',
  summarizing: '요약 중',
  done: '완료',
  error: '오류',
}
const STATUS_COLOR: Record<string, string> = {
  idle: 'var(--text-disabled)',
  uploading: 'var(--blue-600)',
  transcribing: 'var(--blue-600)',
  summarizing: 'var(--blue-600)',
  done: 'var(--success)',
  error: 'var(--error)',
}

interface Props {
  championUserId: string
  sessions: CheckUpSession[]
  onSelect: (session: CheckUpSession) => void
  onRefresh: () => void
}

export function AdminSessionList({ championUserId, sessions, onSelect, onRefresh }: Props) {
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0])
  const [showForm, setShowForm] = useState(false)

  async function createSession() {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const session = await apiFetch<CheckUpSession>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          champion_user_id: championUserId,
          session_date: newDate,
          title: newTitle.trim(),
        }),
      })
      toast.success('세션이 생성되었습니다.')
      setShowForm(false)
      setNewTitle('')
      onRefresh()
      onSelect(session)
    } catch (e) {
      toast.error('세션 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>체크업 세션</h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold"
          style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Plus className="h-3 w-3" />
          새 세션
        </button>
      </div>

      {showForm && (
        <div
          className="rounded-xl border p-3 mb-4 flex flex-col gap-2"
          style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}
        >
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="세션 제목 (예: 6월 3주차 체크업)"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 text-xs py-2 rounded-lg"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              취소
            </button>
            <button
              onClick={createSession}
              disabled={creating || !newTitle.trim()}
              className="flex-1 text-xs py-2 rounded-lg font-semibold disabled:opacity-40"
              style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {creating ? '생성 중...' : '생성'}
            </button>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-disabled)' }}>아직 세션이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="w-full flex items-center justify-between p-3 rounded-xl border text-left"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', cursor: 'pointer' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.session_date}</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ color: STATUS_COLOR[s.processing_status], background: `${STATUS_COLOR[s.processing_status]}18`, fontWeight: 600 }}
                >
                  {STATUS_LABEL[s.processing_status]}
                </span>
                <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-disabled)' }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/sessions/AdminSessionDetail.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { ArrowLeft, Trash2, Send } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { SessionMiniGantt } from '@/components/SessionMiniGantt'
import { RecordingPanel } from '@/components/sessions/RecordingPanel'
import { parseName } from '@/lib/utils'
import type { CheckUpSession, SessionActionItem, SessionComment, Milestone } from '@/lib/types'

interface Props {
  sessionId: string
  currentAdminId: string
  onBack: () => void
  onDeleted: () => void
}

export function AdminSessionDetail({ sessionId, currentAdminId, onBack, onDeleted }: Props) {
  const [session, setSession] = useState<CheckUpSession | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [actionItems, setActionItems] = useState<SessionActionItem[]>([])
  const [comments, setComments] = useState<SessionComment[]>([])
  const [loading, setLoading] = useState(true)

  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [newItemBody, setNewItemBody] = useState('')
  const [addingItem, setAddingItem] = useState(false)

  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<CheckUpSession & { action_items: SessionActionItem[]; comments: SessionComment[]; milestones: Milestone[] }>(
        `/api/sessions/${sessionId}`
      )
      setSession(data)
      setNotes(data.notes ?? '')
      setActionItems(data.action_items ?? [])
      setComments(data.comments ?? [])
      setMilestones(data.milestones ?? [])
    } catch {
      toast.error('세션을 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sessionId])

  async function saveNotes() {
    setSaving(true)
    try {
      await apiFetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      })
      toast.success('저장되었습니다.')
    } catch { toast.error('저장 실패') } finally { setSaving(false) }
  }

  async function deleteSession() {
    if (!confirm('이 세션을 삭제할까요?')) return
    setDeleting(true)
    try {
      await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      toast.success('삭제되었습니다.')
      onDeleted()
    } catch { toast.error('삭제 실패') } finally { setDeleting(false) }
  }

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

  async function postComment() {
    if (!newComment.trim()) return
    setPostingComment(true)
    try {
      const c = await apiFetch<SessionComment>(`/api/sessions/${sessionId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: newComment.trim() }),
      })
      setComments(v => [...v, c])
      setNewComment('')
    } catch { toast.error('댓글 작성 실패') } finally { setPostingComment(false) }
  }

  async function saveEditComment(commentId: string) {
    try {
      const c = await apiFetch<SessionComment>(`/api/sessions/${sessionId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: editingBody.trim() }),
      })
      setComments(v => v.map(x => x.id === commentId ? c : x))
      setEditingCommentId(null)
    } catch { toast.error('수정 실패') }
  }

  async function deleteComment(commentId: string) {
    try {
      await apiFetch(`/api/sessions/${sessionId}/comments/${commentId}`, { method: 'DELETE' })
      setComments(v => v.filter(c => c.id !== commentId))
    } catch { toast.error('삭제 실패') }
  }

  function handleProcessed(processedNotes: string, processedItems: SessionActionItem[]) {
    setNotes(processedNotes)
    setActionItems(processedItems)
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1,2,3].map(i => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }
  if (!session) return null

  function relativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return '방금'
    if (min < 60) return `${min}분 전`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}시간 전`
    return `${Math.floor(h / 24)}일 전`
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs"
          style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <ArrowLeft className="h-3 w-3" /> 목록으로
        </button>
        <button
          onClick={deleteSession}
          disabled={deleting}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg disabled:opacity-40"
          style={{ color: 'var(--error)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
        >
          <Trash2 className="h-3 w-3" />
          삭제
        </button>
      </div>

      <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{session.title}</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{session.session_date}</p>

      {/* Mini Gantt */}
      <SessionMiniGantt milestones={milestones} sessionDate={session.session_date} />

      {/* Recording Panel */}
      <RecordingPanel sessionId={sessionId} onProcessed={handleProcessed} />

      {/* Notes */}
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>📝 미팅 노트</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={8}
          placeholder="미팅 내용을 입력하거나 녹음 후 AI 요약을 사용하세요."
          className="w-full rounded-xl border p-3 text-sm resize-none"
          style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
        />
      </div>

      {/* Action Items */}
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>✅ 액션 아이템</p>
        <div className="flex flex-col gap-1.5 mb-2">
          {actionItems.map(item => (
            <div
              key={item.id}
              className="flex items-center gap-2 p-2 rounded-lg border"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
            >
              <input
                type="checkbox"
                checked={item.is_completed}
                onChange={() => toggleItem(item)}
                className="h-4 w-4 cursor-pointer"
                style={{ accentColor: 'var(--blue-600)' }}
              />
              <span
                className="flex-1 text-sm"
                style={{
                  color: 'var(--text-primary)',
                  textDecoration: item.is_completed ? 'line-through' : 'none',
                  opacity: item.is_completed ? 0.5 : 1,
                }}
              >
                {item.body}
              </span>
              <button
                onClick={() => deleteItem(item.id)}
                className="text-xs"
                style={{ color: 'var(--error)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newItemBody}
            onChange={e => setNewItemBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem() }}
            placeholder="액션 아이템 추가..."
            className="flex-1 rounded-lg border px-3 py-2 text-xs"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button
            onClick={addItem}
            disabled={addingItem || !newItemBody.trim()}
            className="text-xs px-3 py-2 rounded-lg font-semibold disabled:opacity-40"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            추가
          </button>
        </div>
      </div>

      {/* Comments */}
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>💬 댓글 ({comments.length})</p>
        <div className="flex flex-col gap-2 mb-2">
          {comments.map(c => {
            const authorName = (c.author as any)?.name
              ? parseName((c.author as any).name).displayName
              : c.author_role === 'admin' ? '관리자' : '챔피언'
            return (
              <div
                key={c.id}
                className="rounded-lg border p-2 text-xs"
                style={{
                  background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex justify-between mb-0.5">
                  <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                    {authorName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                    {c.author_id === currentAdminId && (
                      <button
                        onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body) }}
                        style={{ color: 'var(--text-disabled)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                      >편집</button>
                    )}
                    <button
                      onClick={() => deleteComment(c.id)}
                      style={{ color: 'var(--error)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                    >삭제</button>
                  </div>
                </div>
                {editingCommentId === c.id ? (
                  <div>
                    <textarea
                      value={editingBody}
                      onChange={e => setEditingBody(e.target.value)}
                      rows={2}
                      className="w-full rounded border p-1.5 resize-none mb-1 text-xs"
                      style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditingCommentId(null)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>취소</button>
                      <button onClick={() => saveEditComment(c.id)}
                        className="text-xs px-2 py-0.5 rounded font-semibold"
                        style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}>저장</button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postComment() }}
            placeholder="댓글 입력... (Cmd+Enter)"
            className="flex-1 rounded-lg border px-3 py-2 text-xs"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button
            onClick={postComment}
            disabled={postingComment || !newComment.trim()}
            className="text-xs px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={saveNotes}
        disabled={saving}
        className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
        style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        {saving ? '저장 중...' : '저장'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Add "체크업 세션" tab to `app/admin/champions/[userId]/page.tsx`**

파일 상단 import 추가:
```typescript
import { AdminSessionList } from '@/components/sessions/AdminSessionList'
import { AdminSessionDetail } from '@/components/sessions/AdminSessionDetail'
```

`useState` 선언부에 추가 (기존 `const [data, setData]` 근처):
```typescript
// session tab
const [sessionTab, setSessionTab] = useState<'list' | 'detail'>('list')
const [sessions, setSessions] = useState<import('@/lib/types').CheckUpSession[]>([])
const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
const [activeMainTab, setActiveMainTab] = useState<'submissions' | 'charter' | 'milestones' | 'sessions'>('submissions')
```

탭 버튼 섹션을 찾아 "체크업 세션" 탭 추가. 파일에서 기존 탭 섹션 패턴을 확인 후 아래 방식으로 추가:

```typescript
// 기존 탭 버튼들 옆에 추가
<button
  onClick={() => {
    setActiveMainTab('sessions')
    apiFetch<import('@/lib/types').CheckUpSession[]>(`/api/sessions?championId=${userId}`)
      .then(setSessions)
      .catch(() => {})
  }}
  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
  style={{
    background: activeMainTab === 'sessions' ? 'var(--blue-600)' : 'var(--surface-secondary)',
    color: activeMainTab === 'sessions' ? '#fff' : 'var(--text-secondary)',
    border: 'none', cursor: 'pointer'
  }}
>
  체크업 세션
</button>
```

탭 콘텐츠 영역에 추가:
```typescript
{activeMainTab === 'sessions' && (
  <section className="mb-8">
    {sessionTab === 'list' ? (
      <AdminSessionList
        championUserId={userId}
        sessions={sessions}
        onSelect={(s) => { setSelectedSessionId(s.id); setSessionTab('detail') }}
        onRefresh={() => {
          apiFetch<import('@/lib/types').CheckUpSession[]>(`/api/sessions?championId=${userId}`)
            .then(setSessions)
            .catch(() => {})
        }}
      />
    ) : selectedSessionId ? (
      <AdminSessionDetail
        sessionId={selectedSessionId}
        currentAdminId={currentAdminId ?? ''}
        onBack={() => {
          setSessionTab('list')
          apiFetch<import('@/lib/types').CheckUpSession[]>(`/api/sessions?championId=${userId}`)
            .then(setSessions)
            .catch(() => {})
        }}
        onDeleted={() => {
          setSessionTab('list')
          apiFetch<import('@/lib/types').CheckUpSession[]>(`/api/sessions?championId=${userId}`)
            .then(setSessions)
            .catch(() => {})
        }}
      />
    ) : null}
  </section>
)}
```

- [ ] **Step 4: Commit**

```bash
git add components/sessions/AdminSessionList.tsx components/sessions/AdminSessionDetail.tsx app/admin/champions/[userId]/page.tsx
git commit -m "[AX-1] feat(sessions): add admin session list and detail UI"
```

---

## Task 8: Champion Session UI

**Files:**
- Create: `components/sessions/ChampionSessionDetail.tsx`
- Create: `app/(champion)/my-project/sessions/page.tsx`
- Create: `app/(champion)/my-project/sessions/[sessionId]/page.tsx`
- Modify: `app/(champion)/ChampionSidebar.tsx`

**Interfaces:**
- Consumes: `CheckUpSession`, `SessionActionItem`, `SessionComment`, `SessionMiniGantt`
- Produces: Champion session list and read-only detail with checkbox + comments

- [ ] **Step 1: Create `components/sessions/ChampionSessionDetail.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { SessionMiniGantt } from '@/components/SessionMiniGantt'
import { parseName } from '@/lib/utils'
import type { CheckUpSession, SessionActionItem, SessionComment, Milestone } from '@/lib/types'

interface Props {
  sessionId: string
  currentUserId: string
}

export function ChampionSessionDetail({ sessionId, currentUserId }: Props) {
  const router = useRouter()
  const [session, setSession] = useState<CheckUpSession | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [actionItems, setActionItems] = useState<SessionActionItem[]>([])
  const [comments, setComments] = useState<SessionComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')

  useEffect(() => {
    apiFetch<CheckUpSession & { action_items: SessionActionItem[]; comments: SessionComment[]; milestones: Milestone[] }>(
      `/api/sessions/${sessionId}`
    )
      .then(data => {
        setSession(data)
        setActionItems(data.action_items ?? [])
        setComments(data.comments ?? [])
        setMilestones(data.milestones ?? [])
      })
      .catch(() => toast.error('세션을 불러올 수 없습니다.'))
      .finally(() => setLoading(false))
  }, [sessionId])

  async function toggleItem(item: SessionActionItem) {
    try {
      const updated = await apiFetch<SessionActionItem>(
        `/api/sessions/${sessionId}/action-items/${item.id}`,
        { method: 'PATCH', body: JSON.stringify({ is_completed: !item.is_completed }) }
      )
      setActionItems(v => v.map(i => i.id === item.id ? updated : i))
    } catch { toast.error('업데이트 실패') }
  }

  async function postComment() {
    if (!newComment.trim()) return
    setPostingComment(true)
    try {
      const c = await apiFetch<SessionComment>(`/api/sessions/${sessionId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: newComment.trim() }),
      })
      setComments(v => [...v, c])
      setNewComment('')
    } catch { toast.error('댓글 작성 실패') } finally { setPostingComment(false) }
  }

  async function saveEditComment(commentId: string) {
    try {
      const c = await apiFetch<SessionComment>(`/api/sessions/${sessionId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: editingBody.trim() }),
      })
      setComments(v => v.map(x => x.id === commentId ? c : x))
      setEditingCommentId(null)
    } catch { toast.error('수정 실패') }
  }

  async function deleteComment(commentId: string) {
    try {
      await apiFetch(`/api/sessions/${sessionId}/comments/${commentId}`, { method: 'DELETE' })
      setComments(v => v.filter(c => c.id !== commentId))
    } catch { toast.error('삭제 실패') }
  }

  function relativeTime(ts: string) {
    const diff = Date.now() - new Date(ts).getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return '방금'
    if (min < 60) return `${min}분 전`
    const h = Math.floor(min / 60)
    if (h < 24) return `${h}시간 전`
    return `${Math.floor(h / 24)}일 전`
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1,2,3].map(i => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
        ))}
      </div>
    )
  }
  if (!session) return null

  return (
    <div>
      <button
        onClick={() => router.push('/my-project/sessions')}
        className="flex items-center gap-1 text-xs mb-4"
        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft className="h-3 w-3" /> 목록으로
      </button>

      <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{session.title}</h3>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{session.session_date}</p>

      {/* Mini Gantt */}
      <SessionMiniGantt milestones={milestones} sessionDate={session.session_date} />

      {/* Notes — read only */}
      {session.notes && (
        <div
          className="rounded-xl border p-4 mb-4"
          style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
        >
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>📝 미팅 노트</p>
          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{session.notes}</p>
        </div>
      )}

      {/* Action Items — toggle only */}
      {actionItems.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>✅ 내 액션 아이템</p>
          <div className="flex flex-col gap-1.5">
            {actionItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2 rounded-lg border"
                style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
              >
                <input
                  type="checkbox"
                  checked={item.is_completed}
                  onChange={() => toggleItem(item)}
                  className="h-4 w-4 cursor-pointer"
                  style={{ accentColor: 'var(--blue-600)' }}
                />
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: 'var(--text-primary)',
                    textDecoration: item.is_completed ? 'line-through' : 'none',
                    opacity: item.is_completed ? 0.5 : 1,
                  }}
                >
                  {item.body}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>💬 댓글 ({comments.length})</p>
        <div className="flex flex-col gap-2 mb-2">
          {comments.map(c => {
            const authorName = (c.author as any)?.name
              ? parseName((c.author as any).name).displayName
              : c.author_role === 'admin' ? '관리자' : '챔피언'
            const isOwn = c.author_id === currentUserId
            return (
              <div
                key={c.id}
                className="rounded-lg border p-2 text-xs"
                style={{
                  background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="flex justify-between mb-0.5">
                  <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                    {authorName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                    {isOwn && (
                      <>
                        <button
                          onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body) }}
                          style={{ color: 'var(--text-disabled)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                        >편집</button>
                        <button
                          onClick={() => deleteComment(c.id)}
                          style={{ color: 'var(--error)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer' }}
                        >삭제</button>
                      </>
                    )}
                  </div>
                </div>
                {editingCommentId === c.id ? (
                  <div>
                    <textarea
                      value={editingBody}
                      onChange={e => setEditingBody(e.target.value)}
                      rows={2}
                      className="w-full rounded border p-1.5 resize-none mb-1 text-xs"
                      style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditingCommentId(null)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}>취소</button>
                      <button onClick={() => saveEditComment(c.id)}
                        className="text-xs px-2 py-0.5 rounded font-semibold"
                        style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}>저장</button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{c.body}</p>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postComment() }}
            placeholder="댓글 입력... (Cmd+Enter)"
            className="flex-1 rounded-lg border px-3 py-2 text-xs"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button
            onClick={postComment}
            disabled={postingComment || !newComment.trim()}
            className="text-xs px-3 py-2 rounded-lg disabled:opacity-40"
            style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(champion)/my-project/sessions/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createUserServerClient, createServiceClient } from '@/lib/supabase/server'
import type { CheckUpSession } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  idle: '미처리', uploading: '업로드 중', transcribing: '전사 중',
  summarizing: '요약 중', done: '완료', error: '오류',
}
const STATUS_COLOR: Record<string, string> = {
  idle: 'var(--text-disabled)', uploading: 'var(--blue-600)',
  transcribing: 'var(--blue-600)', summarizing: 'var(--blue-600)',
  done: 'var(--success)', error: 'var(--error)',
}

export default async function ChampionSessionsPage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const serviceClient = createServiceClient()
  const { data: sessions } = await serviceClient
    .from('check_up_sessions')
    .select('*')
    .eq('champion_user_id', user.id)
    .order('session_date', { ascending: false })

  const list = (sessions ?? []) as CheckUpSession[]

  return (
    <div>
      <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>체크업 세션</h1>

      {list.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-disabled)' }}>
          아직 체크업 세션이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map(s => (
            <Link
              key={s.id}
              href={`/my-project/sessions/${s.id}`}
              className="flex items-center justify-between p-3 rounded-xl border"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', textDecoration: 'none' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.session_date}</p>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ color: STATUS_COLOR[s.processing_status], background: `${STATUS_COLOR[s.processing_status]}18` }}
              >
                {STATUS_LABEL[s.processing_status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(champion)/my-project/sessions/[sessionId]/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { ChampionSessionDetail } from '@/components/sessions/ChampionSessionDetail'

export default async function ChampionSessionDetailPage({ params }: { params: { sessionId: string } }) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <ChampionSessionDetail sessionId={params.sessionId} currentUserId={user.id} />
}
```

- [ ] **Step 4: Add nav item to `app/(champion)/ChampionSidebar.tsx`**

기존 NAV 배열에 항목 추가:
```typescript
import { Calendar } from 'lucide-react'  // 기존 import에 Calendar 추가

// NAV 배열에 추가:
{ icon: Calendar, label: '체크업 세션', href: '/my-project/sessions', match: (p: string) => p.startsWith('/my-project/sessions') },

// MOBILE_TABS 배열에 추가:
{ icon: Calendar, label: '체크업', href: '/my-project/sessions' },
```

- [ ] **Step 5: Commit**

```bash
git add components/sessions/ChampionSessionDetail.tsx app/\(champion\)/my-project/sessions/ app/\(champion\)/ChampionSidebar.tsx
git commit -m "[AX-1] feat(sessions): add champion session list and detail views"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: DB 스키마 ✅, API Routes ✅, 녹음 처리 ✅, Progress UI ✅, SessionMiniGantt ✅, Admin UI ✅, Champion UI ✅, 권한 매트릭스 ✅, 타입 ✅, 환경변수 ✅
- [x] **Placeholders**: 없음 — 모든 단계에 실제 코드 포함
- [x] **Type consistency**: `CheckUpSession`, `SessionActionItem`, `SessionComment` — Task 1에서 정의, Task 2-8 모두 동일한 타입명 사용
- [x] **Security**: Champion은 자신의 세션만 접근 가능 (API routes에서 `user.id` 강제 적용), 어드민 전용 기능은 `verifyAdmin` 적용
- [x] **Progress UI**: XHR upload progress (0→20%) + interval simulation (20→95%) + XHR onload (→100%) 모두 구현
