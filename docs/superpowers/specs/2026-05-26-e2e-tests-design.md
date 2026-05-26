# E2E Tests Design

## Architecture

```
playwright.config.ts              # 루트 레벨 Playwright 설정
global-setup.ts                   # 테스트 전 champion/admin 세션 생성
e2e/
  auth/
    champion.json                 # 저장된 champion storageState (gitignored)
    admin.json                    # 저장된 admin storageState (gitignored)
  helpers/
    inject-session.ts             # Supabase 세션 → Playwright 쿠키 변환 유틸
  tests/
    route-protection.spec.ts
    admin-auth.spec.ts
    admin-kanban.spec.ts
    admin-progress.spec.ts
    champion-access.spec.ts
```

**Framework**: Playwright (TypeScript)  
**Browser**: Chromium only (CI 속도 최적화)  
**Pattern**: Storage State — globalSetup에서 세션 생성 후 spec 파일에서 `test.use({ storageState })` 재사용

## Auth Strategy

### Admin
`global-setup.ts`에서 Playwright browser page를 열어 `/admin/login` 폼에 이메일/패스워드 입력 → 인증 성공 후 `page.context().storageState()`로 `e2e/auth/admin.json` 저장.

### Champion
Google OAuth라 UI 로그인 불가. 테스트 전용 챔피언 계정(이메일/패스워드 인증)을 Supabase에 생성하고:
1. `global-setup.ts`에서 `supabase.auth.signInWithPassword()` 호출 → 세션 토큰 획득
2. `@supabase/ssr`이 기대하는 쿠키 형식(`sb-<project-ref>-auth-token`)으로 변환
3. Playwright page context에 `addCookies()` 주입 후 storageState 저장 → `e2e/auth/champion.json`

### 필요 환경 변수 (`.env.local` + CI secrets)
```
TEST_CHAMPION_EMAIL=
TEST_CHAMPION_PASSWORD=
TEST_ADMIN_EMAIL=
TEST_ADMIN_PASSWORD=
```
기존 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` 재사용.

## Critical Flows (12 시나리오)

### route-protection.spec.ts
1. 미인증 → `/` 접근 시 `/login`으로 리다이렉트
2. 미인증 → `/admin/kanban` 접근 시 `/admin/login`으로 리다이렉트
3. Champion 세션 → `/admin/kanban` 접근 시 리다이렉트
4. Admin 세션 → `/` 접근 시 리다이렉트

### admin-auth.spec.ts
5. 올바른 자격증명 → 로그인 성공 후 `/admin/kanban` 이동
6. 잘못된 비밀번호 → 에러 메시지 표시

### admin-kanban.spec.ts
7. 칸반 보드 5개 컬럼 헤더 렌더링 확인
8. 카드가 하나 이상 존재하는 컬럼 확인 (테스트 데이터 전제)

### admin-progress.spec.ts
9. `/admin/progress` 페이지 로드 성공 (200 OK)
10. StatsBar 렌더링 확인 (stat 수치 5개 visible)
11. 제출 상태 배지 존재 확인

### champion-access.spec.ts
12. 세션 주입 후 `/` 로드 (리다이렉트 없음)
13. `/charter` 접근 가능 (200)
14. `/admin/kanban` → 리다이렉트 (champion은 admin 불가)

## CI 통합

`.github/workflows/ci.yml`에 build 스텝 이후 추가:

```yaml
- name: Install Playwright browsers
  run: bunx playwright install --with-deps chromium

- name: Run E2E tests
  run: bunx playwright test
  env:
    TEST_ADMIN_EMAIL: ${{ secrets.TEST_ADMIN_EMAIL }}
    TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
    TEST_CHAMPION_EMAIL: ${{ secrets.TEST_CHAMPION_EMAIL }}
    TEST_CHAMPION_PASSWORD: ${{ secrets.TEST_CHAMPION_PASSWORD }}
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
    SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
```

`playwright.config.ts`의 `webServer` 설정으로 `next build → next start` 자동 처리.

## Out of Scope
- 드래그앤드롭 상호작용 테스트 (Playwright에서 dnd-kit 불안정)
- 이메일 발송 E2E
- 모바일 뷰포트 테스트
- Visual regression
