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
