# champion-milestone-sync — Pivot 지원 (마일스톤 삭제/재생성) — Design

**Status:** Approved
**Author:** Claude (with yr.park@dreamus.io)
**Date:** 2026-08-11

## 1. Problem

`champion-milestone-sync` 스킬은 오늘 세션의 작업을 기존 마일스톤 중 관련된 것과 매칭해 진행 상황을 기록한다. 그런데 챔피언이 프로젝트 방향을 크게 바꾼(pivot) 경우, 오늘 한 작업이 기존 마일스톤 어느 것과도 안 맞을 수 있다. 지금 스킬은 이 경우 "관련 마일스톤이 없다"고만 말하고 아무것도 하지 않는다 — 챔피언은 여전히 사이트에 직접 들어가서 낡은 마일스톤을 지우고 새 마일스톤을 만들어야 한다.

실제로 챔피언들의 pivot이 드물지 않게 관찰되어, 이 수동 단계를 스킬 안으로 가져오기로 한다.

## 2. Scope

**In scope:** 마일스톤(milestones)의 삭제와 재생성만.

**Out of scope (명시):** 과제정의서(charter_submissions)는 절대 건드리지 않는다 — pivot이 charter 레벨의 방향 전환이라도, 이 기능은 milestone 레벨에서만 반응한다. Charter 수정은 지금처럼 챔피언이 사이트에서 직접 한다.

## 3. Architecture — 새 API/DB 없음

필요한 세 엔드포인트가 이미 존재하고 전부 챔피언 PAT(`amst_`)로 호출 가능하다(관리자 전용 아님, 각각 `user_id` 소유권으로 스코핑됨):

| 엔드포인트 | 용도 |
|---|---|
| `GET /api/milestones/[id]/log` | 삭제 확인 메시지에 넣을 활동 로그 건수 조회 (이번 작업 직전에 [별도 핫픽스](https://github.com/claud-park/ax-homework-submission/pull/70)로 복구됨) |
| `DELETE /api/milestones/[id]` | 마일스톤 삭제 |
| `POST /api/milestones` | 마일스톤 생성 (publish_status: 'published') |

`pairing-client.mjs`에 명령어 2개(`create-milestone`, `delete-milestone`)만 추가하면 된다. 새 마이그레이션, 새 라우트, 새 인증 스코프 전부 불필요.

## 4. DB 삭제 시 부작용 (확인 메시지에 반드시 반영)

- `milestone_activity_log.milestone_id`는 `ON DELETE CASCADE` — 마일스톤을 지우면 그 마일스톤에 쌓인 활동 로그 전체가 **복구 불가능하게 함께 삭제**된다. 삭제 확인 메시지는 반드시 로그 건수를 미리 조회해서 보여준다.
- `milestones.parent_milestone_id`는 `ON DELETE SET NULL` — 지우려는 마일스톤에 하위 마일스톤이 있으면, 그 하위 항목들은 삭제되지 않고 최상위로 승격된다(데이터 유실은 아니지만 위계가 바뀌는 부작용). 하위 항목이 있으면 확인 메시지에 이 사실을 명시한다.

## 5. 동작 흐름

기존 SKILL.md의 3단계("Match")가 매칭 0건으로 끝났을 때만 개입한다. 매칭이 하나라도 있으면 지금 흐름 그대로 진행하고 이 절차는 타지 않는다.

1. **Match 실패 확인.** 이미 2단계("Fetch milestones")에서 받아온 마일스톤 목록을 다시 챔피언에게 보여주며 묻는다: "오늘 작업이 기존 마일스톤 어디에도 안 맞는 것 같습니다. 이 중 이제 더 이상 유효하지 않은 게 있나요? (없으면 새 마일스톤만 추가할게요)" — AI가 스스로 "이건 죽었다"고 단정하지 않는다. 챔피언이 아무것도 지목하지 않으면 2단계를 건너뛰고 3단계(생성 제안)로 바로 이동 — "새 마일스톤 제안" 자체는 삭제 여부와 무관하게 항상 시도한다.

2. **삭제 확인 (지목된 항목마다 개별로).** 지목된 마일스톤마다:
   - `milestone-log <milestone_id>`로 활동 로그 건수를 조회
   - 하위 마일스톤 존재 여부 확인(이미 받은 목록에서 `parent_milestone_id`로 필터)
   - "[제목] 마일스톤을 삭제할까요? 활동 로그 N건이 함께 사라집니다." (+하위 항목이 있으면 "하위 마일스톤 M개는 삭제되지 않고 최상위로 이동합니다" 추가)
   - 명시적 yes를 받은 것만 `delete-milestone <id>` 실행. no면 그 항목은 그대로 둔 채 다음으로.

3. **생성 제안.** 오늘 세션 내용을 바탕으로 제목+설명 초안을 만들어 별도로 확인: "새 마일스톤 '[제목]'을(를) 만들까요? — [설명 1~2문장]". 이것도 삭제와 완전히 독립된 확인이다 — 삭제를 거절해도 생성은 제안한다.

4. **생성 실행.** yes 받으면 `create-milestone "<title>" --description="<desc>"` 실행 (published로 즉시 생성).

5. **바로 이어서 로그.** 새로 만든 마일스톤에 오늘 작업 내용을 곧바로 기록할지 확인: "오늘 작업도 여기에 기록할까요?" — yes면 기존 5단계("Write")를 새 마일스톤 id로 그대로 실행. 스킬을 다시 부르지 않아도 되게 하기 위함.

6. **Report.** 지운 것, 새로 만든 것, 기록한 것을 각각 한 줄씩 요약. 아무것도 안 했으면("아무것도 안 지우고 새로 안 만들기로 함") 그것도 명확히 보고.

## 6. 에러 처리

- `create-milestone`에는 charter 승인 게이트가 없다(생성 자체는 누구나 가능) — 하지만 곧바로 5단계에서 "진행중으로 표시"하려고 하면 기존 `charter_not_approved`가 그대로 날 수 있다. 이 경우 새 마일스톤 자체는 생성된 채로 남고 진행상태 표시만 실패했다는 걸 명확히 구분해서 보고한다(기존 6단계 Report 규칙과 동일한 원칙 — 부분 성공을 성공처럼 말하지 않는다).
- `delete-milestone` 실패(DB 에러 등)는 그대로 사람에게 보고하고 멈춘다 — 재시도하지 않는다.
- 여러 항목을 지목했는데 일부만 삭제 확인을 받은 경우, 확인 안 받은 항목은 조용히 건너뛰고 그 사실을 Report에 남긴다.

## 7. Testing

이 리포 관례대로 스크립트 자체는 실제 페어링이 필요해 수동 검증, SKILL.md 로직은 리뷰 위주. `pairing-client.mjs`의 신규 명령어(`create-milestone`, `delete-milestone`, `milestone-log`)는 순수 HTTP 래퍼라 단위 테스트 대상이 아니며, 기존 `log-milestone`/`list-milestones`와 동일한 패턴을 따른다.
