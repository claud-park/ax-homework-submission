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

건너뛰면 (컬럼 없음):
- 초안 게시: `postDraft`의 세션 SELECT(`recap_sent_at` 포함)가 에러가 나 data가 null이 되고, 로그 없이 조용히 리턴한다. 초안이 그냥 안 뜬다.
- 발송: `sendRecap`의 세션 SELECT(`recap_slack_ts` 포함)가 실패해 `recap session read failed` 로그를 남기고 `dm_failed`를 돌려준다. Admin에게는 "챔피언에게 DM을 보내지 못했어요"가 보인다 (이미 초안이 있었을 때만 도달 가능).

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
- 새 env는 재배포해야 적용된다. 4단계에서 main 머지로 배포되므로 그대로 반영된다. 이미 배포된 뒤 값을 바꿨다면 `vercel redeploy <배포 URL>`.
- `APP_BASE_URL`, `ADMIN_SLACK_*`는 기존 production 값을 확인만 한다.

## 4. 머지와 배포

- [ ] 1~3단계 완료 확인 후 PR 머지
- [ ] Vercel Production 배포가 Ready인지 확인

## 5. 스모크 테스트 (본인에게만 발송)

챔피언이 운영자 본인 계정인 테스트 세션을 쓴다 (DM이 본인에게만 간다).

1. 해당 세션 재처리 (또는 짧은 테스트 녹음 처리)
2. 채널 `C0CAZ6XP4F6`에 recap 초안과 [챔피언에게 발송], [수정 후 발송] 버튼이 뜨는지 확인
3. [수정 후 발송] 클릭: 모달 prefill이 읽기 좋은 텍스트인지 확인 후 제출
4. 본인 DM 수신 확인. 초안이 "발송했어요" 한 줄로 바뀌고 버튼은 사라진다.
5. 같은 세션을 다시 재처리하면 새 초안이 버튼과 함께 올라오고 발송 상태가 초기화된다 (다시 보내면 챔피언에게 DM이 또 간다. 챔피언이 운영자 본인인 테스트 세션에서만 할 것). 재처리를 한 번 더 한 뒤 **이전** 초안의 버튼을 누르면 "이미 새 초안으로 대체됐어요"가 나와야 한다 (단, 이전 초안은 이미 발송됐다면 버튼이 없으니 발송 전 상태의 이전 초안으로 확인).
   "이미 발송됐어요"는 두 Admin이 동시에 누른 경합에서만 나온다.
6. (가능하면) Admin이 아닌 계정의 클릭 시 본인에게만 보이는 "recap 발송은 Admin만 할 수 있어요" 확인

| 증상 | 의미 |
|---|---|
| 클릭 시 401 | `RECAP_SLACK_SIGNING_SECRET` 누락 또는 불일치 (fail-closed). 이 경우만 401 |
| 클릭해도 아무 반응 없음 (200) | `RECAP_SLACK_APP_ID` 불일치(앞뒤 공백 포함) 또는 Admin 판별 실패(`ADMIN_SLACK_*`에 클릭한 사람의 Slack ID 없음). 본인에게만 보이는 "발송은 Admin만 할 수 있어요"가 뜨면 후자 |
| "recap 발송은 Admin만 할 수 있어요." | 클릭한 사람의 Slack ID가 `ADMIN_SLACK_*`에 없음 |
| "이미 새 초안으로 대체됐어요. 최신 초안에서 발송해 주세요." | 더 새 초안이 있는데 이전 초안 버튼을 누름 |
| "이 세션은 지금 발송할 수 없어요." | 세션이 없거나 처리 완료(done)가 아님 |
| "이미 발송됐어요." | 동시 클릭 경합 |
| 스레드 답글 "챔피언의 Slack 계정을 이메일로 찾지 못했어요." | 챔피언 이메일이 없거나 Slack에서 조회 안 됨 (`users:read.email` 확인) |
| 스레드 답글 "챔피언에게 DM을 보내지 못했어요. 잠시 후 다시 시도해 주세요." | Slack DM 실패, 읽기 오류, 마이그레이션 미적용 등. Vercel 로그 확인 |
| 초안이 안 떠요 + 로그가 없어요 | 마이그레이션 미적용 가능성 먼저 확인. 그 외 채널 ID, 봇 토큰 누락(이것도 조용히 리턴) |

## 6. 롤백

Vercel production에서 `RECAP_SLACK_BOT_TOKEN` 또는 `RECAP_SLACK_CHANNEL_ID`를 제거하고 재배포하면 새 초안 게시가 조용히 중단된다. 마이그레이션 컬럼은 남겨 둬도 된다.

- `RECAP_SLACK_BOT_TOKEN`만 제거하면 이미 올라간 초안의 버튼은 계속 눌리지만 DM은 `dm_failed`로 실패한다.
- 완전히 멈추려면 Slack 앱에서 Interactivity Request URL을 제거하거나, `RECAP_SLACK_SIGNING_SECRET`을 제거한다 (클릭이 401이 됨).

```bash
vercel env rm RECAP_SLACK_BOT_TOKEN production
vercel redeploy <배포 URL>
```
