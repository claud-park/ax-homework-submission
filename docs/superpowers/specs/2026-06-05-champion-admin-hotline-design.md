# Champion Admin Hotline — Design Spec

**Date**: 2026-06-05  
**Branch**: `feature/champion-admin-hotline`  
**Status**: Approved

---

## Overview

Champion View 우하단에 Floating Action Button(FAB)을 추가하고, 클릭 시 Admin과 실시간 메시지를 주고받을 수 있는 채팅 패널을 제공한다. 메시지는 Supabase PostgreSQL에 저장하고 Supabase Realtime으로 실시간 동기화한다. Admin에게는 이메일 알림을 발송하며, Admin은 별도 Inbox 탭에서 모든 대화를 관리한다.

---

## Decisions

| 항목 | 결정 |
|------|------|
| 알림 채널 | ~~Slack Bot~~ → Gmail SMTP (기존 인프라 활용) |
| 패널 스타일 | Floating 채팅 버블 (FAB 위에 팝업, Intercom 패턴) |
| 메시지 저장 | Supabase `hotline_messages` 테이블 |
| Admin 응답 경로 | Admin Sidebar "핫라인" 탭 + 이메일 딥링크 |
| Unread 추적 | Champion / Admin 양쪽 별도 (`read_by_champion`, `read_by_admin`) |

---

## Architecture

### Database Schema

```sql
-- Migration: 019_hotline_messages.sql
CREATE TABLE hotline_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  champion_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_role      TEXT NOT NULL CHECK (sender_role IN ('champion', 'admin')),
  body             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_by_champion BOOLEAN NOT NULL DEFAULT FALSE,
  read_by_admin    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_hotline_champion ON hotline_messages(champion_user_id, created_at);

-- RLS: champion sees only own thread; admin sees all
ALTER TABLE hotline_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "champion_own_thread" ON hotline_messages
  FOR ALL USING (
    auth.uid() = champion_user_id
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
```

### Data Flow

1. Champion이 메시지 전송 → `POST /api/hotline/messages` → DB 저장
2. API에서 Admin에게 이메일 알림 발송 (딥링크: `/admin/hotline?champion={userId}`)
3. Admin이 답장 → `POST /api/hotline/messages` → DB 저장
4. Supabase Realtime이 Champion 브라우저에 push → FAB 빨간 뱃지 표시
5. Champion이 패널 열면 → `PATCH /api/hotline/messages/read` → `read_by_champion = true`
6. Admin이 inbox 열면 → `PATCH /api/hotline/messages/read` → `read_by_admin = true`

---

## API Routes

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/hotline/messages?champion={userId}` | 스레드 조회 (champion은 자신 것만, admin은 지정 champion) |
| `POST` | `/api/hotline/messages` | 메시지 전송 |
| `PATCH` | `/api/hotline/messages/read` | 읽음 처리 (`{ role: 'champion' \| 'admin', champion_user_id }`) |
| `GET` | `/api/admin/hotline` | Admin: 전체 champion 대화 목록 + unread count |

---

## Components

### Champion Side

**`HotlineFAB`** (`components/HotlineFAB.tsx`) — `'use client'`
- 우하단 fixed position FAB (z-50)
- Admin 미확인 메시지 있으면 빨간 뱃지 표시
- 클릭 시 `HotlinePanel` 토글

**`HotlinePanel`** (`components/HotlinePanel.tsx`) — `'use client'`
- FAB 위 팝업 (position: fixed, bottom-right)
- 헤더: "Admin 핫라인" + 온라인 상태 dot + 닫기 버튼
- 메시지 스크롤 영역 (Champion 말풍선 오른쪽, Admin 말풍선 왼쪽)
- 텍스트 input + 전송 버튼
- Supabase Realtime 구독으로 실시간 업데이트
- 패널 열릴 때 `read_by_champion` 일괄 업데이트

**Champion Layout 수정** (`app/(champion)/layout.tsx`)
- `<HotlinePanel />` 추가 (layout 레벨, 모든 champion 페이지에서 접근 가능)

### Admin Side

**`/admin/hotline` page** (`app/admin/hotline/page.tsx` + `HotlineInboxClient.tsx`)
- 좌: Champion 대화 목록 (unread 뱃지, 마지막 메시지 preview, 시간)
- 우: 선택된 Champion 스레드 뷰 + 답장 input
- URL 파라미터 `?champion={userId}` 로 딥링크 지원
- 진입 시 선택된 대화의 `read_by_admin` 일괄 업데이트

**Admin Sidebar 수정** (`app/admin/AdminSidebar.tsx`)
- "핫라인 💬" 메뉴 추가
- 전체 unread count 뱃지 표시

### Notifications

**`lib/notifications.ts` 확장**
- `notifyHotlineMessage({ champion, body })` — Admin에게 이메일 발송
  - 제목: `[핫라인] {championName} 에서 메시지가 도착했습니다`
  - 딥링크 버튼: `/admin/hotline?champion={userId}`

---

## Out of Scope

- Champion에게 Admin 답장 알림 이메일 (앱 내 Realtime으로 충분)
- 파일 첨부
- 메시지 삭제/수정
- Admin 온라인 상태 실제 감지 (고정 "온라인" 표시)
