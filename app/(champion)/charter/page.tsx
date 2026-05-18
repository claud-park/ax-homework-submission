'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { apiFetch } from '@/lib/api-client'
import type { Homework, ProjectCharter, CharterSubmission } from '@/lib/types'
import { CharterCommentPanel } from '@/components/CharterCommentPanel'

type SectionKey = 'problem_definition' | 'goal' | 'scope_in' | 'scope_out' | 'expected_outcomes' | 'risks'

function HomeworkSelect({ value, onChange, homeworks }: {
  value: number | ''
  onChange: (v: number | '') => void
  homeworks: Homework[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = value !== '' ? homeworks.find(h => h.id === value) : null
  const label = selected
    ? `과제 #${String(selected.id).padStart(2, '0')}  ${selected.title}`
    : '과제 연결 없음'

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 8px',
          borderRadius: '6px',
          border: `1px solid ${open ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
          background: selected ? 'rgba(37,99,235,0.07)' : 'var(--surface-secondary)',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: selected ? 600 : 400,
          color: selected ? 'var(--blue-600)' : 'var(--text-disabled)',
          whiteSpace: 'nowrap',
          transition: 'border-color 0.15s',
        }}
      >
        {label}
        <span style={{ fontSize: '9px', opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          zIndex: 300,
          minWidth: '220px',
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          overflow: 'hidden',
        }}>
          {/* 연결 없음 */}
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '9px 14px',
              fontSize: '12px',
              background: value === '' ? 'rgba(37,99,235,0.07)' : 'transparent',
              color: value === '' ? 'var(--blue-600)' : 'var(--text-secondary)',
              fontWeight: value === '' ? 600 : 400,
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              cursor: 'pointer',
            }}
          >
            과제 연결 없음
          </button>
          {/* Homework options */}
          {homeworks.map(h => {
            const isActive = value === h.id
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => { onChange(h.id); setOpen(false) }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 14px',
                  fontSize: '12px',
                  background: isActive ? 'rgba(37,99,235,0.07)' : 'transparent',
                  color: isActive ? 'var(--blue-600)' : 'var(--text-primary)',
                  fontWeight: isActive ? 600 : 400,
                  border: 'none',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: isActive ? 'var(--blue-600)' : 'var(--text-disabled)',
                  background: isActive ? 'rgba(37,99,235,0.12)' : 'var(--surface-secondary)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  flexShrink: 0,
                }}>
                  #{String(h.id).padStart(2, '0')}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.title}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
type CharterContent = ProjectCharter['content']
type SidePanel = null | 'new' | CharterSubmission

const SECTIONS: { key: SectionKey; label: string; required?: boolean }[] = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)', required: true },
  { key: 'goal', label: '목표 (TO-BE)', required: true },
  { key: 'scope_in', label: '범위 In (Scope In)', required: true },
  { key: 'scope_out', label: '범위 Out (Scope Out)', required: true },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
]

function stripHtml(html: string) { return html.replace(/<[^>]*>/g, '').trim() }

function SectionEditor({ label, required, content, onBlur }: {
  label: string; required?: boolean; content: string; onBlur: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content,
    onBlur: ({ editor }) => onBlur(editor.getHTML()),
  })
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {required && <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>}
      </div>
      <div style={{ background: 'var(--surface-secondary)' }}>
        <EditorContent editor={editor} className="p-3 min-h-16 text-sm prose max-w-none" />
      </div>
    </div>
  )
}

// Keyed by submission id or 'new' — remounts when switching between items
function CharterPanel({ mode, submission, homeworks, onClose, onCreated, onUpdated }: {
  mode: 'new' | 'edit'
  submission?: CharterSubmission
  homeworks: Homework[]
  onClose: () => void
  onCreated: (sub: CharterSubmission) => void
  onUpdated: (sub: CharterSubmission) => void
}) {
  const [projectName, setProjectName] = useState(submission?.project_name ?? '')
  const [homeworkId, setHomeworkId] = useState<number | ''>(submission?.homework_id ?? '')
  const [saving, setSaving] = useState(false)
  const contentRef = useRef<CharterContent>(submission?.content ?? {})

  function handleSectionBlur(key: SectionKey, html: string) {
    contentRef.current = { ...contentRef.current, [key]: html }
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (mode === 'new') {
        const newSub = await apiFetch<CharterSubmission>('/api/charter/submissions', {
          method: 'POST',
          body: JSON.stringify({
            project_name: projectName,
            content: contentRef.current,
            homework_id: homeworkId !== '' ? homeworkId : null,
          }),
        })
        onCreated(newSub)
      } else {
        const updated = await apiFetch<CharterSubmission>(`/api/charter/submissions/${submission!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ project_name: projectName, content: contentRef.current }),
        })
        onUpdated(updated)
      }
    } finally {
      setSaving(false)
    }
  }

  async function exportDocx() {
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx')
    const { saveAs } = await import('file-saver')
    const src = contentRef.current
    const sections = SECTIONS.map(s => [
      new Paragraph({ text: s.label, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: stripHtml(src[s.key] ?? ''), break: 1 })] }),
    ]).flat()
    const doc = new Document({
      sections: [{ children: [new Paragraph({ text: projectName || '과제정의서', heading: HeadingLevel.HEADING_1 }), ...sections] }],
    })
    const blob = await Packer.toBlob(doc)
    saveAs(blob, `과제정의서_${projectName || 'charter'}.docx`)
  }

  return (
    <div className="flex flex-col h-full border-l" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Panel header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded"
          style={{ color: 'var(--text-secondary)', background: 'var(--surface-secondary)' }}
        >
          ✕
        </button>
        <div className="flex flex-col flex-1 min-w-0 gap-1">
          <textarea
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="프로젝트명을 입력하세요"
            rows={1}
            className="text-sm font-semibold bg-transparent outline-none resize-none w-full"
            style={{ color: 'var(--text-primary)' }}
          />
          {mode === 'new' && (
            <HomeworkSelect
              value={homeworkId}
              onChange={setHomeworkId}
              homeworks={homeworks}
            />
          )}
          {mode === 'edit' && submission?.homework_id && (
            <span style={{ fontSize: '11px', color: 'var(--blue-600)' }}>
              과제 #{String(submission.homework_id).padStart(2, '0')}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={exportDocx}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}
          >
            📄 DOCX
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            {saving ? '저장 중...' : mode === 'new' ? '제출하기' : '재제출하기'}
          </button>
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
              key={s.key}
              label={s.label}
              required={s.required}
              content={(submission?.content ?? {})[s.key] ?? ''}
              onBlur={html => handleSectionBlur(s.key, html)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SubmissionCard({ sub, compressed, active, onClick }: {
  sub: CharterSubmission; compressed: boolean; active: boolean; onClick: () => void
}) {
  const date = new Date(sub.updated_at ?? sub.submitted_at).toLocaleDateString('ko-KR')

  if (compressed) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left px-3 py-2.5 border-b"
        style={{
          borderColor: 'var(--border-subtle)',
          background: active ? 'rgba(37,99,235,0.08)' : 'transparent',
        }}
      >
        <p className="text-xs font-semibold truncate" style={{ color: active ? 'var(--blue-600)' : 'var(--text-primary)' }}>
          {sub.project_name || '(제목 없음)'}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>{date}</p>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border transition-colors"
      style={{
        borderColor: active ? 'var(--blue-600)' : 'var(--border-subtle)',
        background: active ? 'rgba(37,99,235,0.06)' : 'var(--surface-primary)',
      }}
    >
      <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        {sub.project_name || '(제목 없음)'}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>{date}</p>
    </button>
  )
}

export default function CharterPage() {
  const [submissions, setSubmissions] = useState<CharterSubmission[]>([])
  const [homeworks, setHomeworks] = useState<Homework[]>([])
  const [sidePanel, setSidePanel] = useState<SidePanel>(null)

  useEffect(() => {
    apiFetch<CharterSubmission[]>('/api/charter/submissions').then(setSubmissions)
    apiFetch<Homework[]>('/api/homeworks').then(setHomeworks)
  }, [])

  // Build homework title lookup
  const hwMap = useMemo(() => new Map(homeworks.map(h => [h.id, h.title])), [homeworks])

  // Group submissions by homework_id, sorted by hw id asc, null last
  const groups = useMemo(() => {
    const map = new Map<string, { hwId: number | null; hwTitle: string | null; items: CharterSubmission[] }>()
    for (const s of submissions) {
      const key = s.homework_id !== null ? String(s.homework_id) : '__none__'
      if (!map.has(key)) map.set(key, { hwId: s.homework_id, hwTitle: s.homework_id !== null ? (hwMap.get(s.homework_id) ?? null) : null, items: [] })
      map.get(key)!.items.push(s)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === '__none__') return 1
        if (b === '__none__') return -1
        return Number(a) - Number(b)
      })
      .map(([key, g]) => ({ key, ...g }))
  }, [submissions, hwMap])

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
    <div className="flex" style={{ height: 'calc(100vh - 40px)', minHeight: 0 }}>

      {/* Submission list — full-width when no panel, 272px when panel open */}
      <div
        className="flex flex-col flex-shrink-0 overflow-hidden"
        style={{
          width: sidePanel !== null ? '272px' : '100%',
          borderRight: sidePanel !== null ? `1px solid var(--border-subtle)` : 'none',
          transition: 'width 0.2s ease',
        }}
      >
        {/* List header */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</span>
          <button
            onClick={() => setSidePanel('new')}
            className="text-xs px-2.5 py-1 rounded-lg font-semibold"
            style={{
              background: sidePanel === 'new' ? 'rgba(37,99,235,0.15)' : 'var(--surface-secondary)',
              color: sidePanel === 'new' ? 'var(--blue-600)' : 'var(--text-secondary)',
            }}
          >
            + 과제정의서 추가
          </button>
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto">
          {submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-disabled)' }}>
              <p className="text-sm">아직 제출한 과제정의서가 없습니다.</p>
              <p className="text-xs">+ 과제정의서를 추가해주세요.</p>
            </div>
          ) : sidePanel !== null ? (
            // Compressed list — grouped by homework
            <div>
              {groups.map(({ key, hwId, hwTitle, items }) => {
                const sectionLabel = hwId !== null
                  ? `과제 #${String(hwId).padStart(2, '0')}${hwTitle ? `  ${hwTitle}` : ''}`
                  : '독립 과제정의서'
                return (
                  <div key={key}>
                    <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-secondary)' }}>
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-disabled)' }}>
                        {sectionLabel}
                      </span>
                    </div>
                    {items.map(sub => (
                      <SubmissionCard
                        key={sub.id}
                        sub={sub}
                        compressed
                        active={activeId === sub.id}
                        onClick={() => setSidePanel(sub)}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          ) : (
            // Full-width grouped sections
            <div className="p-4 flex flex-col gap-6">
              {groups.map(({ key, hwId, hwTitle, items }) => {
                const sectionLabel = hwId !== null
                  ? `과제 #${String(hwId).padStart(2, '0')}${hwTitle ? `  ${hwTitle}` : ''}`
                  : '독립 과제정의서'
                return (
                  <div key={key}>
                    {/* Section header */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wide shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {sectionLabel}
                      </span>
                      <div className="flex-1" style={{ height: '1px', background: 'var(--border-subtle)' }} />
                      <span className="text-xs shrink-0" style={{ color: 'var(--text-disabled)' }}>{items.length}개</span>
                    </div>
                    {/* Card grid */}
                    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                      {items.map(sub => (
                        <SubmissionCard
                          key={sub.id}
                          sub={sub}
                          compressed={false}
                          active={false}
                          onClick={() => setSidePanel(sub)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
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
              homeworks={homeworks}
              onClose={() => setSidePanel(null)}
              onCreated={handleCreated}
              onUpdated={handleUpdated}
            />
          </div>
          {sidePanel !== 'new' && (
            <div className="flex flex-col border-l" style={{ width: '300px', minWidth: '280px', borderColor: 'var(--border-subtle)' }}>
              <CharterCommentPanel key={sidePanel.id} charterId={sidePanel.id} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
