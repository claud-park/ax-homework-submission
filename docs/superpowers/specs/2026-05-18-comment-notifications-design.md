# 댓글/답글 이메일 알림 Implementation Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 제출/과제정의서에 코멘트(또는 답글)가 작성되면 반대편(admin↔champion)에게 이메일로 알린다.

**Architecture:** Task 2의 이메일 인프라(`lib/email.ts`, `lib/notifications.ts`) 재사용. `notifyNewComment` 단일 unified composer 추가 + 4개 POST 라우트에 IIFE fire-and-forget 패턴 적용. role 기반으로 recipient 결정.

**Tech Stack:** Next.js 14 App Router, Nodemailer + Gmail SMTP (기존), TypeScript

---

## 이벤트 매트릭스

| 이벤트 | API 라우트 | author 결정 | recipient |
|--------|----------|-----------|-----------|
| 제출 코멘트 (챔피언) | `POST /api/submissions/[id]/comments` | 항상 `user` | **어드민** (`ADMIN_NOTIFICATION_EMAIL`) |
| 제출 코멘트 (어드민) | `POST /api/admin/submissions/[id]/comments` | 항상 `admin` | **챔피언** (`submission.user_id`의 `users.email`) |
| 과제정의서 코멘트 (양방향) | `POST /api/charter/submissions/[id]/comments` | `isAdmin ? 'admin' : 'user'` | author=admin → 챔피언 / author=user → 어드민 |
| 과제정의서 답글 (양방향) | `POST /api/charter/submissions/[id]/comments/[commentId]/replies` | `isAdmin ? 'admin' : 'user'` | author=admin → 챔피언 / author=user → 어드민 |

## 신규 composer

`lib/notifications.ts`에 추가:

```ts
export async function notifyNewComment(params: {
  recipientEmail: string
  recipientName: string
  authorName: string
  authorRole: 'admin' | 'user'
  contextType: 'submission' | 'charter'
  contextTitle: string       // e.g. "#02 경쟁사 분석" or "프로젝트 헌장 - 김민준"
  body: string               // 코멘트/답글 본문
  isReply: boolean
  link: string               // 어드민/챔피언 페이지 deeplink
}): Promise<void>
```

### Subject 포맷

- 코멘트: `[새 코멘트] ${authorName} (${authorRoleLabel}) - ${contextTitle}`
- 답글: `[새 답글] ${authorName} (${authorRoleLabel}) - ${contextTitle}`

여기서 `authorRoleLabel` = admin → "어드민", user → "챔피언"

### HTML 템플릿

```html
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #6366f1;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">${isReply ? '💬 새 답글' : '💬 새 코멘트'}</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">작성자</td><td style="padding:8px 0;font-weight:600">${escapeHtml(authorName)} (${authorRoleLabel})</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">위치</td><td style="padding:8px 0">${escapeHtml(contextTitle)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b;vertical-align:top">내용</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(body)}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">이동해서 확인</a>
  </div>
</div>
```

색상: 인디고(`#6366f1`) — 기존 제출(파랑)/기한변경(빨강)과 구분.

### 내부 동작

```ts
async function notifyNewComment(params) {
  if (!params.recipientEmail) {
    console.warn('[email] skipped notifyNewComment: no recipient email', { ... })
    return
  }
  const authorRoleLabel = params.authorRole === 'admin' ? '어드민' : '챔피언'
  const subject = `[${params.isReply ? '새 답글' : '새 코멘트'}] ${params.authorName} (${authorRoleLabel}) - ${params.contextTitle}`
  const html = `... (위 템플릿)`
  try {
    await sendEmail({ to: params.recipientEmail, subject, html })
  } catch (e) {
    console.error('[email] notifyNewComment failed:', e)
  }
}
```

→ 기존 `adminEmail()` 헬퍼는 라우트 쪽에서만 호출 (이 composer는 라우트가 결정한 recipientEmail을 그대로 받음).

## 라우트 변경 패턴

### 1. `POST /api/submissions/[id]/comments` (챔피언이 자기 제출에 코멘트 → 어드민 알림)

```ts
import { notifyNewComment } from '@/lib/notifications'

// insert 직후
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
    const hw = subRow.homeworks as { title: string } | null
    const contextTitle = `#${String(subRow.homework_id).padStart(2, '0')} ${hw?.title ?? ''}`
    const link = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/admin/homework/${subRow.homework_id}`
    await notifyNewComment({
      recipientEmail,
      recipientName: '관리자',
      authorName: userRow.name,
      authorRole: 'user',
      contextType: 'submission',
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

### 2. `POST /api/admin/submissions/[id]/comments` (어드민이 챔피언 제출에 코멘트 → 챔피언 알림)

`notifyNewComment` 호출 — recipient는 `users.email`을 `submission.user_id` 기준으로 조회.

```ts
const [{ data: subRow }] = await Promise.all([
  supabase.from('submissions').select('user_id, homework_id, homeworks(title), users(name, email)').eq('id', params.id).single(),
])
if (!subRow) { console.warn(...); return }
const champ = subRow.users as { name: string; email: string } | null
const hw = subRow.homeworks as { title: string } | null
if (!champ?.email) { console.warn('no champion email'); return }
const contextTitle = `#${String(subRow.homework_id).padStart(2, '0')} ${hw?.title ?? ''}`
const link = `${appBaseUrl}/homework/${subRow.homework_id}`
await notifyNewComment({
  recipientEmail: champ.email,
  recipientName: champ.name,
  authorName: '관리자',
  authorRole: 'admin',
  contextType: 'submission',
  contextTitle,
  body: commentBody.trim(),
  isReply: false,
  link,
})
```

### 3. `POST /api/charter/submissions/[id]/comments` (양방향)

- author = `isAdmin ? 'admin' : 'user'`
- recipient 결정:
  - author=admin → 챔피언 (`charter.user_id`의 `users.email`)
  - author=user → 어드민 (`ADMIN_NOTIFICATION_EMAIL`)
- author name: admin이면 "관리자", user면 `users.name`
- contextTitle: `프로젝트 헌장 - ${champion name}` (charter 자체에 별도 title 없음, charter_submissions에 project_name 있긴 함 — 있으면 그걸, 없으면 user name)
- link: `${appBaseUrl}/admin/progress` (admin 쪽) 또는 `${appBaseUrl}/charter` (champion 쪽)
- skip self-comment: author === recipient면 미발송 (실무상 거의 없지만 방어)

### 4. `POST /api/charter/submissions/[id]/comments/[commentId]/replies` (양방향)

3번과 동일한 분기 로직 + `isReply: true`.

## 스킵 규칙

1. recipient email이 없음 → console.warn + skip
2. lookup이 null 반환 → console.warn + skip
3. 환경변수 미설정 (GMAIL_USER 등) → 기존 `sendEmail` 헬퍼가 처리

## 변경/추가 파일

| 파일 | 변경 유형 |
|------|---------|
| `lib/notifications.ts` | `notifyNewComment` 추가 |
| `app/api/submissions/[id]/comments/route.ts` | POST에 IIFE 알림 (recipient=admin) |
| `app/api/admin/submissions/[id]/comments/route.ts` | POST에 IIFE 알림 (recipient=champion) |
| `app/api/charter/submissions/[id]/comments/route.ts` | POST에 IIFE 알림 (role 분기) |
| `app/api/charter/submissions/[id]/comments/[commentId]/replies/route.ts` | POST에 IIFE 알림 (role 분기) |

## 에러 처리 / 운영

| 상황 | 처리 |
|------|------|
| recipientEmail 없음 (`users.email` null, ADMIN_NOTIFICATION_EMAIL 미설정) | composer 내 console.warn + skip |
| SMTP 발송 실패 | composer 내 try/catch → console.error |
| 라우트 lookup 실패 | IIFE 외부 try/catch → console.error |
| Self-comment (author === recipient) | 라우트에서 early skip — 챔피언이 admin도 겸직하는 edge case 방어 |
