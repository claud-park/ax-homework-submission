import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: 'AX Homework',
  description: 'AX Homework Submission System',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}<Toaster position="top-right" richColors /></body>
    </html>
  )
}
