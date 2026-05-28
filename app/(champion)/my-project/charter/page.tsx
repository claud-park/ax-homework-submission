'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { apiFetch } from '@/lib/api-client'
import type { ProjectCharter, CharterSubmission, Milestone } from '@/lib/types'
import DateRangePicker from '@/components/DateRangePicker'
import { CharterCommentPanel } from '@/components/CharterCommentPanel'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { FileText } from 'lucide-react'
import { DraftBadge } from '@/components/DraftBadge'
import { PublishStatusFilter, type PublishFilterValue } from '@/components/PublishStatusFilter'
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'
import { ResizeHandle, useResizableWidth } from '@/components/ui/resize-handle'

type SectionKey = 'summary' | 'problem' | 'user' | 'goal' | 'solution' | 'build'

type CharterContent = ProjectCharter['content']
type SidePanel = null | 'new' | CharterSubmission

const SECTIONS: { key: SectionKey; label: string; required?: boolean; tooltip?: string }[] = [
  { key: 'summary', label: '00. 30-Second Summary', required: true, tooltip: '이 프로젝트의 의의 — 어떤 반향을 기대하는가' },
  { key: 'problem', label: '01. Problem · 왜 이 문제를 푸는가', required: true, tooltip: '회사·부서·개인 차원에서 이 문제가 왜 중요한지 (영향 범위 넓을수록 좋아요)' },
  { key: 'user', label: '02. User · 누가 이걸 쓸 것인가', tooltip: '누가 쓸 것인가? Persona, 시나리오, Use Case 중심으로' },
  { key: 'goal', label: '03. Goal · Success Metric', tooltip: "목표 한 줄 요약 — 정성/정량 모두 OK ('업무 시간 단축'도 충분해요)" },
  { key: 'solution', label: '04. Solution · 어떻게 풀 것인가', tooltip: '핵심 기능과 지표 — 무엇을 만들고 무엇으로 측정할지' },
  { key: 'build', label: '05. Build · 어떻게 만들 것인가', tooltip: '어떻게 만들 것인가 — 기술 스택, 구현 접근법' },
]

function stripHtml(html: string) { return html.replace(/<[^>]*>/g, '').trim() }

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

function SectionEditor({ label, required, tooltip, content, onBlur, onDirty }: {
  label: string; required?: boolean; tooltip?: string; content: string; onBlur: (html: string) => void; onDirty?: () => void
}) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content,
    onBlur: ({ editor }) => onBlur(editor.getHTML()),
    onUpdate: () => onDirty?.(),
  })

  // TipTap v3 initialises content asynchronously; imperatively sync whenever
  // the editor instance becomes available or the content prop changes.
  // false = suppress onUpdate so onDirty isn't triggered spuriously.
  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(content, { emitUpdate: false })
  }, [editor, content])

  return (
    <div className="rounded-xl border overflow-hidden focus-within:ring-2 focus-within:ring-blue-accent" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          {tooltip && <InfoTooltip text={tooltip} />}
        </div>
        {required && <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>}
      </div>
      <div style={{ background: 'var(--surface-secondary)' }}>
        <EditorContent editor={editor} className="p-3 min-h-16 text-sm prose max-w-none [&_.ProseMirror]:outline-none" />
      </div>
    </div>
  )
}

const TIMELINE_INPUT: React.CSSProperties = {
  background: 'var(--surface-primary)',
  border: '1px solid var(--border-subtle)',
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
  const [form, setForm] = useState({ week_number: '1', title: '', start_date: '', due_date: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ week_number: '1', title: '', start_date: '', due_date: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const sorted = [...milestones].sort((a, b) =>
    a.week_number - b.week_number || a.start_date.localeCompare(b.start_date)
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const created = await apiFetch<Milestone>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({
          week_number: parseInt(form.week_number) || null,
          title: form.title,
          start_date: form.start_date || null,
          due_date: form.due_date || null,
          publish_status: 'published',
        }),
      })
      onAdded(created)
      setForm({ week_number: '1', title: '', start_date: '', due_date: '' })
      setShowForm(false)
      toast.success('마일스톤이 추가되었습니다.')
    } catch (e: unknown) {
      toast.error('마일스톤 저장 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  function openEdit(m: Milestone) {
    setEditingId(m.id)
    setEditForm({ week_number: String(m.week_number), title: m.title, start_date: m.start_date, due_date: m.due_date })
    setConfirmDeleteId(null)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    setEditSaving(true)
    try {
      const updated = await apiFetch<Milestone>(`/api/milestones/${editingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          week_number: parseInt(editForm.week_number) || null,
          title: editForm.title,
          start_date: editForm.start_date || null,
          due_date: editForm.due_date || null,
        }),
      })
      onUpdated(updated)
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
      await apiFetch(`/api/milestones/${id}`, { method: 'DELETE' })
      onDeleted(id)
      setConfirmDeleteId(null)
      toast.success('마일스톤이 삭제되었습니다.')
    } catch (e: unknown) {
      toast.error('마일스톤 삭제 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>06. Timeline · Milestones</span>
          <InfoTooltip text="주별 마일스톤 — WBS 탭과 연동됩니다" />
        </div>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="text-xs px-2.5 py-1 rounded font-semibold"
          style={{
            background: showForm ? 'var(--surface-secondary)' : 'var(--blue-600)',
            color: showForm ? 'var(--text-secondary)' : '#fff',
            border: showForm ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          {showForm ? '취소' : '+ 추가'}
        </button>
      </div>

      {/* Inline add form */}
      {showForm && (
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-secondary)' }}>
          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>주차</label>
                <input
                  type="number"
                  value={form.week_number}
                  onChange={e => setForm(f => ({ ...f, week_number: e.target.value }))}
                  min="1"
                  required
                  style={TIMELINE_INPUT}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="예: API 설계 완료"
                  required
                  style={TIMELINE_INPUT}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>기간</label>
              <DateRangePicker
                startDate={form.start_date}
                endDate={form.due_date}
                onChange={(s, e) => setForm(f => ({ ...f, start_date: s, due_date: e }))}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !form.title || !form.start_date || !form.due_date}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}
              >
                {saving ? '저장 중...' : '추가'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Milestone bulleted list */}
      <div style={{ background: 'var(--surface-secondary)', minHeight: 56 }}>
        {sorted.length === 0 ? (
          <p className="px-4 py-4 text-xs" style={{ color: 'var(--text-disabled)' }}>아직 마일스톤이 없습니다. 위에서 추가해보세요.</p>
        ) : (
          <ul className="py-1">
            {sorted.map(m => {
              if (editingId === m.id) {
                return (
                  <li key={m.id} className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <form onSubmit={handleEditSubmit} className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>주차</label>
                          <input type="number" value={editForm.week_number} onChange={e => setEditForm(f => ({ ...f, week_number: e.target.value }))} min="1" required style={TIMELINE_INPUT} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
                          <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required style={TIMELINE_INPUT} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>기간</label>
                        <DateRangePicker startDate={editForm.start_date} endDate={editForm.due_date} onChange={(s, e) => setEditForm(f => ({ ...f, start_date: s, due_date: e }))} />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: 'var(--surface-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                          취소
                        </button>
                        <button type="submit" disabled={editSaving || !editForm.title || !editForm.start_date || !editForm.due_date} className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>
                          {editSaving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </form>
                  </li>
                )
              }

              if (confirmDeleteId === m.id) {
                return (
                  <li key={m.id} className="flex items-center gap-2 px-4 py-1.5">
                    <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-bold" style={{ color: 'var(--blue-600)' }}>W{m.week_number}</span> {m.title} 삭제할까요?
                    </span>
                    <button type="button" onClick={() => handleDelete(m.id)} className="text-xs px-2.5 py-1 rounded font-semibold" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid rgba(248,113,113,0.4)' }}>
                      확인
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs px-2.5 py-1 rounded font-semibold" style={{ background: 'var(--surface-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                      취소
                    </button>
                  </li>
                )
              }

              return (
                <li key={m.id} className="group flex items-center gap-2 px-4 py-1.5">
                  <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>·</span>
                  <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--blue-600)' }}>W{m.week_number}</span>
                  <span className="text-xs font-semibold flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-disabled)' }}>{m.start_date} – {m.due_date}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button type="button" onClick={() => openEdit(m)} className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-disabled)', background: 'none' }} title="수정">
                      ✏
                    </button>
                    <button type="button" onClick={() => { setConfirmDeleteId(m.id); setEditingId(null) }} className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-disabled)', background: 'none' }} title="삭제">
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// Keyed by submission id or 'new' — remounts when switching between items
function CharterPanel({ mode, submission, onClose, onCreated, onUpdated }: {
  mode: 'new' | 'edit'
  submission?: CharterSubmission
  onClose: () => void
  onCreated: (sub: CharterSubmission) => void
  onUpdated: (sub: CharterSubmission) => void
}) {
  const [projectName, setProjectName] = useState(submission?.project_name ?? '')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const contentRef = useRef<CharterContent>(submission?.content ?? {})
  const dirtyRef = useRef<boolean>(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [milestones, setMilestones] = useState<Milestone[]>([])

  useEffect(() => {
    apiFetch<Milestone[]>('/api/milestones')
      .then(data => setMilestones(data.filter(m => m.publish_status === 'published')))
      .catch(() => {})
  }, [])

  function handleSectionBlur(key: SectionKey, html: string) {
    contentRef.current = { ...contentRef.current, [key]: html }
  }

  function handleCloseRequest() {
    if (dirtyRef.current) {
      setShowUnsavedDialog(true)
    } else {
      onClose()
    }
  }

  async function handleSave(targetStatus: 'draft' | 'published'): Promise<boolean> {
    setSaving(true)
    try {
      if (mode === 'new') {
        const newSub = await apiFetch<CharterSubmission>('/api/charter/submissions', {
          method: 'POST',
          body: JSON.stringify({
            project_name: projectName,
            content: contentRef.current,
            publish_status: targetStatus,
          }),
        })
        dirtyRef.current = false
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
        dirtyRef.current = false
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
      const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx')
      // file-saver may export saveAs as named or default depending on bundler
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { saveAs } = require('file-saver') as { saveAs: typeof import('file-saver').saveAs }
      const src = contentRef.current
      const today = new Date().toLocaleDateString('ko-KR')

      const coverChildren = [
        new Paragraph({
          children: [new TextRun({ text: 'AX · 과제정의서', size: 24, color: '888888' })],
        }),
        new Paragraph({ text: projectName || '과제정의서', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: `작성일: ${today}`, size: 20, color: '666666' })],
        }),
        new Paragraph({ text: '' }),
        new Paragraph({ text: '' }),
      ]

      const bodyChildren = SECTIONS.flatMap(s => [
        new Paragraph({ text: s.label, heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: stripHtml(src[s.key] ?? '') || '(내용 없음)', size: 22 })] }),
        new Paragraph({ text: '' }),
      ])

      const sortedMs = [...milestones].sort((a, b) =>
        a.week_number - b.week_number || a.start_date.localeCompare(b.start_date)
      )
      const timelineChildren = [
        new Paragraph({ text: '06. Timeline · Milestones', heading: HeadingLevel.HEADING_2 }),
        ...(sortedMs.length === 0
          ? [new Paragraph({ children: [new TextRun({ text: '(마일스톤 없음)', size: 22, color: '888888' })] })]
          : sortedMs.map(m => new Paragraph({
              children: [new TextRun({ text: `W${m.week_number}  ${m.title}  ${m.start_date} – ${m.due_date}`, size: 22 })],
              bullet: { level: 0 },
            }))
        ),
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
    <div className="flex flex-col h-full border-l" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Panel header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0 whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}>
        <button
          onClick={handleCloseRequest}
          className="text-xs px-2 py-1 rounded"
          style={{ color: 'var(--text-secondary)', background: 'var(--surface-secondary)' }}
        >
          ✕
        </button>
        <div className="flex flex-col flex-1 min-w-0 gap-1">
          <label htmlFor="charter-project-name" className="sr-only">프로젝트명</label>
          <input
            id="charter-project-name"
            type="text"
            value={projectName}
            onChange={e => { dirtyRef.current = true; setProjectName(e.target.value) }}
            placeholder="프로젝트명을 입력하세요"
            className="text-sm font-semibold bg-transparent outline-none w-full"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
          >
            {exporting ? (<><Spinner size="sm" className="inline" /> 내보내는 중...</>) : '📄 DOCX'}
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
      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-3 max-w-2xl">
          {mode === 'edit' && submission && (
            <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
              마지막 수정: {new Date(submission.updated_at).toLocaleString('ko-KR')}
            </p>
          )}
          {SECTIONS.map(s => (
            <SectionEditor
              key={`${submission?.id ?? mode}-${s.key}`}
              label={s.label}
              required={s.required}
              tooltip={s.tooltip}
              content={(submission?.content ?? {})[s.key] ?? ''}
              onBlur={html => handleSectionBlur(s.key, html)}
              onDirty={() => { dirtyRef.current = true }}
            />
          ))}
          <TimelineSection
            milestones={milestones}
            onAdded={m => setMilestones(prev => [...prev, m])}
            onUpdated={m => setMilestones(prev => prev.map(x => x.id === m.id ? m : x))}
            onDeleted={id => setMilestones(prev => prev.filter(x => x.id !== id))}
          />
        </div>
      </div>

      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 않은 변경사항이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>닫기 전에 어떻게 하시겠어요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 편집</AlertDialogCancel>
            <button
              onClick={async () => {
                setShowUnsavedDialog(false)
                const ok = await handleSave('draft')
                if (ok) onClose()
              }}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            >
              임시저장 후 닫기
            </button>
            <AlertDialogAction onClick={() => { setShowUnsavedDialog(false); dirtyRef.current = false; onClose() }}>저장 안 함</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SubmissionCard({ sub, compressed, active, onClick }: {
  sub: CharterSubmission; compressed: boolean; active: boolean; onClick: () => void
}) {
  const date = new Date(sub.updated_at ?? sub.submitted_at).toLocaleDateString('ko-KR')
  const isDraft = sub.publish_status === 'draft'

  if (compressed) {
    return (
      <button onClick={onClick} className="w-full text-left px-3 py-2.5 border-b"
        style={{ borderColor: 'var(--border-subtle)', background: active ? 'rgba(37,99,235,0.08)' : 'transparent' }}>
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold truncate flex-1" style={{ color: active ? 'var(--blue-600)' : 'var(--text-primary)' }}>
            {sub.project_name || '(제목 없음)'}
          </p>
          {isDraft && <DraftBadge />}
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>{date}</p>
      </button>
    )
  }

  return (
    <button onClick={onClick} className="text-left p-4 rounded-xl border transition-colors"
      style={{ borderColor: active ? 'var(--blue-600)' : 'var(--border-subtle)', background: active ? 'rgba(37,99,235,0.06)' : 'var(--surface-primary)' }}>
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {sub.project_name || '(제목 없음)'}
        </p>
        {isDraft && <DraftBadge />}
      </div>
      <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>{date}</p>
    </button>
  )
}


export default function CharterPage() {
  const [submissions, setSubmissions] = useState<CharterSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [sidePanel, setSidePanel] = useState<SidePanel>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { width: listWidth, setWidth: setListWidth, onMouseDown: onResizeList } = useResizableWidth({
    initialWidth: 272,
    min: 220,
    max: 1200,
    side: 'right',
  })

  function openSidePanel(panel: Exclude<SidePanel, null>) {
    if (sidePanel === null && containerRef.current) {
      const hasCommentPanel = panel !== 'new' && panel.publish_status === 'published'
      const ratio = hasCommentPanel ? 0.4 : 0.5
      setListWidth(Math.round(containerRef.current.getBoundingClientRect().width * ratio))
    }
    setSidePanel(panel)
  }
  const [filter, setFilter] = useState<PublishFilterValue>(() => {
    if (typeof window === 'undefined') return 'all'
    const q = new URLSearchParams(window.location.search).get('status') as PublishFilterValue | null
    return q && ['all','published','draft'].includes(q) ? q : 'all'
  })
  useEffect(() => {
    const url = new URL(window.location.href)
    if (filter === 'all') url.searchParams.delete('status')
    else url.searchParams.set('status', filter)
    window.history.replaceState({}, '', url.toString())
  }, [filter])

  useEffect(() => {
    apiFetch<CharterSubmission[]>('/api/charter/submissions')
      .then(setSubmissions)
      .catch((e: Error) => toast.error('과제정의서 목록 로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  const visibleSubmissions = useMemo(
    () => filter === 'all' ? submissions : submissions.filter(s => s.publish_status === filter),
    [submissions, filter]
  )

  const panelKey = sidePanel === null ? '' : sidePanel === 'new' ? 'new' : sidePanel.id
  const activeId = sidePanel !== null && sidePanel !== 'new' ? sidePanel.id : null

  function handleCreated(newSub: CharterSubmission) {
    setSubmissions(prev => [newSub, ...prev])
    setSidePanel(newSub)
  }

  function handleUpdated(updated: CharterSubmission) {
    setSubmissions(prev => prev.map(s => s.id === updated.id ? updated : s))
    setSidePanel(updated)
  }

  return (
    <div ref={containerRef} className="flex" style={{ height: 'calc(100vh - 40px)', minHeight: 0 }}>

      {/* Submission list — full-width when no panel, resizable when panel open */}
      <div
        className="relative flex flex-col flex-shrink-0 overflow-hidden"
        style={{
          width: sidePanel !== null ? `${listWidth}px` : '100%',
          borderRight: sidePanel !== null ? `1px solid var(--border-subtle)` : 'none',
        }}
      >
        {sidePanel !== null && <ResizeHandle side="right" onMouseDown={onResizeList} />}
        {/* List header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</span>
            <PublishStatusFilter value={filter} onChange={setFilter} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open('/charter-guide', 'charter-guide', 'width=780,height=720,resizable=yes,scrollbars=yes')}
              className="text-xs font-medium underline"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)' }}
            >
              과제정의서란?
            </button>
            <button
              onClick={() => openSidePanel('new')}
              className="text-xs px-2.5 py-1 rounded-lg font-semibold"
              style={{
                background: sidePanel === 'new' ? 'rgba(37,99,235,0.15)' : 'var(--surface-secondary)',
                color: sidePanel === 'new' ? 'var(--blue-600)' : 'var(--text-secondary)',
              }}
            >
              + 과제정의서 추가
            </button>
          </div>
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="과제정의서가 없습니다"
              description="과제정의서를 추가해주세요."
            />
          ) : sidePanel !== null ? (
            // Compressed list
            <div>
              {visibleSubmissions.map(sub => (
                <SubmissionCard
                  key={sub.id}
                  sub={sub}
                  compressed
                  active={activeId === sub.id}
                  onClick={() => openSidePanel(sub)}
                />
              ))}
            </div>
          ) : (
            // Full-width card grid
            <div className="p-4">
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                {visibleSubmissions.map(sub => (
                  <SubmissionCard
                    key={sub.id}
                    sub={sub}
                    compressed={false}
                    active={false}
                    onClick={() => openSidePanel(sub)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side panel — editor + comment panel */}
      {sidePanel !== null && (
        <div className="flex flex-1 overflow-hidden" style={{ minWidth: 0 }}>
          <div className="flex-1 overflow-hidden">
            <CharterPanel
              key={panelKey}
              mode={sidePanel === 'new' ? 'new' : 'edit'}
              submission={sidePanel !== 'new' ? sidePanel : undefined}
              onClose={() => setSidePanel(null)}
              onCreated={handleCreated}
              onUpdated={handleUpdated}
            />
          </div>
          {sidePanel !== 'new' && sidePanel.publish_status === 'published' && (
            <div className="flex flex-col border-l" style={{ width: '300px', minWidth: '280px', borderColor: 'var(--border-subtle)' }}>
              <CharterCommentPanel key={sidePanel.id} charterId={sidePanel.id} />
            </div>
          )}
        </div>
      )}


    </div>
  )
}
