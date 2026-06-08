'use client'
import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { apiFetch } from '@/lib/api-client'

const SectionEditorInner = dynamic(() => import('./SectionEditorInner'), {
  ssr: false,
  loading: () => (
    <div className="p-3 min-h-24 animate-pulse" style={{ background: 'var(--surface-secondary)', borderRadius: 4 }} />
  ),
})
import type { ProjectCharter, CharterSubmission, Milestone } from '@/lib/types'
import DateRangePicker from '@/components/DateRangePicker'
import { CharterCommentPanel } from '@/components/CharterCommentPanel'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { ChevronsLeft, ChevronsRight, FileText, FileDown } from 'lucide-react'
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'

type SectionKey = 'summary' | 'problem' | 'user' | 'goal' | 'solution' | 'build' | 'closing'

type CharterContent = ProjectCharter['content']
type SidePanel = null | 'new' | CharterSubmission

const SECTIONS: { key: SectionKey; label: string; required?: boolean; tooltip?: string; placeholder?: string; groupHeader?: string }[] = [
  { key: 'summary', label: '00. 30-Second Summary', required: true, groupHeader: '프로젝트 정의', tooltip: '이 프로젝트의 의의 — 어떤 반향을 기대하는가', placeholder: '30초 안에 누구에게든 설명할 수 있는 한 문단. 왜 이 프로젝트가 존재하는가?' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가', required: true, tooltip: '회사·부서·개인 차원에서 이 문제가 왜 중요한지 (영향 범위 넓을수록 좋아요)', placeholder: '지금 어떤 문제가 있고, 그 문제를 왜 지금 풀어야 하는가?' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가', required: true, groupHeader: '대상과 목표', tooltip: '누가 쓸 것인가? Persona, 시나리오, Use Case 중심으로', placeholder: '이 솔루션을 쓰는 사람은 누구인가? 어떤 상황에서, 무엇을 하려고 쓰는가?' },
  { key: 'goal', label: '03. Goal · Success Metric', required: true, tooltip: "목표 한 줄 요약 — 정성/정량 모두 OK ('업무 시간 단축'도 충분해요)", placeholder: '이 프로젝트가 성공했을 때 무엇이 달라지는가? 어떻게 측정할 것인가?' },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가', required: true, groupHeader: '해결 방법', tooltip: '핵심 기능과 지표 — 무엇을 만들고 무엇으로 측정할지', placeholder: '핵심 기능 3가지와 각 기능이 어떻게 문제를 해결하는지 설명해보세요.' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가', required: true, tooltip: '어떻게 만들 것인가 — 기술 스택, 구현 접근법', placeholder: '기술 스택, 구현 방식, 예상 일정, 필요한 협업을 정리해주세요.' },
  { key: 'closing', label: '07. 마무리', required: true, groupHeader: '마무리', tooltip: '이 시스템이 어떤 의사결정을 지원하는지', placeholder: '이 프로젝트가 완성됐을 때 어떤 의사결정이 달라지는가?' },
]


function fmtMD(s: string): string {
  if (!s) return ''
  const [, m, d] = s.split('-').map(Number)
  return `${m}/${d}`
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const id = `tooltip-${text.slice(0, 8).replace(/\s/g, '')}`

  function openTooltip() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({
        top: r.top - 6,
        left: Math.min(r.left, window.innerWidth - 308),
      })
    }
    setShow(true)
  }

  return (
    <div className="inline-flex items-center">
      <button
        ref={btnRef}
        type="button"
        aria-label="설명 보기"
        aria-describedby={show ? id : undefined}
        onMouseEnter={openTooltip}
        onMouseLeave={() => setShow(false)}
        onFocus={openTooltip}
        onBlur={() => setShow(false)}
        style={{ background: 'none', border: 'none', cursor: 'default', padding: 0, color: 'var(--text-disabled)', fontSize: 11, userSelect: 'none', lineHeight: 1 }}
      >
        ⓘ
      </button>
      {show && createPortal(
        <div
          id={id}
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: 'translateY(-100%)',
            width: 300,
            zIndex: 9999,
            background: 'var(--text-primary)',
            color: 'var(--surface-primary)',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'normal',
            pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </div>
  )
}

function SectionEditor({ label, required, tooltip, placeholder, content, onBlur, onDirty }: {
  label: string; required?: boolean; tooltip?: string; placeholder?: string; content: string; onBlur: (html: string) => void; onDirty?: () => void
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden focus-within:ring-2 focus-within:ring-blue-accent"
      style={{ borderColor: 'var(--border)' }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-1.5">
          {required && <span style={{ color: 'var(--amber)', fontSize: 13, lineHeight: 1 }}>*</span>}
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
        {required && <span className="text-xs font-medium" style={{ color: 'var(--amber)' }}>필수</span>}
      </div>
      <div style={{ background: 'var(--background)' }}>
        <SectionEditorInner
          content={content}
          placeholder={placeholder}
          onBlur={onBlur}
          onDirty={onDirty}
        />
      </div>
    </div>
  )
}

function SectionGroupHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text-disabled)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
    </div>
  )
}

const TIMELINE_INPUT: React.CSSProperties = {
  background: 'var(--background)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  color: 'var(--text-primary)',
  padding: '6px 10px',
  fontSize: '13px',
  width: '100%',
}

function TimelineSection({ milestones, onAdded, onUpdated, onDeleted }: {
  milestones: Milestone[]
  onAdded: (m: Milestone) => void
  onUpdated: (m: Milestone) => void
  onDeleted: (id: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', start_date: '', due_date: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', start_date: '', due_date: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [subFormParentId, setSubFormParentId] = useState<string | null>(null)
  const [subForm, setSubForm] = useState({ title: '', start_date: '', due_date: '' })
  const [subSaving, setSubSaving] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const depth0 = [...milestones]
    .filter(m => !m.parent_milestone_id)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  const byParent = new Map<string, Milestone[]>()
  for (const m of milestones) {
    if (m.parent_milestone_id) {
      const arr = byParent.get(m.parent_milestone_id) ?? []
      arr.push(m)
      byParent.set(m.parent_milestone_id, arr)
    }
  }

  async function handleReorder(draggedId: string, targetId: string) {
    const draggedMs = milestones.find(m => m.id === draggedId)
    const targetMs = milestones.find(m => m.id === targetId)
    if (!draggedMs || !targetMs) return
    if (draggedMs.parent_milestone_id !== targetMs.parent_milestone_id) return

    const group = draggedMs.parent_milestone_id === null
      ? depth0
      : (byParent.get(draggedMs.parent_milestone_id) ?? []).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

    const srcIdx = group.findIndex(m => m.id === draggedId)
    const dstIdx = group.findIndex(m => m.id === targetId)
    if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx) return

    const reordered = [...group]
    const [removed] = reordered.splice(srcIdx, 1)
    reordered.splice(dstIdx, 0, removed)

    const updates = reordered.map((m, i) => ({ ...m, display_order: i }))
    updates.forEach(m => onUpdated(m))

    try {
      await Promise.all(updates.map(m =>
        apiFetch<{ milestone: Milestone }>(`/api/milestones/${m.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ display_order: m.display_order }),
        }).then(({ milestone }) => onUpdated(milestone))
      ))
    } catch {
      toast.error('순서 저장 실패')
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const { milestone: created } = await apiFetch<{ milestone: Milestone, parentUpdated: Milestone | null }>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          publish_status: 'published',
        }),
      })
      onAdded(created)
      setForm({ title: '', start_date: '', due_date: '' })
      setShowForm(false)
      toast.success('마일스톤이 추가되었습니다.')
    } catch (e: unknown) {
      toast.error('마일스톤 저장 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  async function handleAddSub(parentId: string, e: React.FormEvent) {
    e.preventDefault()
    setSubSaving(true)
    try {
      const { milestone: created, parentUpdated } = await apiFetch<{ milestone: Milestone, parentUpdated: Milestone | null }>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({
          title: subForm.title,
          parent_milestone_id: parentId,
          start_date: subForm.start_date || null,
          due_date: subForm.due_date || null,
          publish_status: 'published',
        }),
      })
      onAdded(created)
      if (parentUpdated) onUpdated(parentUpdated)
      setSubForm({ title: '', start_date: '', due_date: '' })
      setSubFormParentId(null)
      toast.success('서브 마일스톤이 추가되었습니다.')
    } catch (e: unknown) {
      toast.error('서브 마일스톤 저장 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubSaving(false)
    }
  }

  function openEdit(m: Milestone) {
    setEditingId(m.id)
    setEditForm({ title: m.title, start_date: m.start_date ?? '', due_date: m.due_date ?? '' })
    setConfirmDeleteId(null)
    setSubFormParentId(null)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    setEditSaving(true)
    try {
      const { milestone: updated, parentUpdated } = await apiFetch<{ milestone: Milestone, parentUpdated: Milestone | null }>(`/api/milestones/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title,
          start_date: editForm.start_date || null,
          due_date: editForm.due_date || null,
        }),
      })
      onUpdated(updated)
      if (parentUpdated) onUpdated(parentUpdated)
      setEditingId(null)
      toast.success('마일스톤이 수정되었습니다.')
    } catch (e: unknown) {
      toast.error('마일스톤 수정 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const { parentUpdated } = await apiFetch<{ parentUpdated: Milestone | null }>(`/api/milestones/${id}`, { method: 'DELETE' })
      onDeleted(id)
      if (parentUpdated) onUpdated(parentUpdated)
      setConfirmDeleteId(null)
      toast.success('마일스톤이 삭제되었습니다.')
    } catch (e: unknown) {
      toast.error('마일스톤 삭제 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  function renderRow(m: Milestone, isChild: boolean) {
    const indent = isChild ? 'pl-8 pr-4' : 'px-4'

    if (editingId === m.id) {
      return (
        <li key={m.id} className={`${indent} py-2 border-b`} style={{ borderColor: 'var(--border-subtle)' }}>
          <form onSubmit={handleEditSubmit} className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
              <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required style={TIMELINE_INPUT} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>기간</label>
              <DateRangePicker startDate={editForm.start_date} endDate={editForm.due_date} onChange={(s, e) => setEditForm(f => ({ ...f, start_date: s, due_date: e }))} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>취소</button>
              <button type="submit" disabled={editSaving || !editForm.title} className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>{editSaving ? '저장 중...' : '저장'}</button>
            </div>
          </form>
        </li>
      )
    }

    if (confirmDeleteId === m.id) {
      return (
        <li key={m.id} className={`flex items-center gap-2 ${indent} py-1.5`}>
          <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}><span className="font-semibold">{m.title}</span> 삭제할까요?</span>
          <button type="button" onClick={() => handleDelete(m.id)} className="text-xs px-2.5 py-1 rounded font-semibold" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid rgba(248,113,113,0.4)' }}>확인</button>
          <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs px-2.5 py-1 rounded font-semibold" style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>취소</button>
        </li>
      )
    }

    const dateStr = m.start_date ? `${fmtMD(m.start_date)} – ${fmtMD(m.due_date ?? '')}` : ''
    const isDragOver = dragOverId === m.id && draggingId !== m.id

    return (
      <li
        key={m.id}
        draggable
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(m.id) }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverId(m.id) }}
        onDragLeave={() => setDragOverId(null)}
        onDrop={e => { e.preventDefault(); if (draggingId) handleReorder(draggingId, m.id); setDraggingId(null); setDragOverId(null) }}
        onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
        className={`group flex items-center gap-2 py-1.5 ${indent}`}
        style={{ opacity: draggingId === m.id ? 0.4 : 1, borderTop: isDragOver ? '2px solid var(--blue-600)' : '2px solid transparent', cursor: 'grab' }}
      >
        <span className="text-xs flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: 'var(--text-disabled)', cursor: 'grab' }}>⠿</span>
        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-disabled)' }}>{isChild ? '└' : '·'}</span>
        <span className="text-xs font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
        {dateStr && <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-disabled)' }}>{dateStr}</span>}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button type="button" onClick={() => openEdit(m)} className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-disabled)', background: 'none' }} title="수정">✏</button>
          <button type="button" onClick={() => { setConfirmDeleteId(m.id); setEditingId(null); setSubFormParentId(null) }} className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-disabled)', background: 'none' }} title="삭제">✕</button>
        </div>
      </li>
    )
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>06. Timeline · Milestones</span>
          <InfoTooltip text="주별 마일스톤 — WBS 탭과 연동됩니다" />
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="text-xs px-2.5 py-1 rounded font-semibold"
          style={{
            background: showForm ? 'transparent' : 'var(--blue-600)',
            color: showForm ? 'var(--text-secondary)' : '#fff',
            border: showForm ? '1px solid var(--border)' : 'none',
          }}
        >
          {showForm ? '취소' : '+ 추가'}
        </button>
      </div>

      {/* Inline add form (depth-0) */}
      {showForm && (
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 1단계 개발" required style={TIMELINE_INPUT} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>기간</label>
              <DateRangePicker startDate={form.start_date} endDate={form.due_date} onChange={(s, e) => setForm(f => ({ ...f, start_date: s, due_date: e }))} />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving || !form.title || !form.start_date || !form.due_date} className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>
                {saving ? '저장 중...' : '추가'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Milestone list */}
      <div style={{ background: 'var(--background)', minHeight: 56 }}>
        {depth0.length === 0 ? (
          <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-disabled)' }}>아직 마일스톤이 없습니다. 위에서 추가해보세요.</p>
        ) : (
          <ul className="py-1">
            {depth0.map(m => {
              const children = (byParent.get(m.id) ?? []).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
              return (
                <Fragment key={m.id}>
                  {renderRow(m, false)}
                  {children.map(child => renderRow(child, true))}
                  {subFormParentId !== m.id && (
                    <li className="pl-8 pr-4 py-1">
                      <button
                        type="button"
                        onClick={() => { setSubFormParentId(m.id); setEditingId(null); setConfirmDeleteId(null) }}
                        className="text-xs hover:opacity-60 transition-opacity"
                        style={{ color: 'var(--text-disabled)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        + 서브 마일스톤 추가
                      </button>
                    </li>
                  )}
                  {subFormParentId === m.id && (
                    <li className="pl-8 pr-4 py-2 border-t" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                      <form onSubmit={e => handleAddSub(m.id, e)} className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={subForm.title}
                          onChange={e => setSubForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="서브 마일스톤 이름"
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Escape') { setSubFormParentId(null); setSubForm({ title: '', start_date: '', due_date: '' }) } }}
                          required
                          style={{ ...TIMELINE_INPUT, fontSize: '12px' }}
                        />
                        <DateRangePicker startDate={subForm.start_date} endDate={subForm.due_date} onChange={(s, e) => setSubForm(f => ({ ...f, start_date: s, due_date: e }))} />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => { setSubFormParentId(null); setSubForm({ title: '', start_date: '', due_date: '' }) }} className="text-xs px-3 py-1 rounded-lg font-semibold" style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>취소</button>
                          <button type="submit" disabled={subSaving || !subForm.title || !subForm.start_date || !subForm.due_date} className="text-xs px-3 py-1 rounded-lg font-semibold disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>{subSaving ? '저장 중...' : '추가'}</button>
                        </div>
                      </form>
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// Keyed by submission id or 'new' — remounts when switching between items
function CharterPanel({ mode, submission, onCreated, onUpdated, onAutoSaved }: {
  mode: 'new' | 'edit'
  submission?: CharterSubmission
  onCreated: (sub: CharterSubmission) => void
  onUpdated: (sub: CharterSubmission) => void
  onAutoSaved?: (sub: CharterSubmission) => void
}) {
  const [projectName, setProjectName] = useState(submission?.project_name ?? '')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const contentRef = useRef<CharterContent>(submission?.content ?? {})
  const [milestones, setMilestones] = useState<Milestone[]>([])

  // Auto-save state (new mode only)
  const autoSavedSubRef = useRef<CharterSubmission | null>(null)
  const autoSavePendingRef = useRef(false)
  const projectNameRef = useRef(projectName)
  const [autoSavingDisplay, setAutoSavingDisplay] = useState(false)
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<Date | null>(null)
  useEffect(() => { projectNameRef.current = projectName }, [projectName])

  // Auto-save state (edit mode)
  const editAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editAutoSavePendingRef = useRef(false)

  // Always-current auto-save function (avoids stale closures via ref pattern)
  const triggerAutoSaveRef = useRef(async () => {})
  triggerAutoSaveRef.current = async () => {
    if (autoSavePendingRef.current) return
    autoSavePendingRef.current = true
    setAutoSavingDisplay(true)
    try {
      const payload = { project_name: projectNameRef.current, content: contentRef.current, publish_status: 'draft' as const }
      let result: CharterSubmission
      if (autoSavedSubRef.current) {
        result = await apiFetch<CharterSubmission>(`/api/charter/submissions/${autoSavedSubRef.current.id}`, {
          method: 'PATCH', body: JSON.stringify(payload),
        })
      } else {
        result = await apiFetch<CharterSubmission>('/api/charter/submissions', {
          method: 'POST', body: JSON.stringify(payload),
        })
      }
      autoSavedSubRef.current = result
      setLastAutoSavedAt(new Date())
      onAutoSaved?.(result)
    } catch { /* silent */ }
    finally {
      autoSavePendingRef.current = false
      setAutoSavingDisplay(false)
    }
  }

  useEffect(() => {
    if (mode !== 'new') return
    const interval = setInterval(() => { void triggerAutoSaveRef.current() }, 30000)
    return () => clearInterval(interval)
  }, [mode])

  // Edit mode auto-save — always-current via ref pattern (avoids stale closures)
  const editAutoSaveRef = useRef(async () => {})
  editAutoSaveRef.current = async () => {
    if (mode !== 'edit' || !submission || editAutoSavePendingRef.current) return
    editAutoSavePendingRef.current = true
    setAutoSavingDisplay(true)
    try {
      const updated = await apiFetch<CharterSubmission>(`/api/charter/submissions/${submission.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          project_name: projectNameRef.current,
          content: contentRef.current,
          publish_status: submission.publish_status,
        }),
      })
      onUpdated(updated)
      setLastAutoSavedAt(new Date())
    } catch { /* silent — 자동저장 실패는 toast 없이 무시 */ }
    finally {
      editAutoSavePendingRef.current = false
      setAutoSavingDisplay(false)
    }
  }

  function scheduleAutoSave() {
    if (mode !== 'edit') return
    if (editAutoSaveTimerRef.current) clearTimeout(editAutoSaveTimerRef.current)
    editAutoSaveTimerRef.current = setTimeout(() => {
      void editAutoSaveRef.current()
    }, 1500)
  }

  useEffect(() => {
    if (mode !== 'edit') return
    apiFetch<Milestone[]>('/api/milestones')
      .then(data => setMilestones(data.filter(m => m.publish_status === 'published')))
      .catch(() => {})
  }, [mode])

  useEffect(() => {
    return () => {
      if (editAutoSaveTimerRef.current) clearTimeout(editAutoSaveTimerRef.current)
    }
  }, [])

  function handleSectionBlur(key: SectionKey, html: string) {
    contentRef.current = { ...contentRef.current, [key]: html }
  }

  async function handleSave(targetStatus: 'draft' | 'published'): Promise<boolean> {
    setSaving(true)
    try {
      if (mode === 'new') {
        const existingId = autoSavedSubRef.current?.id
        const payload = { project_name: projectName, content: contentRef.current, publish_status: targetStatus }
        const newSub = existingId
          ? await apiFetch<CharterSubmission>(`/api/charter/submissions/${existingId}`, {
              method: 'PATCH', body: JSON.stringify(payload),
            })
          : await apiFetch<CharterSubmission>('/api/charter/submissions', {
              method: 'POST', body: JSON.stringify(payload),
            })
        onCreated(newSub)
      } else {
        const updated = await apiFetch<CharterSubmission>(`/api/charter/submissions/${submission!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            project_name: projectName,
            content: contentRef.current,
            publish_status: targetStatus,
          }),
        })
        onUpdated(updated)
      }
      toast.success(targetStatus === 'draft' ? '임시저장되었습니다.' : '게시되었습니다.')
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      try {
        const parsed = JSON.parse(msg)
        if (parsed.error === 'validation_failed') {
          toast.error('게시 실패: 필수 항목을 확인해주세요')
          return false
        }
      } catch { /* not JSON */ }
      toast.error((targetStatus === 'draft' ? '임시저장 실패: ' : '게시 실패: ') + msg)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      const { Document, Paragraph, TextRun, HeadingLevel, Packer, UnderlineType,
        Table: DocxTable, TableRow: DocxTableRow, TableCell: DocxTableCell, WidthType, BorderStyle } = await import('docx')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { saveAs } = require('file-saver') as { saveAs: typeof import('file-saver').saveAs }
      const src = contentRef.current
      const today = new Date().toLocaleDateString('ko-KR')

      type TR = InstanceType<typeof TextRun>
      type P = InstanceType<typeof Paragraph>
      type DocxChild = P | InstanceType<typeof DocxTable>
      type InlineStyles = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean }

      const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'cccccc' }
      const tableBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder, insideH: cellBorder, insideV: cellBorder }

      const inlineNodes = (node: Node, s: InlineStyles): TR[] => {
        const runs: TR[] = []
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) {
            const text = child.textContent || ''
            if (text) runs.push(new TextRun({
              text, size: 22,
              bold: s.bold || undefined,
              italics: s.italic || undefined,
              underline: s.underline ? { type: UnderlineType.SINGLE } : undefined,
              strike: s.strike || undefined,
              font: s.code ? 'Courier New' : undefined,
            }))
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as Element
            const tag = el.tagName.toLowerCase()
            const ns: InlineStyles = { ...s }
            if (tag === 'strong' || tag === 'b') ns.bold = true
            if (tag === 'em' || tag === 'i') ns.italic = true
            if (tag === 'u') ns.underline = true
            if (tag === 's' || tag === 'del' || tag === 'strike') ns.strike = true
            if (tag === 'code') ns.code = true
            runs.push(...inlineNodes(el, ns))
          }
        }
        return runs
      }

      const htmlToChildren = (html: string): DocxChild[] => {
        if (!html?.trim()) return [new Paragraph({ children: [new TextRun({ text: '(내용 없음)', size: 22, color: '888888' })] })]
        const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
        const result: DocxChild[] = []
        let olIdx = 0

        const walk = (node: Node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return
          const el = node as Element
          const tag = el.tagName.toLowerCase()
          if (tag === 'p') {
            const runs = inlineNodes(el, {})
            result.push(new Paragraph({ children: runs.length ? runs : [new TextRun({ text: '' })] }))
          } else if (tag === 'ul') {
            olIdx = 0
            for (const li of el.children)
              result.push(new Paragraph({ children: inlineNodes(li, {}), bullet: { level: 0 } }))
          } else if (tag === 'ol') {
            olIdx = 0
            for (const li of el.children) {
              olIdx++
              result.push(new Paragraph({ children: [new TextRun({ text: `${olIdx}. `, size: 22 }), ...inlineNodes(li, {})] }))
            }
          } else if (tag === 'blockquote') {
            for (const child of el.childNodes) walk(child)
          } else if (tag === 'pre') {
            const text = (el.querySelector('code') ?? el).textContent || ''
            result.push(new Paragraph({ children: [new TextRun({ text, size: 20, font: 'Courier New' })] }))
          } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
            result.push(new Paragraph({ children: inlineNodes(el, { bold: true }), spacing: { before: 200, after: 80 } }))
          } else if (tag === 'table') {
            const trs = Array.from(el.querySelectorAll('tr'))
            const colCount = trs.reduce((max, tr) => Math.max(max, tr.children.length), 0)
            const colWidthPct = colCount > 0 ? Math.floor(100 / colCount) : 100
            const colWidthDxa = colCount > 0 ? Math.floor(9360 / colCount) : 9360
            const rows: InstanceType<typeof DocxTableRow>[] = []
            for (const tr of trs) {
              const cells: InstanceType<typeof DocxTableCell>[] = []
              for (const cell of tr.children) {
                const isHeader = cell.tagName.toLowerCase() === 'th'
                const runs = inlineNodes(cell, { bold: isHeader })
                cells.push(new DocxTableCell({
                  children: [new Paragraph({ children: runs.length ? runs : [new TextRun({ text: '' })] })],
                  borders: tableBorders,
                  shading: isHeader ? { fill: 'f2f2f5' } : undefined,
                  width: { size: colWidthPct, type: WidthType.PERCENTAGE },
                }))
              }
              if (cells.length) rows.push(new DocxTableRow({ children: cells }))
            }
            if (rows.length) {
              result.push(new DocxTable({
                rows,
                width: { size: 100, type: WidthType.PERCENTAGE },
                columnWidths: Array(colCount).fill(colWidthDxa),
              }))
            }
          } else {
            for (const child of el.childNodes) walk(child)
          }
        }

        for (const child of dom.body.childNodes) walk(child)
        return result.length ? result : [new Paragraph({ children: [new TextRun({ text: '(내용 없음)', size: 22, color: '888888' })] })]
      }

      const coverChildren = [
        new Paragraph({ children: [new TextRun({ text: 'AX · 과제정의서', size: 24, color: '888888' })] }),
        new Paragraph({ text: projectName || '과제정의서', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: '' }),
        new Paragraph({ children: [new TextRun({ text: `작성일: ${today}`, size: 20, color: '666666' })] }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: '' }),
      ]

      const bodyChildren = SECTIONS.flatMap(s => [
        new Paragraph({ text: s.label, heading: HeadingLevel.HEADING_2 }),
        ...htmlToChildren(src[s.key] ?? ''),
        new Paragraph({ text: '' }),
      ])

      const sortedMs = [...milestones].sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
      const timelineChildren = [
        new Paragraph({ text: '06. Timeline · Milestones', heading: HeadingLevel.HEADING_2 }),
        ...(sortedMs.length === 0
          ? [new Paragraph({ children: [new TextRun({ text: '(마일스톤 없음)', size: 22, color: '888888' })] })]
          : sortedMs.map(m => new Paragraph({
              children: [new TextRun({ text: `${m.title}  ${m.start_date ?? ''} – ${m.due_date ?? ''}`, size: 22 })],
              bullet: { level: 0 },
            }))),
        new Paragraph({ text: '' }),
      ]

      const doc = new Document({
        sections: [{ children: [...coverChildren, ...bodyChildren, ...timelineChildren] }],
      })
      const blob = await Packer.toBlob(doc)
      saveAs(blob, `과제정의서_${projectName || 'charter'}.docx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center gap-4 px-6 py-3.5 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
        <div className="flex-1 min-w-0">
          <label htmlFor="charter-project-name" className="sr-only">프로젝트명</label>
          <input
            id="charter-project-name"
            type="text"
            value={projectName}
            onChange={e => { setProjectName(e.target.value); scheduleAutoSave() }}
            placeholder="프로젝트명을 입력하세요"
            className="text-flo-h400 font-semibold bg-transparent outline-none w-full"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {(autoSavingDisplay || lastAutoSavedAt) && (
            <span className="flex items-center gap-1.5 flex-shrink-0" style={{ color: 'var(--text-disabled)', fontSize: 12 }}>
              {autoSavingDisplay
                ? <><Spinner size="sm" className="inline" /> 저장 중...</>
                : lastAutoSavedAt
                  ? `마지막 자동저장 ${lastAutoSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : null}
            </span>
          )}
          <button
            onClick={() => window.open('/charter-guide', 'charter-guide', 'width=780,height=720,resizable=yes,scrollbars=yes')}
            className="text-xs font-medium underline flex-shrink-0"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', marginRight: 8 }}
          >
            과제정의서란?
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            title="DOCX로 내보내기"
            className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
          >
            {exporting ? (<><Spinner size="sm" className="inline" /> 내보내는 중...</>) : <><FileDown className="h-3.5 w-3.5" /> DOCX</>}
          </button>
          <SaveOrPublishButtons
            status={submission?.publish_status}
            saving={saving}
            onSaveDraft={() => handleSave('draft')}
            onPublish={() => handleSave('published')}
            size="sm"
          />
        </div>
      </div>

      {/* Section editors */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-4 max-w-3xl mx-auto">
          {mode === 'edit' && submission && (
            <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
              마지막 수정: {new Date(submission.updated_at).toLocaleString('ko-KR')}
            </p>
          )}
          {SECTIONS.map(s => (
            <Fragment key={`${submission?.id ?? mode}-${s.key}`}>
              {s.groupHeader && <SectionGroupHeader label={s.groupHeader} />}
              <SectionEditor
                label={s.label}
                required={s.required}
                tooltip={s.tooltip}
                placeholder={s.placeholder}
                content={(submission?.content ?? {})[s.key] ?? ''}
                onBlur={html => handleSectionBlur(s.key, html)}
                onDirty={scheduleAutoSave}
              />
            </Fragment>
          ))}
          <SectionGroupHeader label="일정" />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-disabled)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>마일스톤을 드래그하여 순서를 바꿀 수 있습니다</span>
          <TimelineSection
            milestones={milestones}
            onAdded={m => setMilestones(prev => [...prev, m])}
            onUpdated={m => setMilestones(prev => prev.map(x => x.id === m.id ? m : x))}
            onDeleted={id => setMilestones(prev => prev.filter(x => x.id !== id))}
          />
        </div>
      </div>

    </div>
  )
}

export function CharterClient({ initialSubmission }: { initialSubmission: CharterSubmission | null }) {
  const [sidePanel, setSidePanel] = useState<SidePanel>(initialSubmission)
  const [feedbackOpen, setFeedbackOpen] = useState(true)

  const panelKey = sidePanel === null ? '' : sidePanel === 'new' ? 'new' : sidePanel.id

  function handleCreated(newSub: CharterSubmission) {
    setSidePanel(newSub)
  }

  function handleUpdated(updated: CharterSubmission) {
    setSidePanel(updated)
  }

  // No charter yet — show empty state
  if (sidePanel === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-5" style={{ height: 'calc(100vh - 40px)' }}>
        <EmptyState
          icon={FileText}
          title="과제정의서가 없습니다"
          description="과제정의서를 작성하고 프로젝트를 시작해보세요."
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.open('/charter-guide', 'charter-guide', 'width=780,height=720,resizable=yes,scrollbars=yes')}
            className="text-xs font-medium underline"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)' }}
          >
            과제정의서란?
          </button>
          <button
            onClick={() => setSidePanel('new')}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            + 과제정의서 작성 시작
          </button>
        </div>
      </div>
    )
  }

  // Charter exists (or new mode) — full-width editor
  return (
    <div className="flex" style={{ height: 'calc(100vh - 40px)', minHeight: 0 }}>
      <div className="flex-1 overflow-hidden">
        <CharterPanel
          key={panelKey}
          mode={sidePanel === 'new' ? 'new' : 'edit'}
          submission={sidePanel !== 'new' ? sidePanel : undefined}
          onCreated={handleCreated}
          onUpdated={handleUpdated}
          onAutoSaved={() => {}}
        />
      </div>
      {sidePanel !== 'new' && sidePanel.publish_status === 'published' && (
        <div className="flex border-l flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setFeedbackOpen(v => !v)}
            className="flex flex-col items-center justify-center gap-2 flex-shrink-0 transition-colors"
            style={{
              width: 40,
              background: 'var(--background)',
              border: 'none',
              borderRight: feedbackOpen ? '1px solid var(--border)' : 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
            title={feedbackOpen ? '피드백 닫기' : '피드백 열기'}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          >
            {feedbackOpen
              ? <ChevronsRight className="h-3.5 w-3.5 flex-shrink-0" />
              : <ChevronsLeft className="h-3.5 w-3.5 flex-shrink-0" />
            }
          </button>
          {feedbackOpen && (
            <div className="flex flex-col" style={{ width: 260, minWidth: 240 }}>
              <CharterCommentPanel key={sidePanel.id} charterId={sidePanel.id} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
