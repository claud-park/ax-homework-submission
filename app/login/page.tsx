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
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(var(--background))' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>AX Homework</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>챔피언 로그인</p>
        <button
          onClick={handleGoogleLogin}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ background: 'var(--blue-600)', color: '#fff' }}
        >
          Google로 계속하기
        </button>
        <p className="text-center mt-6 text-xs" style={{ color: 'var(--text-disabled)' }}>
          관리자는 <a href="/admin/login" style={{ color: 'var(--blue-600)' }}>여기서 로그인</a>
        </p>
      </div>
    </div>
  )
}
