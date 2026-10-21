# Slack recap 발송 (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1:1 노트 처리가 끝나면 Admin 채널에 recap 초안(요약·액션 아이템·노트 링크)이 올라오고, Admin이 Slack에서 버튼으로 (선택적으로 문구를 고쳐) 해당 챔피언 DM으로 발송한다.

**Architecture:** 처리 완료 지점(`runProcessingInBackground`)에서 best-effort로 초안을 게시한다. 초안 메시지의 `recap_send`/`recap_edit` 버튼은 기존 `app/api/one-on-one/slack/interactions` 라우트가 받는다. 발송은 DB의 원자적 UPDATE로 중복을 막고, 문구 포맷·mrkdwn 변환·Block Kit 구성은 순수 함수로 분리해 단위 테스트한다.

**Tech Stack:** Next.js App Router, Supabase(서비스 클라이언트), `@slack/web-api`, vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-recording-stability-and-slack-recap-design.md` (PR 2 절)

## Global Constraints

- 자동 발송 금지: 챔피언 DM은 Admin의 버튼 클릭으로만 나간다.
- 초안 채널은 신규 환경변수 `RECAP_SLACK_CHANNEL_ID`(값 `C0CAZ6XP4F6`). 기존 `ADMIN_SLACK_CHANNEL_ID`는 쓰지 않는다 (production에 없고 켜면 기존 Admin 알림이 함께 활성화됨).
- **recap은 별도 Slack 앱을 쓴다** (2026-10-21 결정): 앱 `AX-1on1-Recap`(App ID `A0CBPVA25UY`, Dreamus 워크스페이스, Interactivity Request URL = `https://ax-homework-submission.vercel.app/api/one-on-one/slack/interactions`). 기존 `AX-1-on-1` 앱의 Interactivity URL은 스케줄러 프로젝트(`ax-one-on-one-scheduler`)를 가리키므로 건드리지 않는다. 설치 승인은 ITS-14471(+ Slack 워크스페이스 설치 요청)로 진행 중이며, 승인 후 발급되는 값을 환경변수 `RECAP_SLACK_BOT_TOKEN`(봇 토큰), `RECAP_SLACK_SIGNING_SECRET`(서명 비밀)으로 쓴다.
  - recap 코드는 기존 `slack` 클라이언트(`SLACK_BOT_TOKEN`)가 아니라 전용 클라이언트 `recapSlack`(`lib/recap/slackClient.ts`, `RECAP_SLACK_BOT_TOKEN`)을 쓴다.
  - interactions 라우트는 요청 서명을 두 비밀(`SLACK_SIGNING_SECRET` = 예약 앱, `RECAP_SLACK_SIGNING_SECRET` = recap 앱) 각각으로 검증해 어느 앱이 서명했는지 결정한다. `recap_*`/recap 모달 요청은 recap 비밀로 서명된 경우에만, 예약 액션(`confirm_1on1`, `cancel_1on1`)은 기존 비밀로 서명된 경우에만 처리한다. 비밀이 비어 있으면 그 앱은 항상 거부(fail-closed).
- Admin 판별은 `getAdminIdBySlackUserId`(`ADMIN_SLACK_*` 환경변수). 목록에 없는 사람이 눌러도 발송하지 않고 본인에게만 보이는 안내(ephemeral)를 준다. 기존 예약 버튼(`confirm_1on1`, `cancel_1on1`)의 동작은 바꾸지 않는다.
- Slack 요청 서명 검증을 거친다. 5분을 넘긴 timestamp는 거부한다.
- `low_quality` 노트에는 초안을 게시하지 않는다.
- Slack 실패는 노트 처리 결과에 영향을 주지 않는다 (`processing_status`를 바꾸거나 throw하지 않음).
- 챔피언 Slack 사용자는 `users.lookupByEmail`로 찾는다. 챔피언 Slack ID를 DB에 저장하지 않는다.
- recap 본문은 노트의 AI 요약 부분(`AI_DIVIDER` 이후)과 액션 아이템. 별도 AI 생성 없음. 블록 텍스트는 Slack 한도 3000자 이내.
- 노트 링크는 `${APP_BASE_URL}/admin/champions/${championUserId}` (세션 딥링크는 이번 범위 밖).
- DB 마이그레이션은 prod Supabase에 수동 적용한다 (이 repo에 자동 적용 스텝이 없음). 코드 배포 전에 적용돼 있어야 한다.
- 사용자 문구는 해요체.

## Review Focus

- 같은 초안 버튼을 두 사람이 동시에 클릭 → DM은 한 번만 나가고 두 번째는 "이미 발송됨" 안내 (Task 4).
- 챔피언 이메일에 해당하는 Slack 사용자가 없거나 DM이 실패 → 발송 기록이 롤백되어 재시도할 수 있고, 초안에 실패 사유가 남는다 (Task 4, 5).
- 재처리로 노트가 다시 `done`이 됨 → 발송 상태가 초기화되고 새 초안이 올라오며, 이전에 발송된 적이 있으면 초안에 표시한다 (Task 3).
- 요약이 3000자를 넘거나 마크다운(굵게·목록·링크)이 섞여 있음 → Slack에서 깨지지 않게 변환·절삭 (Task 2).
- Admin이 아닌 사람이 버튼을 누르거나, 서명이 틀리거나 오래된 요청 (Task 1, 5).

---

### Task 1: Slack 서명 검증 분리 (+ 재전송 방지)

**Files:**
- Create: `lib/one-on-one/slackSignature.ts`
- Modify: `app/api/one-on-one/slack/interactions/route.ts` (기존 인라인 검증을 교체)
- Test: `test/lib/slack-signature.test.ts`

**Interfaces:**
- Produces: `verifySlackSignature(args: { body: string; timestamp: string | null; signature: string | null; secret: string; now?: number }): boolean` — `v0:${timestamp}:${body}`의 HMAC-SHA256(hex, `v0=` 접두)을 `timingSafeEqual`로 비교하고, `|now - timestamp| > 300초`이면 false. 헤더가 없으면 false.

- [ ] **Step 1: Write the failing tests** (`now`를 주입해 시간 고정)
  - `accepts a correctly signed fresh request`
  - `rejects a wrong signature`, `rejects when signature or timestamp header is missing`
  - `rejects a timestamp older than 5 minutes` / `rejects a timestamp more than 5 minutes in the future`
  - `rejects a signature of different length without throwing`
- [ ] **Step 2: Run** `npx vitest run test/lib/slack-signature.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `verifySlackSignature` in `lib/one-on-one/slackSignature.ts`.
- [ ] **Step 4: Replace** the inline HMAC check in `interactions/route.ts` (L11-37) with `verifySlackSignature`, keeping the 401 response. 기존 `confirm_1on1`/`cancel_1on1` 처리는 그대로 둔다.
- [ ] **Step 5: Run** `npx vitest run test/lib/slack-signature.test.ts && npx tsc --noEmit` — Expected: PASS, 타입 오류 없음
- [ ] **Step 6: Commit** `git add lib/one-on-one/slackSignature.ts app/api/one-on-one/slack/interactions/route.ts test/lib/slack-signature.test.ts && git commit -m "[AX-1] refactor(slack): 요청 서명 검증을 분리하고 재전송 방지 추가"`

---

### Task 2: recap 포맷·Block Kit 순수 함수

**Files:**
- Create: `lib/recap/format.ts`
- Test: `test/lib/recap-format.test.ts`

**Interfaces:**
- Consumes: `AI_DIVIDER` 분리 규칙 from `lib/audio-pipeline/notes.ts` (같은 정규식 방식으로 AI 요약 부분만 추출; 상수가 export되지 않은 정규식이면 이 파일에서 `splitAiSummary`로 구현).
- Produces (모두 순수 함수):
  - `extractAiSummary(notes: string): string` — AI 구분선 이후 부분. 구분선이 없으면 전체 노트.
  - `toSlackMrkdwn(md: string): string` — `**굵게**`→`*굵게*`, `- `/`* ` 목록→`• `, `[텍스트](url)`→`<url|텍스트>`, `#` 제목→굵게, 인용 `> ` 제거.
  - `truncateForSlack(text: string, max?: number): string` — 기본 2900자, 넘으면 `…` 붙여 절삭.
  - `buildRecapText(input: { championName: string; sessionTitle: string | null; sessionDate: string; notes: string; actionItems: { body: string; is_completed: boolean }[]; noteUrl: string }): string` — 챔피언 DM 본문: 인사 한 줄, `*요약*` 섹션, `*액션 아이템*` 섹션(미완료만, 번호 목록; 없으면 섹션 생략), 노트 링크.
  - `buildDraftBlocks(input: { sessionId: string; championName: string; sessionTitle: string | null; sessionDate: string; recapText: string; previouslySent: boolean }): KnownBlock[]` — 헤더 + 본문 section + (previouslySent이면 "이전 recap이 이미 발송됐어요" context) + actions(버튼 `action_id: 'recap_send'` 텍스트 "챔피언에게 발송"(primary), `action_id: 'recap_edit'` 텍스트 "수정 후 발송", 둘 다 `value: sessionId`).
  - `buildSentBlocks(input: { championName: string; sentByLabel: string; sentAt: Date }): KnownBlock[]` — 버튼 없이 "✅ {sentByLabel}님이 {championName} 챔피언에게 발송했어요" context.
  - `buildFailureBlocks`는 만들지 않는다: 실패는 스레드 답글 텍스트로 처리한다 (Task 4).
  - `RECAP_ACTIONS = { send: 'recap_send', edit: 'recap_edit', editSubmit: 'recap_edit_submit' } as const`

- [ ] **Step 1: Write the failing tests**
  - `extractAiSummary` 3건: 구분선 있음 → 이후만, 사용자 메모만 있음 → 전체, 굵게·공백 변형 구분선(`***🤖 AI 요약***`) 허용.
  - `toSlackMrkdwn` 표: `**a**`→`*a*`, `- x`→`• x`, `[링크](https://e.com)`→`<https://e.com|링크>`, `## 제목`→`*제목*`.
  - `truncateForSlack`: 2900자 이하는 그대로, 초과는 길이 ≤ 2901 이고 `…`로 끝남.
  - `buildRecapText`: 미완료 액션 아이템만 번호로 나오고, 액션 아이템이 모두 완료면 해당 섹션 없음, 노트 링크 포함, 3000자 이하.
  - `buildDraftBlocks`: actions 블록의 두 버튼 `action_id`/`value`가 정확하고, `previouslySent: true`일 때만 안내 context가 있다. 본문 section 텍스트 ≤ 3000자.
  - `buildSentBlocks`: 버튼(actions 블록)이 없다.
- [ ] **Step 2: Run** `npx vitest run test/lib/recap-format.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `lib/recap/format.ts` (타입은 `@slack/web-api`의 `KnownBlock`).
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `git add lib/recap/format.ts test/lib/recap-format.test.ts && git commit -m "[AX-1] feat(recap): recap 문구·Block Kit 포맷 함수"`

---

### Task 3: 발송 상태 컬럼과 초안 게시

**Files:**
- Create: `supabase/migrations/20261021000000_session_recap_state.sql`
- Modify: `lib/types.ts` (`CheckUpSession`에 recap 필드 추가)
- Create: `lib/recap/postDraft.ts`
- Modify: `lib/sessions/runProcessingInBackground.ts`
- Test: `test/lib/recap-post-draft.test.ts`

**Interfaces:**
- Consumes: `buildRecapText`, `buildDraftBlocks` (Task 2); `slack` from `lib/one-on-one/slack`.
- Produces:
  - 컬럼(모두 nullable): `recap_slack_channel TEXT`, `recap_slack_ts TEXT`, `recap_sent_at TIMESTAMPTZ`, `recap_sent_by TEXT`. `CheckUpSession`에 같은 이름의 `string | null` 필드.
  - `postRecapDraft(deps: { supabase: SupabaseClient; slackClient?: Pick<WebClient, 'chat'>; env?: { channelId?: string; token?: string; baseUrl?: string } }, sessionId: string): Promise<void>` — 절대 throw하지 않는다. `slackClient`/`env` 기본값은 `recapSlack`(`lib/recap/slackClient.ts`, 이 태스크에서 만든다: `export const recapSlack = new WebClient(process.env.RECAP_SLACK_BOT_TOKEN)`)과 `process.env`(`RECAP_SLACK_CHANNEL_ID`, `RECAP_SLACK_BOT_TOKEN`, `APP_BASE_URL`).
- 동작: 채널/토큰이 없으면 조용히 반환. 세션 상태가 `done`이 아니면 반환. 세션(+챔피언 이름/이메일)·액션 아이템을 읽고, 이전에 `recap_sent_at`이 있었는지 기록한 뒤 `recap_sent_at/by`를 null로 초기화하고, `chat.postMessage`로 초안을 올려 반환된 `channel`/`ts`를 `recap_slack_channel/ts`에 저장한다. `runProcessingInBackground`는 `processSessionAudio`가 `lowQuality`가 아닌 결과를 반환했을 때만 호출하며 별도 try/catch로 감싸 기존 `.catch`(status를 `error`로 바꾸는 경로)와 섞이지 않게 한다.

- [ ] **Step 1: Write the migration** (idempotent: `ADD COLUMN IF NOT EXISTS`, 파일 상단 주석에 목적과 "prod 수동 적용, 코드 배포 전" 명시) 
- [ ] **Step 2: Write the failing tests** (supabase와 slack을 손으로 만든 스텁으로 주입)
  - `posts a draft with send and edit buttons and stores channel and ts`
  - `does nothing when RECAP_SLACK_CHANNEL_ID or token is missing`
  - `does nothing when the session is not done`
  - `resets recap_sent_at/by and marks previouslySent when the session was sent before`
  - `swallows a Slack error without throwing`
- [ ] **Step 3: Run** `npx vitest run test/lib/recap-post-draft.test.ts` — Expected: FAIL
- [ ] **Step 4: Implement** `postRecapDraft`, the type fields, and the hook in `runProcessingInBackground.ts` (`processSessionAudio(...).then(result => { if (!result.lowQuality) return postRecapDraft(...) })`을 기존 `.catch` 앞이 아니라 별도 체인으로 연결해, 초안 게시 실패가 status를 `error`로 만들지 않는다).
- [ ] **Step 5: Run** `npx vitest run test/lib/recap-post-draft.test.ts && npx tsc --noEmit` — Expected: PASS
- [ ] **Step 6: Commit** `git add supabase/migrations/20261021000000_session_recap_state.sql lib/types.ts lib/recap/postDraft.ts lib/sessions/runProcessingInBackground.ts test/lib/recap-post-draft.test.ts && git commit -m "[AX-1] feat(recap): 노트 완료 시 Admin 채널에 recap 초안 게시"`

---

### Task 4: 챔피언 DM 발송 (원자적 중복 방지)

**Files:**
- Create: `lib/recap/sendRecap.ts`
- Test: `test/lib/recap-send.test.ts`

**Interfaces:**
- Consumes: `buildRecapText` (Task 2), 컬럼 (Task 3).
- Produces: `sendRecapToChampion(deps: { supabase: SupabaseClient; slackClient?: Pick<WebClient, 'chat' | 'users'> /* 기본 recapSlack */ }, args: { sessionId: string; adminId: string; textOverride?: string }): Promise<SendRecapResult>` where
  `type SendRecapResult = { ok: true; championName: string; sentAt: Date } | { ok: false; reason: 'not_found' | 'not_done' | 'already_sent' | 'no_slack_user' | 'dm_failed' }`.
- 동작 순서: ① 세션 조회(없으면 `not_found`, 상태가 `done`이 아니면 `not_done`) ② 원자적 선점 `update({ recap_sent_at: now, recap_sent_by: adminId }).eq('id', sessionId).is('recap_sent_at', null).select('id')` — 반환 행이 없으면 `already_sent` ③ `users.lookupByEmail`(챔피언 이메일) — 실패/없음이면 선점을 롤백(`recap_sent_at/by`를 null로)하고 `no_slack_user` ④ `chat.postMessage({ channel: slackUserId, text: textOverride ?? buildRecapText(...) })` — 실패하면 선점을 롤백하고 `dm_failed`.
  `textOverride`가 있으면 그 문구를 그대로 보내되 3000자를 넘으면 절삭한다.

- [ ] **Step 1: Write the failing tests** (supabase 스텁은 `recap_sent_at` 상태를 실제로 흉내 내서 두 번째 선점이 실패하게 한다)
  - `sends once and marks recap_sent_at and recap_sent_by`
  - `second concurrent call returns already_sent and posts no second DM` (두 호출을 `Promise.all`)
  - `rolls back the claim when the champion has no Slack user` (재호출이 성공할 수 있어야 함)
  - `rolls back the claim when chat.postMessage fails`
  - `uses textOverride verbatim and truncates over 3000 chars`
  - `refuses a session that is not done`
- [ ] **Step 2: Run** `npx vitest run test/lib/recap-send.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `sendRecapToChampion`.
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `git add lib/recap/sendRecap.ts test/lib/recap-send.test.ts && git commit -m "[AX-1] feat(recap): 챔피언 DM 발송과 중복 방지"`

---

### Task 5: 버튼·모달 처리 (interactions 라우트)

**Files:**
- Modify: `app/api/one-on-one/slack/interactions/route.ts`
- Create: `lib/recap/interactions.ts` (라우트에서 분리한 recap 전용 핸들러)
- Test: `test/lib/recap-interactions.test.ts`

**Interfaces:**
- Consumes: `sendRecapToChampion` (Task 4), `buildSentBlocks`, `RECAP_ACTIONS`, `buildRecapText` (Task 2), `getAdminIdBySlackUserId` from `lib/one-on-one/slack`.
- 이 태스크에서 라우트의 서명 검증을 두 비밀로 확장한다: `verifySlackSignature`를 `SLACK_SIGNING_SECRET`과 `RECAP_SLACK_SIGNING_SECRET`로 각각 호출해 `signedBy: 'booking' | 'recap' | null`을 정하고(둘 다 실패하면 기존대로 401), `recap_*`/recap 모달 요청은 `signedBy === 'recap'`일 때만, `confirm_1on1`/`cancel_1on1`은 `signedBy === 'booking'`일 때만 처리한다(그 외에는 200으로 무시하고 아무것도 보내지 않는다). 이 분기를 순수 함수 `resolveSignedBy(args, secrets)`로 빼서 단위 테스트한다(비밀이 비어 있으면 해당 앱은 fail-closed, 두 비밀이 같은 값이어도 booking이 우선하지 않도록 둘 다 같으면 거부하지 말고 recap/booking 구분은 action_id 소속과 함께 확인).
- Produces: `handleRecapAction(deps, payload): Promise<void>` — `payload.type`이 `block_actions`이고 `action_id`가 `recap_send`/`recap_edit`일 때, 또는 `payload.type === 'view_submission'`이고 `view.callback_id === 'recap_edit_submit'`일 때 처리한다. 라우트는 `payload.type`이 `view_submission`이거나 `action_id`가 `recap_*`이면 이 함수로 넘기고, 그 외는 기존 `confirm_1on1`/`cancel_1on1` 경로를 그대로 탄다 (기존 코드는 `actions[0]`를 바로 읽으므로 `view_submission`을 먼저 분기해야 한다).
- 동작:
  - **공통 Admin 확인:** `getAdminIdBySlackUserId(payload.user.id)`가 null이면 `chat.postEphemeral({ channel, user, text: 'recap 발송은 Admin만 할 수 있어요.' })`(모달 제출이면 모달 오류 대신 DM 없이 종료)만 하고 아무것도 보내지 않는다.
  - **`recap_send`:** `sendRecapToChampion` 호출. 성공이면 원본 초안 메시지(`payload.channel.id`, `payload.message.ts`)를 `chat.update`로 `buildSentBlocks`로 교체. `already_sent`이면 `chat.postEphemeral`로 "이미 발송됐어요", `no_slack_user`/`dm_failed`이면 초안 스레드(`thread_ts`)에 사유를 답글로 남긴다 (예: "챔피언의 Slack 계정을 이메일로 찾지 못했어요").
  - **`recap_edit`:** `views.open({ trigger_id, view })` — 입력 블록 하나(`multiline`, `initial_value`는 `buildRecapText`로 만든 현재 문구, `block_id: 'recap_text'`, `action_id: 'value'`), `callback_id: 'recap_edit_submit'`, `private_metadata`는 `JSON.stringify({ sessionId, channel, ts })`, 제목/제출 버튼 텍스트는 해요체.
  - **`recap_edit_submit`:** `private_metadata`의 `sessionId`로 `sendRecapToChampion({ textOverride })`, 성공이면 저장된 `channel`/`ts`의 초안 메시지를 `buildSentBlocks`로 업데이트, 실패 사유는 `response_action: 'errors'`로 모달에 표시 (`already_sent`이면 모달을 닫고 안내). 입력이 비어 있으면 모달 오류.
  - Slack은 3초 안에 200을 기대한다. 이 핸들러의 작업(DB 몇 번 + Slack 호출)은 인라인으로 수행하되, `views.open`은 `trigger_id` 만료(3초)를 고려해 가장 먼저 호출한다.

- [ ] **Step 1: Write the failing tests** (Slack 클라이언트와 `sendRecapToChampion`을 `vi.mock`)
  - `non-admin click sends nothing and posts an ephemeral notice`
  - `recap_send success updates the draft message to the sent state`
  - `recap_send already_sent posts an ephemeral notice and does not update`
  - `recap_send no_slack_user replies in the draft thread`
  - `recap_edit opens a modal prefilled with the recap text and carries sessionId in private_metadata`
  - `recap_edit_submit sends the edited text as override and updates the draft by stored channel and ts`
  - `recap_edit_submit with empty text returns response_action errors and sends nothing`
  - `route still dispatches confirm_1on1 and cancel_1on1 unchanged` (라우트 분기 함수가 분리 가능하면 그 함수를 테스트; 분리하지 않으면 이 항목은 수동 확인으로 보고서에 명시)
- [ ] **Step 2: Run** `npx vitest run test/lib/recap-interactions.test.ts` — Expected: FAIL
- [ ] **Step 3: Implement** `lib/recap/interactions.ts` and wire it into the route (view_submission 분기를 `actions[0]` 읽기 전에 둔다).
- [ ] **Step 4: Run** `npx vitest run test/lib/recap-interactions.test.ts && npx tsc --noEmit && npm run lint` — Expected: PASS
- [ ] **Step 5: Commit** `git add lib/recap/interactions.ts app/api/one-on-one/slack/interactions/route.ts test/lib/recap-interactions.test.ts && git commit -m "[AX-1] feat(recap): 발송·수정 후 발송 버튼과 모달 처리"`

---

### Task 6: 환경변수 문서화와 배포 런북

**Files:**
- Modify: `.env.example`, `.env.local.example`
- Create: `docs/superpowers/plans/2026-10-21-slack-recap-deploy-runbook.md` (배포 전 체크리스트; 또는 PR 설명으로 대체해도 되지만 repo에 남긴다)

- [ ] **Step 1: Document** in both example files: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `ADMIN_SLACK_CLAUD`, `ADMIN_SLACK_ALEX`, `ADMIN_SLACK_JENNIFER`, `ADMIN_SLACK_CHANNEL_ID`(선택, 기존 Admin 알림용), `RECAP_SLACK_BOT_TOKEN`, `RECAP_SLACK_SIGNING_SECRET`, `RECAP_SLACK_CHANNEL_ID`, `APP_BASE_URL`. 값은 비워 둔다.
- [ ] **Step 2: Write the runbook** — 배포 순서와 확인 항목:
  1. prod Supabase에 `20261021000000_session_recap_state.sql` 적용 (컬럼 4개 확인 쿼리 포함)
  2. `AX-1on1-Recap` 앱 설치 승인 확인(ITS-14471 + Slack 워크스페이스 설치 요청 승인) → 앱 설정 화면에서 Bot User OAuth Token(xoxb-)과 Signing Secret 확인. Vercel production에 `RECAP_SLACK_BOT_TOKEN`, `RECAP_SLACK_SIGNING_SECRET`, `RECAP_SLACK_CHANNEL_ID=C0CAZ6XP4F6` 추가 후 재배포 (`vercel env ls production`로 확인). 값은 채팅/로그/커밋에 남기지 않는다.
  3. Slack 앱 `AX-1on1-Recap`(A0CBPVA25UY): Interactivity 켜짐 + Request URL이 `https://ax-homework-submission.vercel.app/api/one-on-one/slack/interactions`인지, 스코프 `chat:write`·`chat:write.public`·`im:write`·`users:read`·`users:read.email` 확인 (`chat:write.public`이 있어 채널 초대는 필수 아님)
  4. 배포 후 스모크: 테스트 세션 재처리 → 초안이 채널에 뜸 → 본인에게만 보내는 수동 테스트 방법(챔피언을 본인 계정으로 둔 테스트 세션) 
- [ ] **Step 3: Run** `npm test && npx tsc --noEmit && npx next build` (필요한 env는 로컬 `.env.local`에서 읽는다) — Expected: 모두 통과
- [ ] **Step 4: Commit** `git add .env.example .env.local.example docs/superpowers/plans/2026-10-21-slack-recap-deploy-runbook.md && git commit -m "[AX-1] docs(recap): 환경변수 문서화와 배포 런북"`
