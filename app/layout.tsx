import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AX Homework',
  description: 'AX Homework Submission System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
