'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--background)' }}
    >
      <div
        className="w-full max-w-[400px] p-10 rounded-3xl border flex flex-col items-center text-center"
        style={{
          background: 'var(--surface-primary)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'color-mix(in srgb, var(--error) 12%, transparent)' }}
        >
          <span style={{ fontSize: 20, color: 'var(--error)' }}>!</span>
        </div>

        <p className="text-flo-caption1 font-semibold mb-2" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
          오류 발생
        </p>
        <h1 className="text-flo-h400 font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          문제가 생겼어요
        </h1>
        <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
          일시적인 오류가 발생했어요.<br />잠시 후 다시 시도해 주세요.
        </p>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={reset}
            className="w-full flex items-center justify-center rounded-xl text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90"
            style={{ height: 48, background: 'var(--accent)' }}
          >
            다시 시도
          </button>
          <a
            href="/"
            className="w-full flex items-center justify-center rounded-xl text-flo-body2 font-semibold transition-opacity hover:opacity-80"
            style={{ height: 48, background: 'var(--button-neutral)', color: 'var(--text-primary)' }}
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  )
}
