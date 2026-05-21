# CI/CD Phase 1 — Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** npm → Bun으로 패키지 매니저 전환. ax-dsp-search 패턴 정렬을 위한 첫 단계. 코드 동작은 변경 없음 — 단지 install/build/run 도구만 교체.

**Architecture:** Next.js 14 App Router의 build/run을 `bun --bun next ...`로 실행. middleware는 Bun runtime 미지원이므로 `runtime: 'nodejs'` 명시. lockfile은 `bun.lock`(text)로 교체. CI는 `setup-bun`으로 전환.

**Tech Stack:** Bun 1.x · Next.js 14 · TypeScript · `@supabase/ssr` middleware

**Spec reference:** `_obsidian/Projects/ax-homework-submission-cicd-unification.md` (외부 vault)

**Branch:** `feature/ci-cd` (이 worktree에서 작업)

---

## File Structure

| 경로 | 작업 | 책임 |
|---|---|---|
| `package.json` | 수정 | `dev`/`build`/`start` 스크립트를 `bun --bun next ...`로 교체 |
| `package-lock.json` | 삭제 | bun으로 단일 lockfile만 유지 |
| `bun.lock` | 신규 (자동 생성) | `bun install` 산출물 |
| `middleware.ts` | 수정 | `export const config`에 `runtime: 'nodejs'` 추가 |
| `.github/workflows/ci.yml` | 수정 | `setup-node` → `setup-bun`, `npm` 명령들을 `bun`으로 |
| `.gitignore` | 검토 (no-op 가능) | `bun.lock`이 무시 항목에 포함돼 있지 않은지 확인 |

각 파일 단일 책임. middleware 변경은 보호 라우트 동작과 직결되므로 별도 커밋.

---

## 진행 전 사전 확인

- [ ] **현재 브랜치/HEAD 확인**

Run:
```bash
git status
git log --oneline -1
git branch --show-current
```
Expected:
- 브랜치: `feature/ci-cd`
- HEAD: `a8f7497 feat(ui): resizable side panels + form UX polish` (main과 동일)
- working tree clean

다른 브랜치라면 중단하고 사용자에게 보고.

- [ ] **bun 설치 확인**

Run: `bun --version`
Expected: `1.x.x` (예: `1.3.3`). 없으면 `curl -fsSL https://bun.sh/install | bash`로 설치 후 새 셸 진입.

---

## Task 1: package.json scripts → bun으로 교체

**Files:**
- Modify: `package.json`

- [ ] **Step 1.1: 현재 scripts 블록 확인**

Run:
```bash
grep -A 6 '"scripts"' package.json
```
Expected:
```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 1.2: scripts를 bun 명령으로 교체**

`package.json`의 scripts 블록을 정확히 다음으로 교체:

```json
  "scripts": {
    "dev": "bun --bun next dev",
    "build": "bun --bun next build",
    "start": "bun --bun next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  },
```

이유:
- `dev`/`build`/`start`: `--bun` 플래그로 Node 대신 Bun 런타임에서 Next 실행 (Bun 공식 권장 형태).
- `lint`/`typecheck`: 외부 바이너리(next, tsc)는 패키지 매니저와 무관 — `bun run lint`도 `next lint`도 동일하게 동작. 그대로 둔다.

- [ ] **Step 1.3: 변경 확인**

Run: `grep -A 6 '"scripts"' package.json`
Expected: 위 Step 1.2의 형태와 정확히 일치.

---

## Task 2: package-lock.json 삭제 + bun.lock 생성

**Files:**
- Delete: `package-lock.json`
- Create (auto): `bun.lock`

- [ ] **Step 2.1: package-lock.json 삭제**

Run: `rm package-lock.json`
Expected: 종료 코드 0.

- [ ] **Step 2.2: bun install로 lockfile 생성**

Run: `bun install`
Expected:
- `bun.lock` 파일이 프로젝트 루트에 생성됨
- `node_modules/` 디렉토리 생성/갱신
- 출력 끝에 `✓ N packages installed` 메시지

- [ ] **Step 2.3: bun.lock 존재 + 형식 확인**

Run:
```bash
ls -la bun.lock
head -5 bun.lock
```
Expected:
- `bun.lock` 파일이 존재 (수 KB ~ 수십 KB)
- 첫 줄: `# This file is auto-generated, edit only if you know what you are doing.` 또는 lockfile v1 형식 헤더

- [ ] **Step 2.4: package-lock.json이 정말 사라졌는지 확인**

Run: `ls package-lock.json 2>&1`
Expected: `ls: package-lock.json: No such file or directory`

---

## Task 3: middleware에 runtime: 'nodejs' 추가

**Files:**
- Modify: `middleware.ts`

Bun runtime은 Next.js middleware (edge runtime 기본)를 지원하지 않는다. App Router에서는 middleware별 runtime을 `config.runtime`으로 명시 가능. 명시 안 하면 Bun으로 빌드 시 middleware가 깨질 수 있음.

- [ ] **Step 3.1: 현재 config 블록 확인**

Run: `tail -5 middleware.ts`
Expected:
```ts
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

- [ ] **Step 3.2: config에 runtime: 'nodejs' 추가**

`middleware.ts`의 마지막 `export const config = { ... }` 블록을 정확히 다음으로 교체:

```ts
export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

(runtime 키를 matcher 위에 추가. 객체 안 키 순서는 자유.)

- [ ] **Step 3.3: 변경 확인**

Run: `tail -6 middleware.ts`
Expected: 위 Step 3.2의 형태.

---

## Task 4: 로컬 검증 — lint / typecheck / build / dev 부팅

**Files:** (없음 — read-only 검증)

- [ ] **Step 4.1: lint 통과 확인**

Run: `bun run lint`
Expected: 종료 코드 0. warnings는 무시. errors가 있으면 본 plan 범위 밖이므로 사용자에게 보고하고 중단.

- [ ] **Step 4.2: typecheck 통과 확인**

Run: `bun run typecheck`
Expected: 종료 코드 0. 타입 에러 있으면 사용자에게 보고하고 중단.

- [ ] **Step 4.3: 빌드 통과 확인 (placeholder env)**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
bun run build
```
Expected:
- 종료 코드 0
- 마지막에 `✓ Compiled successfully` + route 목록 출력
- middleware 빌드 라인에서 `λ Middleware ... runtime: nodejs` (또는 유사) 확인 가능

middleware runtime 미설정 상태로 빌드 시 Bun에서 깨질 위험이 있으므로, 이 단계 통과가 Task 3 검증의 핵심.

- [ ] **Step 4.4: dev 서버 30초 부팅 테스트**

Run (백그라운드):
```bash
bun run dev > /tmp/bun-dev.log 2>&1 &
DEV_PID=$!
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
kill $DEV_PID 2>/dev/null
```
Expected:
- `200` (login 페이지 응답)
- `/tmp/bun-dev.log` 마지막 줄들에 `✓ Ready in ...` 메시지 + 에러 없음

에러 또는 다른 status code면 로그 확인 후 보고.

- [ ] **Step 4.5: 어드민 이메일 발송 1회 sanity 테스트 (옵션, 사용자 승인 필요)**

`lib/email.ts`의 nodemailer가 Bun Node 호환층에서 정상 동작하는지 확인. 실제 SMTP 호출이 발생하므로 **사용자 승인 후에만** 실행.

Run:
```bash
bun -e "
import('./lib/email.ts').then(async (m) => {
  // 실제 호출 시그니처는 lib/email.ts 확인 후 맞춤
  console.log('email module loaded:', Object.keys(m));
});
"
```
또는 dev 서버를 켠 상태에서 admin UI로 1건 발송 후 수신 확인.

Expected: 모듈 로드 성공 + 발송 시 정상 SMTP 응답. 실패 시 nodemailer alternative 검토 (별도 spec).

발송 sanity 테스트를 skip하면 머지 게이트는 Phase 2 컨테이너 검증으로 대체 가능.

---

## Task 5: GitHub Actions CI를 bun으로 전환

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 5.1: 현재 ci.yml 내용 확인**

Run: `cat .github/workflows/ci.yml`
Expected: `setup-node@v4` + `npm ci/lint/typecheck/build` 구조.

- [ ] **Step 5.2: ci.yml을 bun 기반으로 교체**

`.github/workflows/ci.yml` 전체를 정확히 다음으로 교체:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: '1'
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key
```

주요 변경:
- `actions/setup-node@v4` → `oven-sh/setup-bun@v2`
- `npm ci` → `bun install --frozen-lockfile`
- `npm run X` → `bun run X`
- `cache: 'npm'` 옵션 제거 (setup-bun이 자체 캐시)

- [ ] **Step 5.3: YAML 문법 검증**

Run:
```bash
bun -e "console.log(require('fs').readFileSync('.github/workflows/ci.yml','utf8').split('\n').length, 'lines')"
```
Expected: 약 26-30 lines. 파일이 비어있지 않으면 통과.

GitHub 측 검증은 push 후 actions가 실행되며 자동.

---

## Task 6: .gitignore 검토 + commit 분할

**Files:**
- Modify (필요시): `.gitignore`

- [ ] **Step 6.1: .gitignore에서 bun 관련 항목 확인**

Run: `grep -i bun .gitignore || echo "no bun entries"`
Expected: `no bun entries` 또는 무관한 디렉토리. `bun.lock`이 ignore 처리되어 있으면 안 됨 (커밋 대상이므로). 그런 경우 해당 라인 제거.

- [ ] **Step 6.2: working tree 상태 확인**

Run: `git status --short`
Expected: 변경 파일 6-7개 정도
- `M  .github/workflows/ci.yml`
- `M  middleware.ts`
- `M  package.json`
- `D  package-lock.json`
- `??  bun.lock`
- (optional) `M  .gitignore`

- [ ] **Step 6.3: Commit 1 — package manager 전환**

```bash
git add package.json package-lock.json bun.lock
git commit -m "$(cat <<'EOF'
chore(deps): switch package manager npm → bun

- package.json scripts: bun --bun next dev/build/start
- package-lock.json 삭제, bun.lock 생성
- lint/typecheck 스크립트는 외부 바이너리이므로 그대로

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```
Expected: 커밋 성공.

- [ ] **Step 6.4: Commit 2 — middleware runtime 명시**

```bash
git add middleware.ts
git commit -m "$(cat <<'EOF'
fix(middleware): declare runtime: 'nodejs' for Bun compatibility

Next.js middleware는 기본 edge runtime인데 Bun runtime이 edge를 지원하지 않음.
nodejs runtime을 명시해서 Bun 빌드/실행 시에도 supabase ssr middleware 동작 보장.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```
Expected: 커밋 성공.

- [ ] **Step 6.5: Commit 3 — CI 워크플로 bun 전환**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: switch GitHub Actions to oven-sh/setup-bun

- setup-node@v4 → oven-sh/setup-bun@v2 (bun-version: 1)
- npm ci → bun install --frozen-lockfile
- npm run * → bun run *
- placeholder env 그대로 유지 (route handler 런타임 호출 아님)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```
Expected: 커밋 성공.

(`.gitignore` 변경이 있었으면 별도 4번 커밋으로 추가)

- [ ] **Step 6.6: 커밋 로그 확인**

Run: `git log --oneline main..HEAD`
Expected: 3 (또는 4) 커밋. 메시지 prefix가 chore/fix/ci로 분리되어 있어야 함.

---

## Task 7: PR 생성은 Phase 2 머지 게이트와 함께 (이 plan에서는 생성하지 않음)

Phase 1 단독 PR을 만들지, Phase 1 + Phase 2 묶음 PR을 만들지는 사용자 결정 사항. 본 plan은 **여기서 종료**하고 사용자에게 다음 단계를 묻는다.

- [ ] **Step 7.1: 사용자에게 보고**

다음을 보고:
```
Phase 1 완료. feature/ci-cd 브랜치에 3개 커밋:
- chore(deps): npm → bun 전환
- fix(middleware): runtime nodejs 선언
- ci: setup-bun으로 워크플로 교체

검증 통과 항목:
- bun run lint / typecheck / build
- dev 서버 부팅 + /login 200 응답
- (옵션) nodemailer sanity: <결과>

다음: Phase 2 (Docker artifacts) 진행할까요? 또는 이 시점에서 별도 PR 머지 후 진행할까요?
```

---

## 완료 후 확인 사항

- [ ] `bun.lock`이 main에 없던 파일로 새로 추가됨
- [ ] `package-lock.json`이 삭제됨
- [ ] middleware.ts에 `runtime: 'nodejs'` 명시
- [ ] `.github/workflows/ci.yml`이 setup-bun + bun 명령으로 변경
- [ ] `bun run build` 통과 (placeholder env로도)
- [ ] feature/ci-cd 브랜치에 3개 신규 commit
- [ ] (옵션) nodemailer 발송 sanity 통과 또는 Phase 2로 이월
