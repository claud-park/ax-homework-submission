# Admin 계정 분리 + 세션 동시성 가드 — 설계

날짜: 2026-06-24
배경: admin 계정을 3명이 공유하며 각자 다른 컴퓨터에서 champion 체크업 세션을 녹음/처리한다. 신원 추적 불가와 같은-세션 동시 처리 레이스를 해결한다.

## 목표

1. **계정 분리** — 공유 admin 1계정을 **admin-alex / admin-claud / admin-jennifer** 3계정(이메일+비번)으로 분리. 기존 공유 계정은 비활성화.
2. **세션 동시성 핵심 가드** — 같은 세션을 두 admin이 동시에 처리/수정할 때의 데이터 손상 방지.

## 현황 (코드 확인 결과)

- admin 로그인: 이메일+비번, `user_metadata.is_admin` 검사 (`app/admin/login/page.tsx`, `lib/auth.ts`). champion은 Google OAuth.
- **귀속은 이미 개별 UUID 기반**: `check_up_sessions.admin_user_id = admin.id`(`app/api/sessions/route.ts`), 댓글 `author_id`/hotline `sender_id`도 개별. 댓글 수정·삭제는 `author_id === 현재 admin`으로 이미 분기(`app/admin/champions/[userId]/page.tsx`).
- 따라서 **계정만 분리하면 귀속·감사·"내 댓글만 수정"이 자동으로 올바르게 동작** — 추가 앱 코드 불필요.
- 동시성 제어는 전무: `processing_status` 단일 컬럼, reprocess는 action item `delete`+`insert`, notes는 last-write-wins.

## Part 1 — 계정 분리 (스크립트)

### `scripts/create-admins.ts` (신규, idempotent)

- service role 키로 Supabase Admin API 사용.
- 입력: 환경변수(실값은 실행 시 주입, 코드/스펙에 하드코딩 금지):
  - `ADMIN_ALEX_EMAIL` / `ADMIN_ALEX_PASSWORD`
  - `ADMIN_CLAUD_EMAIL` / `ADMIN_CLAUD_PASSWORD`
  - `ADMIN_JENNIFER_EMAIL` / `ADMIN_JENNIFER_PASSWORD`
  - `OLD_ADMIN_EMAIL` (비활성화 대상)
  - `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (기존 env 재사용)
  - 표시 이름은 코드에 매핑: alex→"Alex", claud→"Claud", jennifer→"Jennifer".
  - 누락된 계정 env는 건너뛰고 경고 로그(부분 실행 허용).
- 동작:
  1. 각 admin에 대해: 이메일로 기존 유저 조회 → 없으면 `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { is_admin: true, name } })`, 있으면 `updateUserById`로 `is_admin: true` + `name` 보정. (idempotent)
  2. **기존 공유 계정 비활성화**: `OLD_ADMIN_EMAIL` 환경변수로 지정된 계정을 조회해 `user_metadata.is_admin = false`로 강등 + `ban_duration`으로 로그인 차단. (삭제 아님 — 과거 데이터의 `admin_user_id` FK는 `ON DELETE SET NULL`이므로 보존 위해 ban 사용)
- 출력: 각 계정 처리 결과(created/updated/skipped) 로그. 비번 등 민감값은 로그에 출력하지 않음.
- 실행: `bun run scripts/create-admins.ts` (또는 package.json 스크립트 추가).

### 앱 코드 변경

- **없음** (헤더는 이미 `user_metadata.name` 표시, 귀속/권한 분기 기존 동작). 챔피언 대면 표기는 "관리자" 유지.

## Part 2 — 동시성 핵심 가드

### 2-1. 처리 락 (process / reprocess)

`/api/sessions/[sessionId]/process`, `/reprocess` 시작 시 **원자적 클레임**:

```
UPDATE check_up_sessions
SET processing_status = 'transcribing'
WHERE id = :id AND processing_status NOT IN ('uploading','transcribing','summarizing')
```

- 영향 row가 0이면 이미 다른 처리가 진행 중 → **409** `{ error: '이미 처리 중인 세션입니다. 잠시 후 다시 시도하세요.' }`. 처리 중단.
- 영향 row가 1이면 클레임 성공 → 공유 파이프라인(`lib/sessions/processAudio.ts`) 진행. 파이프라인 내부의 `processing_status='transcribing'` 중복 set은 무해.
- 효과: 같은 세션 이중 전사/요약, action item `delete`+`insert` 인터리빙 차단.
- 구현 메모: Supabase는 update 후 `.select()` 행 수로 클레임 성공 판정. 클레임을 라우트에서 수행하고, 성공 시에만 `processSessionAudio` 호출.

### 2-2. notes 낙관적 동시성 (PATCH 세션)

`PATCH /api/sessions/[sessionId]` (title/notes/date 수정):

- 클라이언트가 마지막으로 읽은 `updated_at`을 body에 포함(`expectedUpdatedAt`).
- 서버: `UPDATE ... WHERE id = :id AND updated_at = :expectedUpdatedAt`. 영향 row 0이면 **409** `{ error: '다른 관리자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.' }`.
- `expectedUpdatedAt` 미전송 시(구버전 호출) 기존 동작 유지 — 점진 적용.

### 2-3. 클라이언트 409 처리

- `RecordingPanel`: process 409 → 에러 단계에 "이미 처리 중" 메시지.
- 세션 상세 notes 저장(`AdminSessionDetail`): 409 → toast로 위 안내 + 최신 데이터 리로드.

## 테스트

- `scripts/create-admins.ts`의 순수 로직(설정 파싱/대상 분류)이 있으면 단위 테스트.
- 처리 락: 라우트 핸들러 레벨에서 "in-flight 상태면 409" 분기 테스트(서비스 클라이언트 모킹 가능 범위).
- notes 동시성: `expectedUpdatedAt` 불일치 시 409 분기 테스트.

## 범위 밖 (YAGNI)

- 녹음 점유 UI("OO가 녹음 중"), 세션 목록 실시간 동기화(Realtime/폴링).
- charter approval `approved_by` 추적, `ADMIN_NOTIFICATION_EMAIL` 분리, 챔피언 대면 admin 실명 노출.

## 비고 / 운영

- 계정 생성 후 3명에게 각자 계정/비번 전달, 기존 공유 비번은 폐기.
- 과거 세션의 `admin_user_id`는 공유 계정 UUID로 남음(소급 분리 불가) — 신규 세션부터 개별 귀속.
- 관련: [[2026-06-23-checkup-session]], `docs/superpowers/specs/2026-06-24-champion-charter-default-and-audio-upload-design.md`
