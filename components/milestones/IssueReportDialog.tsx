'use client'
import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import type { Milestone, BottleneckType } from '@/lib/types'

const BOTTLENECK_OPTIONS: { value: BottleneckType; label: string }[] = [
  { value: 'technical', label: '기술적 문제' },
  { value: 'resource', label: '리소스 부족' },
  { value: 'external', label: '외부 의존성' },
  { value: 'other', label: '기타' },
]

const CHECKIN_INPUT_STYLE: React.CSSProperties = {
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: '13px',
  width: '100%',
}

export interface IssueReportDialogProps {
  milestone: Milestone | null
  onClose: () => void
  onSubmit: (id: string, type: BottleneckType, note: string) => Promise<void>
}

export function IssueReportDialog({ milestone, onClose, onSubmit }: IssueReportDialogProps) {
  const [form, setForm] = useState<{ type: BottleneckType | ''; note: string }>({ type: '', note: '' })
  const [submitting, setSubmitting] = useState(false)

  function close() {
    setForm({ type: '', note: '' })
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!milestone || !form.type || !form.note.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(milestone.id, form.type as BottleneckType, form.note)
      close()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={!!milestone} onOpenChange={open => { if (!open) close() }}>
      <DialogContent style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
        <DialogHeader>
          <DialogTitle>이슈 보고/도움 요청</DialogTitle>
          {milestone && <DialogDescription>{milestone.title}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              이슈 유형 <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as BottleneckType | '' }))}
              required
              style={{ ...CHECKIN_INPUT_STYLE, cursor: 'pointer' }}
            >
              <option value="">선택해주세요</option>
              {BOTTLENECK_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>설명 <span style={{ color: 'var(--error)' }}>*</span></label>
            <textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="이슈 상황을 자세히 설명해주세요"
              rows={3}
              required
              style={{ ...CHECKIN_INPUT_STYLE, resize: 'none' }}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={close}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !form.type || !form.note.trim()}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--error)', color: 'var(--text-inverse)', opacity: (submitting || !form.type || !form.note.trim()) ? 0.7 : 1 }}
            >
              보고하기
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
