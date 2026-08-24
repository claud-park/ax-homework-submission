# Champion Weekly 미팅 동기화 — Design

**Status:** Draft
**Author:** Claude (with yr.park@dreamus.io)
**Date:** 2026-08-24

## 1. Problem

챔피언 1:1 세션(`check_up_sessions`)은 이미 Obsidian ↔ 앱 동기화 기능(`obsidian-session-sync` 스킬 + `ax-sessions` MCP 서버)이 있다. 그런데 `check_up_sessions`는 "챔피언 1명 = 세션 1개" 구조라, 여러 챔피언이 한 자리에 모여 각자 프로젝트 진행 상황을 공유하는 **AX Champion Weekly**(그룹 미팅)를 담을 수 없다.

Weekly 미팅 노트는 이미 로컬 Obsidian vault에 AI 회의록 도구로 정리되어 있고, 그 안에는 "🤖 챔피언별 활동 공유"라는 섹션이 챔피언별로 나뉘어 있다. 이 구조를 그대로 DB로 옮기면, 관리자가 특정 챔피언의 주간 진행 상황을 시간 흐름에 따라 한눈에 확인할 수 있다.

## 2. Scope와 목적

- **목적은 순수 관리자용 기록·검색이다.** 챔피언 본인에게 노출하는 UI는 만들지 않는다 — 1:1(챔피언이 본인 세션을 봄)과 다른 지점이다.
- 동기화는 **Obsidian → App 단방향**만 다룬다 (1:1과 동일하게 이 방향이 실사용의 대부분).
- **기존 `ax-sessions` MCP 서버(`app/api/mcp/route.ts`)를 확장**한다. 별도 서버·별도 배포·별도 인증을 새로 만들지 않는다. 이 기능은 admin 전용이므로 기존 관리자 PAT(`admt_` 스코프, `2026-08-08-obsidian-session-sync-mcp-design.md`에서 도입)를 그대로 재사용한다 — **새 인증 로직이 필요 없다.**
- 실질적으로 이는, 배포가 끝나면 Claude Code에서 이미 페어링되어 연결된 `ax-sessions` MCP 연결이 새 도구 3개를 자동으로 노출한다는 뜻이다. 재연결(`claude mcp add` 재실행)이나 재페어링이 필요 없다 — 세션을 새로 시작해 도구 목록을 다시 불러오기만 하면 된다.

## 3. Data model

### `champion_weekly_sessions`

```sql
CREATE TABLE champion_weekly_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date  DATE NOT NULL,
  session_time  TIME,
  title         TEXT NOT NULL,           -- 예: "[11층 하와이] AX Champion Weekly"
  notes         TEXT,                    -- 요약 + 논의 주제 (조건화), 1:1과 동일한 스타일
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weekly_sessions_date ON champion_weekly_sessions(session_date DESC);

ALTER TABLE champion_weekly_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_sessions_admin_all" ON champion_weekly_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );
```

같은 회의실·같은 날짜에 여러 Weekly가 열릴 가능성은 1:1의 `multiple_sessions_on_date`처럼 낮지만 0은 아니므로(예: 층별로 별도 Weekly), unique 제약은 걸지 않는다 — `get_weekly_session`이 같은 날짜에 여러 건이면 목록으로 반환해 에이전트가 사람에게 확인받도록 한다(1:1과 동일 패턴).

### `weekly_champion_updates`

```sql
CREATE TABLE weekly_champion_updates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_session_id UUID NOT NULL REFERENCES champion_weekly_sessions(id) ON DELETE CASCADE,
  champion_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_label     TEXT,               -- 예: "드리머스 뷰360 (ax-view360) / 아이디 매퍼"
  summary           TEXT NOT NULL,      -- 활동 공유 불릿 내용 (마크다운)
  display_order     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_weekly_updates_session ON weekly_champion_updates(weekly_session_id, display_order);
-- 챔피언별 진척도 히스토리 조회(관리자 UI의 핵심 쿼리)
CREATE INDEX idx_weekly_updates_champion ON weekly_champion_updates(champion_user_id, created_at DESC);

ALTER TABLE weekly_champion_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_updates_admin_all" ON weekly_champion_updates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid() AND raw_app_meta_data->>'is_admin' = 'true'
    )
  );
```

챔피언용 SELECT 정책은 만들지 않는다(2절의 목적에 따라 관리자만 접근).

## 4. MCP 도구 (기존 `ax-sessions` 서버에 3개 추가)

| 도구 | 권한 | 설명 |
|---|---|---|
| `get_weekly_session` | 관리자 PAT만 (챔피언 PAT는 403 — 애초에 이 기능은 admin 전용) | `date`로 조회. 없으면 `null`, 여러 건이면 `{error: "multiple_sessions_on_date", sessions: [...]}` (1:1의 `get_session`과 동일 패턴). |
| `upsert_weekly_session` | 관리자 PAT만 | 없으면 생성, 있으면 `title`/`notes` 갱신. `expected_updated_at`으로 충돌 감지(1:1의 `upsert_session`과 동일). |
| `sync_champion_updates` | 관리자 PAT만 | `weekly_session_id` + 챔피언별 업데이트 배열. `id` 있는 항목은 `project_label`/`summary` 갱신, 없는 항목은 신규 생성(생성된 id를 응답으로 반환해 파일에 백필). **삭제하지 않음** — `sync_action_items`와 동일한 안전 원칙. |

`list_champions`는 신규로 만들 필요 없음 — 기존 도구를 그대로 재사용해 이름→`champion_user_id` 매핑에 쓴다.

## 5. Obsidian 파싱 규칙

Weekly 노트의 `## 🤖 챔피언별 활동 공유` 섹션 아래 `### 이름 — 프로젝트명` 서브섹션을 하나의 챔피언 업데이트로 파싱한다:

- "이름" 부분을 `list_champions` 결과와 매칭(1:1 스킬의 이름 매칭 규칙 재사용 — `한글이름(영문닉네임)/부서/Dreamus` 포맷에서 닉네임 우선 매칭).
- 매칭 실패(예: `### 화자6 (미상) — 정산서 자동화`)는 **건너뛰고 목록으로 관리자에게 보고** — 추측으로 아무 챔피언에게나 매핑하지 않는다.
- 서브섹션 제목의 `—` 뒤 텍스트를 `project_label`로, 그 아래 불릿 전체를 `summary`로 저장한다.
- 전체 노트의 `🎯 요약`(+ 필요시 `📢 결정 사항` 조건화)은 `champion_weekly_sessions.notes`로, 1:1과 같은 조건화 원칙(화자 매핑·전사록 등은 제외)을 따른다.
- `🏆 우수 사례·인사이트`, `🤨 질문·건의 사항`, `✅ 액션 아이템`은 이번 범위에서 어디에도 저장하지 않는다(2절의 범위 밖 결정).

## 6. Obsidian 파일 매핑 (ID 백필)

1:1과 동일한 HTML 주석 컨벤션을 그대로 확장한다:

```markdown
# [11층 하와이] AX Champion Weekly
<!-- weekly_session_id: b176f9e0-... -->

## 🤖 챔피언별 활동 공유

### Jennifer — 드리머스 뷰360 (ax-view360) / 아이디 매퍼
<!-- weekly_update_id: 24f9f71c-... -->

- 아이디 매핑 진행: ...
```

에이전트는 도구 호출 전 로컬 파일과 `get_weekly_session` 결과의 diff를 보여주고 명시적 확인을 받는다 — 1:1 스킬과 동일한 확인 게이트, 예외 없음.

## 7. 관리자 UI

`app/admin/champions/[userId]/page.tsx`(챔피언 상세 페이지)에 **"Weekly 진척도"** 섹션을 추가한다:

- 해당 챔피언의 `weekly_champion_updates`를 `created_at DESC`로 조회해 리스트 표시.
- 각 항목: 미팅 날짜(부모 `champion_weekly_sessions.session_date`), `project_label`, `summary`(마크다운 렌더링).
- 페이지네이션/무한스크롤 등은 기존 해당 페이지의 다른 섹션 컨벤션을 따른다(구현 단계에서 확인).
- 전체 Weekly 미팅 목록을 보여주는 별도 페이지(`/admin/weekly` 같은)는 이번 범위에 넣지 않는다 — 필요해지면 후속 작업.

## 8. Scope / Out of scope

**In scope:**
- 마이그레이션: `champion_weekly_sessions`, `weekly_champion_updates` 2개 테이블 + RLS(admin-only)
- `app/api/mcp/route.ts`에 `get_weekly_session`/`upsert_weekly_session`/`sync_champion_updates` 3개 도구 추가
- `app/admin/champions/[userId]/page.tsx`에 "Weekly 진척도" 섹션 추가
- `obsidian-session-sync` 스킬 문서에 Weekly 동기화 절차 추가 (기존 스킬 확장 vs 별도 스킬 파일 여부는 구현 계획 단계에서 결정)

**Out of scope (명시적으로 다음 범위):**
- 챔피언 본인이 보는 UI
- 회의 전체 액션아이템(담당자 미구분) 테이블화 — notes 텍스트 안에만 존재
- App → Obsidian 역방향 export
- 자동/백그라운드 동기화 — 에이전트가 명시적으로 호출할 때만 동작
- 새 인증 스코프/PAT 도입 — 기존 admin PAT(`admt_`) 재사용
- 전체 Weekly 목록 관리자 페이지

## 9. Testing

- Unit: 새 MCP 도구의 이름 매칭 실패 처리(건너뛰고 보고하는지), `sync_champion_updates`의 생성/갱신 분기 — 순수 로직만 단위 테스트, 이 리포 관례대로 실제 DB 왕복은 hand-trace + 수동 검증.
- RLS: `raw_app_meta_data->>'is_admin'` 기준으로 관리자만 접근 가능한지, 챔피언 PAT/일반 로그인 세션은 두 테이블 모두 접근 불가한지 수동 검증.
- Obsidian 파싱: 실제 vault의 Weekly 노트 샘플(예: `2026-08-20_1504_[11층 하와이] AX Champion Weekly.md`)로 파싱 로직을 직접 돌려 챔피언 매칭·미매칭 케이스를 확인 — 자동화 테스트 대상 아님(1:1과 동일 이유), 수동 검증 항목.
- 관리자 UI: 실제로 몇 건 동기화한 뒤 브라우저에서 해당 챔피언 페이지에 "Weekly 진척도" 섹션이 시간순으로 올바르게 뜨는지 확인.
