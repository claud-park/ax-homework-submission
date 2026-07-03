import nodemailer from 'nodemailer'
import { withRetry } from '@/lib/retry'

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
  // 일시적 SMTP/네트워크 오류에 대비해 지수 백오프 재시도. 최종 실패 시 기존과 동일하게 throw.
  await withRetry(() => transporter.sendMail({ from: user, to, subject, html }), {
    attempts: 3,
    baseDelayMs: 500,
    onRetry: (err, attempt) =>
      console.warn(`[email] send failed (attempt ${attempt}/3) to=${to}: ${err instanceof Error ? err.message : String(err)}`),
  })
}
