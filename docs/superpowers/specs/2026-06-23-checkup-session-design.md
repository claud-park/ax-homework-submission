# Check-up Session Feature Design

**Date**: 2026-06-23  
**Status**: Approved

---

## Overview

Admin ↔ Champion 주간 1:1 체크업 세션을 기록·관리하는 기능. 세션 노트 작성, 브라우저 내장 녹음 + AI 자동 요약, 액션 아이템 체크, 챔피언 댓글 기능을 포함한다.

---

## 1. DB 스키마

### `check_up_sessions`

```sql
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
```

RLS:
- 챔피언: `champion_user_id = auth.uid()` 인 행만 SELECT
- 어드민: 전체 SELECT / INSERT / UPDATE / DELETE

### `session_action_items`

```sql
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
```

RLS:
- 챔피언: 자신의 세션 액션아이템 SELECT + is_completed/completed_at UPDATE만 허용
- 어드민: 전체 CRUD

### `session_comments`

```sql
CREATE TABLE session_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES check_up_sessions(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  author_id   UUID NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('admin','champion')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS:
- 챔피언: 자신의 세션 댓글 SELECT + 자신이 작성한 댓글 INSERT / UPDATE / DELETE
- 어드민: 전체 CRUD

---

## 2. API Routes

```
POST   /api/sessions                                  — 세션 생성 (admin only)
GET    /api/sessions?championId=<id>                  — 세션 목록
GET    /api/sessions/[sessionId]                      — 세션 상세 (milestones 포함)
PATCH  /api/sessions/[sessionId]                      — title / notes / session_date 수정 (admin)
DELETE /api/sessions/[sessionId]                      — 세션 삭제 (admin only)

POST   /api/sessions/[sessionId]/process              — 오디오 업로드 + Whisper STT + Claude 요약 (admin)

POST   /api/sessions/[sessionId]/action-items                 — 액션아이템 생성 (admin)
PATCH  /api/sessions/[sessionId]/action-items/[itemId]        — 수정 or 체크 토글 (admin: 전체 / champion: is_completed만)
DELETE /api/sessions/[sessionId]/action-items/[itemId]        — 삭제 (admin only)

POST   /api/sessions/[sessionId]/comments                     — 댓글 생성 (admin + champion)
PATCH  /api/sessions/[sessionId]/comments/[commentId]         — 댓글 수정 (본인만)
DELETE /api/sessions/[sessionId]/comments/[commentId]         — 댓글 삭제 (본인만)
```

`GET /api/sessions/[sessionId]` 응답에 champion의 milestones를 포함시켜 별도 fetch 없이 SessionMiniGantt에 데이터 공급.

---

## 3. 녹음 처리 플로우 (Synchronous)

```
[1] 브라우저: Web Audio API로 녹음 시작
    → recordingDurationSec 프론트에서 트래킹

[2] 녹음 종료 버튼 클릭
    → 오디오 blob 생성 (webm/opus)

[3] POST /api/sessions/[sessionId]/process
    → multipart/form-data: audio blob + recordingDurationSec
    → DB: processing_status = 'uploading'

[4] 서버: Supabase Storage 업로드
    → 업로드 완료 후 processing_status = 'transcribing'

[5] 서버: OpenAI Whisper API 호출
    → model: whisper-1, language: ko
    → 완료 후 raw_transcript 저장, processing_status = 'summarizing'

[6] 서버: Claude claude-sonnet-4-6 API 호출
    → prompt: 미팅 노트 요약 + 액션아이템 JSON 추출
    → 완료 후 notes 저장, action_items insert, processing_status = 'done'

[7] 응답 반환: { notes, actionItems }
    → 프론트: 편집 화면으로 전환
```

Vercel Function timeout: 300s 이내 처리 가능 (45분 오디오 기준 STT ~120s + 요약 ~15s + 업로드 ~30s).

### 비용 추정 (20명 × 12주)

| 항목 | 세션당 | 전체 |
|------|--------|------|
| OpenAI Whisper (45min) | $0.27 | ~$65 |
| Claude claude-sonnet-4-6 요약 | $0.04 | ~$10 |
| **합계** | **$0.31** | **~$75** |

---

## 4. Progress UI

녹음 종료 후 처리 중 표시되는 모달/오버레이.

### 단계 가중치

| 단계 | 전체 % 범위 | 진행 방식 |
|------|------------|-----------|
| 파일 업로드 | 0 → 20% | XHR progress 이벤트 (실제 %) |
| STT (Whisper) | 20 → 80% | `recordingDurationSec × 0.08`초 동안 선형 인터폴레이션 |
| AI 요약 (Claude) | 80 → 95% | 15초 동안 선형 인터폴레이션 |
| 저장 완료 | 95 → 100% | 즉시 |

### 남은 시간 계산

```ts
remainingSec = (100 - currentPct) / progressRatePerSec
// 마지막 10초는 "거의 완료 중..." 고정 텍스트
```

### UI 요소

```
┌─────────────────────────────────────────────────────────┐
│  세션 처리 중...                       남은 시간 2:34   │
│                                                         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░  62%         │
│                                                         │
│  ✅ 파일 업로드 완료                                    │
│  🔄 음성 전사 중 (Whisper AI)  ← pulse 애니메이션       │
│  ⬜ AI 요약 생성 (Claude)                              │
│  ⬜ 저장 완료                                          │
└─────────────────────────────────────────────────────────┘
```

에러 시: 빨간 배너 + "다시 시도" 버튼. 오디오 파일은 Storage에 유지.

---

## 5. SessionMiniGantt 컴포넌트

세션 상세 페이지 최상단에 위치하는 경량 Gantt.

- **props**: `milestones: Milestone[]`, `sessionDate: string`
- **표시 범위**: `sessionDate` ±3일 (7일 window)
- **active 조건**: `start_date <= windowEnd && due_date >= windowStart`
- **색상**: 기존 `STATUS_COLOR` / `STATUS_BG` 상수 재사용
- **세션일 마커**: 수직 점선
- **마일스톤 없음**: 컴포넌트 미노출
- **데이터 소스**: `GET /api/sessions/[sessionId]` 응답에 milestones 포함 (별도 fetch 없음)
- **라이브러리**: `gantt-task-react` 사용하지 않음 — SVG 또는 div 기반 직접 구현 (경량화)

---

## 6. Admin UI

### 위치

`/admin/champions/[userId]` 페이지의 기존 탭에 **"체크업 세션"** 탭 추가.

### 세션 목록 뷰

- 세션 리스트 (날짜 역순)
- 각 항목: 제목, 날짜, processing_status 뱃지, 상세 진입 버튼
- 우상단 "새 세션 만들기" 버튼

### 세션 상세 뷰

```
[상단] SessionMiniGantt (session_date 기준 마일스톤 현황)
[녹음] 녹음 시작/종료 버튼 + 타이머 + Progress UI
[노트] AI 요약 결과 textarea (편집 가능)
[액션아이템] 체크박스 목록 + 추가/수정/삭제
[댓글] 댓글 목록 + 입력
[하단] 저장 버튼
```

Admin 전용 기능: 녹음, 세션 생성/삭제, 노트 편집, 액션아이템 CRUD.

---

## 7. Champion UI

### 위치

`ChampionSidebar` NAV에 **"체크업 세션"** 탭 추가 → `/my-project/sessions`

모바일 `MOBILE_TABS`에도 추가.

### 세션 목록 뷰

- 세션 리스트 (날짜 역순, 읽기 전용)

### 세션 상세 뷰

```
[상단] SessionMiniGantt (session_date 기준 마일스톤 현황)
[노트] 미팅 노트 (읽기 전용)
[액션아이템] 체크박스 토글만 가능 (추가/삭제 불가)
[댓글] 댓글 목록 + 본인 댓글 CUD
```

Champion 제한: 녹음 없음, 세션 생성/삭제 없음, 노트 편집 없음, 액션아이템 추가/삭제 없음.

---

## 8. 권한 매트릭스

| 기능 | Admin | Champion |
|------|-------|----------|
| 세션 생성/삭제 | ✅ | ❌ |
| 노트 편집 | ✅ | ❌ (읽기만) |
| 녹음 | ✅ | ❌ |
| 액션아이템 CRUD | ✅ | 체크 토글만 |
| 댓글 CUD | ✅ | 본인 것만 |
| 세션 조회 | ✅ | 본인 세션만 |
| Gantt 표시 | ✅ | ✅ |

---

## 9. 타입 추가 (`lib/types.ts`)

```ts
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

---

## 10. 환경 변수 추가

```
OPENAI_API_KEY=        # Whisper STT
# Claude API는 기존 ANTHROPIC_API_KEY 재사용
```

---

## 11. 보완 사항

### Storage 버킷

Supabase Storage 버킷명: `check-up-sessions` (private)  
파일 경로 패턴: `sessions/{sessionId}/audio.webm`

### notes 포맷

plain text (마크다운 아님). Admin이 textarea에서 자유 편집.

### Claude 요약 프롬프트 가이드

```
당신은 1:1 미팅 노트 작성 전문가입니다.
아래는 Admin과 Champion 간의 체크업 세션 전사 내용입니다.

다음 두 가지를 JSON으로 반환하세요:
1. "notes": 미팅 주요 내용 요약 (plain text, 한국어, 3~5문단)
2. "actionItems": 액션 아이템 배열 (각 항목은 { "body": string })

전사 내용:
{transcript}
```

### API 보안 — Champion 세션 목록

`GET /api/sessions?championId=<id>` 호출 시, Champion 역할이면 `championId` 파라미터 무시하고 `auth.uid()`로 강제 필터링. Admin만 임의 `championId` 조회 가능.

### 녹음 길이 권장 한도

권장 최대: 60분. Vercel Function 300s 내 처리 가능 범위 (60분 오디오 STT ~160s + 요약 ~15s + 업로드 ~40s = ~215s). 60분 초과 시 UI에서 경고 표시.
