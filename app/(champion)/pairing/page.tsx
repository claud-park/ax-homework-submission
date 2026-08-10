'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'

type ApproveState = 'idle' | 'approving' | 'approved' | 'error'
type PairingScope = 'champion' | 'admin'

function PairingPageInner() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code') ?? ''
  const [scope, setScope] = useState<PairingScope | null>(null)
  const [scopeError, setScopeError] = useState(false)
  const [state, setState] = useState<ApproveState>('idle')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    apiFetch<{ status: string; scope?: PairingScope }>(`/api/pairing/poll?code=${encodeURIComponent(code)}`)
      .then((body) => {
        if (body.status === 'expired' || !body.scope) {
          setScopeError(true)
          return
        }
        setScope(body.scope)
      })
      .catch(() => setScopeError(true))
  }, [code])

  async function handleApprove() {
    setState('approving')
    setMessage(null)
    try {
      await apiFetch('/api/pairing/approve', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })
      setState('approved')
    } catch (err) {
      setState('error')
      setMessage(err instanceof Error ? err.message : 'API error')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'hsl(var(--background))' }}
    >
      <div
        className="w-full max-w-[360px] p-10 rounded-3xl border text-center"
        style={{
          background: 'var(--surface-primary)',
          borderColor: 'var(--border-subtle)',
          boxShadow: 'var(--shadow-l)',
        }}
      >
        <h1 className="text-flo-h400 font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          기기 연결
        </h1>

        {!code && (
          <p className="text-flo-body2 mt-4" style={{ color: 'var(--text-secondary)' }}>
            연결 코드가 없습니다. Claude Code 스킬이 알려준 링크로 다시 접속해주세요.
          </p>
        )}

        {code && scopeError && (
          <p className="text-flo-body2 mt-4" style={{ color: 'var(--text-secondary)' }}>
            코드가 만료되었거나 올바르지 않습니다. 스킬에서 다시 시도해주세요.
          </p>
        )}

        {code && !scope && !scopeError && (
          <p className="text-flo-body2 mt-4" style={{ color: 'var(--text-secondary)' }}>
            확인 중...
          </p>
        )}

        {code && scope && state !== 'approved' && (
          <>
            <p className="text-flo-body2 mb-2" style={{ color: 'var(--text-secondary)' }}>
              {scope === 'admin'
                ? '내 컴퓨터를 관리자 권한으로 이 계정에 연결할까요?'
                : '내 컴퓨터의 Claude Code 스킬을 이 계정에 연결할까요?'}
            </p>
            <p
              className="text-flo-h300 font-mono font-semibold mb-6 tracking-widest"
              style={{ color: 'var(--accent)' }}
            >
              {code}
            </p>
            <button
              onClick={handleApprove}
              disabled={state === 'approving'}
              className="w-full flex items-center justify-center rounded-xl text-flo-body2 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ height: 48, background: 'var(--accent)' }}
            >
              {state === 'approving' ? '연결 중...' : '이 기기 연결하기'}
            </button>
            {message && (
              <p className="text-flo-caption1 mt-4" style={{ color: 'var(--red-600, #dc2626)' }}>
                연결에 실패했습니다: {message}
              </p>
            )}
          </>
        )}

        {state === 'approved' && (
          <p className="text-flo-body2 mt-4" style={{ color: 'var(--text-secondary)' }}>
            연결되었습니다. 터미널로 돌아가주세요 — 곧 자동으로 이어집니다.
          </p>
        )}
      </div>
    </div>
  )
}

export default function PairingPage() {
  return (
    <Suspense fallback={null}>
      <PairingPageInner />
    </Suspense>
  )
}
