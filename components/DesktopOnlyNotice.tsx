'use client'
import { Monitor } from 'lucide-react'

export function DesktopOnlyNotice() {
  return (
    <div
      className="md:hidden flex flex-col items-center justify-center min-h-[60vh] gap-4 px-8 text-center"
    >
      <Monitor size={40} style={{ color: 'var(--text-disabled)' }} />
      <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
        이 페이지는 PC에서 이용해주세요
      </p>
      <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
        모바일에서는 일부 기능만 제공됩니다
      </p>
    </div>
  )
}
