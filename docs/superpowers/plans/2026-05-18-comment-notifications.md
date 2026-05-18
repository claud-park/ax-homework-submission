# 댓글/답글 이메일 알림 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제출/과제정의서에 코멘트(또는 답글)가 작성되면 반대편(admin↔champion)에게 이메일로 알린다.

**Architecture:** Task 2(이메일 알림)의 인프라(`lib/email.ts`, `lib/notifications.ts`) 재사용. `notifyNewComment` 단일 unified composer 추가 + 4개 POST 라우트에 동일한 IIFE fire-and-forget 패턴 적용.

**Tech Stack:** Next.js 14 App Router, Nodemailer + Gmail SMTP, TypeScript

---

## 변경/추가 파일 목록

| 파일 | 변경 유형 |
|------|---------|
| `lib/notifications.ts` | `notifyNewComment` 함수 추가 |
| `app/api/submissions/[id]/comments/route.ts` | POST에 IIFE 알림 (recipient=admin) |
| `app/api/admin/submissions/[id]/comments/route.ts` | POST에 IIFE 알림 (recipient=champion) |
| `app/api/charter/submissions/[id]/comments/route.ts` | POST에 IIFE 알림 (role 분기) |
| `app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts` | POST에 IIFE 알림 (role 분기) |

---

## Task 1: `notifyNewComment` composer 추가

**Files:**
- Modify: `/Users/claud_01/Documents/flo/AX/ax-homework-submission/lib/notifications.ts`

`notifyNewComment` 함수는 unified — 코멘트/답글 + 4개 트리거 모두 사용. 라우트가 recipient/author/context를 조립해서 넘긴다. composer는 받은 값으로 제목/본문 만들고 발송.

- [ ] **Step 1: `lib/notifications.ts` 끝에 `notifyNewComment` 추가**

  파일 끝(현재 `notifyDeadlineChangeRequest` 함수 닫힘 `}` 다음)에 추가:

  ```ts

  export async function notifyNewComment(params: {
    recipientEmail: string
    recipientName: string
    authorName: string
    authorRole: 'admin' | 'user'
    contextTitle: string
    body: string
    isReply: boolean
    link: string
  }): Promise<void> {
    if (!params.recipientEmail) {
      console.warn('[email] skipped notifyNewComment: no recipient email', {
        recipientName: params.recipientName,
        authorName: params.authorName,
      })
      return
    }
    const authorRoleLabel = params.authorRole === 'admin' ? '어드민' : '챔피언'
    const kind = params.isReply ? '새 답글' : '새 코멘트'
    const subject = `[${kind}] ${params.authorName} (${authorRoleLabel}) - ${params.contextTitle}`
    const html = `
  <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <div style="border-bottom:2px solid #6366f1;padding-bottom:12px;margin-bottom:20px">
      <h2 style="margin:0;font-size:18px">💬 ${kind}</h2>
    </div>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:8px 0;color:#64748b;width:100px">작성자</td><td style="padding:8px 0;font-weight:600">${escapeHtml(params.authorName)} (${authorRoleLabel})</td></tr>
      <tr><td style="padding:8px 0;color:#64748b">위치</td><td style="padding:8px 0">${escapeHtml(params.contextTitle)}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;vertical-align:top">내용</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(params.body)}</td></tr>
    </table>
    <div style="margin-top:24px">
      <a href="${escapeHtml(params.link)}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">이동해서 확인</a>
    </div>
  </div>
  `.trim()
    try {
      await sendEmail({ to: params.recipientEmail, subject, html })
    } catch (e) {
      console.error('[email] notifyNewComment failed:', e)
    }
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

  Expected: `lib/notifications.ts`에서 새 오류 없음.

- [ ] **Step 4: Commit**

  ```bash
  git add lib/notifications.ts
  git commit -m "feat(email): notifyNewComment 통합 composer (코멘트/답글)"
  ```

---

## Task 2: 챔피언 제출 코멘트 → 어드민 알림

**Files:**
- Modify: `/Users/claud_01/Documents/flo/AX/ax-homework-submission/app/api/submissions/[id]/comments/route.ts`

챔피언이 자기 제출에 코멘트를 달면 어드민에게 이메일.

- [ ] **Step 1: import 추가**

  파일 상단 import 블록에 추가:

  ```ts
  import { notifyNewComment } from '@/lib/notifications'
  ```

- [ ] **Step 2: POST 핸들러에 IIFE 알림 블록 추가**

  현재 POST 핸들러 끝의 `return NextResponse.json(data, { status: 201 })` 바로 위에 다음 블록을 삽입한다. (insert 후 error 체크 후, return 전.)

  ```ts
    // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
    void (async () => {
      try {
        const recipientEmail = process.env.ADMIN_NOTIFICATION_EMAIL
        if (!recipientEmail) return
        const [{ data: userRow }, { data: subRow }] = await Promise.all([
          supabase.from('users').select('name').eq('id', user.id).single(),
          supabase.from('submissions').select('homework_id, homeworks(title)').eq('id', params.id).single(),
        ])
        if (!userRow || !subRow) {
          console.warn('[email] skipped notifyNewComment: lookup returned null', { userId: user.id, submissionId: params.id })
          return
        }
        const hw = subRow.homeworks as { title: string } | { title: string }[] | null
        const hwTitle = Array.isArray(hw) ? hw[0]?.title : hw?.title
        const contextTitle = `#${String(subRow.homework_id).padStart(2, '0')} ${hwTitle ?? ''}`
        const link = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/admin/homework/${subRow.homework_id}`
        await notifyNewComment({
          recipientEmail,
          recipientName: '관리자',
          authorName: userRow.name,
          authorRole: 'user',
          contextTitle,
          body: commentBody.trim(),
          isReply: false,
          link,
        })
      } catch (e) {
        console.error('[email] outer catch:', e)
      }
    })()
  ```

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app/api/submissions/[id]/comments/route.ts
  git commit -m "feat(api): 챔피언 제출 코멘트 시 어드민에게 이메일 알림"
  ```

---

## Task 3: 어드민 제출 코멘트 → 챔피언 알림

**Files:**
- Modify: `/Users/claud_01/Documents/flo/AX/ax-homework-submission/app/api/admin/submissions/[id]/comments/route.ts`

어드민이 챔피언 제출에 코멘트를 달면 챔피언에게 이메일. 챔피언 이메일은 submission → user_id → users.email 조회.

- [ ] **Step 1: import 추가**

  파일 상단:

  ```ts
  import { notifyNewComment } from '@/lib/notifications'
  ```

- [ ] **Step 2: POST 핸들러에 IIFE 알림 블록 추가**

  `return NextResponse.json(data, { status: 201 })` 직전에 삽입:

  ```ts
    // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
    void (async () => {
      try {
        const { data: subRow } = await supabase
          .from('submissions')
          .select('user_id, homework_id, homeworks(title), users(name, email)')
          .eq('id', params.id)
          .single()
        if (!subRow) {
          console.warn('[email] skipped notifyNewComment: submission lookup returned null', { submissionId: params.id })
          return
        }
        const champ = subRow.users as { name: string; email: string } | { name: string; email: string }[] | null
        const champRow = Array.isArray(champ) ? champ[0] : champ
        if (!champRow?.email) {
          console.warn('[email] skipped notifyNewComment: champion email missing', { userId: subRow.user_id })
          return
        }
        const hw = subRow.homeworks as { title: string } | { title: string }[] | null
        const hwTitle = Array.isArray(hw) ? hw[0]?.title : hw?.title
        const contextTitle = `#${String(subRow.homework_id).padStart(2, '0')} ${hwTitle ?? ''}`
        const link = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/homework/${subRow.homework_id}`
        await notifyNewComment({
          recipientEmail: champRow.email,
          recipientName: champRow.name,
          authorName: '관리자',
          authorRole: 'admin',
          contextTitle,
          body: commentBody.trim(),
          isReply: false,
          link,
        })
      } catch (e) {
        console.error('[email] outer catch:', e)
      }
    })()
  ```

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app/api/admin/submissions/[id]/comments/route.ts
  git commit -m "feat(api): 어드민 제출 코멘트 시 챔피언에게 이메일 알림"
  ```

---

## Task 4: 과제정의서 코멘트 → 반대편 알림 (양방향)

**Files:**
- Modify: `/Users/claud_01/Documents/flo/AX/ax-homework-submission/app/api/charter/submissions/[id]/comments/route.ts`

과제정의서(charter)는 POST 라우트가 양방향(admin/user 둘 다) — `isAdmin`으로 분기. recipient도 분기:
- author=admin → 챔피언 (`charter.user_id`의 `users.email`)
- author=user → 어드민 (`ADMIN_NOTIFICATION_EMAIL`)

- [ ] **Step 1: import 추가**

  파일 상단:

  ```ts
  import { notifyNewComment } from '@/lib/notifications'
  ```

- [ ] **Step 2: POST 핸들러에 IIFE 알림 블록 추가**

  `return NextResponse.json(data, { status: 201 })` 직전:

  ```ts
    // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
    void (async () => {
      try {
        const authorRole: 'admin' | 'user' = isAdmin ? 'admin' : 'user'
        const { data: charterRow } = await supabase
          .from('charter_submissions')
          .select('user_id, project_name, users(name, email)')
          .eq('id', params.id)
          .single()
        if (!charterRow) {
          console.warn('[email] skipped notifyNewComment: charter lookup returned null', { charterId: params.id })
          return
        }
        const champ = charterRow.users as { name: string; email: string } | { name: string; email: string }[] | null
        const champRow = Array.isArray(champ) ? champ[0] : champ
        const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000'
        const contextTitle = `과제정의서 - ${charterRow.project_name ?? champRow?.name ?? ''}`

        let recipientEmail: string | undefined
        let recipientName: string
        let authorName: string
        let link: string

        if (authorRole === 'admin') {
          if (!champRow?.email) {
            console.warn('[email] skipped notifyNewComment: champion email missing', { userId: charterRow.user_id })
            return
          }
          recipientEmail = champRow.email
          recipientName = champRow.name
          authorName = '관리자'
          link = `${appBase}/charter`
        } else {
          recipientEmail = process.env.ADMIN_NOTIFICATION_EMAIL
          if (!recipientEmail) return
          recipientName = '관리자'
          authorName = champRow?.name ?? '챔피언'
          link = `${appBase}/admin/progress`
        }

        await notifyNewComment({
          recipientEmail,
          recipientName,
          authorName,
          authorRole,
          contextTitle,
          body: body.trim(),
          isReply: false,
          link,
        })
      } catch (e) {
        console.error('[email] outer catch:', e)
      }
    })()
  ```

  주의: 이 핸들러는 본문 변수명이 `body` (`const { body } = await req.json()`)다. `commentBody` 아님.

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app/api/charter/submissions/[id]/comments/route.ts
  git commit -m "feat(api): 과제정의서 코멘트 시 반대편에게 이메일 알림 (양방향)"
  ```

---

## Task 5: 과제정의서 답글 → 반대편 알림 (양방향)

**Files:**
- Modify: `/Users/claud_01/Documents/flo/AX/ax-homework-submission/app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts`

Task 4와 동일한 분기 로직 + `isReply: true`. 본문 변수명은 이 핸들러에서도 `body`.

- [ ] **Step 1: import 추가**

  파일 상단:

  ```ts
  import { notifyNewComment } from '@/lib/notifications'
  ```

- [ ] **Step 2: POST 핸들러에 IIFE 알림 블록 추가**

  `return NextResponse.json(data, { status: 201 })` 직전:

  ```ts
    // Fire-and-forget email notification (self-hosted: safe; on serverless move to a background job)
    void (async () => {
      try {
        const authorRole: 'admin' | 'user' = isAdmin ? 'admin' : 'user'
        const { data: charterRow } = await supabase
          .from('charter_submissions')
          .select('user_id, project_name, users(name, email)')
          .eq('id', params.id)
          .single()
        if (!charterRow) {
          console.warn('[email] skipped notifyNewComment: charter lookup returned null', { charterId: params.id })
          return
        }
        const champ = charterRow.users as { name: string; email: string } | { name: string; email: string }[] | null
        const champRow = Array.isArray(champ) ? champ[0] : champ
        const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000'
        const contextTitle = `과제정의서 - ${charterRow.project_name ?? champRow?.name ?? ''}`

        let recipientEmail: string | undefined
        let recipientName: string
        let authorName: string
        let link: string

        if (authorRole === 'admin') {
          if (!champRow?.email) {
            console.warn('[email] skipped notifyNewComment: champion email missing', { userId: charterRow.user_id })
            return
          }
          recipientEmail = champRow.email
          recipientName = champRow.name
          authorName = '관리자'
          link = `${appBase}/charter`
        } else {
          recipientEmail = process.env.ADMIN_NOTIFICATION_EMAIL
          if (!recipientEmail) return
          recipientName = '관리자'
          authorName = champRow?.name ?? '챔피언'
          link = `${appBase}/admin/progress`
        }

        await notifyNewComment({
          recipientEmail,
          recipientName,
          authorName,
          authorRole,
          contextTitle,
          body: body.trim(),
          isReply: true,
          link,
        })
      } catch (e) {
        console.error('[email] outer catch:', e)
      }
    })()
  ```

- [ ] **Step 3: TypeScript 컴파일 확인**

  ```bash
  cd /Users/claud_01/Documents/flo/AX/ax-homework-submission
  npx tsc --noEmit 2>&1 | head -20
  ```

- [ ] **Step 4: Lint 확인**

  ```bash
  npm run lint 2>&1 | head -30
  ```

  Expected: `replies/route.ts`에서 새 오류 없음.

- [ ] **Step 5: Commit**

  ```bash
  git add app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts
  git commit -m "feat(api): 과제정의서 답글 시 반대편에게 이메일 알림 (양방향)"
  ```
