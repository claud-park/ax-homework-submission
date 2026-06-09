'use client'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
export default function AdminLoginPage() {
  const supabase = createSupabaseBrowserClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError || !data.user?.user_metadata?.is_admin) {
      setError('관리자 계정이 아니거나 비밀번호가 틀렸습니다.')
      await supabase.auth.signOut()
      return
    }
    window.location.href = '/admin'
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
          관리자 로그인
        </h1>
        <p className="text-flo-body2 mb-8" style={{ color: 'var(--text-secondary)' }}>
          Dreamus 어드민 계정으로 로그인하세요
        </p>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="text-flo-body2 outline-none"
            style={{
              height: 44, padding: '0 14px', borderRadius: 12, width: '100%',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="text-flo-body2 outline-none"
            style={{
              height: 44, padding: '0 14px', borderRadius: 12, width: '100%',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          {error && (
            <p className="text-flo-caption1" style={{ color: 'var(--error)' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl text-flo-body2 font-semibold text-white mt-2 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ height: 48, background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
