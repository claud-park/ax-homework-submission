'use client'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient()

  async function handleGoogleLogin() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'hsl(var(--background))' }}
    >
      <div
        className="w-full max-w-[360px] p-10 rounded-3xl border"
        style={{
          background: 'var(--surface-primary)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-l)',
        }}
      >
        {/* Icon mark */}
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
        >
          <span className="text-flo-body1 font-bold" style={{ color: 'var(--accent)' }}>A</span>
        </div>

        <h1 className="text-flo-h400 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          AX Homework
        </h1>
        <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
          챔피언 로그인
        </p>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90"
          style={{ height: 48, background: 'var(--accent)' }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="white" fillOpacity=".9"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="white" fillOpacity=".9"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="white" fillOpacity=".9"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="white" fillOpacity=".9"/>
          </svg>
          Google로 계속하기
        </button>

        <p className="text-center mt-6 text-flo-caption1" style={{ color: 'var(--text-disabled)' }}>
          관리자는{' '}
          <a href="/admin/login" style={{ color: 'var(--blue-600)' }}>
            여기서 로그인
          </a>
        </p>
      </div>
    </div>
  )
}
