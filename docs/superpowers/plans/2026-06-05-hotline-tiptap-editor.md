# Hotline Tiptap Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `<input>` in Champion HotlineFAB and Admin HotlineInboxClient with a shared Tiptap rich editor supporting bold/italic/code, inline image upload (Supabase Storage), and file attachments.

**Architecture:** New shared `HotlineEditor` component wraps Tiptap (StarterKit + Image + Placeholder). Upload/download go through two new Next.js API routes backed by the private `hotline` Supabase Storage bucket. Message bodies are now stored as Tiptap HTML; `DOMPurify.sanitize` is used for rendering. A new `hotline_attachments` DB table tracks non-inline files. Both hotline API routes (`/api/hotline/messages`, `/api/admin/hotline/messages`) accept an optional `attachments` array and join the table on GET.

**Tech Stack:** Tiptap v3 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-placeholder`), Supabase Storage (private bucket), DOMPurify v3 (already installed), Next.js 14 App Router, `apiUpload` from `lib/api-client.ts` (already exists for FormData uploads).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/022_hotline_attachments.sql` | CREATE | hotline_attachments table, RLS, storage bucket |
| `lib/types.ts` | MODIFY | HotlineAttachment + PendingAttachment types; HotlineMessage.attachments |
| `app/api/hotline/upload/route.ts` | CREATE | File upload to `hotline` bucket; returns signed URL for images |
| `app/api/hotline/download/route.ts` | CREATE | 1h signed URL for non-image file downloads |
| `components/HotlineEditor.tsx` | CREATE | Shared Tiptap editor: toolbar, image upload, file attach, send |
| `components/HotlineFileChip.tsx` | CREATE | File attachment chip (used in FAB + InboxClient) |
| `app/globals.css` | MODIFY | `.hotline-msg-body` CSS for rendered message HTML |
| `app/api/hotline/messages/route.ts` | MODIFY | GET: join attachments; POST: accept + insert attachments |
| `app/api/admin/hotline/messages/route.ts` | MODIFY | GET: join attachments; POST: accept + insert attachments |
| `components/HotlineFAB.tsx` | MODIFY | Replace input → HotlineEditor; render HTML + file chips |
| `app/admin/hotline/HotlineInboxClient.tsx` | MODIFY | Replace input → HotlineEditor; render HTML + file chips |

---

### Task 1: DB Migration + Storage Bucket

**Files:**
- Create: `supabase/migrations/022_hotline_attachments.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/022_hotline_attachments.sql

-- hotline_attachments table
CREATE TABLE hotline_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  UUID NOT NULL REFERENCES hotline_messages(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  mime_type   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hotline_attachments ENABLE ROW LEVEL SECURITY;

-- Champions can only see attachments on their own messages
CREATE POLICY "champion_read_own_attachments" ON hotline_attachments
  FOR SELECT USING (
    message_id IN (
      SELECT id FROM hotline_messages
      WHERE champion_user_id = auth.uid()
    )
  );

-- Admins can see all attachments
CREATE POLICY "admin_read_all_attachments" ON hotline_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- Create storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('hotline', 'hotline', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply migration manually**

Go to Supabase Dashboard → SQL Editor → paste the file contents → Run.

If the `INSERT INTO storage.buckets` line fails (permission error), go to Storage → New bucket → name `hotline`, set to **private** instead.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/022_hotline_attachments.sql
git commit -m "[AX-1] feat: hotline_attachments 마이그레이션 + hotline 스토리지 버킷"
```

---

### Task 2: Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add types**

Find the `HotlineMessage` interface (around line 161) and the lines after `HotlineThread`. Add **before** `HotlineMessage`:

```ts
export interface HotlineAttachment {
  id: string
  message_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
}

export interface PendingAttachment {
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
}
```

Add `attachments` field to `HotlineMessage` (the interface ends at line ~170):

```ts
export interface HotlineMessage {
  id: string
  champion_user_id: string
  sender_id: string
  sender_role: 'champion' | 'admin'
  body: string
  read_by_champion: boolean
  read_by_admin: boolean
  created_at: string
  attachments?: HotlineAttachment[]   // ← ADD THIS LINE
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors (pre-existing warnings about non-serializable props in SubmissionDetailPanel are acceptable).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "[AX-1] feat: HotlineAttachment, PendingAttachment 타입 추가"
```

---

### Task 3: Install @tiptap/extension-image

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install the package**

```bash
npm install @tiptap/extension-image
```

Expected output includes `added 1 package` (or similar) with `@tiptap/extension-image` listed.

- [ ] **Step 2: Verify import works**

```bash
node -e "require('@tiptap/extension-image'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "[AX-1] chore: @tiptap/extension-image 설치"
```

---

### Task 4: Upload API

**Files:**
- Create: `app/api/hotline/upload/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/hotline/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const filePath = `${user.id}/${randomUUID()}/${file.name}`
  const arrayBuffer = await file.arrayBuffer()

  const supabase = createServiceClient()
  const { error: uploadError } = await supabase.storage
    .from('hotline')
    .upload(filePath, arrayBuffer, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const result: {
    file_path: string
    file_name: string
    file_size: number
    mime_type: string
    url?: string
  } = {
    file_path: filePath,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
  }

  if (file.type.startsWith('image/')) {
    const { data: signed } = await supabase.storage
      .from('hotline')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365)
    if (signed) result.url = signed.signedUrl
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "hotline/upload" | head -5
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add app/api/hotline/upload/route.ts
git commit -m "[AX-1] feat: POST /api/hotline/upload — Supabase Storage 업로드"
```

---

### Task 5: Download API

**Files:**
- Create: `app/api/hotline/download/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/hotline/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { file_path?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.file_path) {
    return NextResponse.json({ error: 'file_path is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.storage
    .from('hotline')
    .createSignedUrl(body.file_path, 60 * 60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/hotline/download/route.ts
git commit -m "[AX-1] feat: POST /api/hotline/download — 1시간 signed URL 발급"
```

---

### Task 6: HotlineEditor Component

**Files:**
- Create: `components/HotlineEditor.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add message body CSS to globals.css**

Append these lines at the end of `app/globals.css`:

```css
/* Hotline HTML message body */
.hotline-msg-body p { margin: 0; }
.hotline-msg-body p + p { margin-top: 4px; }
.hotline-msg-body strong, .hotline-msg-body b { font-weight: 700; }
.hotline-msg-body em, .hotline-msg-body i { font-style: italic; }
.hotline-msg-body code { font-family: ui-monospace, monospace; background: rgba(0,0,0,0.12); border-radius: 3px; padding: 1px 4px; font-size: 0.88em; }
.hotline-msg-body img { max-width: 100%; border-radius: 6px; margin-top: 4px; display: block; }
```

- [ ] **Step 2: Create HotlineEditor.tsx**

```tsx
// components/HotlineEditor.tsx
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { ImageIcon, Paperclip, Send, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { apiUpload } from '@/lib/api-client'
import type { PendingAttachment } from '@/lib/types'

interface UploadResponse {
  file_path: string
  file_name: string
  file_size: number
  mime_type: string
  url?: string
}

interface HotlineEditorProps {
  onSend: (body: string, attachments: PendingAttachment[]) => Promise<void>
  disabled?: boolean
  placeholder?: string
}

export function HotlineEditor({ onSend, disabled, placeholder = '메시지 입력...' }: HotlineEditorProps) {
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendRef = useRef<() => void>(() => {})

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      handleKeyDown(_view, event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          sendRef.current()
          return true
        }
        return false
      },
    },
  })

  const canSend = editor ? (!editor.isEmpty || pendingAttachments.length > 0) : false

  async function handleSend() {
    if (!editor || !canSend || sending || disabled || uploading) return
    const body = editor.getHTML()
    const atts = [...pendingAttachments]
    setSending(true)
    try {
      await onSend(body, atts)
      editor.commands.clearContent()
      setPendingAttachments([])
    } finally {
      setSending(false)
    }
  }
  // Always point ref to the latest handleSend (captures current state)
  sendRef.current = handleSend

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    e.target.value = ''
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiUpload<UploadResponse>('/api/hotline/upload', formData)
      if (res.url) {
        editor.chain().focus().setImage({ src: res.url }).run()
      }
    } catch {
      // silently skip — file not uploaded
    } finally {
      setUploading(false)
    }
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiUpload<UploadResponse>('/api/hotline/upload', formData)
      setPendingAttachments(prev => [...prev, {
        file_name: res.file_name,
        file_path: res.file_path,
        file_size: res.file_size,
        mime_type: res.mime_type,
      }])
    } catch {
      // silently skip
    } finally {
      setUploading(false)
    }
  }

  if (!editor) return null

  const isDisabled = !!disabled || sending || uploading

  return (
    <div
      className="flex flex-col"
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        background: 'var(--surface-secondary)',
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-2 pt-1.5 pb-1 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-faint)' }}
      >
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          className="p-1 rounded text-xs font-bold transition-colors"
          style={{
            color: 'var(--text-primary)',
            background: editor.isActive('bold') ? 'var(--border-subtle)' : 'transparent',
            opacity: editor.isActive('bold') ? 1 : 0.45,
          }}
          title="굵게 (Ctrl+B)"
          disabled={isDisabled}
        >B</button>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
          className="p-1 rounded text-xs italic transition-colors"
          style={{
            color: 'var(--text-primary)',
            background: editor.isActive('italic') ? 'var(--border-subtle)' : 'transparent',
            opacity: editor.isActive('italic') ? 1 : 0.45,
          }}
          title="기울임 (Ctrl+I)"
          disabled={isDisabled}
        >I</button>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run() }}
          className="p-1 rounded text-xs font-mono transition-colors"
          style={{
            color: 'var(--text-primary)',
            background: editor.isActive('code') ? 'var(--border-subtle)' : 'transparent',
            opacity: editor.isActive('code') ? 1 : 0.45,
          }}
          title="코드"
          disabled={isDisabled}
        >{`<>`}</button>
        <div style={{ width: 1, height: 14, background: 'var(--border-faint)', margin: '0 2px', flexShrink: 0 }} />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={isDisabled}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-primary)', opacity: isDisabled ? 0.3 : 0.5 }}
          title="이미지 삽입"
        >
          <ImageIcon size={13} />
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-primary)', opacity: isDisabled ? 0.3 : 0.5 }}
          title="파일 첨부"
        >
          <Paperclip size={13} />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileAttach} />
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="text-flo-caption1 px-3 py-2 outline-none"
        style={{
          color: 'var(--text-primary)',
          minHeight: 60,
          maxHeight: 160,
          overflowY: 'auto',
        }}
      />

      {/* Pending file attachments */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-1.5">
          {pendingAttachments.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <Paperclip size={10} />
              <span className="max-w-[120px] truncate">{a.file_name}</span>
              <button
                type="button"
                onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}
                className="opacity-50 hover:opacity-100 ml-0.5"
                style={{ lineHeight: 1 }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Send button */}
      <div className="flex justify-end px-2 pb-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || isDisabled}
          aria-label="전송"
          className="flex items-center justify-center rounded-lg transition-opacity disabled:opacity-30"
          style={{ width: 32, height: 32, background: 'var(--accent)', color: '#fff', flexShrink: 0 }}
          title="전송 (Enter)"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "HotlineEditor" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/HotlineEditor.tsx app/globals.css
git commit -m "[AX-1] feat: HotlineEditor Tiptap 공유 컴포넌트 추가"
```

---

### Task 7: HotlineFileChip Component

**Files:**
- Create: `components/HotlineFileChip.tsx`

This chip renders a non-image file attachment in message history. Clicking generates a 1h download URL and opens it.

- [ ] **Step 1: Create HotlineFileChip.tsx**

```tsx
// components/HotlineFileChip.tsx
'use client'
import { Download, Paperclip } from 'lucide-react'
import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { HotlineAttachment } from '@/lib/types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

interface Props {
  attachment: HotlineAttachment
  onDark?: boolean
}

export function HotlineFileChip({ attachment, onDark = false }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    if (loading) return
    setLoading(true)
    try {
      const { url } = await apiFetch<{ url: string }>('/api/hotline/download', {
        method: 'POST',
        body: JSON.stringify({ file_path: attachment.file_path }),
      })
      window.open(url, '_blank', 'noopener')
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-opacity disabled:opacity-50"
      style={{
        background: onDark ? 'rgba(255,255,255,0.15)' : 'var(--border-subtle)',
        color: onDark ? '#fff' : 'var(--text-secondary)',
        maxWidth: 200,
      }}
      title="다운로드"
    >
      <Paperclip size={11} style={{ flexShrink: 0 }} />
      <span className="truncate flex-1 text-left">{attachment.file_name}</span>
      <span style={{ opacity: 0.6, flexShrink: 0 }}>{formatBytes(attachment.file_size)}</span>
      <Download size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/HotlineFileChip.tsx
git commit -m "[AX-1] feat: HotlineFileChip — 파일 첨부 다운로드 칩"
```

---

### Task 8: Champion Message API

**Files:**
- Modify: `app/api/hotline/messages/route.ts`

Current file is ~61 lines. Full replacement below.

- [ ] **Step 1: Replace the file**

```ts
// app/api/hotline/messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyHotlineMessage } from '@/lib/notifications'
import type { HotlineMessage, PendingAttachment } from '@/lib/types'

export async function GET(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('*, attachments:hotline_attachments(*)')
    .eq('champion_user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as HotlineMessage[])
}

export async function POST(req: NextRequest) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.user_metadata?.is_admin === true) {
    return NextResponse.json({ error: 'Admins use /api/admin/hotline/messages' }, { status: 403 })
  }

  let body: { body?: string; attachments?: PendingAttachment[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const strippedText = body.body?.replace(/<[^>]*>/g, '').trim() ?? ''
  const hasAttachments = (body.attachments?.length ?? 0) > 0
  if (!strippedText && !hasAttachments) {
    return NextResponse.json({ error: 'body or attachments required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: msg, error } = await supabase
    .from('hotline_messages')
    .insert({
      champion_user_id: user.id,
      sender_id: user.id,
      sender_role: 'champion',
      body: body.body ?? '',
      read_by_champion: true,
      read_by_admin: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let attachments: unknown[] = []
  if (hasAttachments) {
    const { data: inserted } = await supabase
      .from('hotline_attachments')
      .insert(
        body.attachments!.map(a => ({
          message_id: msg.id,
          file_name: a.file_name,
          file_path: a.file_path,
          file_size: a.file_size,
          mime_type: a.mime_type,
        }))
      )
      .select()
    attachments = inserted ?? []
  }

  const championName = (user.user_metadata?.name as string | undefined) ?? user.email ?? '챔피언'
  notifyHotlineMessage({ champion: { id: user.id, name: championName }, body: body.body ?? '' })
    .catch(() => {})

  return NextResponse.json({ ...msg, attachments } as HotlineMessage, { status: 201 })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "hotline/messages" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/hotline/messages/route.ts
git commit -m "[AX-1] feat: /api/hotline/messages — attachments 지원 추가"
```

---

### Task 9: Admin Message API

**Files:**
- Modify: `app/api/admin/hotline/messages/route.ts`

- [ ] **Step 1: Replace the file**

```ts
// app/api/admin/hotline/messages/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import type { HotlineMessage, PendingAttachment } from '@/lib/types'

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const championUserId = searchParams.get('champion')
  if (!championUserId) return NextResponse.json({ error: 'champion param required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('hotline_messages')
    .select('*, attachments:hotline_attachments(*)')
    .eq('champion_user_id', championUserId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  void supabase
    .from('hotline_messages')
    .update({ read_by_admin: true })
    .eq('champion_user_id', championUserId)
    .eq('sender_role', 'champion')
    .eq('read_by_admin', false)

  return NextResponse.json(data as HotlineMessage[])
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { champion_user_id?: string; body?: string; attachments?: PendingAttachment[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.champion_user_id) {
    return NextResponse.json({ error: 'champion_user_id required' }, { status: 400 })
  }

  const strippedText = body.body?.replace(/<[^>]*>/g, '').trim() ?? ''
  const hasAttachments = (body.attachments?.length ?? 0) > 0
  if (!strippedText && !hasAttachments) {
    return NextResponse.json({ error: 'body or attachments required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: msg, error } = await supabase
    .from('hotline_messages')
    .insert({
      champion_user_id: body.champion_user_id,
      sender_id: admin.id,
      sender_role: 'admin',
      body: body.body ?? '',
      read_by_champion: false,
      read_by_admin: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let attachments: unknown[] = []
  if (hasAttachments) {
    const { data: inserted } = await supabase
      .from('hotline_attachments')
      .insert(
        body.attachments!.map(a => ({
          message_id: msg.id,
          file_name: a.file_name,
          file_path: a.file_path,
          file_size: a.file_size,
          mime_type: a.mime_type,
        }))
      )
      .select()
    attachments = inserted ?? []
  }

  return NextResponse.json({ ...msg, attachments } as HotlineMessage, { status: 201 })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "admin/hotline" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/hotline/messages/route.ts
git commit -m "[AX-1] feat: /api/admin/hotline/messages — attachments 지원 추가"
```

---

### Task 10: HotlineFAB

**Files:**
- Modify: `components/HotlineFAB.tsx`

Remove `input`, `sending`, `inputRef` state. Add `handleSend`. Replace message rendering. Replace input section with `<HotlineEditor>`. Render file attachment chips below message bubbles.

- [ ] **Step 1: Replace HotlineFAB.tsx**

```tsx
// components/HotlineFAB.tsx
'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-client'
import type { HotlineMessage, PendingAttachment } from '@/lib/types'
import { HotlineEditor } from './HotlineEditor'
import { HotlineFileChip } from './HotlineFileChip'
import DOMPurify from 'dompurify'

export function HotlineFAB() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<HotlineMessage[]>([])
  const [unread, setUnread] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
    })
  }, [supabase])

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
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
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

  useEffect(() => {
    if (!open) return
    if (unread > 0) {
      apiFetch('/api/hotline/read', { method: 'PATCH', body: JSON.stringify({}) }).catch(() => {})
      setUnread(0)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function handleSend(body: string, attachments: PendingAttachment[]) {
    const newMsg = await apiFetch<HotlineMessage>('/api/hotline/messages', {
      method: 'POST',
      body: JSON.stringify({ body, attachments }),
    })
    setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
  }

  const fabAriaLabel = unread > 0
    ? `Admin 핫라인 ${open ? '닫기' : '열기'}, ${unread}개 읽지 않은 메시지`
    : `Admin 핫라인 ${open ? '닫기' : '열기'}`

  return (
    <>
      {open && (
        <div
          className="fixed z-50 flex flex-col"
          style={{
            bottom: '80px',
            right: '24px',
            width: '320px',
            height: '460px',
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
          <div
            role="log"
            aria-live="polite"
            aria-label="메시지 목록"
            className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2"
          >
            {messages.length === 0 && (
              <p className="text-flo-caption1 text-center mt-8" style={{ color: 'var(--text-disabled)' }}>
                Admin에게 궁금한 점을 자유롭게 문의하세요.
              </p>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender_role === 'champion' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className="hotline-msg-body text-flo-caption1 px-3 py-2 rounded-2xl max-w-[75%] break-words"
                  style={
                    msg.sender_role === 'champion'
                      ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 }
                      : { background: 'var(--surface-secondary)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                  }
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.body) }}
                />
                {msg.attachments && msg.attachments.filter(a => !a.mime_type.startsWith('image/')).length > 0 && (
                  <div className="flex flex-col gap-1 mt-1" style={{ maxWidth: '75%' }}>
                    {msg.attachments
                      .filter(a => !a.mime_type.startsWith('image/'))
                      .map(a => (
                        <HotlineFileChip key={a.id} attachment={a} onDark={msg.sender_role === 'champion'} />
                      ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Editor */}
          <div
            className="flex-shrink-0 px-3 py-3"
            style={{ borderTop: '1px solid var(--border-faint)' }}
          >
            <HotlineEditor onSend={handleSend} placeholder="메시지 입력..." />
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label={fabAriaLabel}
        aria-expanded={open}
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
            aria-hidden="true"
            className="absolute flex items-center justify-center font-bold"
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
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "HotlineFAB" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/HotlineFAB.tsx
git commit -m "[AX-1] feat: HotlineFAB — Tiptap 에디터 + HTML 렌더링 + 파일 첨부 칩"
```

---

### Task 11: HotlineInboxClient

**Files:**
- Modify: `app/admin/hotline/HotlineInboxClient.tsx`

Remove `input`, `sending` state. Add `handleSend`. Replace message rendering. Replace input section with `<HotlineEditor>`.

- [ ] **Step 1: Replace HotlineInboxClient.tsx**

```tsx
// app/admin/hotline/HotlineInboxClient.tsx
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { HotlineMessage, HotlineThread, PendingAttachment } from '@/lib/types'
import { HotlineEditor } from '@/components/HotlineEditor'
import { HotlineFileChip } from '@/components/HotlineFileChip'
import DOMPurify from 'dompurify'

export function HotlineInboxClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [threads, setThreads] = useState<HotlineThread[]>([])
  const [messages, setMessages] = useState<HotlineMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('champion'))
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

  async function handleSend(body: string, attachments: PendingAttachment[]) {
    if (!selectedId) return
    const msg = await apiFetch<HotlineMessage>('/api/admin/hotline/messages', {
      method: 'POST',
      body: JSON.stringify({ champion_user_id: selectedId, body, attachments }),
    })
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
    loadThreads()
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
                <span className="text-flo-caption1 font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {t.champion_name}
                </span>
                {t.unread_count > 0 && (
                  <span
                    className="flex items-center justify-center text-flo-caption2 font-bold rounded-full flex-shrink-0"
                    style={{ minWidth: 18, height: 18, background: '#ef4444', color: '#fff', fontSize: 10, padding: '0 4px' }}
                  >
                    {t.unread_count}
                  </span>
                )}
              </div>
              <p className="text-flo-caption2 truncate" style={{ color: 'var(--text-secondary)' }}>
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
                  className={`flex flex-col ${msg.sender_role === 'admin' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className="hotline-msg-body text-flo-caption1 px-3 py-2 rounded-2xl max-w-[70%] break-words"
                    style={
                      msg.sender_role === 'admin'
                        ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 }
                        : { background: 'var(--surface-secondary)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                    }
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.body) }}
                  />
                  {msg.attachments && msg.attachments.filter(a => !a.mime_type.startsWith('image/')).length > 0 && (
                    <div className="flex flex-col gap-1 mt-1" style={{ maxWidth: '70%' }}>
                      {msg.attachments
                        .filter(a => !a.mime_type.startsWith('image/'))
                        .map(a => (
                          <HotlineFileChip key={a.id} attachment={a} onDark={msg.sender_role === 'admin'} />
                        ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Editor */}
            <div
              className="flex-shrink-0 px-4 py-3"
              style={{ borderTop: '1px solid var(--border-faint)', background: 'var(--surface-primary)' }}
            >
              <HotlineEditor onSend={handleSend} placeholder="Admin으로 답장..." />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors (pre-existing SubmissionDetailPanel warnings are acceptable).

- [ ] **Step 3: Commit**

```bash
git add app/admin/hotline/HotlineInboxClient.tsx
git commit -m "[AX-1] feat: HotlineInboxClient — Tiptap 에디터 + HTML 렌더링 + 파일 첨부 칩"
```

---

### Task 12: Smoke Test + Production Deploy

This task has no automated tests (no test runner configured). Verify in the browser.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Champion FAB smoke test**

1. Open `http://localhost:3000` as a Champion user
2. Click the chat FAB → panel opens
3. Type some text → toolbar shows Bold/Italic/Code buttons
4. Press **Ctrl+B** → text becomes bold
5. Press **Enter** → message sends, renders as HTML (bold preserved)
6. Click the image icon → select an image file → image appears inline in editor
7. Press **Enter** → message sends, image appears in message bubble
8. Click the paperclip icon → select a non-image file → chip appears below editor
9. Press **Enter** → message sends, chip appears below the bubble with download button
10. Click download chip → signed URL opens in new tab

- [ ] **Step 3: Admin inbox smoke test**

1. Open `http://localhost:3000/admin/hotline` as an Admin user
2. Select a champion thread
3. Type a message with bold formatting → send
4. Verify HTML renders correctly in the message bubble
5. Attach a file → send → chip appears below admin's bubble

- [ ] **Step 4: Deploy to production**

```bash
vercel --prod
```

Wait for READY status. Verify production at the deployed URL.

- [ ] **Step 5: Final commit (if any cleanup needed)**

If no changes needed, this task is done.
