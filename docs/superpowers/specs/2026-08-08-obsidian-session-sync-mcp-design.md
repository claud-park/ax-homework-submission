# Obsidian ↔ 1-on-1 세션 동기화 MCP 서버 — Design

**Status:** Approved
**Author:** Claude (with yr.park@dreamus.io)
**Date:** 2026-08-08

## 1. Problem

AX 팀은 사내 skill/plugin을 LLM 친화적으로("MCP-ify") 제공하고 싶어 함. 첫 후보로 챔피언/어드민이 이미 로컬에서 관리하는 Obsidian vault의 1-on-1 미팅노트·액션아이템을, ax-homework-submission의 기존 `check_up_sessions`/`session_action_items` 테이블과 양방향으로 동기화하는 기능을 만든다. 실사용 패턴은 **90%가 Obsidian → 앱 방향**(어드민이 로컬에서 정리한 노트를 앱에 반영)이므로, 이 방향의 UX가 1순위이고 앱 → Obsidian 방향(파일로 내보내기)은 같은 도구로 커버되는 부수 기능이다.

이 기능은 두 모듈로 계획된 MCP 서버의 1번 모듈이다. 2번 모듈(어드민용 마일스톤/진척도 조회 도구)은 이 설계 범위 밖이며, 같은 서버에 나중에 추가된다.

## 2. Who runs this, and why that matters

애초 가정은 "챔피언이 로컬에서 자기 세션 노트를 동기화"였으나, 실사용은 **어드민이 로컬에서 여러 챔피언의 세션 노트를 동기화**하는 경우가 대부분이다. 이는 champion-milestone-sync에서 이미 만든 개인 액세스 토큰(PAT) 인증을 그대로 재사용할 수 없다는 뜻이다 — 그 PAT는 "유출돼도 본인 데이터만 건드릴 수 있게" 의도적으로 관리자 권한을 절대 갖지 않도록 설계됐다(`lib/auth.ts`의 `verifyPersonalAccessToken`이 언제나 `app_metadata: {}`를 반환). 어드민이 다른 챔피언의 `check_up_sessions`를 읽고 쓰려면 별도의, 명시적으로 관리자 권한을 가진 토큰이 필요하다.

## 3. Architecture

```
로컬 (어드민 또는 챔피언의 Claude Code/Desktop)         MCP 서버 (이 앱의 Next.js API 라우트)      DB
┌──────────────────────────┐                     ┌───────────────────────────┐      ┌────────────────────┐
│ Obsidian vault (로컬 파일)   │                     │ app/api/mcp/route.ts       │      │ check_up_sessions    │
│  AX/champions/김철수.md      │  ①로컬 파일 읽기/쓰기   │  (MCP HTTP transport)       │      │ session_action_items │
│                           │◀───────────────────│                            │      │                      │
│ 에이전트가 파일 파싱·          │  ②MCP 도구 호출        │ list_champions (admin만)   │ ③CRUD│                      │
│ 매칭·확인·도구 호출           │────────────────────▶│ get_session                │─────▶│                      │
└──────────────────────────┘                     │ upsert_session             │      │                      │
                                                  │ sync_action_items          │      └────────────────────┘
                                                  └───────────────────────────┘
```

MCP 서버는 이 앱과 같은 Next.js 프로젝트 안에 둔다(별도 배포 없음) — `lib/auth.ts`, `createServiceClient`, `lib/sessions/access.ts`의 `resolveSessionRole` 등 기존 인프라를 함수 호출로 그대로 재사용하기 위함. Obsidian 파일을 실제로 읽고 쓰는 건 MCP 서버가 아니라 로컬에서 도는 에이전트(챔피언/어드민의 Claude 세션)다 — 벤더가 로컬 파일시스템에 접근할 수 있는 유일한 주체이기 때문.

## 4. 인증 — 관리자 PAT 신설

기존 `personal_access_tokens` 테이블을 확장한다(신규 테이블 대신):

```sql
ALTER TABLE personal_access_tokens
  ADD COLUMN scope text NOT NULL DEFAULT 'champion' CHECK (scope IN ('champion', 'admin'));

ALTER TABLE device_pairing_codes
  ADD COLUMN scope text NOT NULL DEFAULT 'champion' CHECK (scope IN ('champion', 'admin'));
```

- 챔피언 PAT는 지금처럼 `amst_` 접두사. 관리자 PAT는 새 접두사 `admt_`.
- `POST /api/pairing/request`가 `{scope: 'admin'}`을 받으면 `device_pairing_codes.scope = 'admin'`으로 코드 발급.
- `/pairing` 페이지는 `scope = 'admin'`인 코드일 때 문구를 "관리자 권한으로 이 기기를 연결할까요?"로 바꾼다.
- `POST /api/pairing/approve`는 코드가 `scope = 'admin'`이면 **승인하는 브라우저 세션이 실제 관리자(`isAdminUser`)인지 검증**한 뒤에만 `admt_` 토큰을 발급(아니면 403). 발급된 토큰의 `personal_access_tokens.scope`도 `'admin'`으로 저장.
- `lib/auth.ts`의 `verifyJWT`에 `admt_` 분기 추가: `personal_access_tokens`에서 `scope = 'admin'`인 유효 토큰을 찾으면, 합성 `User` 객체에 `app_metadata: { is_admin: true }`를 채워 반환한다. 이 한 가지 변경만으로 `resolveSessionRole`을 포함해 `app_metadata.is_admin`을 검사하는 기존 코드 전부가 관리자 PAT를 투명하게 인식한다 — 세션 관련 라우트 자체는 손대지 않는다.
- 챔피언 PAT의 `verifyPersonalAccessToken`은 지금처럼 절대 `is_admin: true`를 채우지 않는다(변경 없음).
- 페어링 자가승인 방지 가드(`isPatBearer`, PR #62에서 신설)는 `amst_`/`admt_` 두 접두사 모두를 막도록 확장 — 관리자 PAT라고 이 가드를 우회하면 안 됨.
- 기기 관리 페이지(`/my-project/devices`, 어드민용은 신설 필요)에서 관리자 PAT는 "관리자 권한" 배지로 눈에 띄게 표시한다 — 블라스트 반경이 챔피언 PAT보다 훨씬 크기 때문.

## 5. MCP 도구

| 도구 | 권한 | 설명 |
|---|---|---|
| `list_champions` | 관리자 PAT만 | `users` 테이블에서 `user_group = 'champion'`인 `{id, name}` 목록. Obsidian 노트에 챔피언 이름만 있고 `user_id`가 없을 때, 최초 1회 이름→ID 매핑용. 챔피언 PAT로 호출하면 403. |
| `get_session` | 둘 다 | 날짜 + (관리자면 `champion_user_id` 필수, 챔피언이면 무시하고 본인) 으로 세션 조회. 없으면 `null`. |
| `upsert_session` | 갱신은 둘 다, **신규 생성은 관리자 PAT만**(기존 `POST /api/sessions`도 `requireAdmin` — 동일 제약 유지) | 세션이 없으면 생성, 있으면 `title`/`notes` 갱신. 챔피언 PAT로 없는 세션에 호출하면 403(생성 대신 어드민에게 요청하라고 안내). |
| `sync_action_items` | 둘 다(기존 세션에 한해) | 액션아이템 배열을 통째로 전달. `id`가 있는 항목은 `body`/`is_completed` 갱신, `id`가 없는 항목은 신규 생성(생성된 id를 응답으로 돌려줘 파일에 다시 적을 수 있게 함). **삭제는 하지 않는다** — 한쪽에서 항목이 빠졌다고 반대쪽에서 지우지 않음(데이터 유실 방지). 삭제는 사이트에서 수동으로. |

인증·스코핑은 기존 `resolveSessionRole`/`GET /api/sessions`의 `isAdmin && championId` 패턴을 그대로 따른다 — 챔피언 PAT는 `championId` 파라미터를 줘도 항상 본인으로 강제, 관리자 PAT만 override 가능.

## 6. Obsidian 파일 매핑

세션·액션아이템 ID를 HTML 주석으로 숨겨 재동기화 시 매칭한다(파일 렌더링에는 안 보임):

```markdown
# 2026-08-08 김철수 1-on-1
<!-- session_id: 3f2a1c9e-... champion_id: 8b7d... -->

## 노트
(마크다운 내용 — session.notes와 매핑)

## 액션 아이템
- [ ] 할 일 1 <!-- id: abc123 -->
- [x] 할 일 2 <!-- id: def456 -->
- [ ] 새로 적은 항목 (id 없음 → sync_action_items 호출 시 신규 생성되고, 응답으로 받은 id를 에이전트가 파일에 다시 적어넣는다)
```

에이전트는 도구를 호출하기 전, 로컬 파일과 `get_session`으로 읽은 앱 쪽 현재 상태를 함께 보여주고 확인을 받는다(champion-milestone-sync와 동일한 확인 게이트) — 확인 없이는 쓰지 않는다.

## 7. 세션 매칭/생성 로직

`get_session(champion_id, date)`가 `null`을 반환하면(그날 세션이 아직 없음), 에이전트는 `upsert_session`으로 새로 만들지 확인받는다. 새 세션의 `title`은 Obsidian 노트의 H1 제목을 그대로 쓰거나, 없으면 "{날짜} 1-on-1"로 기본값을 둔다. 기존 `POST /api/sessions`가 `admin_user_id`를 호출자(관리자)로 자동 채우는 것과 동일하게, `upsert_session`도 관리자 PAT로 신규 생성 시 `admin_user_id`를 토큰 소유자로 채운다.

## 8. Scope / Out of scope

In scope:
- `personal_access_tokens`/`device_pairing_codes`에 `scope` 컬럼 추가 마이그레이션
- 페어링 발급/승인 플로우의 관리자 스코프 분기
- `lib/auth.ts`의 `admt_` 토큰 인식 확장
- 어드민용 기기 관리 페이지(신설, 관리자 PAT 배지 포함)
- `app/api/mcp/route.ts` (MCP HTTP transport) + 4개 도구
- 로컬에서 이 MCP 서버를 쓰기 위한 설정 안내 문서(SKILL.md 또는 이에 준하는 사용 가이드 — 정확한 형태는 플랜 단계에서 결정)

Out of scope (명시적으로 다음 범위):
- 2번 모듈(어드민 마일스톤/진척도 조회 도구) — 같은 서버에 나중에 추가
- 자동/백그라운드 동기화 — 이번 범위는 에이전트가 명시적으로 호출할 때만 동작
- 앱 → Obsidian 방향의 전용 "export" 도구 — `get_session`으로 읽은 내용을 에이전트가 직접 파일로 쓰는 것으로 충분(주 사용 방향이 아니므로 별도 도구 불필요)
- 사내 스킬 허브(dreamus-harness-repo) 등록 — champion-milestone-sync 때와 동일하게 별도 후속 작업

## 9. Testing

- Unit: `scope` 컬럼 인식하는 `verifyJWT`의 `admt_` 분기, 페어링 승인의 관리자 검증 로직 — 이 리포의 관례대로 순수 로직만 단위 테스트, 실제 DB 왕복은 hand-trace + 수동 검증.
- MCP 도구 자체는 로직이 기존 `check_up_sessions`/`session_action_items` REST 라우트의 얇은 재포장에 가까우므로, 새 도구의 스코핑 로직(관리자 override 가능 여부)만 집중적으로 리뷰.
- 실제 Obsidian 파일 파싱/쓰기는 로컬 에이전트가 하는 것이라 자동화 테스트 대상이 아님 — 수동 검증 항목으로 남긴다.
