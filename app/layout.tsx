import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ConfirmProvider } from '@/components/ui/confirm'

const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  variable: '--font-pretendard',
  weight: '100 900',
})

export const metadata: Metadata = {
  title: "AX Champions' League",
  description: "AX Champions' League — Dreamus AX 과제 관리 플랫폼",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <ConfirmProvider>{children}</ConfirmProvider>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
