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
| `NODE_ENV` | ✗ | ✓ (compose 고정) | `docker-compose.yml`에서 `production` 으로 직접 설정. `.env` 와 무관. |

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

`-p ax-homework-submission` 은 compose 프로젝트 네임 — `docker compose ps/logs/down` 명령이 이 프로젝트에 속한 컨테이너만 다루게 한다. 컨테이너 이름 자체는 `docker-compose.yml`의 `container_name: ax-homework-frontend` 로 고정되어 있어서, 동일 호스트에서 staging+prod 같은 다중 인스턴스를 띄우면 이름 충돌이 난다. 다중 인스턴스 필요 시 compose 파일을 환경별로 분리하거나 `container_name` 을 제거하고 `-p` 만으로 구분할 것.

배포 알림은 Jenkinsfile post-deploy 단계에서 Slack hook 호출 — ax-dsp-search와 동일. 본 plan은 Jenkinsfile 자체는 다루지 않음 (서버에 gitignored 형태로 존재).

## 헬스 체크

기동 직후:

```bash
# 컨테이너 상태
docker compose -p ax-homework-submission ps

# 로그
docker compose -p ax-homework-submission logs --tail=50 frontend

# HTTP 응답
# 정상 응답
curl -I http://localhost:3000/login   # → 200 (Supabase env 정상일 때)
curl -I http://localhost:3000/        # → 302 → /login (미인증)

# /login 이 500을 뱉으면 NEXT_PUBLIC_SUPABASE_* 또는 SUPABASE_SERVICE_KEY 가 잘못 박힘.
# 컨테이너 로그에서 supabase 클라이언트 초기화 에러를 확인할 것.
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
