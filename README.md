This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Getting Started (Local)

```bash
bun install
cp .env.local.example .env.local   # 그 후 실제 값 채움 (.env.local.example=로컬 개발용, .env.example=Docker 운영용)
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

## Commit Convention

모든 커밋 메시지는 아래 형식을 따라야 한다. `commit-msg` hook이 자동으로 검사한다.

```
[AX-NNN] type(scope): 설명
```

- `[AX-NNN]` — Jira 티켓 번호 (필수)
- `type` — feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert 중 하나
- `(scope)` — 선택 사항
- `설명` — 한글 또는 영문, 비워둘 수 없음

예시:
```
[AX-42] feat(kanban): 드래그앤드롭 컬럼 순서 변경 추가
[AX-7] fix: 파일 업로드 null 포인터 오류 수정
[AX-1] chore: 의존성 업데이트
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
