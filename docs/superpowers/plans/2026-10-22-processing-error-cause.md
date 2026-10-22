# 처리 실패 원인 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1:1 노트 처리가 서버에서 실패했을 때, "서버에서 처리하지 못했어요" 대신 원인(OpenAI 크레딧 부족, 요청 제한, 인증 실패, 요약 크레딧 부족, AI 연결 실패)과 다음 행동을 Admin 화면에 보여 준다.

**배경:** 2026-10-22 production에서 OpenAI 크레딧 소진(`429 You have no credits remaining`)으로 처리가 실패했는데 화면에는 원인 없는 문구만 떴고, 로그를 뒤져서야 알았다. 실패 사유를 저장하는 곳이 없다.

**Architecture:** 실패 원인을 짧은 코드(`processing_error`)로 `check_up_sessions`에 저장하고(원문 메시지는 저장하지 않는다), 화면이 코드를 한국어 문구로 바꿔 보여 준다. 분류는 순수 함수, 저장은 상태 업데이트와 분리된 best-effort 쓰기(컬럼이 없어도 처리 결과에 영향 없음).

**Tech Stack:** Next.js, Supabase, vitest.

## Global Constraints

- 실패 원인 저장 실패(컬럼 없음 등)가 `processing_status` 갱신을 막거나 바꾸면 안 된다: `processing_error`는 **별도 UPDATE**로, 반환된 `error`는 로그만 남긴다. `processing_status='error'`를 쓰는 기존 UPDATE에 이 컬럼을 섞지 않는다.
- 저장하는 값은 아래 코드 중 하나뿐이다 (원문 에러 메시지·키·URL 저장 금지): `stt_quota`, `stt_rate_limited`, `stt_auth`, `summary_quota`, `summary_auth`, `upstream_unavailable`, `summary_parse`, `unknown`.
- 처리가 다시 시작되거나 `done`/`low_quality`로 끝나면 `processing_error`를 null로 되돌린다 (역시 별도 best-effort UPDATE).
- 마이그레이션은 prod Supabase에 수동 적용한다 (멱등 `ADD COLUMN IF NOT EXISTS`). 컬럼이 없어도 코드는 기존 문구로 동작해야 한다(안전한 기본값).
- Admin 화면 전용. 문구는 해요체. `processAudio`의 파이프라인 동작(STT/요약 순서, 락)은 바꾸지 않는다.
- 새 의존성 없음. `bun.lock` 변경 없음.

## Review Focus

- OpenAI/Anthropic SDK 오류 객체의 실제 형태(`status`, `code`, `error.type`, 메시지)에서 분류가 맞는지: 429 + `insufficient_quota`/"no credits" → `stt_quota`, 그 외 429 → `stt_rate_limited`, 401/403 → `stt_auth`, Anthropic "credit balance is too low" → `summary_quota`.
- 컬럼이 없는 DB에서 실패 처리 경로가 여전히 `status='error'`를 정확히 한 번 쓰고 throw하지 않는다.
- 성공/재처리 시 이전 실패 코드가 남아 있지 않는다.
- 분류 불가 오류는 `unknown`으로 저장되고 화면은 기존 문구를 쓴다.

---

### Task 1: 분류·저장 (서버)

**Files:**
- Create: `supabase/migrations/20261022000000_session_processing_error.sql`
- Create: `lib/sessions/processingError.ts`
- Modify: `lib/types.ts` (`CheckUpSession.processing_error?: string | null`)
- Modify: `lib/sessions/runProcessingInBackground.ts`, `lib/sessions/processAudio.ts` (성공/`SummaryParseError` 경로의 정리·기록)
- Test: `test/lib/processing-error.test.ts`, `test/lib/run-processing-in-background.test.ts` (기존 파일 확장)

**Interfaces:**
- Produces:
  - `type ProcessingErrorCode = 'stt_quota' | 'stt_rate_limited' | 'stt_auth' | 'summary_quota' | 'summary_auth' | 'upstream_unavailable' | 'summary_parse' | 'unknown'`
  - `classifyProcessingError(err: unknown, stage?: 'stt' | 'summary'): ProcessingErrorCode` — `err.status`(숫자), `err.code`, `err.error?.code`/`err.error?.type`, 메시지 정규식으로 판별. `stage`를 모르면 메시지/호스트 힌트(예: openai vs anthropic 메시지)로 추정하고, 불확실하면 STT 쪽 코드가 아니라 `unknown`/`upstream_unavailable`로 둔다. `SummaryParseError` → `summary_parse`.
  - `recordProcessingError(supabase: SupabaseClient, sessionId: string, code: ProcessingErrorCode | null): Promise<void>` — 별도 UPDATE(`processing_error`만), 반환 `error`는 `console.error`(메시지만), 절대 throw하지 않는다.
  - `isProcessingErrorCode(value: unknown): value is ProcessingErrorCode`

- [ ] **Step 1: Write the migration** (`ALTER TABLE check_up_sessions ADD COLUMN IF NOT EXISTS processing_error TEXT;`, 상단 주석: 목적, prod 수동 적용, 멱등, 컬럼이 없어도 코드는 안전).
- [ ] **Step 2: Write the failing tests** (`test/lib/processing-error.test.ts`):
  - `429 + insufficient_quota → stt_quota` (OpenAI 형태: `{ status: 429, code: 'insufficient_quota', message: '429 You have no credits remaining…' }` 및 `error.code` 중첩 형태 둘 다)
  - `429 without quota hint → stt_rate_limited`; `401 / 403 → stt_auth`
  - Anthropic `credit balance is too low`(400/`invalid_request_error`) → `summary_quota`; Anthropic 401 → `summary_auth`
  - 네트워크/타임아웃 계열(`ECONNRESET`, `ETIMEDOUT`, `fetch failed`, 5xx) → `upstream_unavailable`
  - `SummaryParseError` → `summary_parse`; 분류 불가/문자열/null → `unknown`
  - `recordProcessingError` 는 UPDATE가 `{ error }`를 반환해도 throw하지 않고 로그만 남기며, 호출 인자는 `processing_error` 키 하나뿐이다.
  - `isProcessingErrorCode` 표.
- [ ] **Step 3: Run** `npx vitest run test/lib/processing-error.test.ts` — Expected: FAIL
- [ ] **Step 4: Implement** `lib/sessions/processingError.ts` and the type field.
- [ ] **Step 5: Hook-in (tests first)** — extend `test/lib/run-processing-in-background.test.ts`: when `processSessionAudio` rejects with a non-`SummaryParseError`, the existing `processing_status='error'` UPDATE still happens exactly once AND a separate update sets `processing_error` to the classified code; when the recording succeeds (`done`/`low_quality` resolved), `processing_error` is reset to null via a separate update; a failing `processing_error` write (supabase returns `{ error }`) changes nothing about the status update and does not throw. Then implement in `runProcessingInBackground.ts` (the catch path classifies and records; the success path clears) and, for the `SummaryParseError` path that already sets `status='error'` inside `processAudio.ts`, record `summary_parse` (best-effort, after the existing write). Processing start: clear the previous code at the start of a run (best-effort). Do not change the pipeline order or the lock.
- [ ] **Step 6: Run** the focused tests, `npx tsc --noEmit`, and the full suite — Expected: PASS
- [ ] **Step 7: Commit** `git add supabase/migrations/20261022000000_session_processing_error.sql lib/sessions lib/types.ts test/lib && git commit -m "[AX-1] feat(sessions): 처리 실패 원인 코드 분류·저장"`

---

### Task 2: 화면에 원인 표시

**Files:**
- Create: `lib/sessions/processingErrorMessage.ts`
- Modify: `components/sessions/RecordingPanel.tsx` (서버 처리 실패 시 문구), `components/sessions/AdminSessionDetail.tsx` (`이전 처리 실패` 배너와 재처리 실패 경로)
- Test: `test/lib/processing-error-message.test.ts`

**Interfaces:**
- Consumes: `ProcessingErrorCode`, `isProcessingErrorCode` (Task 1).
- Produces: `processingErrorMessage(code: string | null | undefined): string | null` — 알려진 코드는 해요체 문구, `unknown`/모르는 값/없음은 `null`(호출부가 기존 문구를 쓴다). 문구:
  - `stt_quota`: "음성 전사(OpenAI) 크레딧이 부족해서 처리하지 못했어요. 크레딧을 충전한 뒤 [재처리]해 주세요."
  - `stt_rate_limited`: "음성 전사 요청이 몰려서 잠시 막혔어요. 잠시 후 [재처리]해 주세요."
  - `stt_auth`: "음성 전사 API 인증에 실패했어요. API 키를 확인해 달라고 개발 담당자에게 알려 주세요."
  - `summary_quota`: "요약(Claude) 크레딧이 부족해서 처리하지 못했어요. 크레딧을 충전한 뒤 [재처리]해 주세요."
  - `summary_auth`: "요약 API 인증에 실패했어요. API 키를 확인해 달라고 개발 담당자에게 알려 주세요."
  - `upstream_unavailable`: "AI 서비스에 연결하지 못했어요. 잠시 후 [재처리]해 주세요."
  - `summary_parse`: "요약 결과를 읽지 못했어요. 전사 원문은 노트에 남겨 뒀어요. [재처리]해 주세요."

- [ ] **Step 1: Write the failing tests** — 코드별 정확한 문구(위 표), `unknown`/`undefined`/`null`/미지의 문자열 → `null`.
- [ ] **Step 2: Run** `npx vitest run test/lib/processing-error-message.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `processingErrorMessage`.
- [ ] **Step 4: Wire the UI.** `RecordingPanel.tsx`: 폴링 결과가 `error`일 때 `processingErrorMessage(final.processing_error)`가 있으면 그 문구로 `phase='error'`의 `errorMsg`를 쓰고(`Error(message)`로 던져 기존 `classifyFailure`의 server 분기가 메시지를 그대로 보여 주게 한다), 없으면 기존 `HttpError(500, '')` 동작 유지. `AdminSessionDetail.tsx`: `이전 처리 실패` 배너에 `processingErrorMessage(session.processing_error)`가 있으면 그 문구를 부제로 보여 주고(없으면 기존 문구), `reprocess()`가 `error`로 끝났을 때 토스트/오류도 같은 문구를 쓴다. 처리 중이거나 성공 상태에서는 원인 문구를 보이지 않는다.
- [ ] **Step 5: Run** the focused test, `npx tsc --noEmit`, `npm run lint` on touched files, full suite, and `npx next build` (env: `set -a; . /Users/claud_01/Documents/flo/AX/ax-homework-submission/.env.local 2>/dev/null; set +a`) — Expected: 모두 통과
- [ ] **Step 6: Commit** `git add lib/sessions/processingErrorMessage.ts components/sessions test/lib && git commit -m "[AX-1] feat(sessions): 처리 실패 원인을 화면에 표시"`
