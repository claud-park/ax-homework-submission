# CI/CD Phase 2 — Docker Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vercel 배포를 폐기하고 Bun 기반 Dockerfile + docker-compose + Jenkins 운영 가이드로 정렬. ax-dsp-search 패턴 100% 차용.

**Architecture:** `oven/bun:1` builder가 Next.js `output: 'standalone'` 산출물을 만들고, `oven/bun:1-slim` runner가 `bun server.js`로 서빙. 빌드는 Jenkins가 서버에서 직접 (no registry). compose는 단일 frontend 서비스만 — Supabase는 외부 SaaS.

**Tech Stack:** Bun 1.x · Next.js 14 standalone · Docker / docker compose v2 · Jenkins (외부, 본 plan 범위 밖) · oven/bun base images

**Spec reference:** `_obsidian/Projects/ax-homework-submission-cicd-phase2.md` + `ax-homework-submission-cicd-unification.md` (외부 vault)

**Prerequisite:** Phase 1 (`docs/superpowers/plans/2026-05-21-cicd-phase1-bun.md`) 완료. `bun.lock` 존재 + middleware runtime 명시.

**Branch:** `feature/ci-cd` (Phase 1과 동일 브랜치, 누적)

---

## File Structure

| 경로 | 작업 | 책임 |
|---|---|---|
| `next.config.mjs` | 수정 | `output: 'standalone'` 추가 |
| `Dockerfile` | 신규 | oven/bun multi-stage (builder → slim runner) |
| `.dockerignore` | 신규 | 빌드 컨텍스트 크기 절감 |
| `docker-compose.yml` | 신규 | 단일 frontend 서비스, `--env-file .env` 강제 |
| `.env.example` | 신규/교체 | 모든 런타임 env 키 + 안내 코멘트 |
| `docs/deployment/docker.md` | 신규 | Jenkins 운영 가이드 (ax-dsp-search 동일 패턴) |
| `docs/migration/vercel-to-docker.md` | 삭제 | Vercel-기반 결정 시절 산물, 폐기 |
| `README.md` | 수정 | Vercel + CI 섹션 → Docker 섹션 교체 |

각 파일 단일 책임. README 교체와 vercel-to-docker.md 삭제는 같은 커밋(둘 다 Vercel 잔재 제거).

---

## 진행 전 사전 확인

- [ ] **Phase 1 완료 상태 확인**

Run:
```bash
ls bun.lock package-lock.json 2>&1
grep "runtime" middleware.ts | head -2
git log --oneline main..HEAD
```
Expected:
- `bun.lock` 존재, `package-lock.json` 없음
- middleware.ts에 `runtime: 'nodejs'` 라인
- Phase 1의 3개 커밋이 main 위에 쌓여 있음

Phase 1 미완료면 본 plan 중단하고 phase1 plan 먼저 실행.

- [ ] **docker / docker compose 설치 확인**

Run:
```bash
docker --version
docker compose version
```
Expected:
- Docker: 20.x 이상
- Docker Compose v2.x 이상 (compose 명령이 `docker compose`)

없으면 사용자에게 보고 후 설치 안내.

---

## Task 1: next.config.mjs에 standalone 출력 추가

**Files:**
- Modify: `next.config.mjs`

- [ ] **Step 1.1: 현재 내용 확인**

Run: `cat next.config.mjs`
Expected:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { domains: ['lh3.googleusercontent.com'] },
}
export default nextConfig
```

- [ ] **Step 1.2: output: 'standalone' 추가**

`next.config.mjs` 전체를 정확히 다음으로 교체:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { domains: ['lh3.googleusercontent.com'] },
}
export default nextConfig
```

- [ ] **Step 1.3: 빌드해서 standalone 산출물 확인**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
bun run build
ls .next/standalone/server.js .next/standalone/.next 2>&1
ls .next/static 2>&1 | head -5
```
Expected:
- 빌드 종료 코드 0
- `.next/standalone/server.js` 존재
- `.next/standalone/.next/` 디렉토리 존재 (server.js가 의존)
- `.next/static/` 존재 (런타임에 별도로 복사할 대상)

- [ ] **Step 1.4: 로컬에서 standalone server.js 직접 실행 (smoke)**

Run (백그라운드):
```bash
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public 2>/dev/null || mkdir -p .next/standalone/public
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
PORT=3001 bun .next/standalone/server.js > /tmp/standalone.log 2>&1 &
STAND_PID=$!
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/login
kill $STAND_PID 2>/dev/null
```
Expected:
- 응답 코드 `200`
- `/tmp/standalone.log`에 `Listening on ...` 메시지 + dynamic require 관련 에러 없음

에러 발생 시: `docx`, `dompurify` 등이 standalone trace에 누락됐을 수 있음. Next 14의 `experimental.outputFileTracingIncludes`로 명시 가능. 발생 시 사용자에게 보고 후 별도 spec.

---

## Task 2: .dockerignore 작성

**Files:**
- Create: `.dockerignore`

- [ ] **Step 2.1: .dockerignore 신규 작성**

프로젝트 루트에 `.dockerignore` 생성. 정확히 다음 내용:

```
# Version control
.git
.gitignore
.gitattributes

# Build artifacts
.next
node_modules
out

# Local env (compose가 --env-file로 명시 주입)
.env
.env.local
.env.development
.env.test
.env.production
.env*.local

# Dev tools / IDE
.vscode
.idea
.cursor
*.swp
.DS_Store

# Docs / planning (런타임 불필요)
docs
.superpowers
.claude
README.md
*.md

# Logs / temp
*.log
npm-debug.log
.cache

# Test
coverage
.nyc_output
```

이유:
- `.next`, `node_modules`: 빌더가 새로 생성
- `.env*`: secret 누출 방지 — compose `--env-file`로 런타임 주입
- `docs`, `.superpowers`, `.claude`: 컨텍스트 크기만 키움
- `*.md`: README 포함 모두 제외 (Dockerfile에서 README는 안 쓰임)

- [ ] **Step 2.2: 작성 확인**

Run: `wc -l .dockerignore && head -5 .dockerignore`
Expected: 약 30 lines. 첫 줄: `# Version control`.

---

## Task 3: Dockerfile 작성

**Files:**
- Create: `Dockerfile`

ax-dsp-search 패턴(`oven/bun:1` builder + `oven/bun:1-slim` runner)을 정렬. Next.js 14 standalone 출력에 맞게 COPY 단계 조정.

- [ ] **Step 3.1: Dockerfile 신규 작성**

프로젝트 루트에 `Dockerfile` 생성. 정확히 다음 내용:

```dockerfile
# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Builder
# ============================================
FROM oven/bun:1 AS builder
WORKDIR /app

# 빌드 타임 ARG (NEXT_PUBLIC_*만 빌드 시점 치환됨)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# 의존성 (lockfile 먼저 → 캐시 적중률 ↑)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 소스 + 빌드 (standalone 출력)
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun --bun next build

# ============================================
# Stage 2: Runner (slim)
# ============================================
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone 산출물 + static + public 복사
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

# standalone server.js는 PORT/HOSTNAME env 인식
CMD ["bun", "server.js"]
```

설계 결정:
- Stage 1은 `oven/bun:1` full (빌드 도구 포함)
- Stage 2는 `oven/bun:1-slim` (런타임만, 이미지 크기 절감)
- `NEXT_PUBLIC_*`은 ARG로 빌드 시점 클라이언트 번들에 박힘. 서버 전용 secret(`SUPABASE_SERVICE_KEY`, `GMAIL_*`)은 ARG 금지 — 런타임 env로만 주입.
- 비 root user 생성은 의도적으로 skip — ax-dsp-search 정렬 + 단순화. 필요 시 Phase 3에서 추가.

- [ ] **Step 3.2: Dockerfile lint (옵션, hadolint 있으면)**

Run: `which hadolint && hadolint Dockerfile || echo "hadolint 없음, skip"`
Expected: 통과 또는 skip. 경고는 무시.

- [ ] **Step 3.3: 실제 빌드 1회**

Run:
```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
  -t ax-homework-submission:phase2-test .
```
Expected:
- 종료 코드 0
- 마지막에 `naming to docker.io/library/ax-homework-submission:phase2-test`
- `docker images | grep ax-homework-submission` 으로 이미지 확인

빌드 실패 시:
- `bun install --frozen-lockfile` 단계: bun.lock과 package.json 불일치 가능. `bun install` 후 재시도.
- `bun --bun next build` 단계: standalone trace 누락 가능 (Task 1.4와 동일 분기).
- `COPY --from=builder` 단계: 빌더 산출물 누락. Task 1.3 점검.

- [ ] **Step 3.4: 이미지 실행 1회 (placeholder env로)**

Run:
```bash
docker run --rm -d \
  -e NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
  -p 3001:3000 \
  --name ax-hw-test \
  ax-homework-submission:phase2-test
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/login
docker logs ax-hw-test | tail -20
docker stop ax-hw-test
```
Expected:
- `200` (login 페이지)
- 로그에 `Listening on http://0.0.0.0:3000` + 에러 없음

실패 분기는 Task 1.4와 동일.

---

## Task 4: .env.example 갱신

**Files:**
- Create: `.env.example`
- (기존 `.env.local.example`은 그대로 두되, README에서 둘의 관계 명시 — Task 7에서 처리)

- [ ] **Step 4.1: 현재 .env.local.example 확인**

Run: `cat .env.local.example`
Expected:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Email notifications (Gmail SMTP)
GMAIL_USER=
GMAIL_APP_PASSWORD=
ADMIN_NOTIFICATION_EMAIL=
APP_BASE_URL=http://localhost:3000
```

- [ ] **Step 4.2: .env.example 신규 작성 (compose `--env-file` 대상)**

프로젝트 루트에 `.env.example` 생성. 정확히 다음 내용:

```
# ax-homework-submission — runtime environment template
# 사용법:
#   1. 이 파일을 .env 로 복사
#   2. 빈 값을 실제 운영 값으로 채움
#   3. docker compose --env-file .env -p ax-homework-submission up -d 로 기동
#
# .env 는 .gitignore 처리됨. 절대 커밋하지 말 것.

# --- Supabase (NEXT_PUBLIC_* 은 클라이언트 번들에 박힘) ---
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# --- Supabase 서버 전용 (절대 NEXT_PUBLIC_ prefix 금지) ---
SUPABASE_SERVICE_KEY=your-service-role-key

# --- Email (Gmail SMTP via nodemailer) ---
GMAIL_USER=
GMAIL_APP_PASSWORD=
ADMIN_NOTIFICATION_EMAIL=

# --- App base URL (이메일 본문 링크 등) ---
APP_BASE_URL=http://localhost:3000
```

차이점 from `.env.local.example`:
- 사용법 코멘트 추가 (compose 호출 라인 포함)
- 그루핑 헤더로 분류
- Vercel 시절 production/preview/development 구분 코멘트는 삭제 (Docker로 단일화)

- [ ] **Step 4.3: 작성 확인**

Run: `cat .env.example | head -10`
Expected: 위 Step 4.2의 첫 10줄.

---

## Task 5: docker-compose.yml 작성

**Files:**
- Create: `docker-compose.yml`

ax-dsp-search CLAUDE.md L346-348 패턴 동일.

- [ ] **Step 5.1: docker-compose.yml 신규 작성**

프로젝트 루트에 `docker-compose.yml` 생성. 정확히 다음 내용:

```yaml
# ax-homework-submission — docker compose
# 사용법:
#   docker compose --env-file .env -p ax-homework-submission build
#   docker compose --env-file .env -p ax-homework-submission up -d
#   docker compose -p ax-homework-submission logs -f frontend
#   docker compose -p ax-homework-submission down

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    image: ax-homework-submission:latest
    container_name: ax-homework-frontend
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # 이중 안전망: --env-file 누락 시에도 변수가 전달되도록
      NODE_ENV: production
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY}
      GMAIL_USER: ${GMAIL_USER}
      GMAIL_APP_PASSWORD: ${GMAIL_APP_PASSWORD}
      ADMIN_NOTIFICATION_EMAIL: ${ADMIN_NOTIFICATION_EMAIL}
      APP_BASE_URL: ${APP_BASE_URL}
```

설계 결정:
- `version:` 키 생략 (compose v2 권장)
- `frontend` 단일 서비스 — Supabase 는 외부 SaaS이므로 compose에 안 들어옴
- `--env-file .env` 와 `environment:` 블록 이중 — 변수 누락 시에도 안전망
- `image: ax-homework-submission:latest` 명시로 `docker images`에서 식별 용이
- `restart: unless-stopped` — 컨테이너 죽으면 자동 재시작, 단 명시적 down은 존중

- [ ] **Step 5.2: compose config 문법 검증**

`.env` 파일 없이도 syntax는 검증 가능. placeholder env로:

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL=x NEXT_PUBLIC_SUPABASE_ANON_KEY=x \
SUPABASE_SERVICE_KEY=x GMAIL_USER=x GMAIL_APP_PASSWORD=x \
ADMIN_NOTIFICATION_EMAIL=x APP_BASE_URL=x \
docker compose -p ax-homework-submission config > /dev/null
echo $?
```
Expected: `0`. config 출력이 깨지면 stderr에 YAML 에러가 표시됨 — 그 라인 수정.

- [ ] **Step 5.3: 실제 .env로 compose build + up 1회**

먼저 `.env` 생성 (gitignored — 절대 커밋 금지):

```bash
cp .env.example .env
# 그 후 에디터로 .env를 실제 값으로 채움 (사용자가 수동으로 또는 vercel env pull 등)
```

`.env`가 실제 값으로 채워졌다고 가정하고:

Run:
```bash
docker compose --env-file .env -p ax-homework-submission build
docker compose --env-file .env -p ax-homework-submission up -d
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
docker compose -p ax-homework-submission logs --tail=30 frontend
```
Expected:
- build 종료 코드 0
- up 후 컨테이너 `Up` 상태 (`docker compose ps`로 확인)
- `/login` 200 응답
- 로그에 에러 없음

확인 후 정리:
```bash
docker compose -p ax-homework-submission down
```

`.env`가 비어있거나 가짜 값이면 인증/이메일은 실패하지만 정적 응답만 통과. 머지 게이트(Task 8)에서 실제 동작 확인 필요.

---

## Task 6: docs/deployment/docker.md 작성 (Jenkins 운영 가이드)

**Files:**
- Create: `docs/deployment/docker.md`

ax-dsp-search의 운영 가이드를 본 프로젝트에 맞게 정렬. Jenkins job 설정 자체는 외부(운영팀)이므로 호출 커맨드 + 위치만 명시.

- [ ] **Step 6.1: docs/deployment/ 디렉토리는 자동 생성 (파일 작성 시)**

- [ ] **Step 6.2: docker.md 작성**

`docs/deployment/docker.md` 정확히 다음 내용:

````markdown
# Docker Deployment Guide

> ax-dsp-search와 동일한 패턴. Jenkins가 서버에서 직접 빌드/기동하며 컨테이너 레지스트리를 쓰지 않는다.

## 사전 준비

1. **Bun 설치 검증** — 빌드 호스트에서 컨테이너 외부 도구가 필요하지 않다 (Dockerfile이 자체 처리). 단, 로컬 검증 시에는 `bun --version`이 1.x여야 함.
2. **Docker / Docker Compose v2** — `docker compose version` 확인.
3. **`.env` 파일** — 운영 호스트의 프로젝트 디렉토리에 `.env.example`을 복사해서 실제 값으로 채움. 권한 `chmod 600 .env` 권장.

## 환경변수

`.env.example` 참조. 모든 키는 compose의 `--env-file .env` 로만 주입되며, 어떤 형태로도 커밋하지 않는다.

| 키 | 빌드 ARG | 런타임 env | 비고 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | 클라이언트 번들에 박힘 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | 클라이언트 번들에 박힘 |
| `SUPABASE_SERVICE_KEY` | ✗ | ✓ | 서버 전용. 빌드 ARG 절대 금지 |
| `GMAIL_USER` | ✗ | ✓ | nodemailer SMTP |
| `GMAIL_APP_PASSWORD` | ✗ | ✓ | Google 앱 비밀번호 |
| `ADMIN_NOTIFICATION_EMAIL` | ✗ | ✓ | 알림 수신처 |
| `APP_BASE_URL` | ✗ | ✓ | 이메일 본문 URL |

## Jenkins 단계 (운영팀)

ax-dsp-search 와 동일한 3-step:

```bash
# 1) repo checkout — Jenkins SCM 단계
# (브랜치는 보통 main)

# 2) 빌드
docker compose --env-file .env -p ax-homework-submission build

# 3) 기동
docker compose --env-file .env -p ax-homework-submission up -d
```

`-p ax-homework-submission` 프로젝트 네임이 다른 서비스와 컨테이너 이름이 겹치지 않게 보장한다.

배포 알림은 Jenkinsfile post-deploy 단계에서 Slack hook 호출 — ax-dsp-search와 동일. 본 plan은 Jenkinsfile 자체는 다루지 않음 (서버에 gitignored 형태로 존재).

## 헬스 체크

기동 직후:

```bash
# 컨테이너 상태
docker compose -p ax-homework-submission ps

# 로그
docker compose -p ax-homework-submission logs --tail=50 frontend

# HTTP 응답
curl -I http://localhost:3000/login   # → 200
curl -I http://localhost:3000/        # → 302 → /login (미인증)
```

## 롤백

빌드 캐시에 이전 이미지가 있으면:

```bash
docker images | grep ax-homework-submission
# 원하는 IMAGE_ID 확인
docker tag <OLD_IMAGE_ID> ax-homework-submission:latest
docker compose -p ax-homework-submission up -d
```

또는 git revert + 재빌드. PR 단위로 revert 가능하도록 작은 머지 권장.

## 운영 시 자주 쓰는 명령

```bash
# 컨테이너 재시작 (이미지 재빌드 없이)
docker compose -p ax-homework-submission restart frontend

# 로그 follow
docker compose -p ax-homework-submission logs -f frontend

# 컨테이너 안에서 디버깅
docker compose -p ax-homework-submission exec frontend sh

# 깨끗하게 내리기 (볼륨/네트워크까지)
docker compose -p ax-homework-submission down --volumes --remove-orphans
```

## 알려진 함정

- **`.env` 파일 누락**: `docker compose --env-file .env ...`에서 파일이 없으면 compose가 조용히 빈 문자열 주입 → 인증/이메일 silent fail. `[ -f .env ] || exit 1` 가드를 Jenkinsfile에 두는 것을 권장.
- **`NEXT_PUBLIC_*` 빌드 ARG 누락**: 클라이언트 번들에 placeholder가 박혀 SDK 호출이 fail. 빌드 로그에서 ARG 라인을 확인.
- **`SUPABASE_SERVICE_KEY` 를 빌드 ARG 로 넘김**: 이미지 layer에 박혀 보안 사고. 절대 `--build-arg`로 전달 금지 — `environment:` 또는 `--env-file`로만.
- **standalone trace 누락**: `docx`, `dompurify` 등 dynamic require가 `.next/standalone`에 안 따라오면 런타임 import 실패. `next.config.mjs`의 `experimental.outputFileTracingIncludes`로 명시 가능. Phase 2 머지 게이트(컨테이너 안에서 export 1회)에서 catch.
````

- [ ] **Step 6.3: 작성 확인**

Run: `wc -l docs/deployment/docker.md && head -5 docs/deployment/docker.md`
Expected: 약 100+ 줄. 첫 줄: `# Docker Deployment Guide`.

---

## Task 7: README.md 교체 (Vercel 섹션 → Docker 섹션)

**Files:**
- Modify: `README.md`

- [ ] **Step 7.1: 현재 README 끝부분 확인**

Run: `tail -50 README.md`
Expected: `## Deployment (Vercel)` 섹션 + 환경변수 표 + `## CI` 섹션.

- [ ] **Step 7.2: Vercel + CI 섹션을 Docker 섹션으로 교체**

README.md의 32번째 줄(`## Deploy on Vercel`) 부터 파일 끝까지를 모두 제거하고 다음으로 교체:

```markdown

## Getting Started (Local)

```bash
bun install
cp .env.local.example .env.local   # 그 후 실제 값 채움
bun run dev
```

`http://localhost:3000` 접속.

## Deployment (Docker + Jenkins)

배포는 Jenkins가 서버에서 직접 빌드 + 기동한다. 컨테이너 레지스트리 없음. 자세한 운영 가이드: [`docs/deployment/docker.md`](docs/deployment/docker.md).

핵심 흐름:

```bash
cp .env.example .env   # 운영 호스트에서, 실제 값 채움. chmod 600 .env 권장.
docker compose --env-file .env -p ax-homework-submission build
docker compose --env-file .env -p ax-homework-submission up -d
```

## CI

`.github/workflows/ci.yml`이 PR과 `main` push 시 다음을 검증한다 (Bun 기반):

- `bun install --frozen-lockfile`
- `bun run lint`
- `bun run typecheck`
- `bun run build` (placeholder env)

로컬에서 동일 검증:
```bash
bun install && bun run lint && bun run typecheck && bun run build
```
```

설계 결정:
- `.env.local.example` (로컬 개발용) 과 `.env.example` (compose용) 명시적 구분
- Vercel 환경변수 표는 모두 제거 — 이제 무관
- CI 섹션은 bun 명령으로 갱신 (Phase 1과 정합)
- Next.js 기본 boilerplate 인트로(L1-31)는 그대로 둠 — 향후 별도 정리 spec

- [ ] **Step 7.3: 변경 확인**

Run: `tail -40 README.md`
Expected: 위 Step 7.2의 형태. `## Deploy on Vercel`, `## Deployment (Vercel)`, `Vercel bot` 같은 단어가 나오면 교체 실패.

Run: `grep -i vercel README.md && echo "VERCEL FOUND!" || echo "ok, no vercel refs"`
Expected: `ok, no vercel refs`.

---

## Task 8: 폐기된 docs/migration/vercel-to-docker.md 삭제

**Files:**
- Delete: `docs/migration/vercel-to-docker.md`

- [ ] **Step 8.1: 파일 존재 확인**

Run: `ls docs/migration/vercel-to-docker.md 2>&1`
Expected: 파일 경로 출력 (~14KB).

- [ ] **Step 8.2: 삭제**

Run:
```bash
git rm docs/migration/vercel-to-docker.md
# 디렉토리가 비면 같이 정리
rmdir docs/migration 2>/dev/null || true
```
Expected: `rm 'docs/migration/vercel-to-docker.md'` 출력.

- [ ] **Step 8.3: 다른 곳에서 이 파일 참조하는지 확인**

Run:
```bash
grep -rn "vercel-to-docker" --include="*.md" --include="*.ts" --include="*.tsx" --include="*.mjs" . 2>/dev/null | grep -v node_modules
```
Expected: 출력 없음 (README에서도 이미 제거됨).

남아있으면 해당 위치 수정.

---

## Task 9: 머지 게이트 4종 검증

각 게이트 통과 후에만 PR 머지 가능. 사용자 또는 운영팀이 확인.

- [ ] **Step 9.1: Gate 1 — `.next/standalone/server.js` 생성**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
bun run build
ls -la .next/standalone/server.js
```
Expected: 파일 존재.

- [ ] **Step 9.2: Gate 2 — compose build + up 성공**

Run (`.env`가 실제 값으로 채워진 상태):
```bash
docker compose --env-file .env -p ax-homework-submission build
docker compose --env-file .env -p ax-homework-submission up -d
docker compose -p ax-homework-submission ps
```
Expected: `frontend` 컨테이너 `Up` 상태.

- [ ] **Step 9.3: Gate 3 — 컨테이너 안에서 로그인 + 어드민 이메일 1회**

수동 검증. 다음 시나리오:
1. 브라우저로 `http://<container-host>:3000/login` 접속
2. Google OAuth로 로그인 (어드민 계정)
3. `/admin` 진입 → 임의의 액션으로 이메일 발송 1건 (예: 새 homework 게시)
4. `ADMIN_NOTIFICATION_EMAIL` 받은 편지함 확인

실패 분기:
- 로그인 실패 → `NEXT_PUBLIC_*` ARG 누락 또는 SUPABASE_URL 오타
- 이메일 발송 실패 → `GMAIL_USER`/`GMAIL_APP_PASSWORD` 또는 Bun + nodemailer 호환성 문제. `docker compose logs frontend`에서 stack trace 확인.

검증 후 정리:
```bash
docker compose -p ax-homework-submission down
```

- [ ] **Step 9.4: Gate 4 — PR CI 그린**

Phase 1에서 갱신한 `.github/workflows/ci.yml` (bun 기반)이 그대로 동작.

PR push 후:
```bash
gh -R claud-park/ax-homework-submission pr checks
```
Expected: `verify` job `pass`.

실패 시 `gh run view --log-failed`로 원인 추적.

---

## Task 10: 커밋 분할

본 plan은 다음 순서로 커밋 (각 커밋은 독립적으로 revert 가능):

- [ ] **Step 10.1: Commit 1 — next.config standalone**

```bash
git add next.config.mjs
git commit -m "$(cat <<'EOF'
feat(build): enable Next.js standalone output

Docker runner가 .next/standalone/server.js 를 직접 실행 가능하게.
빌드 산출물에 의존하는 모든 라이브러리는 자동 trace 됨.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10.2: Commit 2 — Docker artifacts**

```bash
git add Dockerfile .dockerignore docker-compose.yml .env.example
git commit -m "$(cat <<'EOF'
feat(docker): add Dockerfile + compose + ignore + env template

- Dockerfile: oven/bun:1 builder → oven/bun:1-slim runner, multi-stage
- docker-compose.yml: frontend 단일 서비스, --env-file 강제 + environment 이중망
- .dockerignore: 빌드 컨텍스트 최소화
- .env.example: 모든 런타임 env 키 + 사용법 안내

ax-dsp-search 패턴 정렬.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10.3: Commit 3 — Jenkins 운영 가이드**

```bash
git add docs/deployment/docker.md
git commit -m "$(cat <<'EOF'
docs(deployment): Jenkins + Docker 운영 가이드

ax-dsp-search 패턴 동일.
- 환경변수 표 (빌드 ARG vs 런타임 env 구분)
- Jenkins 3-step 명령
- 헬스체크 / 롤백 / 자주 쓰는 명령 / 알려진 함정

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10.4: Commit 4 — Vercel 잔재 제거**

```bash
git add README.md docs/migration/vercel-to-docker.md
git commit -m "$(cat <<'EOF'
chore(vercel): remove Vercel migration doc + replace README sections

- docs/migration/vercel-to-docker.md 삭제 (폐기된 Vercel 결정 시절 산물)
- README: Vercel 배포 + CI(npm) 섹션 → Docker (compose) + CI(bun) 섹션

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10.5: 커밋 로그 확인**

Run: `git log --oneline main..HEAD`
Expected: Phase 1의 3개 + Phase 2의 4개 = 총 7개. 메시지 prefix가 모두 분리되어 있음.

---

## 완료 후 확인 사항

- [ ] `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `docs/deployment/docker.md` 신규 존재
- [ ] `docs/migration/vercel-to-docker.md` 삭제, `docs/migration/` 디렉토리 비면 정리
- [ ] `next.config.mjs`에 `output: 'standalone'`
- [ ] `README.md`에 `vercel` 단어가 더는 없음
- [ ] 4종 머지 게이트 모두 통과
- [ ] feature/ci-cd 브랜치에 Phase 1(3) + Phase 2(4) = 7개 신규 commit
- [ ] PR 작성은 별도 단계 (사용자 결정)
