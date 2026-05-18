# 이메일 알림 (제출/기한변경) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챔피언이 과제를 제출하거나 기한변경 요청을 생성할 때 어드민(yr.park@dreamus.io)에게 Gmail SMTP로 이메일 알림한다.

**Architecture:** `lib/email.ts`에 Nodemailer 기반 low-level `sendEmail` 헬퍼, `lib/notifications.ts`에 이벤트별 composer 2개. POST 라우트에서 DB insert 성공 후 비차단 호출 (try/catch + console.error → API 응답은 항상 성공).

**Tech Stack:** Next.js 14 App Router, Nodemailer, Gmail SMTP, TypeScript

---

## 변경/추가 파일 목록

| 파일 | 변경 유형 |
|------|---------|
| `package.json` / lock | nodemailer + @types/nodemailer 추가 |
| `.env.local.example` | GMAIL_USER, GMAIL_APP_PASSWORD, ADMIN_NOTIFICATION_EMAIL, APP_BASE_URL 추가 |
| `lib/email.ts` | 신규 — Nodemailer transporter + sendEmail |
| `lib/notifications.ts` | 신규 — notifyNewSubmission + notifyDeadlineChangeRequest |
| `app/api/submissions/route.ts` | POST 핸들러에 notifyNewSubmission 호출 추가 |
| `app/api/deadline-requests/route.ts` | POST 핸들러에 notifyDeadlineChangeRequest 호출 추가 |

---

## Task 1: Nodemailer 설치 + `lib/email.ts` 작성 + env 예시 업데이트

**Files:**
- Create: `lib/email.ts`
- Modify: `.env.local.example`
- Modify: `package.json` / lock (via npm install)

- [ ] **Step 1: nodemailer + @types/nodemailer 설치**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npm install nodemailer
  npm install --save-dev @types/nodemailer
  ```

  Expected: `package.json` `dependencies`에 `nodemailer`, `devDependencies`에 `@types/nodemailer` 추가됨.

- [ ] **Step 2: `lib/email.ts` 신규 작성**

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

- [ ] **Step 3: `.env.local.example` 업데이트**

  현재 파일을 읽고, 끝에 다음 4줄을 추가한다 (기존 항목 보존):

  ```
  # Email notifications (Gmail SMTP)
  GMAIL_USER=
  GMAIL_APP_PASSWORD=
  ADMIN_NOTIFICATION_EMAIL=
  APP_BASE_URL=http://localhost:3000
  ```

- [ ] **Step 4: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: 오류 없음 (lib/email.ts에서 새 오류 발생하지 않아야 함).

- [ ] **Step 5: Commit**

  ```bash
  git add package.json package-lock.json .env.local.example lib/email.ts
  git commit -m "feat(email): nodemailer 설치 + lib/email.ts sendEmail 헬퍼"
  ```

---

## Task 2: `lib/notifications.ts` 작성 (이벤트별 composer 2개)

**Files:**
- Create: `lib/notifications.ts`

이 모듈은 spec의 HTML 템플릿을 그대로 인라인으로 포함한다. 두 composer 모두:
1. `adminEmail()` 헬퍼로 수신자 환경변수 확인 (없으면 early return)
2. `appBaseUrl()` 헬퍼로 본문 링크 baseUrl 결정 (기본값 `http://localhost:3000`)
3. 제목/본문 조합 후 `sendEmail()` 호출
4. try/catch로 감싸 발송 실패 시 `console.error`만 남기고 throw하지 않음 (호출자가 안전하게 await/.catch 가능)

- [ ] **Step 1: `lib/notifications.ts` 신규 작성**

  ```ts
  import type { User, Homework, Milestone, Submission, DeadlineChangeRequest } from '@/lib/types'
  import { sendEmail } from '@/lib/email'

  function appBaseUrl(): string {
    return process.env.APP_BASE_URL ?? 'http://localhost:3000'
  }

  function adminEmail(): string | null {
    return process.env.ADMIN_NOTIFICATION_EMAIL ?? null
  }

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
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
    const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">📝 새 과제 제출</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">과제</td><td style="padding:8px 0">#${hwNo} ${escapeHtml(homework.title)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">시도 횟수</td><td style="padding:8px 0">${submission.attempt_number}회</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">파일명</td><td style="padding:8px 0">${escapeHtml(submission.file_name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">제출 시각</td><td style="padding:8px 0">${escapeHtml(submission.submitted_at)}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">칸반에서 검토</a>
  </div>
</div>
`.trim()
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
    const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #dc2626;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">⚠️ 기한변경 요청</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마일스톤</td><td style="padding:8px 0">${escapeHtml(milestone.title)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">원래 마감</td><td style="padding:8px 0">${escapeHtml(request.original_due_date)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">요청 마감</td><td style="padding:8px 0;color:#dc2626;font-weight:600">${escapeHtml(request.requested_due_date)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b;vertical-align:top">사유</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(request.reason)}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="${link}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">요청 검토</a>
  </div>
</div>
`.trim()
    try {
      await sendEmail({ to, subject, html })
    } catch (e) {
      console.error('[email] notifyDeadlineChangeRequest failed:', e)
    }
  }
  ```

  주의: `escapeHtml`은 사용자 입력(`user.name`, `homework.title`, `milestone.title`, `request.reason`, `submission.file_name`)을 HTML 본문에 삽입할 때 인젝션 방지용. `submission.submitted_at`은 ISO 문자열이지만 안전하게 한번 더 escape.

- [ ] **Step 2: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: 오류 없음.

- [ ] **Step 3: Lint 확인**

  ```bash
  npm run lint 2>&1 | head -30
  ```

  Expected: `lib/notifications.ts`에서 오류 없음.

- [ ] **Step 4: Commit**

  ```bash
  git add lib/notifications.ts
  git commit -m "feat(email): notifyNewSubmission + notifyDeadlineChangeRequest composer"
  ```

---

## Task 3: `app/api/submissions/route.ts` POST에 알림 호출 추가

**Files:**
- Modify: `app/api/submissions/route.ts`

기존 POST 핸들러의 마지막 부분 — submission insert 성공 후 `return NextResponse.json(data, { status: 201 })` 직전에 알림 호출을 끼워 넣는다. await하지 않고 fire-and-forget (`.catch()`로 외부 안전망 추가).

- [ ] **Step 1: `app/api/submissions/route.ts` 수정**

  파일 상단 import에 `notifyNewSubmission` 추가:

  ```ts
  import { notifyNewSubmission } from '@/lib/notifications'
  ```

  파일 끝 부분의 기존 코드:

  ```ts
    // Create submission record
    const { data, error } = await supabase
      .from('submissions')
      .insert({
        user_id: user.id,
        homework_id: parseInt(homeworkId),
        file_path: filePath,
        file_name: file.name,
        status: 'pending',
        attempt_number: attemptNumber,
      })
      .select()
      .single()
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data, { status: 201 })
  }
  ```

  를 다음으로 교체:

  ```ts
    // Create submission record
    const { data, error } = await supabase
      .from('submissions')
      .insert({
        user_id: user.id,
        homework_id: parseInt(homeworkId),
        file_path: filePath,
        file_name: file.name,
        status: 'pending',
        attempt_number: attemptNumber,
      })
      .select()
      .single()
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 })

    // Fire-and-forget email notification (errors logged inside helper)
    const { data: homework } = await supabase
      .from('homeworks')
      .select('*')
      .eq('id', parseInt(homeworkId))
      .single()
    const { data: userRow } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    if (homework && userRow) {
      notifyNewSubmission({ user: userRow, homework, submission: data }).catch(e =>
        console.error('[email] outer catch:', e)
      )
    }

    return NextResponse.json(data, { status: 201 })
  }
  ```

- [ ] **Step 2: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: 오류 없음.

- [ ] **Step 3: 코드 동작 sanity check (수동)**

  - GMAIL_USER가 비어있는 dev 환경에서 챔피언 계정으로 과제 제출
  - 서버 콘솔에 `[email] skipped: GMAIL_USER or GMAIL_APP_PASSWORD not set` 출력 확인
  - 제출은 성공 (201 응답) 확인
  - GMAIL_USER + GMAIL_APP_PASSWORD + ADMIN_NOTIFICATION_EMAIL 모두 설정 후 다시 제출 → 어드민 이메일 수신 확인

  > 수동 검증이라 GMAIL 계정 준비 안 됐으면 graceful skip 경로만 확인하고 commit하면 됨. 실 발송 검증은 env 설정 후 별도 진행 가능.

- [ ] **Step 4: Commit**

  ```bash
  git add app/api/submissions/route.ts
  git commit -m "feat(api): 제출 시 어드민에게 이메일 알림"
  ```

---

## Task 4: `app/api/deadline-requests/route.ts` POST에 알림 호출 추가

**Files:**
- Modify: `app/api/deadline-requests/route.ts`

POST 핸들러의 insert 성공 후 `return NextResponse.json(data, { status: 201 })` 직전에 알림 호출 추가. 패턴은 Task 3과 동일.

- [ ] **Step 1: `app/api/deadline-requests/route.ts` 수정**

  파일 상단 import에 `notifyDeadlineChangeRequest` 추가:

  ```ts
  import { notifyDeadlineChangeRequest } from '@/lib/notifications'
  ```

  파일 끝의 기존 POST 핸들러 코드:

  ```ts
    const { data, error } = await supabase
      .from('deadline_change_requests')
      .insert({ milestone_id, user_id: user.id, original_due_date: ms.due_date, requested_due_date, reason })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }
  ```

  를 다음으로 교체:

  ```ts
    const { data, error } = await supabase
      .from('deadline_change_requests')
      .insert({ milestone_id, user_id: user.id, original_due_date: ms.due_date, requested_due_date, reason })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fire-and-forget email notification (errors logged inside helper)
    const { data: milestone } = await supabase
      .from('milestones')
      .select('*')
      .eq('id', milestone_id)
      .single()
    const { data: userRow } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    if (milestone && userRow) {
      notifyDeadlineChangeRequest({ user: userRow, milestone, request: data }).catch(e =>
        console.error('[email] outer catch:', e)
      )
    }

    return NextResponse.json(data, { status: 201 })
  }
  ```

- [ ] **Step 2: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: 오류 없음.

- [ ] **Step 3: Lint 확인**

  ```bash
  npm run lint 2>&1 | head -30
  ```

  Expected: 새 오류 없음 (기존 `<img>` warnings는 무관).

- [ ] **Step 4: 코드 동작 sanity check (수동)**

  - 챔피언 계정으로 마일스톤 페이지에서 기한변경 요청 제출
  - GMAIL_USER 미설정 시: 콘솔에 skip 로그, 요청은 201 성공
  - 설정된 경우: 어드민 이메일 수신 확인 (제목/마감일/사유 정상 표시)

- [ ] **Step 5: Commit**

  ```bash
  git add app/api/deadline-requests/route.ts
  git commit -m "feat(api): 기한변경 요청 시 어드민에게 이메일 알림"
  ```
