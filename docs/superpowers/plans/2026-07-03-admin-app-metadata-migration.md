# Admin 판별 app_metadata 이전 Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 판별을 클라이언트가 수정 가능한 `user_metadata.is_admin`에서 서비스 롤만 수정 가능한 `app_metadata.is_admin`으로 이전해 권한 상승(privilege escalation) 취약점을 제거한다.

**Architecture:** 코드 전역의 admin 판별을 단일 헬퍼 `isAdminUser(user)`로 통일하고(app_metadata만 신뢰, fallback 없음), RLS 정책을 `raw_app_meta_data`로 재생성한다. 기존 admin 계정의 `app_metadata.is_admin`은 백필 스크립트로 채운다.

**Tech Stack:** Next.js 14, Supabase Auth (GoTrue), TypeScript, vitest.

## Global Constraints

- **기능 동일성 유지**: 백필 후 admin/champion 동작이 이전과 완전히 동일해야 함. 재로그인 요구 없음(`getUser()`가 Auth 서버에서 최신 레코드 반환).
- **프로필 필드 불변**: `user_metadata.name`, `full_name`, `avatar_url`은 그대로 둔다. `is_admin`만 이전.
- **fallback 금지**: 코드는 `app_metadata.is_admin`만 읽는다. `user_metadata` fallback을 두면 취약점이 남으므로 금지.
- **prod 무조작**: 이 세션에서 prod DB/배포를 건드리지 않는다. 백필·마이그레이션·배포는 런북으로 사용자에게 인계.
- **배포 순서(런북)**: ①백필 스크립트 실행 → ②RLS 마이그레이션 적용 → ③코드 배포. 순서 위반 시 admin 락아웃 위험.

---

### Task 1: `isAdminUser` 헬퍼 + 단위 테스트

**Files:**
- Modify: `lib/auth.ts`
- Create: `test/lib/is-admin.test.ts`

**Interfaces:**
- Produces: `isAdminUser(user: { app_metadata?: { is_admin?: boolean } } | null | undefined): boolean`

- [ ] Step 1: `test/lib/is-admin.test.ts` 작성 — app_metadata.is_admin=true→true, user_metadata.is_admin=true만 있으면 false(취약점 폐쇄 증명), 둘 다 없음→false, null→false.
- [ ] Step 2: 테스트 실패 확인 (`bun run test -- is-admin`).
- [ ] Step 3: `lib/auth.ts`에 `isAdminUser` 구현, `verifyAdmin`이 이를 사용하도록 수정.
- [ ] Step 4: 테스트 통과 확인.
- [ ] Step 5: 커밋.

### Task 2: 서버 코드 admin 판별 치환

**Files (is_admin 판별만 치환, name/avatar 라인은 미변경):**
- `lib/sessions/access.ts` (타입 + line 17)
- `app/charter-popup/[id]/page.tsx:22`
- `app/admin/hotline/page.tsx:8`
- `app/admin/layout.tsx:19`
- `app/api/hotline/messages/route.ts:26`
- `app/api/hotline/read/route.ts:14`
- `app/api/admin/users/route.ts:28`
- `app/api/admin/users/[userId]/route.ts:27`
- `app/api/sessions/route.ts:10`
- `app/api/sessions/[sessionId]/route.ts:14`
- `app/api/sessions/[sessionId]/comments/route.ts:11`
- `app/api/sessions/[sessionId]/comments/[commentId]/route.ts:40`
- `app/api/charter/comments/[commentId]/route.ts:37`
- `app/api/charter/submissions/route.ts:22`
- `app/api/charter/submissions/[id]/comments/route.ts:25,51`
- `app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts:12`
- `app/api/milestones/route.ts:41`

- [ ] 각 파일에서 `user.user_metadata?.is_admin` → `isAdminUser(user)` (또는 app_metadata 직접 판별). `verifyAdmin`을 이미 통과한 라우트는 무변경.
- [ ] typecheck 통과 확인.
- [ ] 커밋.

### Task 3: 클라이언트 admin 판별 + middleware 치환

**Files:**
- `app/admin/login/page.tsx:17` (`data.user?.app_metadata?.is_admin`)
- `middleware.ts:29,31,43` (`user.app_metadata?.is_admin`)

- [ ] 치환. 클라이언트 User 객체도 `app_metadata`를 포함하므로 읽기 가능(쓰기는 불가).
- [ ] typecheck 통과.
- [ ] 커밋.

### Task 4: RLS 정책 재생성 마이그레이션

**Files:**
- Create: `supabase/migrations/20260703000000_admin_app_metadata_rls.sql`

- [ ] 기존 6개 admin 정책을 DROP + `raw_app_meta_data->>'is_admin'`로 CREATE:
  - `hotline_admin_all` (hotline_messages)
  - `admin_read_all_attachments` (hotline_attachments)
  - `checkup_admin_all` (check_up_sessions)
  - `action_items_admin_all` (session_action_items)
  - `session_comments_admin_all` (session_comments)
  - `checkup_audio_admin_all` (storage.objects)
- [ ] 기존 마이그레이션 파일은 편집하지 않음(이미 적용됨).
- [ ] 커밋.

### Task 5: 백필 스크립트 + create-admins 수정

**Files:**
- Create: `scripts/backfill-admin-app-metadata.ts`
- Modify: `scripts/create-admins.ts`

- [ ] 백필: `listUsers` 순회, `user_metadata.is_admin===true`인 계정에 `app_metadata:{is_admin:true}` 세팅(idempotent).
- [ ] `create-admins.ts`: 신규/갱신 시 `app_metadata:{is_admin:true}` 세팅, 구계정 비활성화 시 `app_metadata:{is_admin:false}`.
- [ ] package.json에 `backfill-admin-meta` 스크립트 추가.
- [ ] 커밋.

### Task 6: 검증 + 런북

- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` 전부 통과.
- [ ] PR 본문에 배포 순서 런북 명시(백필→마이그레이션→배포, 그리고 admin 로그인 스모크 테스트).
