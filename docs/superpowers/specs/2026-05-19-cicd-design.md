---
title: CI/CD 도입 설계 — Vercel 자동 배포 + GitHub Actions CI, Docker 마이그레이션 가이드
date: 2026-05-19
status: approved
related:
  - reference: /Users/claud_01/Documents/flo/vibe-flo/agent-toolkit/vibe-starter/templates/nextjs-csr (CSR/Nginx, 본 프로젝트는 SSR이라 1:1 차용 불가)
---

# CI/CD 도입 설계

## 1. 배경

현재 `ax-homework-submission`은 Next.js 14 App Router 기반 **SSR** 애플리케이션이다.
- Supabase 인증 미들웨어(`middleware.ts`)와 약 20개의 server route handler 사용
- nodemailer로 Gmail SMTP를 통해 이메일 발송
- 정적 export(`next export`)는 불가능 → Node 런타임 필요
- 현재 CI/CD 파이프라인 없음. 배포는 수동

reference로 제공된 `vibe-flo/agent-toolkit/vibe-starter/templates/nextjs-csr`는 CSR + 정적 export → Nginx 서빙을 전제로 한 Dockerfile/container-build 스크립트를 제공한다. 본 프로젝트(SSR)에는 그대로 적용할 수 없으나, "컨테이너 빌드 스크립트로 이미지를 만든다"는 패턴은 그대로 가져올 수 있다. reference에는 GitHub Actions 워크플로가 포함되어 있지 않다.

## 2. 의사결정 요약

| 항목 | 결정 | 비고 |
|---|---|---|
| MVP 배포 방식 | **Vercel 자동 배포** | push-to-deploy. SSR/middleware/API routes 모두 native 지원 |
| MVP CI | **GitHub Actions: lint + typecheck + build** | Vercel 빌드 대기 전 빠른 PR 피드백 |
| 향후(런칭 시) | **Docker 이미지 빌드(reference 스타일)** | 본 PR에서는 **문서만** 작성, 코드는 손대지 않음 |
| 문서 작성 대상 | **LLM 에이전트** | 단계별 실행 가능한 형태(파일 내용 풀로 포함) |

## 3. Phase 1 — Vercel + GitHub Actions CI

### 3.1 Vercel 자동 배포 (외부 설정, 코드 변경 없음)

- Vercel 프로젝트를 GitHub repo `claud-park/ax-homework-submission`에 연결
- `main` push → Production 배포
- PR → Preview 배포 (Vercel bot이 PR에 URL 코멘트)
- 별도 `vercel.json` 불필요 — Next.js 프레임워크 자동 감지

**Vercel 대시보드에 등록할 환경변수**

| 변수 | 환경 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | 클라이언트 노출 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | 클라이언트 노출 OK |
| `SUPABASE_SERVICE_KEY` | Production, Preview | 서버 전용 |
| `GMAIL_USER` | Production, Preview | 서버 전용 |
| `GMAIL_APP_PASSWORD` | Production, Preview | 서버 전용 |
| `ADMIN_NOTIFICATION_EMAIL` | Production, Preview | 서버 전용 |
| `APP_BASE_URL` | Production | 실제 도메인 (예: `https://ax-homework.example.com`) |
| `APP_BASE_URL` | Preview | `https://${VERCEL_URL}` 권장 (브랜치별 URL) |

> **이메일 본문에 들어가는 URL 일관성**: Preview에서 발송되는 이메일이 Production 도메인을 가리키지 않도록 Preview는 `VERCEL_URL` 기반으로 설정한다. nodemailer 호출부가 `APP_BASE_URL`을 참조하는지 확인이 필요(미참조 시 본 spec 범위 밖, 추후 정리).

### 3.2 GitHub Actions CI workflow

**파일**: `.github/workflows/ci.yml`

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

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://placeholder.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: placeholder-anon-key
```

**설계 결정 근거**
- **단일 잡 직렬**: lint → typecheck → build 순서로 fail-fast. PR 체크 1개로 단순.
- **concurrency**: 같은 ref에 새 push가 오면 이전 실행 취소 → 분 단위 시간/비용 절감.
- **빌드 env는 placeholder만**: middleware/route handler는 런타임에 실행되며 빌드 시점에는 호출되지 않는다. 진짜 secret을 CI에 넣지 않아 leak 위험이 없다.
- **Node 20 LTS**: Next.js 14 권장 버전.
- **`npm ci`**: lockfile 엄격 모드로 재현 가능 빌드 보장.

### 3.3 `package.json` 수정

추가할 스크립트 한 줄:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

기존 `dev`, `build`, `start`, `lint`는 그대로 둔다.

### 3.4 README.md 갱신

Vercel 배포 + 환경변수 등록 절차를 한 섹션으로 추가:

```markdown
## Deployment (Vercel)

1. https://vercel.com/new 에서 GitHub repo 임포트
2. Framework Preset: Next.js (자동 감지)
3. Environment Variables 등록:
   - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (모든 환경)
   - SUPABASE_SERVICE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_NOTIFICATION_EMAIL (Production/Preview)
   - APP_BASE_URL: Production은 실제 도메인, Preview는 `https://${VERCEL_URL}`
4. Deploy

이후 `main` push 시 자동 Production 배포, PR open 시 자동 Preview 배포.

## CI

`.github/workflows/ci.yml`이 PR과 main push 시 lint + typecheck + build를 검증한다.
```

## 4. Phase 2 — Vercel → Docker 마이그레이션 가이드 (문서만)

**파일**: `docs/migration/vercel-to-docker.md`

본 PR에서는 문서만 작성한다. **코드(Dockerfile, container-build.sh 등) 생성은 하지 않는다.** 이유: 현재 MVP 단계에서는 Vercel만으로 충분하며, 컨테이너 자산이 미리 생성되면 유지보수 부담만 늘어난다.

### 4.1 문서 구조

```
1. Why migrate?
   - Vercel 제약/비용 검토 시점, self-host 동기

2. 사전 조건 체크리스트
   - Docker 또는 Podman 설치 확인
   - 컨테이너 레지스트리 결정 (GHCR / Docker Hub / private)
   - 배포처 결정 (자체 서버 / Cloud Run / Fly.io / Railway)
   - 도메인 + 리버스 프록시 (Nginx/Caddy) 준비

3. Reference 비교
   - vibe-flo nextjs-csr 템플릿 경로 명시
   - 차이점 표: CSR/Nginx vs SSR/Node
   - 가져올 수 있는 것: container-build.sh 패턴, docker-compose 구조
   - 다시 작성할 것: Dockerfile (Nginx → node server.js)

4. 단계별 실행 (Step 1-10)

   Step 1: next.config.mjs 수정
     - 변경 파일: next.config.mjs
     - 추가: output: 'standalone'
     - 검증: npm run build 후 .next/standalone 디렉토리 생성 확인

   Step 2: Dockerfile 작성
     - 새 파일: Dockerfile
     - 내용: multi-stage (node:20-alpine builder → node:20-alpine runner)
     - 빌드 타임 ARG: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
     - 런타임 env: 컨테이너 실행 시 주입 (서버 전용 secret)
     - 포트: 3000
     - 시작 명령: node server.js
     - [전체 Dockerfile 코드블록 포함]

   Step 3: .dockerignore 작성
     - 새 파일: .dockerignore
     - reference의 .dockerignore 그대로 복사 가능
     - [전체 코드블록 포함]

   Step 4: docker-compose 작성
     - 새 파일: docker/docker-compose.yml
     - 포트: 3000:3000
     - env_file: ../.env.production
     - [전체 코드블록 포함]

   Step 5: container-build.sh 작성
     - 새 파일: container-build.sh
     - reference 스크립트 거의 그대로 복사, 포트 안내만 3000으로 수정
     - [전체 코드블록 포함, 수정 부분 강조]

   Step 6: package.json 스크립트 추가
     - 변경 파일: package.json
     - 추가: "container:build": "bash container-build.sh"

   Step 7: 런타임 env 이전
     - 새 파일: .env.production (gitignored)
     - Vercel 대시보드에서 export한 모든 env를 키-값으로 옮김
     - 검증: docker run --env-file .env.production ...

   Step 8: GitHub Actions Docker 빌드/푸시 워크플로 (옵션, 권장)
     - 새 파일: .github/workflows/docker.yml
     - 트리거: push to main, 또는 tag v*
     - 빌드 후 GHCR(ghcr.io/claud-park/ax-homework-submission)에 push
     - [전체 워크플로 코드블록 포함]
     - 사전조건: repo Settings → Actions → Workflow permissions → Read and write

   Step 9: Vercel 프로젝트 정리
     - Vercel 대시보드 → Settings → Git → Disconnect
     - 환경변수 백업 후 프로젝트 삭제(선택)

   Step 10: 배포처별 가이드 링크
     - Cloud Run, Fly.io, Railway, 직접 VM (Nginx 리버스 프록시) 각각 한 줄 가이드

5. 검증 체크리스트
   - [ ] docker run 후 http://localhost:3000 응답
   - [ ] 로그인 → middleware 리다이렉트 동작
   - [ ] /api/submissions POST 동작
   - [ ] 이메일 발송 동작 (실제 SMTP 호출 확인)
   - [ ] /admin 보호 라우트 동작

6. 롤백 절차
   - Vercel 재연결 (5분 내 복귀 가능)
   - GitHub Actions에서 docker.yml 비활성화 또는 삭제
   - .env.production 백업본 보관

7. 알려진 차이점 (reference vs 본 프로젝트)
   - reference: CSR, 정적 export, Nginx, Action Log proxy
   - 본 프로젝트: SSR, Node 런타임, middleware/server actions, Nginx 불필요(직접 노출 또는 리버스 프록시)
```

### 4.2 문서 작성 원칙

- **각 Step은 "변경 파일 / 명령 / 검증" 3요소를 모두 포함**
- **파일 내용은 코드블록으로 풀로 포함** — LLM 에이전트가 grep/탐색 없이 바로 적용 가능
- **외부 링크 최소화** — 링크가 깨져도 문서가 자립
- **명령은 macOS/Linux 양쪽 표기**

## 5. 변경 파일 목록 (Phase 1 구현 시)

**신규 생성**
- `.github/workflows/ci.yml`
- `docs/migration/vercel-to-docker.md`
- `docs/superpowers/specs/2026-05-19-cicd-design.md` (본 문서)

**수정**
- `package.json` — `"typecheck": "tsc --noEmit"` 한 줄 추가
- `README.md` — Vercel 배포 + CI 섹션 추가

**손대지 않음**
- `next.config.mjs` (Phase 2 전용)
- `middleware.ts`, `app/**`, 그 외 모든 런타임 코드

## 6. 검증 / Test Plan

CI workflow는 인프라성이라 별도 유닛 테스트 없음. 다음으로 검증:

- **로컬 동일 명령 재현**: `npm ci && npm run lint && npm run typecheck && npm run build` (placeholder env로) → 통과해야 PR 머지 가능
- **GitHub Actions 결과 확인**: PR open 시 잡 1개 표시 → 통과 확인. 일부러 lint 에러 1개 넣어 fail-fast 동작 확인
- **Vercel Preview 스모크 테스트**: PR Preview URL에서 로그인 → 제출 1회

Phase 2 마이그레이션 문서는 작성 시점에 실행하지 않으며, 향후 실행 시 문서 내 §5 검증 체크리스트로 자가검증.

## 7. 위험 / 미해결 사항

- **Vercel 무료 플랜 한도**: Hobby 플랜은 commercial use 금지. MVP 사용자가 사내 전용이라면 검토 필요. 한도 초과 시 Phase 2 마이그레이션이 빨라질 수 있음.
- **`APP_BASE_URL` 사용처 미확인**: 이메일 본문 등에서 어떻게 참조되는지 본 spec 작성 시 코드 검증 안 함. Phase 1 구현 단계에서 grep으로 확인하고 필요 시 별도 spec.
- **secret 보안**: Vercel 대시보드 등록은 LLM이 대신 못함 — 사용자가 직접 등록해야 함. README에 명시.
