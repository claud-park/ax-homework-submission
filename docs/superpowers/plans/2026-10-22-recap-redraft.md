# recap 초안 다시 올리기 + 게시 실패 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** recap 초안이 Slack에 올라가지 못했을 때(채널 설정 문제 등) Admin이 처리 비용 없이 `[recap 초안 다시 올리기]`로 복구할 수 있고, 실패한 사실과 원인이 Admin 세션 화면에 보인다.

**배경:** 2026-10-22 노트 처리는 성공했는데 recap 봇이 비공개 채널에 초대돼 있지 않아 초안 게시가 `channel_not_found`로 실패했고, 로그에만 남았다. 다시 올리려면 `[재처리]`(전사·요약 재실행, 이 세션 기준 약 $0.16)밖에 없었다.

**Architecture:** `postRecapDraft`가 결과(성공/사유)를 반환하도록 하고(여전히 throw하지 않음), 실패 원인 코드를 `check_up_sessions.recap_draft_error`에 best-effort로 기록한다. Admin 전용 API `POST /api/sessions/[sessionId]/recap-draft`가 같은 함수를 호출해 초안을 다시 올리고, Admin 세션 화면이 버튼과 실패 배너를 보여 준다.

**Tech Stack:** Next.js, Supabase, `@slack/web-api`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-recording-stability-and-slack-recap-design.md` (PR 2 절의 "실패 처리" 보강)

## Global Constraints

- 이미 챔피언에게 **발송된**(`recap_sent_at` 있음) 세션에서는 수동 재게시를 거부한다(`already_sent`): 실수로 발송을 다시 활성화해 챔피언에게 중복 DM이 가는 것을 막는다. 자동 경로(재처리 후 새 초안)의 기존 동작은 바꾸지 않는다.
- 수동 재게시는 Admin 전용(`requireAdmin`), 세션 상태가 `done`일 때만. `low_quality`/`error`는 거부.
- `recap_draft_error`에는 아래 코드만 저장(원문 메시지·토큰·URL 저장 금지): `channel_not_found`, `not_in_channel`, `invalid_auth`, `missing_scope`, `rate_limited`, `slack_unavailable`, `unknown`. 설정 누락(`RECAP_SLACK_CHANNEL_ID`/토큰 없음)은 의도된 꺼짐 상태이므로 **기록하지 않는다**(화면에도 알리지 않음). API 응답에는 `not_configured`로 구분해 돌려준다.
- 실패 코드 기록은 상태/발송 컬럼 UPDATE와 **분리된 best-effort UPDATE**(`recap_draft_error`만): 컬럼이 없어도 초안 게시·노트 처리에 영향 없어야 한다. 게시 성공 시에는 성공 UPDATE와 별개로 이 코드를 null로 되돌린다(역시 best-effort).
- `postRecapDraft`는 계속 절대 throw하지 않고, 반환값 추가는 기존 호출부(`runProcessingInBackground`)와 호환돼야 한다.
- 마이그레이션은 prod Supabase에 수동 적용(멱등). 코드는 마이그레이션 전후 모두 안전해야 한다(컬럼 없으면 실패 배너만 안 뜸).
- Admin 화면 전용, 문구는 해요체. 새 의존성 없음, `bun.lock` 변경 없음.

## Review Focus

- 이미 발송된 세션/`low_quality`/비 Admin/존재하지 않는 세션에서 수동 재게시가 거부된다.
- 수동 재게시 성공 시 `recap_slack_channel/ts`가 새 초안으로 갱신되고 `recap_draft_error`가 지워진다. 이전 초안 버튼은 `stale_draft`로 거부된다(기존 동작).
- Slack 오류(`channel_not_found` 등)가 분류되어 코드로 기록되고, 로그에는 메시지만 남고 토큰은 남지 않는다.
- 마이그레이션 전 DB에서 자동 경로가 던지거나 멈추지 않는다.
- 화면: 실패 배너는 `processing_status==='done'`이고 `recap_draft_error`가 있을 때만, 버튼은 `done`이고 아직 발송되지 않았고 (초안이 없거나 실패 기록이 있을 때)만 보인다.

---

### Task 1: 결과 반환·실패 기록·재게시 API

**Files:**
- Create: `supabase/migrations/20261022010000_session_recap_draft_error.sql`
- Modify: `lib/recap/postDraft.ts`, `lib/types.ts` (`CheckUpSession.recap_draft_error?: string | null`)
- Create: `lib/recap/draftError.ts`, `app/api/sessions/[sessionId]/recap-draft/route.ts`
- Test: `test/lib/recap-draft-error.test.ts`, `test/lib/recap-post-draft.test.ts` (기존 파일 확장), `test/lib/recap-redraft-route.test.ts`

**Interfaces:**
- Produces:
  - `type RecapDraftErrorCode = 'channel_not_found' | 'not_in_channel' | 'invalid_auth' | 'missing_scope' | 'rate_limited' | 'slack_unavailable' | 'unknown'`
  - `classifyRecapDraftError(err: unknown): RecapDraftErrorCode` — `@slack/web-api`의 플랫폼 오류(`err.code === 'slack_webapi_platform_error'`, `err.data?.error`: `channel_not_found`, `not_in_channel`, `invalid_auth`/`not_authed`/`account_inactive`/`token_revoked` → `invalid_auth`, `missing_scope`, `ratelimited`), 요청/HTTP/타임아웃/네트워크 오류 → `slack_unavailable`, 그 외 → `unknown`. throw하지 않는다.
  - `isRecapDraftErrorCode(v: unknown): v is RecapDraftErrorCode`
  - `type PostRecapDraftResult = { posted: true } | { posted: false; reason: 'not_configured' | 'not_found' | 'not_done' | 'already_sent' | 'slack_error' | 'db_error'; errorCode?: RecapDraftErrorCode }`
  - `postRecapDraft(deps: PostRecapDraftDeps & { refuseIfSent?: boolean }, sessionId: string): Promise<PostRecapDraftResult>` — 기존 동작 유지(자동 경로는 `refuseIfSent` 없음). `refuseIfSent`이고 `recap_sent_at`이 있으면 `{ posted:false, reason:'already_sent' }`(게시하지 않음). Slack 오류는 `reason:'slack_error'` + 분류 코드를 반환하고, 분류 코드를 별도 best-effort UPDATE(`{ recap_draft_error: code }`만)로 기록한다. 성공 시 별도 best-effort UPDATE로 `recap_draft_error: null`.
  - `POST /api/sessions/[sessionId]/recap-draft` → `requireAdmin`(기존 `lib/api/guard`) 통과 시 `postRecapDraft({ supabase, refuseIfSent: true }, sessionId)` 호출, 응답 JSON `{ ok: true }` 또는 `{ ok: false, reason, errorCode? }`(HTTP 200; 인증 실패는 guard의 응답 그대로). `maxDuration`은 기본값(짧은 작업).

- [ ] **Step 1: Write the migration** (`ALTER TABLE check_up_sessions ADD COLUMN IF NOT EXISTS recap_draft_error TEXT;`, 헤더 주석: 목적, prod 수동 적용, 멱등, 컬럼이 없어도 코드는 안전).
- [ ] **Step 2: Write the failing tests**
  - `draftError`: `channel_not_found`/`not_in_channel`/`invalid_auth`(+`not_authed`, `token_revoked`)/`missing_scope`/`ratelimited→rate_limited` 플랫폼 오류 형태(`{ code: 'slack_webapi_platform_error', data: { error } }`), 요청/타임아웃(`code: 'slack_webapi_request_error'`/`slack_webapi_http_error`) → `slack_unavailable`, 이상한 값(null, 문자열, getter가 throw하는 객체) → `unknown`(throw 안 함); `isRecapDraftErrorCode` 표.
  - `postRecapDraft`(기존 파일 확장, 손으로 만든 supabase/slack 스텁): 성공 시 `{ posted: true }` + 성공 UPDATE 이후 `recap_draft_error: null` 별도 UPDATE; Slack `channel_not_found` 실패 시 `{ posted:false, reason:'slack_error', errorCode:'channel_not_found' }` + `{ recap_draft_error: 'channel_not_found' }`만 담은 별도 UPDATE이며 `recap_sent_at/by`를 건드리는 UPDATE는 없다; 설정 누락(채널/토큰 없음) → `{ posted:false, reason:'not_configured' }` 이고 **어떤 UPDATE도 없다**; 세션 없음 → `not_found`, 상태가 `done`이 아니면 `not_done`; `refuseIfSent:true` + `recap_sent_at` 있음 → `already_sent`, 게시 호출 없음; `refuseIfSent` 없음(자동 경로) + `recap_sent_at` 있음 → 기존처럼 게시하고 `previouslySent` 배너; 실패 코드 UPDATE가 `{ error }`를 반환해도(컬럼 없음) throw하지 않고 결과는 동일; 기존 테스트가 반환값 때문에 깨지지 않는다.
  - route(핸들러를 직접 호출하는 방식으로, `requireAdmin`/`postRecapDraft`를 모킹): admin이면 `postRecapDraft`에 `refuseIfSent:true`와 세션 id가 전달되고 결과가 JSON으로 나간다; guard가 응답을 돌려주면(비로그인/비 Admin) 그 응답을 그대로 반환하고 `postRecapDraft`는 호출되지 않는다.
- [ ] **Step 3: Run** `npx vitest run test/lib/recap-draft-error.test.ts test/lib/recap-post-draft.test.ts test/lib/recap-redraft-route.test.ts` — Expected: FAIL
- [ ] **Step 4: Implement** `lib/recap/draftError.ts`, update `postRecapDraft` (반환값, `refuseIfSent`, 분류·기록), the type field, and the route. 기존 `runProcessingInBackground` 호출부는 반환값을 무시하므로 수정하지 않는다.
- [ ] **Step 5: Run** the focused tests, `npx tsc --noEmit`, full suite — Expected: PASS
- [ ] **Step 6: Commit** `git add supabase/migrations/20261022010000_session_recap_draft_error.sql lib/recap lib/types.ts app/api/sessions test/lib && git commit -m "[AX-1] feat(recap): 초안 게시 결과 반환·실패 원인 기록·재게시 API"`

---

### Task 2: Admin 화면 버튼과 실패 배너

**Files:**
- Create: `lib/recap/draftErrorMessage.ts`
- Modify: `components/sessions/AdminSessionDetail.tsx`
- Test: `test/lib/recap-draft-error-message.test.ts`

**Interfaces:**
- Consumes: `RecapDraftErrorCode`, `isRecapDraftErrorCode` (Task 1), `POST /api/sessions/[sessionId]/recap-draft` 응답 형태.
- Produces: `recapDraftErrorMessage(code: string | null | undefined): string | null` — 알려진 코드는 원인과 다음 행동을 해요체로, 모르는 값/없음은 `null`(호출부는 일반 문구 "recap 초안을 Slack에 올리지 못했어요" 사용). 문구:
  - `channel_not_found`: "recap 채널을 찾지 못했어요. 채널 ID를 확인하고, 비공개 채널이면 채널에서 /invite @AX-1on1-Recap 으로 봇을 초대해 주세요."
  - `not_in_channel`: "recap 봇이 채널에 없어요. 채널에서 /invite @AX-1on1-Recap 으로 봇을 초대해 주세요."
  - `invalid_auth`: "recap 봇 토큰이 올바르지 않아요. 개발 담당자에게 토큰 확인을 요청해 주세요."
  - `missing_scope`: "recap 봇에 필요한 권한이 없어요. 개발 담당자에게 Slack 앱 권한 확인을 요청해 주세요."
  - `rate_limited`: "Slack 요청이 몰려서 잠시 막혔어요. 잠시 후 다시 올려 주세요."
  - `slack_unavailable`: "Slack에 연결하지 못했어요. 잠시 후 다시 올려 주세요."
  - API 응답의 `reason` 문구(토스트)는 같은 파일의 `recapRedraftReasonMessage(reason, errorCode)`로 만든다: `already_sent`→"이미 챔피언에게 발송된 recap이에요.", `not_done`→"노트 처리가 끝난 세션에서만 올릴 수 있어요.", `not_configured`→"recap 설정이 아직 없어요. 개발 담당자에게 확인을 요청해 주세요.", `not_found`→"세션을 찾지 못했어요.", `slack_error`→ `recapDraftErrorMessage(errorCode)` ?? "recap 초안을 Slack에 올리지 못했어요.", `db_error`→"recap 초안을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.".

- [ ] **Step 1: Write the failing tests** — 코드별 정확한 문구, 모르는 값/`null`/`undefined` → `null`; `recapRedraftReasonMessage`의 모든 `reason` 분기와 `slack_error`+코드/코드 없음.
- [ ] **Step 2: Run** `npx vitest run test/lib/recap-draft-error-message.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `lib/recap/draftErrorMessage.ts`.
- [ ] **Step 4: Wire the UI** in `AdminSessionDetail.tsx`: (a) 실패 배너 — `processing_status==='done'`이고 `session.recap_draft_error`가 있으면 기존 배너 스타일(`이전 처리 실패` 배너와 비슷하게, 경고색)로 "recap 초안이 Slack에 올라가지 않았어요"와 `recapDraftErrorMessage` 문구 + 버튼; (b) 버튼 `[recap 초안 다시 올리기]` — `done`이고 `recap_sent_at`이 없고 (`recap_slack_ts`가 없거나 `recap_draft_error`가 있을 때) 보임; 클릭 시 `POST /api/sessions/${sessionId}/recap-draft`(기존 `apiFetch` 패턴), 진행 중 비활성화·중복 클릭 방지, 성공 토스트 "recap 초안을 Slack에 올렸어요", 실패 토스트는 `recapRedraftReasonMessage`, 끝나면 세션 메타를 다시 불러와(`refreshSessionMeta` 또는 동일 목적의 기존 함수) 배너/버튼 상태가 갱신된다. 이미 발송된 세션, `low_quality`/`error`/처리 중 세션에는 버튼·배너를 보이지 않는다. `CheckUpSession`의 `recap_*` 필드가 `GET /api/sessions/[id]`(select '*')로 이미 내려온다는 점을 확인하고, 클라이언트 상태 갱신에 `recap_slack_ts`/`recap_draft_error`/`recap_sent_at`이 포함되도록 한다(필요하면 `refreshSessionMeta`의 복사 필드 확장).
- [ ] **Step 5: Run** the focused test, `npx tsc --noEmit`, `npm run lint` (touched files 오류 없음), full suite, `npx next build` (env: `set -a; . /Users/claud_01/Documents/flo/AX/ax-homework-submission/.env.local 2>/dev/null; set +a`) — Expected: 모두 통과
- [ ] **Step 6: Commit** `git add lib/recap/draftErrorMessage.ts components/sessions/AdminSessionDetail.tsx test/lib/recap-draft-error-message.test.ts && git commit -m "[AX-1] feat(recap): 초안 다시 올리기 버튼과 게시 실패 배너"`
