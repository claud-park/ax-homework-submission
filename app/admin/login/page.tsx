'use client'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function AdminLoginPage() {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
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
    router.push('/admin')
  }

  const inputStyle = {
    background: 'var(--surface-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(var(--background))' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>관리자 로그인</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>AX Homework Admin</p>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
          {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="py-3 rounded-xl font-semibold text-sm mt-2 disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
