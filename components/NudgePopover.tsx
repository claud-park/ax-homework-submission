import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'

export type NudgeType = 'no_charter' | 'no_milestone' | 'delayed_milestone'

const ISSUE_LABEL: Record<NudgeType, string> = {
  no_charter: '과제정의서 미제출',
  no_milestone: '마일스톤 미등록',
  delayed_milestone: '마일스톤 지연',
}

interface Props {
  userId: string
  name: string
  nudgeType: NudgeType
  milestoneTitle?: string
  anchorX: number
  anchorY: number
  onClose: () => void
}

export function NudgePopover({ userId, name, nudgeType, milestoneTitle, anchorX, anchorY, onClose }: Props) {
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (sending) return
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [sending, onClose])

  async function handleSend() {
    setSending(true)
    try {
      await apiFetch('/api/admin/nudge', {
        method: 'POST',
        body: JSON.stringify({ userId, nudgeType, milestoneTitle }),
      })
      setSending(false)
      onClose()
      toast.success('📧 넛지 메일을 발송했습니다')
    } catch (e) {
      // 서버 메시지(쿨다운 안내 등)를 그대로 노출. 없으면 일반 문구.
      const msg = e instanceof Error && e.message ? e.message : '메일 발송에 실패했습니다. 다시 시도해주세요.'
      toast.error(msg)
      setSending(false)
    }
  }

  const issueLabel = nudgeType === 'delayed_milestone' && milestoneTitle
    ? `'${milestoneTitle}' 지연`
    : ISSUE_LABEL[nudgeType]

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: anchorX,
        top: anchorY,
        zIndex: 9999,
        minWidth: 180,
        padding: '12px 14px',
        borderRadius: 8,
        background: 'var(--surface-primary)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.14)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{issueLabel}</div>
      </div>
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '7px 12px',
          borderRadius: 6,
          border: 'none',
          background: sending ? 'rgba(217,119,6,0.4)' : 'rgba(217,119,6,0.85)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: sending ? 'default' : 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {sending ? (
          <>
            <span
              className="animate-spin"
              style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff',
                display: 'inline-block',
              }}
            />
            발송 중...
          </>
        ) : (
          '찌르기 📧'
        )}
      </button>
    </div>
  )
}
