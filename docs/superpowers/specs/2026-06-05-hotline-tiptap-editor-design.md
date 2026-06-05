# Hotline Tiptap Editor Design

**Date:** 2026-06-05  
**Status:** Approved

---

## Overview

Admin/Champion Hotline의 메시지 입력 필드(`<input type="text">`)를 Tiptap 리치 에디터로 교체한다. Bold/Italic/Code 툴바, Markdown 단축키, 인라인 이미지, 파일 첨부를 지원한다. Champion(HotlineFAB)과 Admin(HotlineInboxClient) 양쪽에 동일한 `HotlineEditor` 컴포넌트를 재사용한다.

---

## Schema

### Migration `022_hotline_attachments.sql`

```sql
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

-- Champions can only see attachments for their own messages
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
```

`hotline_messages.body` 컬럼은 그대로 유지 (TEXT). 이제 Tiptap HTML을 저장.

---

## Storage

- 버킷명: `hotline` (private)
- 경로 규칙: `{champion_user_id}/{message_id_temp}/{filename}`
  - 메시지 전송 전에도 파일을 미리 업로드하므로 temp UUID 사용
- 인라인 이미지: 업로드 직후 1년 signed URL 생성 → body HTML의 `<img src>` 에 삽입
- 파일 첨부: 다운로드 클릭 시 1시간 signed URL 생성

---

## TypeScript Types

```ts
// lib/types.ts 추가
export interface HotlineAttachment {
  id: string
  message_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
}

// HotlineMessage에 attachments 추가
export interface HotlineMessage {
  // ... 기존 필드
  attachments?: HotlineAttachment[]
}
```

---

## 패키지 추가

```bash
npm install @tiptap/extension-image
```

---

## 새 컴포넌트: `components/HotlineEditor.tsx`

**역할:** Champion/Admin 양쪽에서 재사용하는 Tiptap 에디터 wrapper

**Props:**
```ts
interface HotlineEditorProps {
  onSend: (body: string, attachments: PendingAttachment[]) => Promise<void>
  disabled?: boolean
  placeholder?: string
}

interface PendingAttachment {
  file_name: string
  file_path: string  // storage path
  file_size: number
  mime_type: string
}
```

**기능:**
- Tiptap 에디터 (`StarterKit` + `Image` + `Placeholder`)
- 툴바: Bold, Italic, Code 버튼 (에디터 위에 고정)
- Markdown 단축키: `**text**` → bold, `_text_` → italic, `` `text` `` → code (StarterKit 내장)
- 이미지 업로드 버튼: 클릭 → 파일 선택 → `POST /api/hotline/upload` → 1년 signed URL → `editor.chain().setImage({ src: url })` 삽입
- 파일 첨부 버튼: 클릭 → 파일 선택 → `POST /api/hotline/upload` → PendingAttachment 목록에 추가, 에디터 하단에 미리보기 표시
- Enter → send, Shift+Enter → 줄바꿈
- 전송 조건: `!editor.isEmpty` OR `pendingAttachments.length > 0`

---

## 업로드 API: `POST /api/hotline/upload`

**인증:** Champion 또는 Admin (JWT 검증)

**Request:** `multipart/form-data` with `file` field

**동작:**
1. 파일 수신
2. `hotline` 버킷에 `{userId}/{uuid}/{filename}` 경로로 업로드
3. 이미지 MIME type (`image/*`) → 1년 signed URL 반환
4. 비이미지 → storage path만 반환 (signed URL은 다운로드 시 생성)

**Response:**
```json
{
  "file_path": "string",
  "file_name": "string",
  "file_size": 12345,
  "mime_type": "image/png",
  "url": "https://... (이미지인 경우만)"
}
```

---

## 메시지 전송 API 변경

### `POST /api/hotline/messages` (champion)
### `POST /api/admin/hotline/messages` (admin)

**Request body 변경:**
```json
{
  "body": "<p>HTML content</p>",
  "attachments": [
    {
      "file_name": "report.pdf",
      "file_path": "user-id/temp-uuid/report.pdf",
      "file_size": 102400,
      "mime_type": "application/pdf"
    }
  ]
}
```

**변경 동작:**
- `body`: trim 대신 HTML strip 후 빈 텍스트 여부 확인. `attachments`가 있으면 body 비어있어도 허용.
- `attachments` 있으면 메시지 INSERT 후 `hotline_attachments` 에도 INSERT

**GET 응답 변경:**
- `hotline_messages` 조회 시 `hotline_attachments` LEFT JOIN 포함하여 `attachments` 배열 반환

---

## 메시지 표시 변경

### HotlineFAB / HotlineInboxClient 공통

**기존:** `{msg.body}` (plain text)

**변경:**
```tsx
// body를 sanitize 후 HTML로 렌더링
<div
  className="prose prose-sm max-w-none text-sm"
  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.body) }}
/>

// 파일 첨부 목록 (이미지 아닌 것만)
{msg.attachments?.filter(a => !a.mime_type.startsWith('image/')).map(a => (
  <FileAttachmentChip key={a.id} attachment={a} />
))}
```

**`FileAttachmentChip`:** 파일명 + 크기 + 다운로드 버튼. 클릭 시 `POST /api/hotline/download` 로 signed URL 발급 후 `window.open`.

---

## 다운로드 API: `POST /api/hotline/download`

```json
// Request
{ "file_path": "user-id/temp-uuid/report.pdf" }
// Response
{ "url": "signed-url-1h" }
```

인증된 사용자만 접근 (본인 또는 admin).

---

## File Map

| 파일 | 유형 | 역할 |
|------|------|------|
| `supabase/migrations/022_hotline_attachments.sql` | CREATE | hotline_attachments 테이블 + RLS |
| `lib/types.ts` | MODIFY | HotlineAttachment, HotlineMessage.attachments 추가 |
| `components/HotlineEditor.tsx` | CREATE | 공유 Tiptap 에디터 컴포넌트 |
| `app/api/hotline/upload/route.ts` | CREATE | 파일/이미지 업로드 (champion + admin) |
| `app/api/hotline/download/route.ts` | CREATE | 파일 다운로드 signed URL |
| `app/api/hotline/messages/route.ts` | MODIFY | attachments 처리, GET JOIN |
| `app/api/admin/hotline/messages/route.ts` | MODIFY | attachments 처리, GET JOIN |
| `components/HotlineFAB.tsx` | MODIFY | input → HotlineEditor, body HTML 렌더링 |
| `app/admin/hotline/HotlineInboxClient.tsx` | MODIFY | input → HotlineEditor, body HTML 렌더링 |

---

## Scope

**In scope:**
- Tiptap 에디터 (bold, italic, code, markdown shortcuts)
- 인라인 이미지 업로드
- 파일 첨부 (비이미지)
- 첨부파일 다운로드
- HTML 메시지 표시 (DOMPurify sanitize)

**Out of scope:**
- 이미지 리사이즈/preview in FAB
- 첨부파일 삭제
- 다른 Tiptap 확장 (heading, list 등)
- 모바일 툴바 최적화
