# 1:1 녹음 안정화 (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 녹음 후 처리 중 wifi가 끊겨도 녹음이 사라지지 않고, 네트워크 문제는 자동으로 이어서 처리되며, 업로드만 끝난 세션은 Admin이 화면에서 복구할 수 있다.

**Architecture:** 순수 함수 헬퍼(재시도, 오류 분류, 폴링 내성)와 IndexedDB 보관소를 먼저 만들고 각각 단위 테스트로 고정한다. 그다음 `RecordingPanel`이 이 헬퍼들을 쓰도록 통합하고, 서버는 Storage 청크 목록을 노출해 `AdminSessionDetail`이 복구 진입로를 보여 준다. `processAudio`와 락 로직은 건드리지 않는다. DB 마이그레이션은 없다.

**Tech Stack:** Next.js App Router, Supabase (Storage 서명 URL 직접 업로드), vitest + jsdom, `fake-indexeddb`(devDependency 추가).

**Spec:** `docs/superpowers/specs/2026-10-21-recording-stability-and-slack-recap-design.md` (PR 1 절)

## Global Constraints

- Admin 기준 화면만 다룬다. 챔피언 직접 녹음 화면은 바꾸지 않는다.
- 큰 파일은 지금처럼 Storage 직접 업로드를 유지한다 (Vercel 함수 본문 4.5MB 한도).
- `lib/sessions/processAudio.ts`, `lib/sessions/lock.ts`, `/process` 라우트의 락 동작은 변경하지 않는다.
- 새 DB 컬럼/마이그레이션을 만들지 않는다.
- IndexedDB가 쓸 수 없는 환경(프라이빗 모드 등)에서도 기존 메모리 경로로 동작해야 한다. 보관소 함수는 예외를 던지지 않는다.
- 서버 상태가 `done`이면 로컬 복사본을 지우고 "이어서 처리" 배너를 보여 주지 않는다 (정상 노트 덮어쓰기 방지).
- 사용자 문구는 해요체. 오류 문구 세 종류(네트워크/인증/서버)는 원인과 다음 행동을 함께 안내한다.

## Review Focus

- 업로드 도중 탭을 닫았다가 다시 열기 → 녹음 복원 배너가 뜨고 이어서 처리된다 (Task 4, 6).
- `[다시 시도]` 또는 복원 처리 시 서버가 아직 처리 중 → `/process`가 409 → 오류가 아니라 폴링으로 이어간다 (Task 6).
- 폴링 중 장시간 오프라인 → 오류로 표시되지 않고, 오프라인 시간은 타임아웃(320초)에 포함되지 않는다 (Task 2).
- IndexedDB 접근 불가 → 저장 실패해도 녹음·업로드는 정상 진행된다 (Task 4).
- 다른 Admin이 별도 파일로 이미 `done`으로 만든 세션 → 로컬 복사본 삭제, 배너 없음 (Task 7).

---

### Task 1: 재시도 헬퍼

**Files:**
- Create: `lib/sessions/retry.ts`
- Test: `test/lib/retry.test.ts`

**Interfaces:**
- Produces:
  - `class HttpError extends Error { constructor(public status: number, message: string) }`
  - `isTransientError(err: unknown): boolean` — `TypeError`, `HttpError`의 status가 408/429/5xx, 메시지가 `/failed to fetch|network|load failed/i`와 맞는 오류는 true. 그 외(4xx, `AuthError` 등)는 false.
  - `waitForOnline(): Promise<void>` — `navigator.onLine !== false`면 즉시 resolve, 아니면 `online` 이벤트까지 대기.
  - `withRetry<T>(fn: () => Promise<T>, opts?: { attempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<T>` — 기본 `attempts=5`, `baseMs=1000`, 대기는 `baseMs * 2^(n-1)`.

- [ ] **Step 1: Write the failing tests** in `test/lib/retry.test.ts` (주입한 `sleep`으로 시간을 쓰지 않는다)
  - `retries a transient error then succeeds` — 처음 2번 `TypeError`, 3번째 성공 → 결과 반환, `fn` 3회 호출.
  - `throws immediately on a non-transient error` — `HttpError(400)` → `fn` 1회 호출 후 throw.
  - `gives up after attempts and rethrows the last error` — 항상 `HttpError(503)`, `attempts: 3` → `fn` 3회 후 throw.
  - `backs off exponentially` — `sleep` 인자가 `[1000, 2000]`(`baseMs: 1000`, 3번째에 성공).
  - `offline failures do not consume an attempt` — `navigator.onLine`을 false로 스텁하고 `online` 이벤트를 dispatch하는 동안 실패한 시도는 `attempts`에 세지 않는다.
  - `isTransientError` 표: `TypeError('Failed to fetch')`, `HttpError(503)`, `HttpError(429)`, `Error('Load failed')` → true; `HttpError(401)`, `HttpError(400)`, `new Error('x')` → false.
- [ ] **Step 2: Run** `npx vitest run test/lib/retry.test.ts` — Expected: FAIL (module not found)
- [ ] **Step 3: Implement** `lib/sessions/retry.ts` per the interface above.
- [ ] **Step 4: Run** `npx vitest run test/lib/retry.test.ts` — Expected: PASS
- [ ] **Step 5: Commit** `git add lib/sessions/retry.ts test/lib/retry.test.ts && git commit -m "[AX-1] feat(sessions): 네트워크 재시도 헬퍼"`

---

### Task 2: 폴링의 네트워크 단절 내성

**Files:**
- Modify: `lib/sessions/pollProcessing.ts`
- Test: `test/lib/poll-processing.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: `waitForOnline` from Task 1.
- Produces: `pollProcessing(sessionId, getToken, onStatus, opts)`의 `opts`에 `onConnection?: (connected: boolean) => void` 추가. 시그니처 나머지와 기존 동작(`!res.ok`는 재시도, terminal 상태에서 resolve)은 유지.

- [ ] **Step 1: Write the failing tests** (기존 파일의 `mockFetchSequence` 스타일을 따른다)
  - `survives fetch throwing and resumes` — `fetch`가 2번 `TypeError`를 던진 뒤 `done` 반환 → resolve, `onConnection` 호출 순서 `[false, true]`.
  - `does not time out while disconnected` — `timeoutMs: 50`, fetch가 `TypeError`로 200ms 동안 실패한 뒤 `done` → throw 없이 resolve (오프라인 시간은 타임아웃 시계에서 제외).
  - `still times out when connected but never terminal` — 기존 타임아웃 동작 유지.
- [ ] **Step 2: Run** `npx vitest run test/lib/poll-processing.test.ts` — Expected: FAIL (두 신규 케이스)
- [ ] **Step 3: Modify** `pollProcessing`: `fetch` 호출을 try/catch로 감싼다. 예외 시 `onConnection(false)`를 전이 시 한 번 호출하고, 실패 구간의 경과 시간을 `disconnectedMs`에 누적해 `Date.now() - start - disconnectedMs > timeout`으로 판정한다. 다음 성공 응답에서 `onConnection(true)`.
- [ ] **Step 4: Run** 같은 명령 — Expected: PASS (기존 케이스 포함)
- [ ] **Step 5: Commit** `git commit -am "[AX-1] feat(sessions): 폴링이 네트워크 단절을 견디도록 보강"`

---

### Task 3: 실패 원인 분류와 문구

**Files:**
- Create: `lib/sessions/uploadErrors.ts`
- Test: `test/lib/upload-errors.test.ts`

**Interfaces:**
- Consumes: `isTransientError`, `HttpError` from Task 1.
- Produces:
  - `class AuthError extends Error {}`
  - `type FailureKind = 'network' | 'auth' | 'server'`
  - `classifyFailure(err: unknown, online: boolean): { kind: FailureKind; message: string }`
    - `network`: `!online`이거나, `HttpError`가 아니면서 `isTransientError(err)`인 오류(`TypeError`, fetch 실패 메시지). 재시도가 소진된 5xx `HttpError`는 `server`로 분류한다. 문구 "네트워크 연결이 끊겨 처리가 중단됐어요. 녹음은 이 기기에 보관돼 있어요. 연결되면 [다시 시도]를 눌러 주세요."
    - `auth`: `AuthError`. 문구 "로그인이 만료됐어요. 새로고침 후 다시 로그인해 주세요. 녹음은 이 기기에 보관돼 있어요."
    - `server`: 그 외. `err.message`가 있으면 그것을, 없으면 "서버에서 처리하지 못했어요. [다시 시도]하거나 세션 화면에서 상태를 확인하세요."

- [ ] **Step 1: Write the failing tests**
  - `offline → network even for generic Error` (`classifyFailure(new Error('x'), false).kind === 'network'`)
  - `TypeError while online → network`
  - `AuthError while online → auth` / `AuthError while offline → network` (오프라인이면 인증 문제로 단정하지 않는다)
  - `generic Error online → server with its message`: `new Error('처리 실패')` online → `{ kind: 'server', message: '처리 실패' }`
  - `exhausted 5xx HttpError online → server`: `new HttpError(503, '서버 오류')` online → `kind === 'server'`
- [ ] **Step 2: Run** `npx vitest run test/lib/upload-errors.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `lib/sessions/uploadErrors.ts`
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `git add lib/sessions/uploadErrors.ts test/lib/upload-errors.test.ts && git commit -m "[AX-1] feat(sessions): 업로드 실패 원인 분류"`

---

### Task 4: 로컬 녹음 보관소 (IndexedDB)

**Files:**
- Create: `lib/audio/localRecordingStore.ts`
- Test: `test/lib/local-recording-store.test.ts`
- Modify: `package.json` (devDependency `fake-indexeddb`)

**Interfaces:**
- Produces:
  - `interface StoredRecording { sessionId: string; blob: Blob; durationSec: number; filename: string; savedAt: number }`
  - `saveRecording(rec: StoredRecording): Promise<boolean>` — 실패(IndexedDB 없음/쿼터)면 false, 예외 없음.
  - `loadRecording(sessionId: string): Promise<StoredRecording | null>` — 없거나 접근 불가면 null.
  - `deleteRecording(sessionId: string): Promise<void>` — 예외 없음.
  - DB 이름 `ax-recordings`, 스토어 `recordings`, keyPath `sessionId`.

- [ ] **Step 1: Install** `npm i -D fake-indexeddb`
- [ ] **Step 2: Write the failing tests** (`import 'fake-indexeddb/auto'`)
  - `round-trips a recording` — save 후 load한 `durationSec`/`filename` 동일, `blob.size` 동일.
  - `load returns null for unknown session`
  - `delete removes the recording`
  - `saving twice for the same session overwrites`
  - `returns false / null without throwing when indexedDB is unavailable` — `vi.stubGlobal('indexedDB', undefined)` 후 `saveRecording` → false, `loadRecording` → null, `deleteRecording` resolve.
- [ ] **Step 3: Run** `npx vitest run test/lib/local-recording-store.test.ts` — Expected: FAIL
- [ ] **Step 4: Implement** `lib/audio/localRecordingStore.ts` (직접 구현, 라이브러리 없이 `indexedDB.open`을 Promise로 감싼다)
- [ ] **Step 5: Run** — Expected: PASS
- [ ] **Step 6: Commit** `git add package.json package-lock.json lib/audio/localRecordingStore.ts test/lib/local-recording-store.test.ts && git commit -m "[AX-1] feat(audio): 녹음 원본 IndexedDB 보관소"`

---

### Task 5: Storage 청크 목록 노출 (서버)

**Files:**
- Create: `lib/sessions/storedAudio.ts`
- Modify: `app/api/sessions/[sessionId]/reprocess/route.ts` (청크 목록 로직을 헬퍼로 교체)
- Modify: `app/api/sessions/[sessionId]/route.ts` (GET 응답에 `stored_audio_chunk_count`)
- Modify: `lib/types.ts` (`CheckUpSession`에 `stored_audio_chunk_count?: number`)
- Test: `test/lib/stored-audio.test.ts`

**Interfaces:**
- Produces: `listStoredChunkPaths(supabase: SupabaseClient, sessionId: string): Promise<string[]>` — `sessions/{sessionId}` 아래 `chunk_\d+\.wav`만, 이름순 정렬한 전체 경로. 목록 실패 시 `[]`.
- GET `/api/sessions/[sessionId]`: Admin이고 `audio_file_path`가 비어 있을 때만 `stored_audio_chunk_count = (await listStoredChunkPaths(...)).length`, 그 외 0.

- [ ] **Step 1: Write the failing tests** (supabase 클라이언트는 `storage.from().list()`만 흉내 내는 객체로 스텁)
  - `returns only chunk wav files, sorted` — `['chunk_001.wav','notes.txt','chunk_000.wav']` → 두 경로, 000 → 001 순.
  - `returns [] when listing errors or is empty`
- [ ] **Step 2: Run** `npx vitest run test/lib/stored-audio.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `listStoredChunkPaths`, `reprocess/route.ts`가 이를 쓰도록 바꾸고(레거시 `audio_file_path` 폴백은 유지), GET 라우트와 타입을 수정한다.
- [ ] **Step 4: Run** `npx vitest run test/lib/stored-audio.test.ts && npx tsc --noEmit` — Expected: PASS, 타입 오류 없음
- [ ] **Step 5: Commit** `git add -A lib app test && git commit -m "[AX-1] feat(sessions): 저장된 오디오 청크 목록 노출"`

---

### Task 6: RecordingPanel 통합

**Files:**
- Modify: `components/sessions/RecordingPanel.tsx`

**Interfaces:**
- Consumes: `withRetry`, `HttpError`, `waitForOnline` (Task 1); `pollProcessing`의 `onConnection` (Task 2); `classifyFailure`, `AuthError` (Task 3); `saveRecording`, `loadRecording`, `deleteRecording`, `StoredRecording` (Task 4).
- 컴포넌트 props는 바꾸지 않는다: `{ sessionId: string; onProcessed: (notes, actionItems) => void }`.

RecordingPanel은 MediaRecorder와 Supabase 클라이언트에 묶여 있어 컴포넌트 단위 테스트를 추가하지 않는다. 동작은 Task 1~4의 단위 테스트와 마지막 수동 QA로 고정한다.

- [ ] **Step 1: 로컬 보관.** `stopAndProcess`에서 `audioBlob`을 만든 직후(크기 검사 통과 후, `uploadAndProcess` 호출 전) `void saveRecording({ sessionId, blob: audioBlob, durationSec, filename: 'audio.webm', savedAt: Date.now() })`.
- [ ] **Step 2: 인증 단계.** `uploadAndProcess` 초입의 세션 확보에서 세션이 없고 `navigator.onLine === false`면 `AuthError`가 아니라 네트워크 실패로 처리한다 (`throw new TypeError('offline')`). 온라인인데 세션이 없을 때만 `AuthError`.
- [ ] **Step 3: 재시도 적용.** 청크마다 `upload-url` 요청과 `uploadToSignedUrl`을 각각 `withRetry`로 감싼다. 응답 `!ok`는 `HttpError(status, ...)`로, Storage `upErr`는 `new Error(upErr.message)`(메시지로 일시 오류 판별)로 던진다. `/process` 호출도 `withRetry`로 감싼다.
- [ ] **Step 4: 409 처리.** `/process`가 409면 오류로 보지 않고 곧바로 폴링 단계로 넘어간다 (서버가 이미 처리 중).
- [ ] **Step 5: 폴링.** `pollProcessing`에 `onConnection`을 넘겨 연결이 끊기면 진행 영역에 "연결이 끊겨 확인하지 못했어요. 서버에서는 계속 처리 중일 수 있어요. 연결되면 자동으로 이어갈게요"를 보여 주고 `phase`는 `error`로 바꾸지 않는다. 복구되면 안내를 지운다.
- [ ] **Step 6: 오류 표시.** `catch`에서 `classifyFailure(err, navigator.onLine !== false)`의 `message`를 `errorMsg`로 쓴다. 처리 결과가 `error`일 때의 기존 문구도 같은 `server` 문구를 쓴다.
- [ ] **Step 7: 로컬 복사본 정리.** 최종 상태가 `done` 또는 `low_quality`이면 `deleteRecording(sessionId)`. `error`이면 남겨 둔다. `reset()`("새로 시작")은 사용자가 의도적으로 버리는 것이므로 `deleteRecording(sessionId)`도 호출한다.
- [ ] **Step 8: 복원 배너.** 마운트 시 `loadRecording(sessionId)`가 있으면 `idle` 화면 위에 "업로드하지 못한 녹음이 있어요. 이어서 처리할까요?" 배너를 보여 준다. `[이어서 처리]`는 해당 blob으로 `uploadAndProcess`를 호출하고(진행 추정치는 `stopAndProcess`와 같은 식), `[버리기]`는 `deleteRecording` 후 배너를 닫는다.
- [ ] **Step 9: 타입·린트** `npx tsc --noEmit && npm run lint` — Expected: 오류 없음
- [ ] **Step 10: Commit** `git commit -am "[AX-1] feat(sessions): 녹음 패널에 로컬 보관·재시도·복원 적용"`

---

### Task 7: AdminSessionDetail 복구 진입로와 로컬 정리

**Files:**
- Modify: `components/sessions/AdminSessionDetail.tsx`

**Interfaces:**
- Consumes: `session.stored_audio_chunk_count` (Task 5), `deleteRecording` (Task 4), 기존 `reprocess()` 함수와 `reprocessing` 상태.

- [ ] **Step 1: 복구 배너.** `!session.audio_file_path && (session.stored_audio_chunk_count ?? 0) > 0`이고 `processing_status`가 처리 중(`transcribing`/`summarizing`)이 아닐 때, `RecordingPanel` 위에 "업로드된 녹음이 있지만 처리되지 않았어요. 저장된 오디오로 처리할 수 있어요." 배너와 기존 `reprocess()`를 호출하는 `[저장된 오디오로 처리]` 버튼을 보여 준다. 스타일은 기존 `이전 처리 실패` 배너를 따른다.
- [ ] **Step 2: 로컬 정리.** 세션 로드 후 `processing_status`가 `done` 또는 `low_quality`이면 `useEffect`에서 `deleteRecording(sessionId)`를 한 번 호출한다 (다른 Admin이 이미 처리를 끝낸 세션의 로컬 복사본이 남아 덮어쓰기 배너를 띄우지 않도록).
- [ ] **Step 3: 타입·린트·전체 테스트·빌드** `npx tsc --noEmit && npm run lint && npm test && npx next build` — Expected: 모두 통과 (`next build`는 라우트 세그먼트 이름 충돌 확인용)
- [ ] **Step 4: Commit** `git commit -am "[AX-1] feat(sessions): 처리되지 않은 업로드 복구 배너와 로컬 복사본 정리"`

---

### Task 8: 수동 QA와 마무리

**Files:** 없음 (검증만)

- [ ] **Step 1: dev 서버에서 시나리오 확인** (Chrome DevTools Network 탭의 Offline 토글 사용). 각 항목에서 기대 결과를 확인한다.
  - 업로드 중 Offline → 자동 대기, Online 복구 후 이어서 완료되어 노트 생성.
  - 처리(전사/요약) 중 Offline → 오류가 뜨지 않고 "연결이 끊겨…" 안내, Online 복구 후 완료 결과 표시.
  - 업로드 중 탭 닫기 → 같은 세션 재진입 시 복원 배너 → `[이어서 처리]`로 노트 생성.
  - `/process` 직전 Offline 후 탭 닫기(오디오만 Storage에 있음) → 재진입 시 `[저장된 오디오로 처리]`로 노트 생성.
  - 다른 탭에서 같은 세션을 파일 업로드로 `done` 처리 → 원래 탭 재진입 시 배너 없음.
  - 프라이빗 창에서 녹음 → 정상 동작 (보관 없이).
- [ ] **Step 2: PR 생성** — 마이그레이션이 없음을 PR 설명에 적는다. 신규 devDependency `fake-indexeddb`를 언급한다.
