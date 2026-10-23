'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { RECAP_CHANNEL_FORMAT_HINT, parseRecapChannelId } from '@/lib/recap/channelId'

interface Props {
  userId: string
  name: string
  channelId: string | null
  onSaved: (channelId: string | null) => void
}

const BTN: React.CSSProperties = {
  fontSize: 12, padding: '3px 10px', borderRadius: 6, whiteSpace: 'nowrap', cursor: 'pointer',
  border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)',
}
const PRIMARY_BTN: React.CSSProperties = {
  ...BTN, background: 'var(--blue-600)', borderColor: 'var(--blue-600)', color: 'var(--text-inverse)',
}
const CHIP: React.CSSProperties = {
  fontSize: 12, padding: '2px 8px', borderRadius: 4, display: 'inline-block', whiteSpace: 'nowrap',
}

/** 1-on-1 현황 표의 'recap 채널' 칸: 저장된 채널 ID 표시 + 인라인 수정(저장·지우기). */
export function RecapChannelCell({ userId, name, channelId, onSaved }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(channelId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    setDraft(channelId ?? '')
    setError(null)
    setEditing(true)
  }

  const save = async (value: string | null) => {
    const parsed = parseRecapChannelId(value)
    if (!parsed.ok) {
      setError(parsed.error)
      toast.error(parsed.error)
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch<{ ok: true; channelId: string | null }>(
        `/api/admin/users/${encodeURIComponent(userId)}/recap-channel`,
        { method: 'PATCH', body: JSON.stringify({ channelId: parsed.channelId }) },
      )
      onSaved(res.channelId)
      setEditing(false)
      setError(null)
      toast.success(res.channelId ? `${name} recap 채널을 저장했어요` : `${name} recap 채널을 지웠어요`)
    } catch (e) {
      const message = e instanceof Error ? e.message : '알 수 없는 오류'
      toast.error(`recap 채널 저장 실패: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
        {channelId ? (
          <code style={{ ...CHIP, background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}>{channelId}</code>
        ) : (
          <span style={{ ...CHIP, background: 'rgba(100,116,139,0.1)', color: 'var(--text-secondary)' }}>미설정</span>
        )}
        <button type="button" onClick={startEdit} aria-label={`${name} recap 채널 수정`} style={BTN}>
          수정
        </button>
      </div>
    )
  }

  const errorId = `recap-channel-error-${userId}`
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save(draft)
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          placeholder="C0123ABCD"
          aria-label={`${name} recap 채널 ID`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={saving}
          autoFocus
          style={{
            fontSize: 12, padding: '3px 8px', borderRadius: 6, width: 130, fontFamily: 'monospace',
            border: `1px solid ${error ? 'var(--error)' : 'var(--border-subtle)'}`,
            background: 'var(--surface-primary)', color: 'var(--text-primary)',
          }}
        />
        <button type="submit" disabled={saving} style={PRIMARY_BTN}>저장</button>
        <button type="button" disabled={saving || !channelId} onClick={() => void save(null)} style={BTN}>지우기</button>
        <button type="button" disabled={saving} onClick={() => setEditing(false)} style={BTN}>취소</button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs" style={{ margin: 0, color: 'var(--error)' }}>
          {error}
        </p>
      )}
      <p className="text-xs" style={{ margin: 0, color: 'var(--text-secondary)', whiteSpace: 'normal' }}>
        {RECAP_CHANNEL_FORMAT_HINT}
      </p>
    </form>
  )
}
