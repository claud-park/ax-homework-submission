# Admin 1-on-1 현황 뷰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** 어드민이 챔피언별 1-on-1 현황(회차, 마지막/다음 미팅, 대기·취소 신청, 신청·확정 시각)을 한 화면에서 점검한다.

**Architecture:** 마이그레이션 없음. 서버 컴포넌트 `app/admin/one-on-one/page.tsx`가 service client로 `fetchOneOnOneOverview`를 호출하고, 순수 함수 `buildOneOnOneOverview`가 행을 집계한다. 클라이언트는 표/칩/펼침 타임라인만 담당한다.

**Tech Stack:** Next.js App Router, Supabase service client, vitest, KST 헬퍼(`kstTodayStr`).

## 결정 (사용자 확정, 2026-10-22)
- **회차** = 선택 시즌의 `check_up_sessions` 건수. `(session_date, session_time nulls last, created_at)` 오름차순 1..N.
- **시즌 구분(예약)** = `slot_start`의 KST 날짜가 시즌 `start_date`~`end_date`(포함) 안. `start_date`가 null이면 필터 끄고 안내 배너.
- **dropped 챔피언** 숨김 (`season_enrollments` role=champion, status≠dropped).
- 예약일 표시: 신청 시각(`created_at`) + 미팅 일시(`slot_start`, KST). 확정 시각(confirmed 행 `updated_at`)은 상세 타임라인에만.
- 다음 미팅 = `status='confirmed' && slot_start > now` 중 최소. 마지막 미팅 = 최근 세션(없으면 "기록 없음").
- "기록 누락 의심" = 지난 confirmed 예약인데 같은 KST 날짜의 세션 없음. "미팅 0회" 플래그.

## Global Constraints
- 어드민 판별은 `app_metadata`(`isAdminUser`), 기존 `app/admin/layout.tsx`·middleware 가드 사용. `user_metadata` 금지.
- 예약 테이블 RLS에 어드민 정책 없음 → 반드시 `createServiceClient()`를 서버에서만 사용.
- 날짜는 KST 헬퍼만 사용(`new Date().getDate()` 금지), `now`는 인자로 주입.
- 쿼리 수는 챔피언 수와 무관(bulk `in`).
- 커밋: `[AX-1] type(scope): subject` + Co-Authored-By 라인.

## Review Focus
- UTC 15:00 이후 slot이 KST 다음날로 계산되는가
- 시즌 `start_date` null / `end_date` null
- 세션 0건, 예약 0건 챔피언
- 이번 시즌 챔피언이 아닌 사용자의 예약 무시
- 같은 날 pending+confirmed+cancelled 혼재

## Tasks
### Task 1 (Sonnet): `lib/one-on-one/overview.ts` — `kstDateOf(iso)`, `isInSeasonWindow(slotIso,start,end)`, `numberSessions(sessions)`
Test `test/lib/one-on-one-overview.test.ts`: UTC 15:00 이후 → 다음날 KST; start null이면 true; end 당일 포함; 세션 정렬(time null last, created_at tiebreak), 빈 배열.
### Task 2 (Opus): `buildOneOnOneOverview({champions,sessions,bookings,now})` → `OverviewRow[]` (`userId,name,department,sessionCount,lastSession,nextBooking,pendingBooking,cancelledCount,latestRequestAt,flags{missingRecord,zeroMeetings},timeline`)
Tests: pending→대기, 다음 미팅=미래 confirmed 최소 slot, 취소 건수, missingRecord 규칙, 세션 0건, 시즌 밖 예약/비챔피언 예약 무시.
### Task 3 (Sonnet): `filterRows(rows, chip)`, `sortRows(rows)` (칩: all|pending|upcoming|zero|missing; 기본 정렬 대기 우선 → 회차 오름차순). 칩별 테스트 1개씩.
### Task 4 (Opus): `lib/data/one-on-one-admin.ts` `fetchOneOnOneOverview(supabase, seasonId?)` — 시즌 조회(없으면 현재 시즌), `Promise.all`로 enrollments / sessions(season_id, in ids) / bookings(in ids) / users; `getCurrentSeasonUserIds` 재사용 금지(closed 시즌 `[]`). Tests: 현재 시즌 없으면 빈 결과, dropped 제외, 세션 쿼리 season_id 필터, 쿼리 수 챔피언 수 무관.
### Task 5 (Sonnet): `app/admin/one-on-one/page.tsx`(서버, `searchParams.season`, `listSeasons`) + `OneOnOneOverviewClient.tsx`(표, 시즌 선택, 상태 칩, 행 펼침 타임라인, 챔피언 상세 링크, 빈 상태, start_date null 배너). `AdminChampionsClient`/`ChampionSummaryTable` 스타일 준수, `DesktopOnlyNotice`.
### Task 6 (Sonnet): `AdminSidebar.tsx` NAV에 `{ icon: Video, label: '1-on-1 현황', href: '/admin/one-on-one' }` ('챔피언 리스트' 다음).
### Task 7 (Opus): 최종 리뷰 + `bun run build`(동적 세그먼트 이름 충돌 확인) + 전체 테스트.

## 후속(범위 밖)
- `one_on_one_bookings.season_id` 추가 + `book/route.ts`에서 채움(날짜 구간 필터 대체)
- 예약↔세션 연결 키, 확정 후 취소 상태
