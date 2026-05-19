# Vercel → Docker 마이그레이션 가이드

> **대상 독자:** LLM 에이전트 또는 엔지니어. 이 문서 하나만 따라가면 Vercel 자동 배포를 자체 Docker 컨테이너 배포로 옮길 수 있다.

> **현재 상태(작성 시점):** 본 프로젝트는 Vercel 자동 배포 + GitHub Actions CI(lint+typecheck+build)로 운영 중. 이 문서를 실행하기 전에는 어떤 파일도 변경되지 않은 상태여야 한다.

> **Reference:** `vibe-flo/agent-toolkit/vibe-starter/templates/nextjs-csr/` (CSR/Nginx 전제이므로 1:1 복사 불가. `container-build.sh` 패턴과 docker-compose 구조만 차용).

---

## 1. Why migrate?

- Vercel 한도/비용 초과 (특히 Hobby commercial 금지)
- self-host로 인프라 일원화 필요
- Edge network latency가 우리 사용자 분포에 비효율
- 컴플라이언스 요구로 데이터 거주 통제 필요

위 사유 중 하나라도 해당하면 마이그레이션 진행.

---

## 2. 사전 조건 체크리스트

- [ ] Docker 또는 Podman 설치 — `docker --version` 또는 `podman --version` 성공
- [ ] 컨테이너 레지스트리 결정 — GHCR(권장, 무료) / Docker Hub / private
- [ ] 배포처 결정 — Cloud Run / Fly.io / Railway / 자체 VM + Nginx 리버스 프록시
- [ ] 도메인 + TLS 인증서 확보 (자체 호스팅 시)
- [ ] 모든 Vercel 환경변수를 안전한 곳(1Password 등)에 백업

---

## 3. Reference 비교

| 항목 | reference (nextjs-csr) | 본 프로젝트 (SSR) |
|---|---|---|
| 렌더링 | CSR + 정적 export (`next export` → `out/`) | SSR + middleware + route handlers |
| 서빙 | Nginx (정적 + Action Log proxy) | Node `next start` 또는 standalone `node server.js` |
| Dockerfile builder | `npm run build:${env}` → `out/` 디렉토리 산출 | `next build` (standalone) → `.next/standalone` 산출 |
| Dockerfile runner | `nginx:alpine` + `nginx.conf` | `node:20-alpine` + `node server.js` |
| 빌드 ARG | `NEXT_PUBLIC_*` 만 | `NEXT_PUBLIC_*` 만 (서버 secret은 런타임 env) |
| 포트 | 80 | 3000 |
| Nginx 설정 | 필요 (CORS proxy 등) | 불필요 (앱이 직접 응답). 리버스 프록시는 외부에서 |

**가져올 수 있는 것:** `container-build.sh` (Docker/Podman 자동 감지 + 친절한 출력), docker-compose 구조, .dockerignore.

**다시 작성할 것:** Dockerfile runner stage (Nginx → Node).

---

## 4. 단계별 실행

각 Step은 **변경 파일 / 명령 / 검증** 3요소를 포함한다.

### Step 1: `next.config.mjs`에 standalone 출력 추가

**변경 파일:** `next.config.mjs`

기존:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { domains: ['lh3.googleusercontent.com'] },
}
export default nextConfig
```

변경 후:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { domains: ['lh3.googleusercontent.com'] },
}
export default nextConfig
```

**명령:**
```bash
npm run build
```

**검증:** `.next/standalone/server.js` 파일이 생성됨. 다음 명령으로 확인:
```bash
ls -la .next/standalone/server.js && ls -la .next/standalone/.next/static
```
둘 다 존재해야 함. `static`이 없으면 Step 2 Dockerfile의 COPY 단계에서 수동 복사 필요(아래 참고).

---

### Step 2: `Dockerfile` 작성

**새 파일:** `Dockerfile` (프로젝트 루트)

```dockerfile
# Next.js SSR Production Dockerfile
# Standalone output → Node 런타임으로 직접 서빙

# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app

# 빌드 타임 ARG (NEXT_PUBLIC_*만 빌드 시점 치환됨)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# 의존성 설치
COPY package*.json ./
RUN npm ci --omit=dev=false

# 소스 복사 + 빌드 (standalone 출력)
COPY . .
RUN npm run build

# ============================================
# Stage 2: Runner
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 비 root 유저
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone 산출물 + static + public 복사
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
```

**명령:**
```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key \
  -t ax-homework-submission:local .
```

**검증:** `docker images | grep ax-homework-submission` 으로 이미지 확인. 빌드 실패 시 로그에서 단계별 원인 확인.

> **주의:** `public/` 디렉토리가 없으면 마지막 COPY가 fail. 프로젝트에 `public/`이 없다면 `mkdir public && touch public/.gitkeep`로 빈 디렉토리 생성 후 commit.

---

### Step 3: `.dockerignore` 작성

**새 파일:** `.dockerignore` (프로젝트 루트)

```
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
.env.local
.env.development
.env.test
.env.production
.next
out
.vscode
.idea
docs
.superpowers
*.md
```

reference의 .dockerignore에 `docs`, `.superpowers` 추가 (빌드 컨텍스트 크기 절감).

---

### Step 4: `docker/docker-compose.yml` 작성 (로컬 검증용)

**새 디렉토리:** `docker/`
**새 파일:** `docker/docker-compose.yml`

```yaml
# ax-homework-submission — Docker Compose (로컬 검증/개발용)

version: '3.8'

services:
  app:
    build:
      context: ..
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    container_name: ax-homework-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - ../.env.production
    # healthcheck:
    #   test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/"]
    #   interval: 30s
    #   timeout: 10s
    #   retries: 3
```

**명령:** (한 번에 build + run)
```bash
cd docker && docker compose up --build
```

**검증:** http://localhost:3000 응답 확인. middleware/auth 동작은 Step 7 이후 진짜 env로 재기동 후 확인.

---

### Step 5: `container-build.sh` 작성

**새 파일:** `container-build.sh` (프로젝트 루트, 실행 권한 필요)

reference의 `container-build.sh`를 그대로 가져오되 마지막 안내 메시지의 포트만 `3000`으로 수정. 전체 내용:

```bash
#!/bin/bash
set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo "=================================="
echo "🚀 Container Build Script"
echo "=================================="

error_exit() { echo -e "${RED}✗ Error: $1${NC}" >&2; exit 1; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

# 본 스크립트는 reference의 "Podman 자동 설치" 기능을 의도적으로 제외했다.
# 자체 호스팅 환경에서는 Docker가 사전 설치돼 있다고 가정한다.
# 미설치 시 자동 설치가 필요하면 reference container-build.sh의 install_podman() 함수를
# 그대로 복사해 넣고, 아래 "Docker 또는 Podman이 필요합니다" 분기에서 호출하면 된다.

CONTAINER_CMD=""
if command -v docker &> /dev/null && docker ps &> /dev/null; then
  CONTAINER_CMD="docker"; success "Docker를 사용합니다"
elif command -v podman &> /dev/null && podman ps &> /dev/null; then
  CONTAINER_CMD="podman"; success "Podman을 사용합니다"
else
  error_exit "Docker 또는 Podman이 필요합니다. https://docs.docker.com/get-docker/ 참고"
fi

[ -d "node_modules" ] || { info "npm install..."; npm install || error_exit "의존성 설치 실패"; }

PROJECT_NAME=$(grep -o '"name": *"[^"]*"' package.json | sed 's/"name": *"\(.*\)"/\1/')
IMAGE_NAME="${1:-${PROJECT_NAME}:latest}"
info "이미지 이름: $IMAGE_NAME"

[ -f "Dockerfile" ] || error_exit "Dockerfile이 없습니다"

# 빌드 ARG는 .env.production에서 읽거나 사용자 입력으로 받기 (예시는 환경변수에서 직접)
SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-}
SUPABASE_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}
[ -z "$SUPABASE_URL" ] && error_exit "NEXT_PUBLIC_SUPABASE_URL 환경변수가 필요합니다 (export 후 재실행)"
[ -z "$SUPABASE_KEY" ] && error_exit "NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다"

BUILD_START=$(date +%s)
$CONTAINER_CMD build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_KEY" \
  -t "$IMAGE_NAME" . || error_exit "빌드 실패"
BUILD_END=$(date +%s)

success "빌드 성공! 🎉"
echo "빌드 시간: $((BUILD_END - BUILD_START))초"
echo ""
echo "실행:"
echo "  $CONTAINER_CMD run --env-file .env.production -p 3000:3000 $IMAGE_NAME"
echo "확인: http://localhost:3000"
```

**명령:**
```bash
chmod +x container-build.sh
export NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=...
./container-build.sh
```

**검증:** 종료 메시지 "빌드 성공" + `docker images | grep ax-homework-submission`.

---

### Step 6: `package.json`에 `container:build` 스크립트 추가

**변경 파일:** `package.json`

scripts 블록에 추가:
```json
"container:build": "bash container-build.sh"
```

기존 typecheck 다음에 (쉼표 위치 주의):
```json
    "typecheck": "tsc --noEmit",
    "container:build": "bash container-build.sh"
```

**명령/검증:** `npm run container:build` 가 위 스크립트를 실행하면 됨.

---

### Step 7: 런타임 env 이전

**새 파일:** `.env.production` (gitignored — `.gitignore`에 `.env*.local`이 있으나 `.env.production`은 명시적으로 무시 항목에 추가 필요)

`.gitignore`에 한 줄 추가:
```
.env.production
```

`.env.production` 내용 (Vercel 대시보드에서 export — `vercel env pull .env.production` CLI 사용 가능):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx
SUPABASE_SERVICE_KEY=eyJxxxx
GMAIL_USER=admin@example.com
GMAIL_APP_PASSWORD=xxxx
ADMIN_NOTIFICATION_EMAIL=admin@example.com
APP_BASE_URL=https://your-production-domain.com
```

**명령 (Vercel CLI로 가져오기):**
```bash
npx vercel env pull .env.production --environment=production
```
또는 대시보드에서 수동 복사.

**검증:** 컨테이너 실행 후 middleware 보호 라우트 동작:
```bash
docker run --rm --env-file .env.production -p 3000:3000 ax-homework-submission:latest
# 다른 터미널에서
curl -I http://localhost:3000/  # → 302 redirect to /login (인증 없이 보호 라우트 접근 시)
```

---

### Step 8: GitHub Actions Docker 빌드/푸시 워크플로 (옵션, 권장)

**새 파일:** `.github/workflows/docker.yml`

GHCR(ghcr.io/claud-park/ax-homework-submission)로 자동 푸시. tag 또는 main push 시 트리거.

```yaml
name: Docker Build & Push

on:
  push:
    branches: [main]
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            NEXT_PUBLIC_SUPABASE_URL=${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**사전 조건:**
1. repo Settings → Actions → General → Workflow permissions: **Read and write permissions** 체크
2. repo Settings → Secrets and variables → Actions → Repository secrets에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 등록

**검증:** main push 후:
```bash
gh -R claud-park/ax-homework-submission run list --workflow=docker.yml --limit 1
```
성공 후 `ghcr.io/claud-park/ax-homework-submission:main` 으로 pull 가능.

---

### Step 9: Vercel 프로젝트 정리

1. Vercel 대시보드 → 프로젝트 → Settings → Git → **Disconnect**
2. 환경변수 백업 확인 (`vercel env pull` 결과물이 안전한 곳에 있는지)
3. 도메인이 Vercel을 가리키고 있으면 새 호스팅으로 A/CNAME 변경
4. 모든 검증 통과 후 프로젝트 삭제(선택) — 즉시 삭제하지 말고 1-2주 두고 관찰 권장

---

### Step 10: 배포처별 가이드

| 배포처 | 한 줄 요약 |
|---|---|
| Cloud Run | `gcloud run deploy --image ghcr.io/claud-park/ax-homework-submission:main --port 3000 --env-vars-file env.yaml` (env.yaml로 secret 전달) |
| Fly.io | `fly launch --image ghcr.io/...` → `fly.toml` 작성 → `fly secrets set ...` → `fly deploy` |
| Railway | GHCR 이미지를 Railway 프로젝트에 연결, Variables에 env 등록 |
| 자체 VM | Nginx/Caddy 리버스 프록시(443 → 3000) + systemd unit으로 `docker run` 관리 |

각 배포처는 별도 spec으로 detail 작성 (본 가이드 범위 밖).

---

## 5. 검증 체크리스트

전체 마이그레이션 후 다음을 순서대로 확인:

- [ ] `docker run --env-file .env.production -p 3000:3000 ax-homework-submission:latest` 기동 성공
- [ ] `curl -I http://localhost:3000/` → `302 Found` (`/login`으로 redirect)
- [ ] 브라우저로 `/login` 접속 → Google OAuth 동작
- [ ] 챔피언 로그인 후 `/homework` 접근 가능
- [ ] 어드민 계정 로그인 → `/admin/kanban` 접근 가능
- [ ] `/api/submissions` POST (파일 업로드 포함) 동작
- [ ] 이메일 발송 확인 (실제 SMTP 호출 — Gmail에서 수신 확인)
- [ ] DnD 상태 변경 시 DB 반영 확인
- [ ] 미인증 사용자가 `/admin/*` 접근 시 `/admin/login`으로 redirect

체크리스트 중 하나라도 실패하면 해당 항목 로그 확인 후 root cause 추적. 보통 원인은 env 누락 또는 standalone 출력 누락.

---

## 6. 롤백 절차

마이그레이션 후 문제 발견 시:

1. Vercel 대시보드 → 프로젝트 → Settings → Git → **Connect Git Repository** 재연결
2. Vercel 환경변수가 모두 살아있는지 확인 (백업본 복원)
3. main 또는 production 브랜치에 dummy commit push → Vercel 재배포 트리거
4. 도메인 DNS를 Vercel로 다시 가리킴
5. GitHub Actions의 `docker.yml`은 disable (또는 트리거 조건만 수동으로)

복귀 소요시간: 5-15분 (DNS TTL 의존).

---

## 7. 알려진 차이점 / 함정

- **`output: 'standalone'`** 없이는 `.next/standalone/server.js`가 생성되지 않아 Dockerfile COPY가 fail. Step 1 누락 주의.
- **`public/` 디렉토리**가 없으면 Dockerfile 마지막 COPY가 fail. 빈 디렉토리라도 생성 필요.
- **Supabase URL/anon key**는 빌드 ARG로 들어가야 함 — 런타임에만 주입하면 클라이언트 번들에 들어가지 않아 브라우저 SDK 호출이 fail.
- **서버 전용 secret**(`SUPABASE_SERVICE_KEY` 등)은 ARG가 아닌 **런타임 env**로만 전달. ARG로 넘기면 이미지 layer에 박혀 보안 사고.
- **middleware의 cookie 처리**는 Vercel/Node 양쪽 동일. 별도 조정 불필요.
- **이미지 도메인 화이트리스트**(`next.config.mjs`의 `images.domains`)는 두 환경 동일.

---

## 8. 변경 파일 요약 (체크용)

마이그레이션 완료 시 다음 파일들이 존재/변경되어야 함:

| 파일 | 상태 |
|---|---|
| `next.config.mjs` | 수정 (`output: 'standalone'`) |
| `Dockerfile` | 신규 |
| `.dockerignore` | 신규 |
| `docker/docker-compose.yml` | 신규 |
| `container-build.sh` | 신규 (chmod +x) |
| `package.json` | 수정 (`container:build` 스크립트) |
| `.env.production` | 신규, gitignored |
| `.gitignore` | 수정 (`.env.production` 추가) |
| `.github/workflows/docker.yml` | 신규 (옵션) |

기존 `.github/workflows/ci.yml` 은 그대로 둔다 — Docker 빌드와 별개로 lint/typecheck/build 검증은 계속 필요.
