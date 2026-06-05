# Champion Admin Hotline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Champion View 우하단 FAB → Floating 채팅 버블로 Admin과 실시간 메시지를 주고받고, Admin은 `/admin/hotline` Inbox에서 모든 대화를 관리한다.

**Architecture:** Supabase PostgreSQL에 `hotline_messages` 테이블을 생성하고 Supabase Realtime으로 Champion 브라우저에 실시간 push한다. Champion이 메시지를 보내면 Admin에게 Gmail SMTP로 딥링크 이메일을 발송한다. Admin은 사이드바 핫라인 탭에서 모든 대화를 조회·답장한다.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + Realtime), nodemailer (기존), lucide-react, Tailwind CSS, `apiFetch` (기존 API client)

---

## File Map

| 파일 | 역할 |
|------|------|
| `supabase/migrations/019_hotline_messages.sql` | 새 테이블 + RLS + Realtime 활성화 |
| `lib/types.ts` | `HotlineMessage`, `HotlineThread` 타입 추가 |
| `lib/notifications.ts` | `notifyHotlineMessage` 함수 추가 |
| `app/api/hotline/messages/route.ts` | Champion: GET 스레드 조회, POST 메시지 전송 |
| `app/api/hotline/read/route.ts` | PATCH: 읽음 처리 (champion & admin 공용) |
| `app/api/admin/hotline/route.ts` | Admin: GET inbox 목록 |
| `app/api/admin/hotline/messages/route.ts` | Admin: GET 특정 스레드, POST 답장 |
| `components/HotlineFAB.tsx` | FAB + Floating 채팅 패널 (champion용) |
| `app/(champion)/layout.tsx` | `<HotlineFAB />` 마운트 |
| `app/admin/hotline/page.tsx` | Admin Hotline Inbox 서버 컴포넌트 |
| `app/admin/hotline/HotlineInboxClient.tsx` | Inbox UI + 대화 스레드 클라이언트 |
| `app/admin/AdminSidebar.tsx` | 핫라인 메뉴 + unread 뱃지 추가 |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/019_hotline_messages.sql`
- Modify: `.gitignore`

- [ ] **Step 1: .gitignore에 `.superpowers/` 추가**

`.gitignore` 파일 하단에 추가:
```
.superpowers/
```

- [ ] **Step 2: migration 파일 생성**

```sql
-- supabase/migrations/019_hotline_messages.sql

CREATE TABLE hotline_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role      TEXT NOT NULL CHECK (sender_role IN ('champion', 'admin')),
  body             TEXT NOT NULL CHECK (char_length(body) > 0),
  read_by_champion BOOLEAN NOT NULL DEFAULT FALSE,
  read_by_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hotline_champion_created
  ON hotline_messages(champion_user_id, created_at);

ALTER TABLE hotline_messages ENABLE ROW LEVEL SECURITY;

-- champion: 자신의 스레드만 접근 가능
CREATE POLICY "hotline_champion_own" ON hotline_messages
  FOR ALL
  USING (auth.uid() = champion_user_id);

-- admin: 모든 스레드 접근 가능
CREATE POLICY "hotline_admin_all" ON hotline_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND raw_user_meta_data->>'is_admin' = 'true'
    )
  );

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE hotline_messages;
```

- [ ] **Step 3: Supabase에 migration 적용**

Supabase 대시보드 → SQL Editor에서 위 SQL 실행 (또는 `supabase db push` 사용).  
테이블이 생성되었는지 Table Editor에서 확인.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/019_hotline_messages.sql .gitignore
git commit -m "feat: hotline_messages 테이블 추가"
```

---

## Task 2: 타입 정의

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: `HotlineMessage`, `HotlineThread` 타입을 `lib/types.ts` 하단에 추가**

```typescript
// lib/types.ts 기존 내용 끝에 추가

export interface HotlineMessage {
  id: string
  champion_user_id: string
  sender_id: string
  sender_role: 'champion' | 'admin'
  body: string
  read_by_champion: boolean
  read_by_admin: boolean
  created_at: string
}

export interface HotlineThread {
  champion_user_id: string
  champion_name: string
  last_message: string
  last_message_at: string
  last_sender_role: 'champion' | 'admin'
  unread_count: number
}
```

- [ ] **Step 2: 타입 체크**

```bash
bun typecheck
```

오류 없으면 통과.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: HotlineMessage, HotlineThread 타입 추가"
```

---

## Task 3: 이메일 알림 함수

**Files:**
- Modify: `lib/notifications.ts`

- [ ] **Step 1: `notifyHotlineMessage` 함수를 `lib/notifications.ts` 하단에 추가**

```typescript
// lib/notifications.ts 기존 내용 끝에 추가

export async function notifyHotlineMessage(params: {
  champion: Pick<User, 'id' | 'name'>
  body: string
}): Promise<void> {
  const to = adminEmail()
  if (!to) return
  const { champion, body } = params
  const link = `${appBaseUrl()}/admin/hotline?champion=${encodeURIComponent(champion.id)}`
  const subject = `[핫라인] ${escapeHtml(champion.name)} 에서 메시지가 도착했습니다`
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">💬 Admin 핫라인 메시지</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(champion.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b;vertical-align:top">메시지</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(body)}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">대화 바로 보기</a>
  </div>
</div>
`.trim()
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyHotlineMessage failed:', e)
  }
}
```

- [ ] **Step 2: 타입 체크**

```bash
bun typecheck
```

- [ ] **Step 3: Commit**

```bash
git add lib/notifications.ts
git commit -m "feat: notifyHotlineMessage 이메일 알림 함수 추가"
```

---

## Task 4: Champion Messages API

**Files:**
- Create: `app/api/hotline/messages/route.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// app/api/hotline/messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyHotlineMessage } from '@/lib/notifications'
import type { HotlineMessage } from '@/lib/types'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('*')
    .eq('champion_user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as HotlineMessage[])
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { body?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: msg, error } = await supabase
    .from('hotline_messages')
    .insert({
      champion_user_id: user.id,
      sender_id: user.id,
      sender_role: 'champion',
      body: body.body.trim(),
      read_by_champion: true,
      read_by_admin: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 이메일 알림 (fire-and-forget)
  const championName = (user.user_metadata?.name as string | undefined) ?? user.email ?? '챔피언'
  notifyHotlineMessage({ champion: { id: user.id, name: championName }, body: body.body.trim() })
    .catch(() => {})

  return NextResponse.json(msg as HotlineMessage, { status: 201 })
}
```

- [ ] **Step 2: 타입 체크**

```bash
bun typecheck
```

- [ ] **Step 3: 수동 테스트 — Champion 메시지 전송**

브라우저에서 Champion으로 로그인 후 DevTools 콘솔:
```javascript
const { data: { session } } = await (await import('@/lib/supabase/client')).createSupabaseBrowserClient().auth.getSession()
const res = await fetch('/api/hotline/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
  body: JSON.stringify({ body: '테스트 메시지' })
})
console.log(await res.json()) // { id: '...', body: '테스트 메시지', ... }
```

- [ ] **Step 4: Commit**

```bash
git add app/api/hotline/messages/route.ts
git commit -m "feat: champion hotline messages API (GET, POST)"
```

---

## Task 5: 읽음 처리 API

**Files:**
- Create: `app/api/hotline/read/route.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// app/api/hotline/read/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { champion_user_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const isAdmin = user.user_metadata?.is_admin === true
  const supabase = createServiceClient()

  if (isAdmin) {
    // Admin이 읽으면: champion이 보낸 메시지를 read_by_admin = true
    if (!body.champion_user_id) {
      return NextResponse.json({ error: 'champion_user_id required' }, { status: 400 })
    }
    const { error } = await supabase
      .from('hotline_messages')
      .update({ read_by_admin: true })
      .eq('champion_user_id', body.champion_user_id)
      .eq('sender_role', 'champion')
      .eq('read_by_admin', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // Champion이 읽으면: admin이 보낸 메시지를 read_by_champion = true
    const { error } = await supabase
      .from('hotline_messages')
      .update({ read_by_champion: true })
      .eq('champion_user_id', user.id)
      .eq('sender_role', 'admin')
      .eq('read_by_champion', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: 타입 체크**

```bash
bun typecheck
```

- [ ] **Step 3: Commit**

```bash
git add app/api/hotline/read/route.ts
git commit -m "feat: hotline read API (PATCH)"
```

---

## Task 6: Admin Inbox API

**Files:**
- Create: `app/api/admin/hotline/route.ts`
- Create: `app/api/admin/hotline/messages/route.ts`

- [ ] **Step 1: Admin inbox 목록 API 생성**

```typescript
// app/api/admin/hotline/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { HotlineThread } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('champion_user_id, sender_role, body, created_at, read_by_admin, users!champion_user_id(name)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // champion_user_id 별로 그룹핑 (첫 번째 레코드 = 가장 최근)
  const threadMap = new Map<string, HotlineThread>()
  for (const row of (data ?? [])) {
    const userId = row.champion_user_id as string
    if (!threadMap.has(userId)) {
      const userRow = row.users as unknown as { name: string } | null
      threadMap.set(userId, {
        champion_user_id: userId,
        champion_name: userRow?.name ?? userId,
        last_message: row.body as string,
        last_message_at: row.created_at as string,
        last_sender_role: row.sender_role as 'champion' | 'admin',
        unread_count: 0,
      })
    }
    // champion이 보낸 메시지 중 admin이 아직 안 읽은 것 카운트
    if (row.sender_role === 'champion' && !row.read_by_admin) {
      const thread = threadMap.get(userId)!
      thread.unread_count += 1
    }
  }

  const threads = Array.from(threadMap.values())
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())

  return NextResponse.json(threads)
}
```

- [ ] **Step 2: Admin 스레드 조회 + 답장 API 생성**

```typescript
// app/api/admin/hotline/messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { HotlineMessage } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const championUserId = searchParams.get('champion')
  if (!championUserId) return NextResponse.json({ error: 'champion param required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('*')
    .eq('champion_user_id', championUserId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as HotlineMessage[])
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { champion_user_id?: string; body?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.champion_user_id || !body.body?.trim()) {
    return NextResponse.json({ error: 'champion_user_id and body required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: msg, error } = await supabase
    .from('hotline_messages')
    .insert({
      champion_user_id: body.champion_user_id,
      sender_id: admin.id,
      sender_role: 'admin',
      body: body.body.trim(),
      read_by_champion: false,
      read_by_admin: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(msg as HotlineMessage, { status: 201 })
}
```

- [ ] **Step 3: 타입 체크**

```bash
bun typecheck
```

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/hotline/route.ts app/api/admin/hotline/messages/route.ts
git commit -m "feat: admin hotline inbox + messages API"
```

---

## Task 7: HotlineFAB 컴포넌트 (Champion 측)

**Files:**
- Create: `components/HotlineFAB.tsx`

- [ ] **Step 1: 파일 생성**

```typescript
// components/HotlineFAB.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-client'
import type { HotlineMessage } from '@/lib/types'

export function HotlineFAB() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<HotlineMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createSupabaseBrowserClient()

  // 현재 로그인 사용자 ID 조회
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
    })
  }, [supabase])

  // 메시지 초기 로드
  useEffect(() => {
    if (!userId) return
    apiFetch<HotlineMessage[]>('/api/hotline/messages')
      .then(data => {
        setMessages(data)
        const adminUnread = data.filter(m => m.sender_role === 'admin' && !m.read_by_champion).length
        setUnread(adminUnread)
      })
      .catch(() => {})
  }, [userId])

  // Supabase Realtime 구독
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`hotline-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hotline_messages',
          filter: `champion_user_id=eq.${userId}`,
        },
        (payload) => {
          const msg = payload.new as HotlineMessage
          setMessages(prev => [...prev, msg])
          if (msg.sender_role === 'admin') {
            setOpen(prev => {
              if (!prev) setUnread(u => u + 1)
              return prev
            })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase])

  // 패널 열릴 때 자동 스크롤 + 읽음 처리
  useEffect(() => {
    if (!open) return
    setUnread(0)
    apiFetch('/api/hotline/read', { method: 'PATCH', body: JSON.stringify({}) }).catch(() => {})
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [open])

  // 새 메시지 오면 스크롤
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      await apiFetch<HotlineMessage>('/api/hotline/messages', {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      })
      // Realtime이 INSERT를 수신해서 자동으로 messages에 추가됨
    } catch {
      setInput(text) // 실패 시 복원
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Floating chat panel */}
      {open && (
        <div
          className="fixed z-50 flex flex-col"
          style={{
            bottom: '80px',
            right: '24px',
            width: '320px',
            height: '420px',
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: '#4ade80' }}
              aria-hidden="true"
            />
            <span className="text-flo-body2 font-semibold flex-1">Admin 핫라인</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="p-1 rounded hover:opacity-70 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
            {messages.length === 0 && (
              <p className="text-flo-caption1 text-center mt-8" style={{ color: 'var(--text-disabled)' }}>
                Admin에게 궁금한 점을 자유롭게 문의하세요.
              </p>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_role === 'champion' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="text-flo-caption1 px-3 py-2 rounded-2xl max-w-[75%] break-words"
                  style={
                    msg.sender_role === 'champion'
                      ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 }
                      : { background: 'var(--surface-secondary)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                  }
                >
                  {msg.body}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="flex gap-2 px-3 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid var(--border-faint)' }}
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="메시지 입력..."
              className="flex-1 text-flo-caption1 px-3 py-2 rounded-lg outline-none"
              style={{
                background: 'var(--surface-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
              disabled={sending}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              aria-label="전송"
              className="flex items-center justify-center rounded-lg transition-opacity disabled:opacity-40"
              style={{ width: 36, height: 36, background: 'var(--accent)', color: '#fff', flexShrink: 0 }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label="Admin 핫라인 열기"
        className="fixed z-50 flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
        style={{
          bottom: '24px',
          right: '24px',
          width: 48,
          height: 48,
          background: 'var(--accent)',
          color: '#fff',
          boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
        }}
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <span
            className="absolute flex items-center justify-center text-flo-caption2 font-bold"
            style={{
              top: -4,
              right: -4,
              width: 18,
              height: 18,
              background: '#ef4444',
              borderRadius: '50%',
              border: '2px solid var(--background)',
              color: '#fff',
              fontSize: 10,
            }}
            aria-label={`${unread}개 읽지 않은 메시지`}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  )
}
```

- [ ] **Step 2: 타입 체크**

```bash
bun typecheck
```

- [ ] **Step 3: Commit**

```bash
git add components/HotlineFAB.tsx
git commit -m "feat: HotlineFAB 컴포넌트 추가 (FAB + floating 채팅 패널)"
```

---

## Task 8: Champion Layout에 HotlineFAB 마운트

**Files:**
- Modify: `app/(champion)/layout.tsx`

- [ ] **Step 1: layout.tsx에 HotlineFAB import 및 렌더링 추가**

`app/(champion)/layout.tsx` 파일의 기존 내용:

```typescript
import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import { ChampionSidebar } from './ChampionSidebar'
```

아래와 같이 수정 (import 1줄 추가, JSX 1줄 추가):

```typescript
import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { parseName } from '@/lib/utils'
import { ChampionSidebar } from './ChampionSidebar'
import { HotlineFAB } from '@/components/HotlineFAB'

export default async function ChampionLayout({ children }: { children: React.ReactNode }) {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const raw = user.user_metadata?.name ?? user.email ?? ''
  const { displayName } = parseName(raw)

  return (
    <div className="flex min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      <ChampionSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center px-6 flex-shrink-0 border-b"
          style={{ height: 52, background: 'var(--background)', borderColor: 'var(--border)' }}
        >
          <div className="md:hidden w-32" />

          {displayName && (
            <div className="ml-auto flex items-center gap-2">
              <div
                className="flex items-center justify-center rounded-full text-flo-caption2 font-semibold flex-shrink-0"
                style={{ width: 24, height: 24, background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }}
              >
                {displayName[0]}
              </div>
              <span className="text-flo-caption1 font-medium" style={{ color: 'var(--text-secondary)' }}>
                {displayName}
              </span>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 overflow-auto md:pb-6 pb-20">{children}</main>
      </div>

      <HotlineFAB />
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크**

```bash
bun typecheck
```

- [ ] **Step 3: 개발 서버에서 Champion 화면 확인**

```bash
bun dev
```

브라우저에서 Champion으로 로그인 → 우하단 💬 FAB 버튼 표시 확인 → 클릭 시 채팅 패널 열림 확인.

- [ ] **Step 4: Commit**

```bash
git add app/(champion)/layout.tsx
git commit -m "feat: champion layout에 HotlineFAB 마운트"
```

---

## Task 9: Admin Hotline Inbox 페이지

**Files:**
- Create: `app/admin/hotline/page.tsx`
- Create: `app/admin/hotline/HotlineInboxClient.tsx`

- [ ] **Step 1: 서버 컴포넌트 page.tsx 생성**

```typescript
// app/admin/hotline/page.tsx
import { redirect } from 'next/navigation'
import { createUserServerClient } from '@/lib/supabase/server'
import { HotlineInboxClient } from './HotlineInboxClient'

export default async function HotlinePage() {
  const supabase = createUserServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.user_metadata?.is_admin) redirect('/admin/login')

  return <HotlineInboxClient />
}
```

- [ ] **Step 2: 클라이언트 컴포넌트 HotlineInboxClient.tsx 생성**

```typescript
// app/admin/hotline/HotlineInboxClient.tsx
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import type { HotlineMessage, HotlineThread } from '@/lib/types'

export function HotlineInboxClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [threads, setThreads] = useState<HotlineThread[]>([])
  const [messages, setMessages] = useState<HotlineMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('champion'))
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadThreads = useCallback(() => {
    apiFetch<HotlineThread[]>('/api/admin/hotline').then(setThreads).catch(() => {})
  }, [])

  useEffect(() => { loadThreads() }, [loadThreads])

  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    apiFetch<HotlineMessage[]>(`/api/admin/hotline/messages?champion=${selectedId}`)
      .then(setMessages)
      .catch(() => {})
    // 읽음 처리
    apiFetch('/api/hotline/read', {
      method: 'PATCH',
      body: JSON.stringify({ champion_user_id: selectedId }),
    }).then(() => {
      setThreads(prev => prev.map(t =>
        t.champion_user_id === selectedId ? { ...t, unread_count: 0 } : t
      ))
    }).catch(() => {})
  }, [selectedId])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [messages])

  function selectChampion(id: string) {
    setSelectedId(id)
    router.replace(`/admin/hotline?champion=${id}`, { scroll: false })
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || !selectedId || sending) return
    setSending(true)
    setInput('')
    try {
      const msg = await apiFetch<HotlineMessage>('/api/admin/hotline/messages', {
        method: 'POST',
        body: JSON.stringify({ champion_user_id: selectedId, body: text }),
      })
      setMessages(prev => [...prev, msg])
      loadThreads()
    } catch {
      setInput(text)
    } finally {
      setSending(false)
    }
  }

  const selectedThread = threads.find(t => t.champion_user_id === selectedId)

  return (
    <div
      className="flex h-full rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)', minHeight: 'calc(100vh - 120px)' }}
    >
      {/* Thread list */}
      <div
        className="w-72 flex-shrink-0 flex flex-col"
        style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--surface-primary)' }}
      >
        <div
          className="px-4 py-3 text-flo-body2 font-semibold flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-faint)', color: 'var(--text-primary)' }}
        >
          전체 대화
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="text-flo-caption1 text-center mt-10" style={{ color: 'var(--text-disabled)' }}>
              수신된 메시지가 없습니다
            </p>
          )}
          {threads.map(t => (
            <button
              key={t.champion_user_id}
              onClick={() => selectChampion(t.champion_user_id)}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{
                background: selectedId === t.champion_user_id
                  ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                  : 'transparent',
                borderBottom: '1px solid var(--border-faint)',
                borderLeft: selectedId === t.champion_user_id ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className="text-flo-caption1 font-semibold truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {t.champion_name}
                </span>
                {t.unread_count > 0 && (
                  <span
                    className="flex items-center justify-center text-flo-caption2 font-bold rounded-full flex-shrink-0"
                    style={{
                      minWidth: 18, height: 18,
                      background: '#ef4444', color: '#fff', fontSize: 10, padding: '0 4px',
                    }}
                  >
                    {t.unread_count}
                  </span>
                )}
              </div>
              <p
                className="text-flo-caption2 truncate"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t.last_sender_role === 'admin' ? '(나) ' : ''}{t.last_message}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 flex flex-col" style={{ background: 'var(--background)' }}>
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-flo-body2" style={{ color: 'var(--text-disabled)' }}>
              좌측에서 대화를 선택하세요
            </p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div
              className="px-5 py-3 flex items-center gap-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-primary)' }}
            >
              <div
                className="flex items-center justify-center rounded-full text-flo-caption1 font-bold flex-shrink-0"
                style={{
                  width: 32, height: 32,
                  background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                {selectedThread?.champion_name?.[0] ?? '?'}
              </div>
              <span className="text-flo-body2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                {selectedThread?.champion_name ?? selectedId}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_role === 'admin' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="text-flo-caption1 px-3 py-2 rounded-2xl max-w-[70%] break-words"
                    style={
                      msg.sender_role === 'admin'
                        ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 }
                        : { background: 'var(--surface-secondary)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                    }
                  >
                    {msg.body}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div
              className="flex gap-2 px-4 py-3 flex-shrink-0"
              style={{ borderTop: '1px solid var(--border-faint)', background: 'var(--surface-primary)' }}
            >
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Admin으로 답장..."
                className="flex-1 text-flo-caption1 px-3 py-2 rounded-lg outline-none"
                style={{
                  background: 'var(--surface-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                aria-label="답장 전송"
                className="flex items-center justify-center rounded-lg transition-opacity disabled:opacity-40"
                style={{ width: 36, height: 36, background: 'var(--accent)', color: '#fff', flexShrink: 0 }}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 타입 체크**

```bash
bun typecheck
```

- [ ] **Step 4: Commit**

```bash
git add app/admin/hotline/page.tsx app/admin/hotline/HotlineInboxClient.tsx
git commit -m "feat: admin hotline inbox 페이지 추가"
```

---

## Task 10: Admin Sidebar에 핫라인 메뉴 추가

**Files:**
- Modify: `app/admin/AdminSidebar.tsx`

- [ ] **Step 1: `AdminSidebar.tsx` 수정 — import에 `MessageCircle` 추가, Props에 `initialHotlineUnread` 추가, NAV에 항목 추가, unread 상태 추가**

```typescript
// app/admin/AdminSidebar.tsx 전체 교체
'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-client'
import { LayoutDashboard, Layers, AlertTriangle, FileText, BarChart2, LogOut, Menu, X, Users, MessageCircle } from 'lucide-react'
import { BottomTabBar, type BottomTab } from '@/components/BottomTabBar'
import type { HotlineThread } from '@/lib/types'

const NAV = [
  { icon: LayoutDashboard, label: '대시보드',     href: '/admin' },
  { icon: Users,           label: '챔피언 리스트', href: '/admin/champions' },
  { icon: Layers,          label: '제출 현황',     href: '/admin/kanban' },
  { icon: AlertTriangle,   label: '지연 신고',     href: '/admin/delay-reports' },
  { icon: FileText,        label: '주간 리포트',   href: '/admin/reports' },
  { icon: MessageCircle,   label: '핫라인',        href: '/admin/hotline' },
]

interface Props {
  initialPendingBottleneck: number
  initialPendingCharters: number
  initialHotlineUnread: number
}

export function AdminSidebar({ initialPendingBottleneck, initialPendingCharters, initialHotlineUnread }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pendingBottleneck, setPendingBottleneck] = useState(initialPendingBottleneck)
  const [pendingCharters, setPendingCharters] = useState(initialPendingCharters)
  const [hotlineUnread, setHotlineUnread] = useState(initialHotlineUnread)

  useEffect(() => {
    Promise.all([
      apiFetch<{ id: string }[]>('/api/admin/milestones/bottleneck-pending')
        .then(d => setPendingBottleneck(d.length))
        .catch(() => {}),
      apiFetch<{ id: string; admin_approved_at: string | null }[]>('/api/admin/charters')
        .then(d => setPendingCharters(d.filter(c => !c.admin_approved_at).length))
        .catch(() => {}),
      apiFetch<HotlineThread[]>('/api/admin/hotline')
        .then(threads => setHotlineUnread(threads.reduce((sum, t) => sum + t.unread_count, 0)))
        .catch(() => {}),
    ])
  }, [pathname])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  const MOBILE_TABS: BottomTab[] = [
    { icon: AlertTriangle,  label: '지연 신고',  href: '/admin/delay-reports', badge: pendingBottleneck },
    { icon: FileText,       label: '과제정의서', href: '/admin/mobile/charters', badge: pendingCharters },
    { icon: BarChart2,      label: '리포트',     href: '/admin/reports' },
    { icon: MessageCircle,  label: '핫라인',     href: '/admin/hotline', badge: hotlineUnread },
  ]

  // NAV 항목별 badge 매핑
  const badgeMap: Record<string, number> = {
    '/admin/delay-reports': pendingBottleneck,
    '/admin/hotline': hotlineUnread,
  }

  return (
    <>
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 md:static md:z-auto',
          'w-[220px] flex-shrink-0 flex flex-col px-3 py-5 border-r',
          'transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', boxShadow: 'var(--shadow-s)' }}
      >
        <div className="flex items-center justify-between px-3 pb-4 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-flo-body1 font-semibold" style={{ color: 'var(--text-primary)' }}>관리자</span>
            <span className="text-flo-caption2 font-semibold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-secondary)', color: 'var(--text-disabled)', letterSpacing: '0.06em' }}>
              ADMIN
            </span>
          </div>
          <button className="md:hidden p-1 rounded" onClick={() => setDrawerOpen(false)} aria-label="메뉴 닫기" style={{ color: 'var(--text-secondary)' }}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map(item => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
            const badge = badgeMap[item.href] ?? 0
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-flo-body2 font-medium transition-colors relative"
                style={{
                  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onClick={() => setDrawerOpen(false)}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ background: 'var(--accent)' }} />}
                <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {item.label}
                {badge > 0 && (
                  <span
                    className="ml-auto flex items-center justify-center text-flo-caption2 font-bold rounded-full"
                    style={{
                      minWidth: 18, height: 18, padding: '0 4px',
                      background: '#ef4444', color: '#fff', fontSize: 10,
                    }}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex-1" />

        <div className="px-3">
          <div className="h-px mb-3" style={{ background: 'var(--border-faint)' }} />
          <button onClick={handleLogout} className="flex items-center gap-2 w-full py-1.5 text-flo-caption1 font-medium hover:opacity-70 transition-opacity" style={{ color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer' }}>
            <LogOut className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </aside>

      <div className="flex items-center gap-3 md:hidden fixed top-0 left-0 z-30 px-6" style={{ height: 52 }}>
        <button onClick={() => setDrawerOpen(true)} aria-label="메뉴 열기" className="p-1 rounded" style={{ color: 'var(--text-secondary)' }}>
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-flo-body2 font-semibold" style={{ color: 'var(--text-primary)' }}>관리자</span>
      </div>

      <BottomTabBar tabs={MOBILE_TABS} />
    </>
  )
}
```

- [ ] **Step 2: Admin layout에서 AdminSidebar props 수정**

`app/admin/layout.tsx` 를 열어 `AdminSidebar`에 `initialHotlineUnread` prop을 전달한다.  
먼저 파일 내용을 확인한 뒤 아래 패턴으로 수정:

```typescript
// app/admin/layout.tsx 에서 AdminSidebar 렌더 부분 수정
// 기존: <AdminSidebar initialPendingBottleneck={...} initialPendingCharters={...} />
// 수정: prop 추가 (초기값 0, SSR에서 카운트 조회 생략 가능)
<AdminSidebar
  initialPendingBottleneck={pendingBottleneck}
  initialPendingCharters={pendingCharters}
  initialHotlineUnread={0}
/>
```

- [ ] **Step 3: 타입 체크**

```bash
bun typecheck
```

- [ ] **Step 4: 개발 서버 전체 플로우 테스트**

```bash
bun dev
```

확인 항목:
1. Champion 로그인 → 우하단 💬 FAB 확인
2. FAB 클릭 → 채팅 패널 열림
3. 메시지 입력 후 Enter → 메시지 전송, 대화창에 표시
4. Admin 로그인 → 사이드바 "핫라인" 메뉴 + 빨간 뱃지 확인
5. `/admin/hotline` 진입 → 챔피언 목록 + 대화 스레드 표시
6. Admin이 답장 → Champion 패널에 실시간으로 메시지 수신 + 읽지 않으면 FAB 뱃지 표시

- [ ] **Step 5: Commit**

```bash
git add app/admin/AdminSidebar.tsx app/admin/layout.tsx
git commit -m "feat: admin sidebar에 핫라인 메뉴 및 unread 뱃지 추가"
```
