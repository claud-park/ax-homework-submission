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
  const link = `${appBaseUrl()}/admin/kanban?homework_id=${encodeURIComponent(homework.id)}`
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">📝 새 과제 제출</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">과제</td><td style="padding:8px 0">#${hwNo} ${escapeHtml(homework.title)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">시도 횟수</td><td style="padding:8px 0">${String(submission.attempt_number)}회</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">파일명</td><td style="padding:8px 0">${escapeHtml(submission.file_name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">제출 시각</td><td style="padding:8px 0">${escapeHtml(submission.submitted_at)}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">칸반에서 검토</a>
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
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">요청 검토</a>
  </div>
</div>
`.trim()
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyDeadlineChangeRequest failed:', e)
  }
}

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
  <p style="margin:0 0 16px 0;font-size:14px;color:#0f172a">안녕하세요, ${escapeHtml(params.recipientName)}님.</p>
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

export async function notifyMilestoneCompleted(params: {
  user: User
  milestone: Milestone
  fileName: string
}): Promise<void> {
  const to = adminEmail()
  if (!to) return
  const { user, milestone, fileName } = params
  const weekLabel = milestone.week_number ? `W${String(milestone.week_number).padStart(2, '0')} · ` : ''
  const subject = `[마일스톤 완료] ${user.name} - ${weekLabel}${milestone.title}`
  const link = `${appBaseUrl()}/admin/progress`
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #16a34a;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">✅ 마일스톤 완료</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마일스톤</td><td style="padding:8px 0">${escapeHtml(weekLabel + milestone.title)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">산출물</td><td style="padding:8px 0">${escapeHtml(fileName)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마감일</td><td style="padding:8px 0">${escapeHtml(milestone.due_date)}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">진척 현황 보기</a>
  </div>
</div>
`.trim()
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyMilestoneCompleted failed:', e)
  }
}
