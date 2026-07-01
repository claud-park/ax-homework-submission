# Mixpanel Analytics — 구현 계획

- 작성일: 2026-07-01
- 스펙: `docs/superpowers/specs/2026-07-01-mixpanel-analytics-design.md`
- 브랜치: `worktree-mixpanel-analytics`

## Phase 1 — Foundation (완료)

- [x] `mixpanel-browser` + `@types/mixpanel-browser` 추가
- [x] `lib/analytics/events.ts` — 이벤트명 상수, `EventPropsMap`, `DUAL_WRITE_EVENTS`
- [x] `lib/analytics/client.ts` — init + track/identify/people/register/reset (토큰 없으면 no-op)
- [x] `lib/analytics/dual-write.ts` — fire-and-forget POST (keepalive)
- [x] `lib/analytics/use-page-tracking.ts` — page_viewed / page_dwell + route 정규화
- [x] `lib/analytics/index.ts` — 공개 `track()`(mixpanel+dual-write), `identifyChampion()`, `resetAnalytics()`
- [x] `components/analytics/AnalyticsProvider.tsx` → root `app/layout.tsx` 마운트
- [x] `components/analytics/ChampionAnalytics.tsx` → `(champion)/layout.tsx` 마운트 (identify + super props + page tracking + champion_login_completed)
- [x] 로그아웃 시 `resetAnalytics()` + login flag 클리어 (ChampionSidebar)
- [x] `.env.example`에 `NEXT_PUBLIC_MIXPANEL_TOKEN` 추가

## Phase 2 — Dual-write backend (완료)

- [x] `supabase/migrations/20260701000000_analytics_events.sql` (RLS enable, service-key insert)
- [x] `app/api/analytics/events/route.ts` — verifyJWT + 허용 이벤트만 insert

## Phase 3 — P0 이벤트 배선 (진행 중, 병렬 에이전트)

- [x] `champion_login_completed` (ChampionAnalytics)
- [ ] `charter_creation_started`, `charter_published` — charter 도메인
- [ ] `milestone_added`, `milestone_marked_complete` — milestones 도메인
- [ ] `submission_completed` — submission 도메인

## Phase 4 — P1 이벤트 배선 (진행 중, 병렬 에이전트)

- [ ] `milestone_issue_reported`, `milestone_deadline_extended`
- [ ] `submission_declined_viewed`
- [ ] `one_on_one_booked`, `hotline_message_sent`

## Phase 5 — 검증

- [ ] `bun run typecheck` (foundation 통과 확인 완료; 배선 후 재확인)
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] 단위 테스트: `normalizeRoute`, dual-write 대상 판별
- [ ] 커밋 + PR

## 후속 (out of scope, 별도 이슈)

- P2 참여도 이벤트 배선
- Mixpanel Export API 주기 백업
- `is_new_user` 정확도: 콜백에서 insert/update 판별해 `?new=1` 부여
