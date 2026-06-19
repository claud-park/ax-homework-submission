import Link from 'next/link'

export default function NotFound() {
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
          style={{ background: 'color-mix(in srgb, var(--text-tertiary) 10%, transparent)' }}
        >
          <span style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>?</span>
        </div>

        <p className="text-flo-caption1 font-semibold mb-2" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.08em' }}>
          404
        </p>
        <h1 className="text-flo-h400 font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          페이지를 찾을 수 없어요
        </h1>
        <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
          요청하신 페이지가 존재하지 않거나<br />삭제되었을 수 있어요.
        </p>

        <Link
          href="/"
          className="w-full flex items-center justify-center rounded-xl text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90"
          style={{ height: 48, background: 'var(--accent)' }}
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  )
}
