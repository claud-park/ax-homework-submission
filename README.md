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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deployment (Vercel)

1. https://vercel.com/new 에서 GitHub repo `claud-park/ax-homework-submission` 임포트
2. Framework Preset: **Next.js** (자동 감지됨)
3. **Environment Variables** 등록 — 누락 시 런타임 실패:

   | 변수 | 환경 | 비고 |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Production / Preview / Development | 클라이언트 노출 OK |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production / Preview / Development | 클라이언트 노출 OK |
   | `SUPABASE_SERVICE_KEY` | Production / Preview | 서버 전용 — 절대 `NEXT_PUBLIC_` prefix 금지 |
   | `GMAIL_USER` | Production / Preview | nodemailer SMTP 계정 |
   | `GMAIL_APP_PASSWORD` | Production / Preview | Google 앱 비밀번호 |
   | `ADMIN_NOTIFICATION_EMAIL` | Production / Preview | 알림 수신 어드민 메일 |
   | `APP_BASE_URL` | Production | 실제 도메인 (예: `https://ax-homework.example.com`) |
   | `APP_BASE_URL` | Preview | `https://${VERCEL_URL}` 권장 |

4. **Deploy** 클릭

이후 `main` push → Production 자동 배포, PR open → Preview 자동 배포(Vercel bot이 PR에 URL 코멘트).

향후 Vercel → 자체 Docker 호스팅으로 옮기는 절차는 `docs/migration/vercel-to-docker.md` 참고.

## CI

`.github/workflows/ci.yml`이 PR과 `main` push 시 다음을 검증한다:

- `npm ci` (lockfile 엄격)
- `npm run lint` (eslint)
- `npm run typecheck` (`tsc --noEmit`)
- `npm run build` (Next.js production build, placeholder env)

로컬에서 동일 검증:
```bash
npm ci && npm run lint && npm run typecheck && npm run build
```
