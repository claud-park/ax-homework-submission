import type { User, Milestone, Submission, DeadlineChangeRequest } from '@/lib/types'
import { sendEmail } from '@/lib/email'
import { postAdminSlack } from '@/lib/notifications/slack'

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
  submission: Submission
}): Promise<void> {
  const { user, submission } = params
  const link = `${appBaseUrl()}/admin/kanban`
  await postAdminSlack(`📝 *새 과제 제출* — ${user.name} (${submission.attempt_number}회)\n<${link}|칸반에서 검토>`)

  const to = adminEmail()
  if (!to) return
  const subject = `[과제 제출] ${user.name}`
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">📝 새 과제 제출</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">시도 횟수</td><td style="padding:8px 0">${String(submission.attempt_number)}회</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">제출물</td><td style="padding:8px 0">${submission.link_url ? escapeHtml(submission.link_url) : escapeHtml(submission.file_name ?? '')}</td></tr>
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
  const { user, milestone, request } = params
  const link = `${appBaseUrl()}/admin/requests`
  await postAdminSlack(`⚠️ *기한변경 요청* — ${user.name} · ${milestone.title}\n${request.original_due_date} → *${request.requested_due_date}*\n<${link}|요청 검토>`)

  const to = adminEmail()
  if (!to) return
  const subject = `[기한변경 요청] ${user.name} - ${milestone.title}`
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
  fileName?: string
}): Promise<void> {
  const { user, milestone, fileName = '(수동 완료)' } = params
  const weekLabel = milestone.week_number ? `W${String(milestone.week_number).padStart(2, '0')} · ` : ''
  const link = `${appBaseUrl()}/admin/progress`
  await postAdminSlack(`✅ *마일스톤 완료* — ${user.name} · ${weekLabel}${milestone.title}\n<${link}|진척 현황 보기>`)

  const to = adminEmail()
  if (!to) return
  const subject = `[마일스톤 완료] ${user.name} - ${weekLabel}${milestone.title}`
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #16a34a;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">✅ 마일스톤 완료</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마일스톤</td><td style="padding:8px 0">${escapeHtml(weekLabel + milestone.title)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">산출물</td><td style="padding:8px 0">${escapeHtml(fileName)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마감일</td><td style="padding:8px 0">${escapeHtml(milestone.due_date ?? '')}</td></tr>
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

const BOTTLENECK_LABEL: Record<string, string> = {
  technical: '기술적 문제',
  resource: '리소스 부족',
  external: '외부 의존성',
  other: '기타',
}

export async function notifyBottleneck(params: {
  user: User
  milestone: Milestone
  type: string
  note: string | null
}): Promise<void> {
  const { user, milestone, type, note } = params
  const weekLabel = milestone.week_number ? `W${String(milestone.week_number).padStart(2, '0')} ` : ''
  const link = `${appBaseUrl()}/admin/delay-reports`
  const typeLabel = BOTTLENECK_LABEL[type] ?? type
  await postAdminSlack(`⚠️ *지연 신고* — ${user.name} · ${weekLabel}${milestone.title} (${typeLabel})\n<${link}|요청 검토>`)

  const to = adminEmail()
  if (!to) return
  const subject = `[AX] 지연 신고 — ${user.name} · ${weekLabel}${milestone.title}`
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #dc2626;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">⚠️ 지연 신고</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(user.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마일스톤</td><td style="padding:8px 0">${escapeHtml(weekLabel + milestone.title)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">마감일</td><td style="padding:8px 0">${escapeHtml(milestone.due_date ?? '')}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b">지연 유형</td><td style="padding:8px 0;color:#dc2626;font-weight:600">${escapeHtml(typeLabel)}</td></tr>
    ${note ? `<tr><td style="padding:8px 0;color:#64748b;vertical-align:top">설명</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(note)}</td></tr>` : ''}
  </table>
  <div style="margin-top:24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">요청 검토</a>
  </div>
</div>
`.trim()
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyBottleneck failed:', e)
  }
}

export async function nudgeChampion(params: {
  user: Pick<User, 'id' | 'email' | 'name'>
  nudgeType: 'no_charter' | 'no_milestone' | 'delayed_milestone'
  milestoneTitle?: string
}): Promise<void> {
  const { user, nudgeType, milestoneTitle } = params
  const base = appBaseUrl()

  const cushion = `바쁜 일정 속에서도 AX 프로젝트를 함께해 주셔서 진심으로 감사드립니다.<br>번거로우시겠지만, 잠깐만 아래 내용을 확인해 주시면 정말 감사하겠습니다.`

  let subject: string
  let bodyLine: string
  let ctaHref: string
  let ctaLabel: string

  if (nudgeType === 'no_charter') {
    subject = '[AX] 과제정의서 제출을 기다리고 있습니다 🙏'
    bodyLine = 'AX Champion 과제정의서를 제출해주세요.'
    ctaHref = `${base}/my-project/charter`
    ctaLabel = '과제정의서 작성하기'
  } else if (nudgeType === 'no_milestone') {
    subject = '[AX] 마일스톤 등록을 기다리고 있습니다 🙏'
    bodyLine = '과제정의서에 마일스톤을 등록해주세요.'
    ctaHref = `${base}/my-project/milestones`
    ctaLabel = '마일스톤 등록하기'
  } else {
    const titleRaw = milestoneTitle ?? ''
    subject = `[AX] '${titleRaw}' 마일스톤을 확인해주세요 🙏`
    bodyLine = `${escapeHtml(titleRaw)} 마일스톤을 완료해주세요. 혹시 병목이 생긴다면 [내 업무 현황] &gt; [이슈 보고/도움 요청]을 해 주세요.`
    ctaHref = `${base}/my-project/milestones`
    ctaLabel = '마일스톤 확인하기'
  }

  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #d97706;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">🙏 AX 팀에서 알림드립니다</h2>
  </div>
  <p style="margin:0 0 16px 0;font-size:14px;color:#0f172a">안녕하세요, ${escapeHtml(user.name)}님.</p>
  <p style="margin:0 0 16px 0;font-size:14px;color:#64748b;line-height:1.6">${cushion}</p>
  <p style="margin:0 0 24px 0;font-size:14px;color:#0f172a">${bodyLine}</p>
  <div>
    <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#d97706;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">${ctaLabel}</a>
  </div>
</div>
`.trim()

  await sendEmail({ to: user.email, subject, html })
}

/**
 * 매주 월요일, 지연/미완료(gantt 빨간 박스) 마일스톤이 있는 champion 에게
 * 보내는 부드러운 자동 넛지. 압박 없이 진행 체크·기한 연장·도움 요청을 안내한다.
 */
export async function nudgeOverdueMilestones(params: {
  user: Pick<User, 'id' | 'email' | 'name'>
}): Promise<void> {
  const { user } = params
  const milestonesUrl = `${appBaseUrl()}/my-project/milestones`
  const subject = '[AX] 이번 주 마일스톤을 함께 살펴볼까요 🌱'

  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #d97706;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">🌱 AX Office에서 인사드려요</h2>
  </div>
  <p style="margin:0 0 16px 0;font-size:14px;color:#0f172a">안녕하세요, ${escapeHtml(user.name)}님.</p>
  <p style="margin:0 0 16px 0;font-size:14px;color:#64748b;line-height:1.7">
    바쁜 일정 속에서도 AX 과제에 함께해 주셔서 진심으로 감사드려요.<br>
    이번 주 마일스톤을 잠깐 함께 살펴보면 좋을 것 같아 가볍게 안내드려요.
  </p>
  <p style="margin:0 0 12px 0;font-size:14px;color:#0f172a;line-height:1.7">
    <a href="${escapeHtml(milestonesUrl)}" style="color:#b45309;font-weight:600;text-decoration:underline">내 마일스톤 현황</a>에서
    <b>[진행 시작]</b>과 <b>[완료]</b>를 그때그때 체크해 주시면, AX Office에서도 진행 상황을 함께 확인할 수 있어요.
    <span style="color:#64748b">진행 노트를 남겨 상황을 공유해 주셔도 좋아요.</span>
  </p>
  <p style="margin:0 0 12px 0;font-size:14px;color:#0f172a;line-height:1.7">
    혹시 마일스톤 진행이나 기한 산정에 어려움이 있으시면, <b>[기한 연장]</b>으로 일정을 편하게 조정해 주셔도 괜찮아요.
  </p>
  <p style="margin:0 0 24px 0;font-size:14px;color:#0f172a;line-height:1.7">
    막히는 지점이 있다면 <b>[이슈 보고/도움 요청]</b>을 남겨 주세요. AX Office에서 확인하고 도움을 드릴게요.
  </p>
  <div>
    <a href="${escapeHtml(milestonesUrl)}" style="display:inline-block;background:#d97706;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">내 마일스톤 현황 보기</a>
  </div>
</div>
`.trim()

  await sendEmail({ to: user.email, subject, html })
}

export async function notifyHotlineMessage(params: {
  champion: Pick<User, 'id' | 'name'>
  body: string
}): Promise<void> {
  const { champion, body } = params
  const link = `${appBaseUrl()}/admin/hotline?champion=${encodeURIComponent(champion.id)}`
  await postAdminSlack(`💬 *핫라인 메시지* — ${champion.name}\n${body.length > 140 ? body.slice(0, 140) + '…' : body}\n<${link}|대화 보기>`)

  const to = adminEmail()
  if (!to) return
  const subject = `[핫라인] ${escapeHtml(champion.name)} 에서 메시지가 도착했습니다`
  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px">
    <h2 style="margin:0;font-size:18px">💬 Admin 핫라인 메시지</h2>
  </div>
  <table style="width:100%;font-size:14px;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#64748b;width:100px">챔피언</td><td style="padding:8px 0;font-weight:600">${escapeHtml(champion.name)}</td></tr>
    <tr><td style="padding:8px 0;color:#64748b;vertical-align:top">메시지</td><td style="padding:8px 0;white-space:pre-wrap">${escapeHtml(body)}</td></tr>
  </table>
  <div style="margin-top:24px">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">대화 바로 보기</a>
  </div>
</div>
`.trim()
  try {
    await sendEmail({ to, subject, html })
  } catch (e) {
    console.error('[email] notifyHotlineMessage failed:', e)
  }
}
