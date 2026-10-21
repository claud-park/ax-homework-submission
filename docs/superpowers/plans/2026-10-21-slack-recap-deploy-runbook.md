# Slack recap 배포 런북 (2026-10-21)

Admin이 Slack 버튼을 누르면 챔피언에게 recap DM이 가는 기능의 배포 체크리스트.
**1~3단계가 끝나기 전에는 PR을 머지하거나 배포하지 않는다.** 시크릿 값은 채팅·커밋·로그에 남기지 않는다.

## 1. prod Supabase 마이그레이션 (머지 전)

`supabase/migrations/20261021000000_session_recap_state.sql`을 prod Supabase SQL Editor에서 수동 적용한다 (이전 마이그레이션과 같은 방식). 멱등이라 여러 번 실행해도 안전하다.

```sql
ALTER TABLE check_up_sessions
  ADD COLUMN IF NOT EXISTS recap_slack_channel TEXT,
  ADD COLUMN IF NOT EXISTS recap_slack_ts TEXT,
  ADD COLUMN IF NOT EXISTS recap_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recap_sent_by TEXT;
```

확인 (4행이어야 함: recap_sent_at timestamptz, recap_sent_by text, recap_slack_channel text, recap_slack_ts text):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'check_up_sessions' and column_name like 'recap_%' order by column_name;
```

건너뛰면: 컬럼이 없을 때 코드가 조용히 리턴하므로 초안이 게시되지 않고 발송도 실패한다. 겉보기엔 정상인데 아무것도 안 올라오는 상태가 된다.

## 2. Slack 앱 `AX-1on1-Recap` (App ID `A0CBPVA25UY`)

- [ ] 설치 승인 확인: ITS `ITS-14471` + Slack 워크스페이스 설치 요청, 둘 다 승인됨
- [ ] 앱 설정 > Install App: Bot User OAuth Token(`xoxb-...`) 확인
- [ ] 앱 설정 > Basic Information: Signing Secret 확인
- [ ] Interactivity가 ON이고 Request URL이 `https://ax-homework-submission.vercel.app/api/one-on-one/slack/interactions`
- [ ] Bot 스코프: `chat:write`, `chat:write.public`, `im:write`, `users:read`, `users:read.email` (`chat:write.public`이 있어 채널 초대는 필수 아님)
- 기존 예약 앱 `AX-1-on-1`은 건드리지 않는다 (Interactivity URL이 다른 Vercel 프로젝트를 가리킴).

## 3. Vercel production 환경변수 (머지 전)

```bash
vercel env add RECAP_SLACK_BOT_TOKEN production        # xoxb-...
vercel env add RECAP_SLACK_SIGNING_SECRET production
vercel env add RECAP_SLACK_CHANNEL_ID production       # C0CAZ6XP4F6
vercel env add RECAP_SLACK_APP_ID production           # 선택, A0CBPVA25UY
vercel env ls production                               # 이름만 확인
```

- `RECAP_SLACK_SIGNING_SECRET`이 없으면 fail-closed라 모든 버튼 클릭이 401이 된다. 머지 전에 꼭 확인한다.
- 새 env는 재배포해야 적용된다. 4단계에서 main 머지로 배포되므로 그대로 반영된다. 이미 배포된 뒤 값을 바꿨다면 `vercel redeploy <deployment-url>`.
- `APP_BASE_URL`, `ADMIN_SLACK_*`는 기존 production 값을 확인만 한다.

## 4. 머지와 배포

- [ ] 1~3단계 완료 확인 후 PR 머지
- [ ] Vercel Production 배포가 Ready인지 확인

## 5. 스모크 테스트 (본인에게만 발송)

챔피언이 운영자 본인 계정인 테스트 세션을 쓴다 (DM이 본인에게만 간다).

1. 해당 세션 재처리 (또는 짧은 테스트 녹음 처리)
2. 채널 `C0CAZ6XP4F6`에 recap 초안과 [챔피언에게 발송], [수정 후 발송] 버튼이 뜨는지 확인
3. [수정 후 발송] 클릭: 모달 prefill이 읽기 좋은 텍스트인지 확인 후 제출
4. 본인 DM 수신 확인, 초안이 "발송했어요" 상태로 바뀌는지 확인
5. 다시 버튼을 누르거나 재실행: "이미 발송됐어요"
6. (가능하면) Admin이 아닌 계정의 클릭이 거부되는지 확인

| 증상 | 의미 |
|---|---|
| 클릭 시 401 | `RECAP_SLACK_SIGNING_SECRET` 누락 또는 불일치 (또는 `RECAP_SLACK_APP_ID` 불일치) |
| 초안이 안 뜸 | 채널 ID, 봇 토큰, 마이그레이션 중 하나가 빠짐 |
| "Slack 계정을 이메일로 찾지 못했어요" | 챔피언 이메일이 Slack 워크스페이스에 없음 (`users:read.email` 확인) |

## 6. 롤백

Vercel production에서 `RECAP_SLACK_BOT_TOKEN` 또는 `RECAP_SLACK_CHANNEL_ID`를 제거하고 재배포하면 초안 게시가 조용히 중단된다. 마이그레이션 컬럼은 남겨 둬도 된다.

```bash
vercel env rm RECAP_SLACK_BOT_TOKEN production
vercel redeploy <deployment-url>
```
