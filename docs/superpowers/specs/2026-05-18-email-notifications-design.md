# 이메일 알림 (제출/기한변경) Implementation Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 챔피언이 과제를 제출하거나 기한변경 요청을 생성할 때 어드민(yr.park@dreamus.io)에게 이메일로 알림한다.

**Architecture:** Nodemailer + Gmail SMTP로 발송. `lib/email.ts`에 low-level 발송 헬퍼, `lib/notifications.ts`에 이벤트별 composer. 각 API 라우트의 POST 핸들러에서 DB insert 성공 후 호출하되, 이메일 실패가 사용자 응답을 막지 않도록 비차단 처리.

**Tech Stack:** Next.js 14 App Router, Nodemailer, Gmail SMTP (앱 비밀번호)

---

## 환경변수

`.env.local` (및 `.env.local.example`):

```
GMAIL_USER=your.account@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
ADMIN_NOTIFICATION_EMAIL=yr.park@dreamus.io
APP_BASE_URL=http://localhost:3000
```

- `GMAIL_USER`/`GMAIL_APP_PASSWORD`: Gmail 2FA 활성화 후 "앱 비밀번호" 발급 필요
- `ADMIN_NOTIFICATION_EMAIL`: 알림 수신자 (현재 단일 admin)
- `APP_BASE_URL`: 이메일 본문 링크에 사용 (dev=localhost, prod=배포 URL)

## 모듈 구조

### `lib/email.ts` (신규)

Nodemailer transporter 초기화 + 단일 `sendEmail` 함수.

```ts
import nodemailer from 'nodemailer'

export interface SendEmailParams {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    console.warn('[email] skipped: GMAIL_USER or GMAIL_APP_PASSWORD not set')
    return
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
  await transporter.sendMail({ from: user, to, subject, html })
}
```

Graceful degradation: 환경변수 비어있으면 `console.warn` 후 조용히 종료. 로컬 개발 시 메일 설정 없이도 정상 동작.

### `lib/notifications.ts` (신규)

이벤트별 composer + 발송. 각 함수는 `try/catch`로 감싸 호출자가 안전하게 await할 수 있다.

```ts
import type { User, Homework, Milestone, Submission, DeadlineChangeRequest } from '@/lib/types'
import { sendEmail } from '@/lib/email'

function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'http://localhost:3000'
}

function adminEmail(): string | null {
  return process.env.ADMIN_NOTIFICATION_EMAIL ?? null
}

export async function notifyNewSubmission(params: {
  user: User
  homework: Homework
  submission: Submission
}): Promise<void> {
  const to = adminEmail()
  if (!to) return
  const { user, homework, submission } = params
  const hwNo = String(homework.id).padStart(2, '0')
  const subject = `[과제 제출] ${user.name} - #${hwNo} ${homework.title}`
  const link = `${appBaseUrl()}/admin/kanban?homework_id=${homework.id}`
  const html = `... (아래 템플릿 섹션 참조)`
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyNewSubmission failed:', e)
  }
}

export async function notifyDeadlineChangeRequest(params: {
  user: User
  milestone: Milestone
  request: DeadlineChangeRequest
}): Promise<void> {
  const to = adminEmail()
  if (!to) return
  const { user, milestone, request } = params
  const subject = `[기한변경 요청] ${user.name} - ${milestone.title}`
  const link = `${appBaseUrl()}/admin/requests`
  const html = `... (아래 템플릿 섹션 참조)`
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyDeadlineChangeRequest failed:', e)
  }
}
```

## HTML 템플릿

심플한 인라인 스타일 (~30라인 / 이벤트). React Email은 YAGNI.

### 제출 알림

```html
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">📝 새 과제 제출</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">{user.name}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">과제</td><td style="padding:8px 0">#{hwNo} {homework.title}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">시도 횟수</td><td style="padding:8px 0">{submission.attempt_number}회</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">파일명</td><td style="padding:8px 0">{submission.file_name}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">제출 시각</td><td style="padding:8px 0">{submission.submitted_at}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="{link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">칸반에서 검토</a>
  </div>
</div>
```

### 기한변경 요청 알림

```html
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #dc2626;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">⚠️ 기한변경 요청</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">{user.name}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마일스톤</td><td style="padding:8px 0">{milestone.title}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">원래 마감</td><td style="padding:8px 0">{request.original_due_date}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">요청 마감</td><td style="padding:8px 0;color:#dc2626;font-weight:600">{request.requested_due_date}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b;vertical-align:top">사유</td><td style="padding:8px 0;white-space:pre-wrap">{request.reason}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="{link}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">요청 검토</a>
  </div>
</div>
```

## API 라우트 변경

### `app/api/submissions/route.ts` POST

submission insert 성공 직후, homework 조회한 뒤 알림 호출:

```ts
// 기존 insert 성공 후
const { data: homework } = await supabase.from('homeworks').select('*').eq('id', parseInt(homeworkId)).single()
const { data: userRow } = await supabase.from('users').select('*').eq('id', user.id).single()
if (homework && userRow) {
  notifyNewSubmission({ user: userRow, homework, submission: data }).catch(e => console.error(e))
}
return NextResponse.json(data, { status: 201 })
```

`notifyNewSubmission`은 내부에서 try/catch하지만 추가 안전망으로 외부에서도 `.catch`. await 안 함 — 응답 지연 방지 (fire-and-forget).

### `app/api/deadline-requests/route.ts` POST

request insert 성공 직후 milestone + user 조회 후 호출:

```ts
const { data: milestone } = await supabase.from('milestones').select('*').eq('id', milestone_id).single()
const { data: userRow } = await supabase.from('users').select('*').eq('id', user.id).single()
if (milestone && userRow) {
  notifyDeadlineChangeRequest({ user: userRow, milestone, request: data }).catch(e => console.error(e))
}
return NextResponse.json(data, { status: 201 })
```

## 의존성 추가

```
npm install nodemailer
npm install --save-dev @types/nodemailer
```

## 변경/추가 파일 목록

| 파일 | 변경 유형 |
|------|---------|
| `lib/email.ts` | 신규 |
| `lib/notifications.ts` | 신규 |
| `app/api/submissions/route.ts` | POST에 notification 호출 추가 |
| `app/api/deadline-requests/route.ts` | POST에 notification 호출 추가 |
| `.env.local.example` | GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_NOTIFICATION_EMAIL, APP_BASE_URL 추가 |
| `package.json` / lock | nodemailer + @types/nodemailer 추가 |

## 에러 처리 / 운영

| 상황 | 처리 |
|------|------|
| `GMAIL_USER`/`GMAIL_APP_PASSWORD` 미설정 | `sendEmail`에서 `console.warn` 후 조용히 종료. 사용자 응답 영향 없음 |
| `ADMIN_NOTIFICATION_EMAIL` 미설정 | notifier에서 early return. `console.warn`은 생략 (반복 로그 방지) |
| SMTP 발송 실패 (인증/네트워크) | notifier 내부 try/catch → `console.error('[email] ... failed:', e)`. 사용자 응답은 성공 (201) 반환 |
| 비차단 패턴 (fire-and-forget) | 호출 시 await 안 함. 서버리스 환경(Vercel)에서는 함수 종료 시 발송이 끊길 수 있어 자체 호스팅 우선. 향후 Vercel 배포 시 await로 전환 검토 |

## 향후 확장 포인트 (Task 3 대비)

- `lib/notifications.ts`에 `notifyCommentReply` 등 함수 추가만으로 확장 가능
- 챔피언 발송이 필요해지면 Gmail "보내는 사람 이름"이 개인 계정이라는 한계 — 추후 Resend + 도메인 인증으로 전환 검토
