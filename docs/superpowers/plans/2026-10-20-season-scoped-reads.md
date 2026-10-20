# 시즌 스코프 읽기(현재 시즌 차터·마일스톤만 노출) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 복귀 챔피언(1기→2기 이어하기)이 2기에서는 차터를 새로 제출해야 하도록, 차터·마일스톤의 목록/집계 읽기를 전부 현재 시즌(`is_current`)으로 한정한다. 2기 전환 직후 관리자 간트에 5명의 1기 차터·마일스톤이 그대로 보이는 문제를 없앤다.

**Architecture:** 쓰기는 이미 `season_id`를 현재 시즌으로 채운다(시즌모델 PR). 읽기만 누락돼 있으므로 `lib/data/season.ts`에 `getCurrentSeasonIdOrNil`을 추가하고, 인벤토리에 잡힌 목록/집계 쿼리마다 `.eq('season_id', seasonId)`를 붙인다. id 단건 조회(차터 상세, 댓글, 세션, 액션아이템)와 1:1 세션 이력은 시즌과 무관한 이력으로 두고 건드리지 않는다. 복귀 챔피언 UX는 (a) 차터 목록 화면에 "지난 시즌 차터" 읽기전용 섹션, (b) 새 차터 생성 시 직전 시즌 최신 차터를 `previous_charter_id`로 자동 연결로 처리한다.

**Tech Stack:** Next.js App Router, Supabase service client, vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-season-model-design.md` §"API/라우트 스코핑 및 화면 동작"(챔피언 화면은 현재 시즌 enrollment 기준, Admin 집계는 `is_current` 필터, 이어하기 챔피언의 "이전 시즌 차터 보기" 링크). 시즌 드롭다운(`?season=`)은 이번 범위 밖.

## Global Constraints

- 현재 시즌이 없으면(이론상) 읽기는 빈 결과여야 한다. `.eq('season_id', null)`은 PostgREST에서 uuid 파싱 에러가 나므로 절대 null을 넘기지 않는다 → `getCurrentSeasonIdOrNil`이 매칭 불가 UUID(`00000000-0000-0000-0000-000000000000`)를 돌려준다.
- `sub_tasks`는 `season_id`가 없고 읽는 곳도 없다. 건드리지 않는다.
- 1:1 세션(`check_up_sessions`, `session_action_items`, `champion_weekly_sessions`)과 MCP, id 단건 조회는 범위 밖.
- 커밋 메시지 `[AX-1]` 접두사 + Co-Authored-By. 최종 검증에 `bun run build` 포함.

## Review Focus

1. 복귀 챔피언이 2기에 아직 차터가 없을 때 `/my-project/milestones`와 사이드바(`/api/milestones`)가 1기 마일스톤을 보여주면 안 된다. → Task 2 대상 사이트에 필터 적용, 수동 확인.
2. 1기 승인 차터만 있고 2기 차터가 없는 복귀 챔피언이 마일스톤 PATCH/log를 호출하면 승인 가드가 막아야 한다(1기 승인으로 통과하면 안 됨). → Task 2 승인 가드에 시즌 필터.
3. daily-nudge가 "차터 있음"을 현재 시즌 기준으로 판단해야 복귀 챔피언에게 차터 제출 넛지가 간다. → Task 4.
4. 2기 차터 POST 시 `previous_charter_id`가 직전 시즌의 가장 최근 **published** 차터를 가리켜야 하고, 이전 차터가 없으면 null이어야 한다. → Task 5 테스트.
5. `charter-popup/[id]`는 현재 시즌이 아니라 **그 차터의 시즌**으로 마일스톤을 필터해야 1기 차터 팝업이 계속 동작한다. → Task 3.

---

### Task 1: `getCurrentSeasonIdOrNil` 헬퍼

**Files:** Modify `lib/data/season.ts`; Test `test/lib/data/season.test.ts`

**Interfaces:** Produces `export const NIL_SEASON_ID = '00000000-0000-0000-0000-000000000000'`, `export async function getCurrentSeasonIdOrNil(supabase): Promise<string>` — 현재 시즌 id, 없으면 `NIL_SEASON_ID`.

- [ ] 테스트: 현재 시즌 있으면 id, 없으면 NIL 반환
- [ ] 구현, 테스트 통과, 커밋 `[AX-1] feat(season): getCurrentSeasonIdOrNil 읽기용 헬퍼`

### Task 2: 챔피언 본인 화면·API 시즌 필터

**Files (모두 `.eq('season_id', seasonId)` 추가):**
- `app/(champion)/my-project/milestones/page.tsx:19,25`
- `app/api/charter/submissions/route.ts:41` (GET, 본인/관리자 user_id 지정 분기)
- `app/api/milestones/route.ts:52,65`
- `app/api/milestones/[id]/route.ts:53`, `app/api/milestones/[id]/log/route.ts:70` (승인 차터 count 가드)
- `app/api/milestones/generate/route.ts:33`
- `app/(champion)/my-project/charter/page.tsx:13` → 현재 시즌 목록 + 지난 시즌 목록을 분리 조회해 `CharterListClient`에 `previousCharters` prop 추가(읽기전용 "지난 시즌 차터" 섹션, 링크는 기존 상세 페이지)

- [ ] 각 사이트 수정, `bun run typecheck && bun run lint`, 커밋 `[AX-1] feat(champion): 차터·마일스톤 읽기를 현재 시즌으로 한정 + 지난 시즌 차터 섹션`

### Task 3: 관리자 집계·공유 헬퍼 시즌 필터

**Files:**
- `lib/data/champions.ts` `fetchGanttData`(:16,17), `fetchSummaryData`(:69,70)
- `app/admin/layout.tsx:27,31`, `app/admin/progress/page.tsx:23,28`, `app/admin/kanban/page.tsx:20,21`, `app/api/admin/kanban/route.ts:24,25`, `app/admin/delay-reports/page.tsx:21,28`, `app/api/admin/milestones/bottleneck-pending/route.ts:10`, `app/api/admin/milestones/bottleneck-reviewed/route.ts:10`, `app/admin/reports/page.tsx:15,17`, `app/api/admin/reports/overview/route.ts:39,41`, `app/api/admin/reports/[weekNumber]/route.ts:12`, `app/api/admin/milestones/route.ts:10`, `app/api/admin/charters/route.ts:10`, `app/api/charter/submissions/route.ts:32`(관리자 전체 분기), `app/api/champions/route.ts:28`, `app/api/champions/[userId]/route.ts:24,30`
- `app/charter-popup/[id]/page.tsx:43,62` → 차터 행의 `season_id`로 필터(현재 시즌 아님)

- [ ] 각 사이트 수정, typecheck/lint, 커밋 `[AX-1] feat(admin): 차터·마일스톤 집계 읽기를 현재 시즌으로 한정`

### Task 4: Cron 넛지 시즌 필터

**Files:** `app/api/cron/daily-nudge/route.ts:43,47`, `app/api/cron/weekly-overdue-nudge/route.ts:37`

- [ ] 수정, 기존 nudge 테스트 통과 확인, 커밋 `[AX-1] fix(cron): 넛지 판단을 현재 시즌 차터·마일스톤 기준으로`

### Task 5: 새 차터에 `previous_charter_id` 자동 연결

**Files:** Modify `app/api/charter/submissions/route.ts` POST; Create `lib/data/charter-lineage.ts`; Test `test/lib/data/charter-lineage.test.ts`

**Interfaces:** `findPreviousCharterId(supabase, userId, currentSeasonId): Promise<string | null>` — `user_id` 동일, `season_id != currentSeasonId`, `publish_status='published'`, `submitted_at` desc limit 1. POST insert에 `previous_charter_id` 포함.

- [ ] 테스트(있음/없음), 구현, 커밋 `[AX-1] feat(charter): 새 시즌 차터에 직전 시즌 차터 자동 연결`

### Task 6: 검증·배포

- [ ] `bun run test && bun run typecheck && bun run lint && bun run build`
- [ ] 리뷰(deep-reasoner) → 수정 → PR → main 머지 → production Ready
- [ ] 운영 확인: 관리자 전체 현황 간트가 비어 있고(2기 차터 없음), 챔피언 목록에 5명이 "차터 없음"으로 보이는지
