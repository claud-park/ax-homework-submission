# Mixpanel Analytics — 설계 문서

- 작성일: 2026-07-01
- 브랜치: `worktree-mixpanel-analytics`
- 관련: 지난 대화의 이벤트 스키마 브레인스토밍(퍼널 P0 + 마찰 P1 + 체류시간 훅 + 핵심만 Supabase dual-write)

## 1. 목표 & 원칙

Champion 여정 전체에 Mixpanel 이벤트 트래킹을 붙인다. 설계 원칙:

- **퍼널 단계 + 마찰(friction) 신호 + 참여도**만 심는다. 허영성(vanity) 이벤트는 버린다.
- 이벤트는 "사용자가 완료한 의미 있는 행위" 단위. 버튼 클릭 자체가 아니라 **결과 기준**.
- 네이밍: `object_action`, 과거형, snake_case (예: `charter_published`).
- 모든 이벤트에 super properties 자동 첨부.

## 2. 아키텍처 (이 코드베이스 기준)

Next.js App Router + bun. SPA라 자동 페이지뷰가 안 잡히므로 라우트 훅으로 계측.

### 2.1 패키지 & 환경변수

- 패키지: `mixpanel-browser` (+ `@types/mixpanel-browser`).
- 환경변수: `NEXT_PUBLIC_MIXPANEL_TOKEN`. 미설정 시 no-op(개발/CI에서 안전).
  - `.env.example` / `.env.local.example`에 추가.
  - CI 빌드에 placeholder env 추가 (기존 `c77d416`와 동일 패턴 — build가 env 부재로 깨지지 않게).

### 2.2 파일 구조 (신규)

```
lib/analytics/
  client.ts        # mixpanel 초기화 + track/identify/reset/register 래퍼 (no-op guard 포함)
  events.ts        # 이벤트명 상수 + 이벤트별 prop 타입
  dual-write.ts    # P0/핵심 이벤트를 Supabase에도 fire-and-forget POST
  index.ts         # 공개 API: track(), identify(), reset(), usePageTracking()
  use-page-tracking.ts  # page_viewed / page_dwell 훅
components/analytics/
  AnalyticsProvider.tsx  # 'use client' — mixpanel init, root layout에 마운트
  ChampionAnalytics.tsx  # 'use client' — identify + super props + usePageTracking, (champion) layout에 마운트
app/api/analytics/events/route.ts  # dual-write 수신 엔드포인트
supabase/migrations/<ts>_analytics_events.sql
```

### 2.3 초기화 지점

- **`AnalyticsProvider`** (root `app/layout.tsx` body 래핑): `mixpanel.init(token, { persistence: 'localStorage', track_pageview: false, ignore_dnt: false })`. 토큰 없으면 no-op 플래그만 세팅.
- **`ChampionAnalytics`** (`(champion)/layout.tsx`에 마운트, 이미 user 확보됨): 서버 레이아웃이 user를 확보하므로 `userId`/`email`/`isAdmin`을 prop으로 내려 클라이언트에서:
  - `identify(supabase_user_id)` (익명→식별 병합)
  - Person props: `email`, `user_group`, `role`
  - Super props(register): `role`, `user_group`, `is_admin`
  - `usePageTracking()` 시작

## 3. 아이덴티티 & 공통 속성

| 항목 | 값 | 시점 |
|------|-----|------|
| `identify` | `supabase_user_id` | 챔피언 레이아웃 마운트(로그인 세션 확보) |
| Person props | `email`, `user_group`(코호트), `role`(champion/admin) | identify 직후 `people.set` |
| Super props | `role`, `user_group`, `is_admin` | `register` (전 이벤트 공통) |

`user_group`은 `users` 테이블/`user_metadata`에서 조회. `role`은 `is_admin` 여부로 champion/admin 판별.

## 4. 체류시간 & 페이지뷰 (재사용 훅)

`usePageTracking()` — `usePathname()` 변화 감지:

- `page_viewed` — 라우트 진입 시. props: `route`(정규화 패턴), `title`.
- `page_dwell` — 라우트 이탈 / 탭 숨김(`visibilitychange`) / 언로드(`pagehide`) 시. props: `route`, `duration_ms`, `active_ms`(탭 활성 시간만).
- 언로드 전송은 `navigator.sendBeacon`(dual-write 대상 아니면 mixpanel의 `transport: 'sendBeacon'`)으로 유실 방지.

**route 정규화**: `/my-project/charter/[id]`, `/champions/[userId]`, `/my-project/sessions/[sessionId]` 등 동적 세그먼트를 `[param]`으로 치환해 카디널리티 억제.

## 5. 핵심 활성화 퍼널 (P0 — 필수)

North Star 퍼널:

```
champion_login_completed → charter_creation_started → charter_published
→ milestone_added → milestone_marked_complete(첫 체크인) → submission_completed
```

| 이벤트 | 시점 | 핵심 속성 | 배선 위치(코드) |
|--------|------|-----------|----------------|
| `champion_login_completed` | 인증 콜백 성공 후 세션 확보 | `is_new_user` | `ChampionAnalytics` (per-login 1회 가드) |
| `charter_creation_started` | "작성 시작" 클릭 | — | charter 작성 진입 컴포넌트 |
| `charter_published` | 게시(published) 성공 | `days_since_signup` | charter 게시 핸들러 |
| `milestone_added` | 마일스톤 추가 성공 | `method: manual\|ai`, `count` | 마일스톤 추가/생성 핸들러 |
| `milestone_marked_complete` | 완료 표시 | `is_first_checkin` | 마일스톤 완료 토글 핸들러 |
| `submission_completed` | 파일/링크 제출 성공 | `type: file\|link`, `attempt_number`, `is_resubmission` | 제출 핸들러 |

- `is_new_user`: 콜백에서 `users` upsert가 insert였는지 판별해 redirect에 `?new=1` 부여 → 첫 진입 시 소비.
- `days_since_signup`: `users.created_at` 기준 계산.
- `attempt_number`/`is_resubmission`: 해당 milestone의 기존 제출 개수로 산출.

## 6. 마찰·품질 신호 (P1 — 강추)

| 이벤트 | 왜 중요한가 | 속성 |
|--------|-------------|------|
| `milestone_issue_reported` | champion이 막힌 지점 | `bottleneck_type` |
| `milestone_deadline_extended` | 일정 압박 신호 | — |
| `submission_declined_viewed` | 불합격 피드백 확인(재도전 추적) | `attempt_number` |
| `one_on_one_booked` | 코칭 수요 | `duration`, `has_agenda` |
| `hotline_message_sent` | 도움 요청 채널 | — |

## 7. 참여도 (P2 — 여유되면)

`one_on_one_slot_selected`(예약 퍼널), `one_on_one_cancelled`, `session_detail_viewed`, `champion_profile_viewed`(피어 투명성), `charter_exported_docx`, `champion_google_calendar_connected`, `submission_comment_posted`.

## 8. 데이터 소유 — Supabase dual-write

- **P0 6종 + `milestone_issue_reported`** 만 Supabase `analytics_events` 테이블에 dual-write.
- 나머지는 Mixpanel만. Mixpanel 전체 백업은 Export API로 주기 처리(후속).
- 방식: `track()` 래퍼가 dual-write 대상 이벤트명이면 `/api/analytics/events`로 fire-and-forget POST. 실패해도 UX 영향 없음(무시).

### `analytics_events` 테이블

```sql
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index analytics_events_event_name_idx on analytics_events(event_name);
create index analytics_events_user_id_idx on analytics_events(user_id);
create index analytics_events_created_at_idx on analytics_events(created_at);
```

- RLS: insert는 인증 사용자 본인 `user_id`만(또는 service key 경유). 조회는 admin만.
- API route는 `verifyUser`로 토큰 검증 후 service client로 insert.

## 9. 트래킹하지 않을 것 (YAGNI)

개별 버튼 클릭, 폼 필드 focus, 자동저장(draft) 하나하나, 드래그 정렬, 탭 토글 — Flows/dwell로 충분히 유추되므로 별도 이벤트로 심지 않음.

## 10. 검증 기준

- `NEXT_PUBLIC_MIXPANEL_TOKEN` 미설정 시 콘솔 에러/크래시 없이 no-op.
- `bun run typecheck`, `bun run lint`, `bun run test` 통과.
- 로컬에서 로그인 → charter → milestone → submission 플로우 실행 시 Mixpanel Live View에 P0 이벤트 순서대로 도착.
- dual-write 이벤트가 `analytics_events`에 적재됨.
