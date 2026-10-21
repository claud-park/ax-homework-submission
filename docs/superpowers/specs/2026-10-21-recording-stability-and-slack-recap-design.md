# 1:1 녹음 안정화 + Slack recap 발송 설계

작성일: 2026-10-21 · 브랜치: feat/1on1-recording-recap

두 개의 독립된 PR로 나눠 순서대로 진행한다. PR 1(녹음 안정화)을 먼저 배포하고, PR 2(Slack recap)를 그다음에 만든다. 두 PR은 서로 의존하지 않는다.

## 배경과 의도

1:1 체크업 세션은 Admin이 주로 `RecordingPanel`로 녹음한다. 녹음을 마치고 처리하는 도중 Admin이 회의실을 떠나면서 wifi가 끊기면 "처리 중 오류" 계열 메시지가 뜨고 미팅노트가 만들어지지 않는 일이 반복됐다. 복구는 다른 Admin이 따로 녹음해 둔 파일을 업로드하는 식으로 했다. 어느 단계에서 끊겼는지는 사용자도 기억하지 못한다. 따라서 세 가지 단절 지점을 모두 막는다.

또 하나의 요구는 노트가 완료되면 챔피언에게 recap을 Slack DM으로 보내는 것이다. 단, STT 환각과 요약 오류가 가끔 있었으므로 자동 발송이 아니라 Admin이 확인한 뒤 발송한다.

## 현재 구조 (조사 결과)

- 녹음: `components/sessions/RecordingPanel.tsx`. `MediaRecorder` 청크와 `Blob`(`lastJobRef`)이 메모리에만 있다. IndexedDB/localStorage는 쓰지 않는다.
- 업로드: 청크마다 `POST /api/sessions/:id/upload-url`로 서명 URL을 받고 `uploadToSignedUrl`로 Storage(`check-up-sessions/sessions/{id}/chunk_NNN.wav`)에 직접 올린다. 재시도 없음.
- 처리: `POST /api/sessions/[sessionId]/process`가 락을 잡고 `waitUntil`로 `lib/sessions/processAudio.ts`를 돌린 뒤 202를 반환한다. 서버 처리는 클라이언트 연결과 무관하게 끝까지 돈다. 클라이언트는 `pollProcessing`으로 2.5초마다 폴링하고 320초에 타임아웃한다.
- 상태: `check_up_sessions.processing_status` (idle, uploading, transcribing, summarizing, done, error, low_quality). 에러 사유 컬럼은 없다.
- 복구: 클라이언트 `retry()`(메모리 Blob 기반)와 `AdminSessionDetail`의 `[재처리]`(`/reprocess`, `status=error`이고 `audio_file_path`가 있을 때만 노출). stale 락은 360초 후 재획득 가능.
- Slack: `lib/one-on-one/slack.ts`(`WebClient(SLACK_BOT_TOKEN)`), `lib/notifications/slack.ts`의 `postAdminSlack`(`ADMIN_SLACK_CHANNEL_ID`), 버튼 클릭 수신 `app/api/one-on-one/slack/interactions`. 챔피언 DM은 `users.lookupByEmail` 후 `chat.postMessage`.

## 단절 지점

| 지점 | 상황 | 현재 결과 |
|---|---|---|
| A | 청크 업로드 중 단절 | 즉시 `phase=error`. Blob이 메모리에만 있어 새로고침/탭 닫기 시 녹음 영구 유실 |
| B | 업로드 완료 후 `/process` 호출 직전·중 단절 | 오디오는 Storage에 있으나 `audio_file_path`가 비어 `[재처리]`가 노출되지 않음 |
| C | 서버 처리 중 폴링 단절 | `fetch` 예외가 잡히지 않아 `pollProcessing`이 throw. 서버는 성공했는데 오류로 표시됨 |

오류 문구는 서버 실패와 네트워크 실패를 구분하지 않는다.

## PR 1: 녹음 안정화

### 목표
- wifi 단절이 있어도 녹음이 사라지지 않는다.
- 네트워크 문제는 자동으로 이어서 처리하고, 불가능할 때 사용자가 원인과 다음 행동을 알 수 있다.
- 업로드는 끝났는데 서버가 모르는 세션(B)을 Admin이 화면에서 복구할 수 있다.

### 비목표
- 챔피언 직접 녹음 화면 변경 (Admin 기준으로만 다룬다).
- STT 품질 개선(모델 교체 등).
- 처리 실패 자동 복구 크론.

### 설계
1. **로컬 보관.** 녹음을 정지하는 순간, WAV 변환 전의 원본 Blob을 IndexedDB에 저장한다. 세션 ID를 키로 쓴다. 서버 처리가 `done`/`low_quality`로 확인되면 삭제한다. `error`로 끝났을 때는 남겨 둔다. IndexedDB 접근이 실패하면(프라이빗 모드 등) 기존 메모리 경로로 동작한다.
2. **업로드 재시도.** 청크 업로드 실패 시 지수 백오프로 자동 재시도한다. 이미 올라간 청크는 건너뛴다. 브라우저가 오프라인이면 `online` 이벤트까지 대기하고 이어서 올린다.
3. **폴링 재시도.** `pollProcessing`이 `fetch` 예외를 잡고 계속 시도한다. 연속 실패가 일정 시간 이어지면 "연결이 끊겨 확인하지 못했어요. 서버에서는 계속 처리 중일 수 있어요" 상태로 표시하고, 연결이 돌아오면 자동 재개한다. 이 경우를 처리 실패로 취급하지 않는다.
4. **오류 문구 분리.** 네트워크 단절, 인증 만료(`refreshSession` 실패 포함), 서버 처리 실패를 구분해 각각 원인과 다음 행동을 안내한다. 오프라인 상태에서의 `refreshSession` 실패를 "인증 오류"로 잘못 표시하지 않는다.
5. **`[재처리]` 진입로 보강 (B).** 서버가 Storage의 청크 목록을 직접 찾을 수 있다는 점을 이용해, `audio_file_path`가 비어 있어도 Storage에 해당 세션 청크가 있으면 `[재처리]`를 노출하고 `/reprocess`가 동작하도록 한다.
6. **새로고침 후 복원.** 세션 상세에 다시 진입했을 때 IndexedDB에 미완료 녹음이 있으면 "업로드하지 못한 녹음이 있어요. 이어서 처리할까요?" 배너를 보여 주고, 누르면 업로드부터 이어간다.
   - 서버의 세션 상태가 이미 `done`이면(예: 다른 Admin이 별도 녹음 파일로 처리를 끝낸 경우) 배너를 보여 주지 않고 로컬 복사본을 삭제한다. 정상 노트를 덮어쓰지 않기 위해서다. *(제 판단)*

### 열린 결정 (빌더에게 위임)
- 재시도 횟수와 백오프 간격, 폴링 단절 표시 기준 시간.
- IndexedDB 래퍼 구현 방식(직접 구현 또는 가벼운 라이브러리).

### 완료 기준
- 업로드 도중 오프라인으로 전환했다가 복구하면 노트가 정상 생성된다.
- 처리 도중 오프라인으로 전환해도 오류로 표시되지 않고, 복구 후 완료 결과가 나온다.
- 업로드 중 탭을 닫았다가 다시 열면 녹음이 복원된다.
- B 상태 세션에서 Admin이 `[재처리]`로 노트를 만들 수 있다.

## PR 2: Slack recap (Admin 확인 후 발송)

### 목표
노트 처리가 끝나면 Admin이 Slack 안에서 recap 초안을 확인하고, 필요하면 문구를 고쳐 버튼으로 해당 챔피언의 DM에 발송한다. 앱에 들어가지 않아도 확인과 발송이 끝난다.

### 비목표
- 자동 발송(항상 Admin 확인을 거친다).
- 챔피언 Slack ID를 DB에 저장하는 일(이메일 조회 방식 유지).
- Slack Workflow Builder(노코드 워크플로) 사용. 봇의 Block Kit 버튼과 기존 interactions 라우트 방식으로 만든다.

### 안티골
- 같은 노트가 실수로 두 번 발송되는 것.
- `low_quality` 노트가 챔피언에게 나가는 것.

### 설계 (일부는 제 판단이며 표시한다)
1. **초안 게시.** 처리가 `done`으로 끝나면 봇이 `ADMIN_SLACK_CHANNEL_ID`에 recap 초안을 게시한다. 내용은 요약, 액션 아이템, 노트 링크이며 `[챔피언에게 발송]`, `[수정 후 발송]` 버튼이 달린다.
2. **발송.** `[챔피언에게 발송]`을 누르면 `users.lookupByEmail`로 챔피언 Slack 사용자를 찾아 DM으로 recap을 보낸다. 로직은 기존 `one-on-one/slack/interactions` 패턴을 따른다.
3. **문구 수정.** `[수정 후 발송]`은 Slack 모달에 recap 텍스트를 보여 주고, 제출하면 수정된 문구로 DM을 보낸다. 노트 본문은 바꾸지 않는다.
4. **중복 방지.** 발송 시각과 발송한 Admin을 `check_up_sessions`에 기록하고(컬럼은 빌더가 설계), 이미 발송됐으면 버튼을 비활성화하거나 "이미 발송됨"을 안내한다. 동시 클릭도 한 번만 처리되도록 서버에서 원자적으로 확인한다. *(제 판단)*
5. **`low_quality` 처리.** `low_quality`이면 recap 초안을 게시하지 않거나, 게시하더라도 발송 버튼 없이 경고만 보여 준다. 관련 알림은 Admin 채널에만 간다. *(제 판단)*
6. **재처리 시.** 노트가 재처리되어 다시 `done`이 되면 발송 기록을 초기화하고 새 초안을 게시한다. 이미 챔피언에게 간 recap이 있었다면 초안에 "이전 recap이 이미 발송됨"을 표시한다. *(제 판단)*
7. **실패 처리.** DM 조회/발송이 실패하면 노트 처리는 성공으로 유지하고, 초안 메시지 스레드에 실패 사유를 남긴다. 챔피언 이메일에 해당하는 Slack 사용자가 없을 때도 같다.
8. **보안.** 버튼 요청은 Slack 서명 검증을 거치고, 누른 사람이 Admin인지 확인한다. Admin 판별은 기존 `lib/one-on-one/slack.ts`의 `getAdminIdBySlackUserId`(환경변수 `ADMIN_SLACK_*`의 Slack ID 목록)를 쓴다. 목록에 없는 사람이 누르면 발송하지 않고 안내만 보여 준다.
9. **대상 세션.** 챔피언이 직접 녹음한 세션을 포함해 `done`이 되는 모든 세션이 초안 대상이다. 초안 게시는 `processAudio`의 완료 지점에서 호출한다. recap 본문은 노트의 기존 요약과 액션 아이템을 쓰며 별도 생성하지 않는다. *(제 판단)*

### 열린 결정 (빌더에게 위임)
- recap 메시지 레이아웃(Block Kit 구성), 요약/액션 아이템 길이 제한 처리.
- 발송 기록 컬럼 구성.
- `.env.example`에 Slack 관련 변수를 문서화할지 여부(문서화를 권장).

### 완료 기준
- 노트 완료 후 Admin 채널에 초안이 올라온다.
- 발송 버튼으로 해당 챔피언 DM에 recap이 도착한다.
- 수정 후 발송 시 수정된 문구가 도착한다.
- 두 번 눌러도 한 번만 발송된다.
- `low_quality` 노트는 챔피언에게 발송되지 않는다.

## 제약
- 기존 `processAudio` 파이프라인과 락 로직은 유지한다. PR 1은 그 앞뒤(클라이언트와 진입로)만 바꾼다.
- DB 변경은 `supabase/migrations`에 마이그레이션으로 추가한다. 배포 전 순서(마이그레이션 → 코드)를 PR 설명에 적는다.
- Vercel 함수 본문 한도(4.5MB)를 피하기 위해 큰 파일은 지금처럼 Storage 직접 업로드를 유지한다.
