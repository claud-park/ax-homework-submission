# Champion 1-on-1 미팅 노트 · 액션 아이템 편집 — 설계

작성일: 2026-06-25
대상: weekly 1-on-1(check-up session) 기능

## 목표

챔피언이 자신의 1-on-1 세션에서 다음을 할 수 있게 한다.

- **미팅 노트(`notes`) 편집** — admin과 공유하는 단일 필드를 공동 편집(협업 노트).
- **액션 아이템 생성 / 본문 수정 / 삭제** — 현재는 완료 토글만 가능.

비목표(이번 범위 아님): 세션 자체의 생성/삭제, 제목·일정(`title`/`session_date`) 변경(스케줄은 admin 전용 유지), 오디오/트랜스크립트 처리.

## 현재 상태 (기준 코드)

- **데이터**: `check_up_sessions.notes`(TEXT) = 미팅 노트. 액션 아이템은 별도 테이블 `session_action_items`(행 1개 = 아이템 1개).
- **권한(API, 실질 게이트)**: mutation 라우트는 모두 `createServiceClient()`(service role, RLS 우회)를 쓰므로 **권한 판정은 API 라우트 로직**이 담당. RLS는 보조 방어선.
  - `PATCH /api/sessions/[sessionId]` → `verifyAdmin` (admin 전용). 허용 필드 `title|notes|session_date`. `expectedUpdatedAt` optimistic concurrency.
  - `POST /api/sessions/[sessionId]/action-items` → `verifyAdmin`.
  - `PATCH .../action-items/[itemId]` → `verifyJWT`; admin은 `body|display_order|is_completed`, **champion은 `is_completed` 토글만**(그 외 필드는 403). champion 분기에서 세션 소유 확인.
  - `DELETE .../action-items/[itemId]` → `verifyAdmin`.
- **UI**:
  - admin: `components/sessions/AdminSessionDetail.tsx` — 노트 편집(`SessionNotesEditor`) + 액션 아이템 전체 CRUD 핸들러 보유.
  - champion: `components/sessions/ChampionSessionDetail.tsx` — 노트 read-only(`MarkdownView`), 액션 아이템은 체크박스 토글만.
- **역할 판정**: 서버 `lib/auth.ts`(`verifyJWT`/`verifyAdmin`), 인라인 `!!user.user_metadata?.is_admin`.

## 설계

### 1. 권한 판정 공통화 (서버, 순수 함수 + 헬퍼)

라우트 4곳이 "admin인가 / 이 세션의 소유 champion인가"를 반복 판정하므로 공통화한다.

**`lib/sessions/access.ts`** (신규)
- `resolveSessionRole(supabase, sessionId, user): Promise<'admin' | 'owner' | null>`
  - admin이면 `'admin'`. 아니면 세션을 조회해 `champion_user_id === user.id`면 `'owner'`, 아니면 `null`.
  - `null`이면 라우트가 403 반환.

**`lib/sessions/permissions.ts`** (신규, 순수 함수 — 단위 테스트 대상)
- `allowedSessionUpdateFields(role: 'admin' | 'owner'): readonly string[]`
  - `admin` → `['title', 'notes', 'session_date']`
  - `owner` → `['notes']`
- `allowedActionItemUpdateFields(role: 'admin' | 'owner'): readonly string[]`
  - `admin` → `['body', 'display_order', 'is_completed']`
  - `owner` → `['body', 'is_completed']` (본문 수정 + 완료 토글; reorder는 admin 전용)

순수 함수로 분리하는 이유: 이 저장소의 테스트 관례(`lib/milestone-filter.ts` 등 순수 함수 단위 테스트)와 일치. 라우트 핸들러는 이 함수로 화이트리스트를 결정.

### 2. API 라우트 변경

- **`PATCH /api/sessions/[sessionId]`**: `verifyAdmin` → `verifyJWT`. `resolveSessionRole`로 role 판정(`null`→403). `allowedSessionUpdateFields(role)`로 적용 필드 제한 → champion은 `notes`만 반영(title/session_date는 무시). `expectedUpdatedAt` 동시성 로직 유지. 409 메시지를 "다른 관리자가" → "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요."로 일반화.
- **`POST .../action-items`**: `verifyAdmin` → `verifyJWT` + `resolveSessionRole`(`null`→403). 통과 시 insert.
- **`PATCH .../action-items/[itemId]`**: champion 분기를 `allowedActionItemUpdateFields('owner')` 기반으로 확장 → `body` 수정 허용. 세션 소유 확인 유지. 허용 외 키만 들어오면 403(빈 업데이트 방지).
- **`DELETE .../action-items/[itemId]`**: `verifyAdmin` → `verifyJWT` + `resolveSessionRole`(`null`→403) 후 삭제.

### 3. RLS 마이그레이션 (보조 방어선)

**`supabase/migrations/<timestamp>_champion_session_edit.sql`** (신규)
- `check_up_sessions`: champion UPDATE 정책 추가 — `FOR UPDATE USING (auth.uid() = champion_user_id) WITH CHECK (auth.uid() = champion_user_id)`. (컬럼 단위 제한은 RLS로 강제하지 않음 — 필드 화이트리스트는 API가 담당.)
- `session_action_items`:
  - champion INSERT 정책 — `WITH CHECK (EXISTS(SELECT 1 FROM check_up_sessions WHERE id = session_id AND champion_user_id = auth.uid()))`.
  - champion DELETE 정책 — `USING (EXISTS(... champion_user_id = auth.uid()))`.
  - (champion UPDATE는 기존 `action_items_champion_toggle` 정책이 소유 행에 대해 이미 허용하므로 본문 수정도 RLS상 통과 — 추가 불필요.)

### 4. 공통 클라이언트 훅 추출 (#4, 중복 제거)

admin/champion 두 컴포넌트가 동일 핸들러를 갖게 되므로 로직을 훅으로 추출하고 **양쪽 모두 훅을 소비**하도록 리팩터(복붙 아님).

**`components/sessions/useSessionActionItems.ts`** (신규)
- 입력: `sessionId`, 초기 `SessionActionItem[]`.
- 보유 상태: `actionItems`, `newItemBody`, `addingItem`, `editingItemId`, `editingItemBody`.
- 노출 핸들러: `addItem`, `toggleItem`, `deleteItem`, `startEdit(item)`, `saveItemBody`, `cancelEdit`, setter들.
- 기존 `AdminSessionDetail`의 핸들러(`addItem`/`toggleItem`/`deleteItem`/`saveItemBody`)를 그대로 이전.

**`components/sessions/useSessionNotes.ts`** (신규)
- 입력: `sessionId`, 현재 `session`/`setSession`.
- 보유 상태: `notes`, `isEditingNotes`, `saving`.
- 노출: `saveNotes`, `setNotes`, `setIsEditingNotes`, 초기화 헬퍼.
- admin의 노트 편집 동작(첫 세션이면 편집 뷰 기본 열림, 409시 `load()` 재조회)과 동일하게 유지.

`AdminSessionDetail`을 이 두 훅으로 교체하되 **기존 동작은 동일**해야 한다(회귀 주의 — 검증 필요).

### 5. 챔피언 UI (`ChampionSessionDetail.tsx`)

- **미팅 노트**: read-only → `useSessionNotes` 사용. admin과 동일한 "수정" 버튼 + `SessionNotesEditor` + 저장. (노트가 비어 있어도 섹션을 보여 작성 가능하게.)
- **액션 아이템**: 토글만 → `useSessionActionItems` 사용. 생성 입력란 + 항목별 인라인 본문 수정/삭제 추가. 체크박스 토글 유지. 섹션 헤더 "내 액션 아이템" 유지.
- 디자인은 기존 champion 디테일의 Notion 스타일(섹션 구분선 + 작은 라벨) 톤을 유지하되, 편집 affordance는 admin 패턴 재사용.

## 데이터 흐름

```
champion 노트 저장:
  ChampionSessionDetail → useSessionNotes.saveNotes
    → PATCH /api/sessions/[id] { notes, expectedUpdatedAt }
    → verifyJWT → resolveSessionRole='owner' → allowedSessionUpdateFields → {notes}만 update

champion 액션 아이템 생성/수정/삭제:
  ChampionSessionDetail → useSessionActionItems.{addItem|saveItemBody|deleteItem}
    → POST/PATCH/DELETE .../action-items[/itemId]
    → verifyJWT → resolveSessionRole='owner' → 허용 필드 검증 → 반영
```

## 에러 처리

- 비소유·비admin: 401(미인증) / 403(타 세션). 클라이언트는 `toast.error(서버 메시지)`.
- 노트 동시 편집 충돌: 409 → 일반화된 메시지 노출 + 재조회(`load()`).
- 액션 아이템: 생성/수정/삭제 실패 시 토스트, 옵티미스틱 상태는 실패 시 서버 응답 기준으로 정정(현재 admin 패턴 유지).

## 테스트

- **단위(순수 함수)**: `allowedSessionUpdateFields`, `allowedActionItemUpdateFields` — role별 허용 필드 화이트리스트. (`test/lib/` 관례)
- 라우트 핸들러는 service client/`supabase.auth.getUser` 의존이 커 통합 테스트 비용이 높으므로, 권한 결정 로직을 위 순수 함수로 뽑아 그 부분을 테스트로 커버.
- 수동 검증: champion 계정으로 (a) 노트 수정 저장, (b) 액션 아이템 추가/본문수정/삭제, (c) 타인 세션 접근 차단, (d) admin 동작 회귀 없음.

## 영향 파일 요약

| 파일 | 변경 |
|---|---|
| `lib/sessions/access.ts` | 신규 — `resolveSessionRole` |
| `lib/sessions/permissions.ts` | 신규 — 허용 필드 순수 함수 |
| `app/api/sessions/[sessionId]/route.ts` | PATCH 권한/필드 화이트리스트 |
| `app/api/sessions/[sessionId]/action-items/route.ts` | POST 권한 |
| `app/api/sessions/[sessionId]/action-items/[itemId]/route.ts` | PATCH champion body 허용, DELETE 권한 |
| `supabase/migrations/<ts>_champion_session_edit.sql` | 신규 RLS 정책 |
| `components/sessions/useSessionActionItems.ts` | 신규 훅 |
| `components/sessions/useSessionNotes.ts` | 신규 훅 |
| `components/sessions/AdminSessionDetail.tsx` | 훅 소비로 리팩터(동작 동일) |
| `components/sessions/ChampionSessionDetail.tsx` | 노트/액션 아이템 편집 UI 추가 |
| `test/lib/session-permissions.test.ts` | 신규 단위 테스트 |
