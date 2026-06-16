'use client'
import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { Milestone } from '@/lib/types'

type Charter = {
  id: string
  user_id: string
  project_name: string | null
  content: Record<string, string>
  submitted_at: string
  updated_at: string
  admin_approved_at: string | null
  users: { id: string; name: string; email: string; avatar_url: string | null }
}

const SECTIONS = [
  { key: 'summary', label: '00. 30-Second Summary' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가' },
  { key: 'goal', label: '03. Goal · Success Metric' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가' },
]

const STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--amber)',
  completed: 'var(--success)', delayed: 'var(--error)',
}
const STATUS_BG: Record<string, string> = {
  not_started: 'rgba(148,163,184,0.12)', in_progress: 'rgba(245,158,11,0.12)',
  completed: 'rgba(34,197,94,0.12)', delayed: 'rgba(248,113,113,0.12)',
}

function stripHtml(html: string) { return html.replace(/<[^>]*>/g, '').trim() }

export default function CharterPopupClient({ charter, milestones, isAdmin = false }: { charter: Charter; milestones: Milestone[]; isAdmin?: boolean }) {
  const [approvedAt, setApprovedAt] = useState<string | null>(charter.admin_approved_at)
  const [approving, setApproving] = useState(false)

  async function handleApprove() {
    setApproving(true)
    try {
      const updated = await apiFetch<{ admin_approved_at: string }>(
        `/api/admin/charters/${charter.id}/approve`,
        { method: 'POST' },
      )
      setApprovedAt(updated.admin_approved_at)
      toast.success('과제정의서가 승인되었습니다.')
      window.opener?.postMessage(
        { type: 'charter_approved', charterId: charter.id, approvedAt: updated.admin_approved_at },
        window.location.origin,
      )
    } catch {
      toast.error('승인 처리에 실패했습니다.')
    } finally {
      setApproving(false)
    }
  }

  const depth0 = milestones
    .filter(m => !m.parent_milestone_id)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  return (
    <div style={{ fontFamily: 'var(--font-pretendard, sans-serif)', background: '#f1f5f9', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 24px',
        background: 'var(--surface-primary)',
        borderBottom: '1px solid var(--border-subtle)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--blue-600)', background: 'rgba(37,99,235,0.12)', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.04em' }}>
              과제정의서
            </span>
            {charter.users.avatar_url
              ? <img src={charter.users.avatar_url} style={{ width: 18, height: 18, borderRadius: '50%' }} alt="" />
              : null}
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{charter.users.name}</span>
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {charter.project_name || '(제목 없음)'}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
            {new Date(charter.updated_at).toLocaleString('ko-KR')}
          </span>
          {approvedAt && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 999, background: 'rgba(22,163,74,0.12)', color: 'var(--success)', border: '1px solid rgba(22,163,74,0.3)' }}>
              ✓ 승인됨
            </span>
          )}
          {isAdmin && !approvedAt && (
            <button
              onClick={handleApprove}
              disabled={approving}
              style={{ fontSize: 12, fontWeight: 600, padding: '4px 14px', borderRadius: 999, background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)', border: '1px solid rgba(37,99,235,0.3)', cursor: 'pointer', opacity: approving ? 0.6 : 1 }}
            >
              {approving ? '처리 중…' : '✓ 승인'}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 00–05 Sections */}
        {SECTIONS.map(({ key, label }) => {
          const html = charter.content[key] ?? ''
          const [num, ...rest] = label.split('. ')
          const title = rest.join('. ')
          return (
            <div key={key} style={{ background: '#ffffff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden', borderLeft: '4px solid var(--blue-600)' }}>
              <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--blue-600)', padding: '1px 7px', borderRadius: 4, letterSpacing: '0.02em', flexShrink: 0 }}>{num}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>{title}</span>
              </div>
              {stripHtml(html) ? (
                <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.75, padding: '14px 18px' }}>
                  <div className="charter-editor">
                    <div className="ProseMirror" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text-disabled)', fontStyle: 'italic', margin: 0, padding: '12px 18px' }}>(내용 없음)</p>
              )}
            </div>
          )
        })}

        {/* 06. Timeline */}
        <div style={{ background: '#ffffff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden', borderLeft: '4px solid var(--blue-600)' }}>
          <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--blue-600)', padding: '1px 7px', borderRadius: 4, letterSpacing: '0.02em', flexShrink: 0 }}>06</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>Timeline · Milestones</span>
          </div>
          {depth0.length > 0 ? (
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {depth0.map(m => {
                const children = milestones
                  .filter(c => c.parent_milestone_id === m.id)
                  .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
                return (
                  <div key={m.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{m.title}</p>
                        {(m.start_date || m.due_date) && (
                          <p style={{ fontSize: 11, color: 'var(--text-disabled)', margin: '2px 0 0' }}>
                            {m.start_date ?? ''}{m.start_date && m.due_date ? ' – ' : ''}{m.due_date ?? ''}
                          </p>
                        )}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: STATUS_COLOR[m.status], background: STATUS_BG[m.status], flexShrink: 0 }}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </div>
                    {children.length > 0 && (
                      <div style={{ marginTop: 6, marginLeft: 16, paddingLeft: 12, borderLeft: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {children.map(c => (
                          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderRadius: 6, background: '#ffffff', border: '1px solid #eef2f7' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{ color: 'var(--text-disabled)', fontSize: 11, flexShrink: 0 }}>↳</span>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</p>
                                {(c.start_date || c.due_date) && (
                                  <p style={{ fontSize: 10, color: 'var(--text-disabled)', margin: '1px 0 0' }}>
                                    {c.start_date ?? ''}{c.start_date && c.due_date ? ' – ' : ''}{c.due_date ?? ''}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 5, color: STATUS_COLOR[c.status], background: STATUS_BG[c.status], flexShrink: 0 }}>
                              {STATUS_LABEL[c.status]}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-disabled)', fontStyle: 'italic', margin: 0, padding: '12px 18px' }}>(마일스톤 없음)</p>
          )}
        </div>

        {/* 07. Closing */}
        <div style={{ background: '#ffffff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.07)', overflow: 'hidden', borderLeft: '4px solid var(--blue-600)' }}>
          <div style={{ padding: '10px 18px 8px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--blue-600)', padding: '1px 7px', borderRadius: 4, letterSpacing: '0.02em', flexShrink: 0 }}>07</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>Closing · 마무리</span>
          </div>
          {stripHtml(charter.content.closing ?? '') ? (
            <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.75, padding: '14px 18px' }}>
              <div className="charter-editor">
                <div className="ProseMirror" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: charter.content.closing ?? '' }} />
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-disabled)', fontStyle: 'italic', margin: 0, padding: '12px 18px' }}>(내용 없음)</p>
          )}
        </div>
      </div>
    </div>
  )
}
