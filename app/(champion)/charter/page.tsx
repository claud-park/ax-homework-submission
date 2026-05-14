'use client'
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { apiFetch } from '@/lib/api-client'
import type { ProjectCharter, CharterSubmission } from '@/lib/types'
import DOMPurify from 'dompurify'

type SectionKey = 'problem_definition' | 'goal' | 'scope_in' | 'scope_out' | 'expected_outcomes' | 'risks'
const SECTIONS: { key: SectionKey; label: string; required?: boolean }[] = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)', required: true },
  { key: 'goal', label: '목표 (TO-BE)', required: true },
  { key: 'scope_in', label: '범위 In (Scope In)', required: true },
  { key: 'scope_out', label: '범위 Out (Scope Out)', required: true },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
]

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

function SectionViewer({ label, html }: { label: string; html: string }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div
        className="p-3 text-sm prose max-w-none"
        style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html || '<p style="color:var(--text-disabled)">—</p>') }}
      />
    </div>
  )
}

type CharterContent = ProjectCharter['content']
type RightPanel = 'editor' | { submission: CharterSubmission }

export default function CharterPage() {
  const [projectName, setProjectName] = useState('')
  const [content, setContent] = useState<CharterContent>({})
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submissions, setSubmissions] = useState<CharterSubmission[]>([])
  const [rightPanel, setRightPanel] = useState<RightPanel>('editor')
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()
  const contentRef = useRef<CharterContent>({})

  useEffect(() => {
    apiFetch<ProjectCharter | null>('/api/charter').then(c => {
      if (c) {
        setProjectName(c.project_name ?? '')
        const charterContent = c.content ?? {}
        setContent(charterContent)
        contentRef.current = charterContent
      }
    })
    apiFetch<CharterSubmission[]>('/api/charter/submissions').then(setSubmissions)
  }, [])

  async function save(newContent: CharterContent, name: string) {
    setSaving(true)
    try {
      await apiFetch('/api/charter', { method: 'PUT', body: JSON.stringify({ project_name: name, content: newContent }) })
      setLastSaved(new Date())
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }

  function handleSectionBlur(key: SectionKey, html: string) {
    const updated: CharterContent = { ...content, [key]: html }
    setContent(updated)
    contentRef.current = updated
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => save(updated, projectName), 800)
  }

  function handleNameBlur() {
    clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => save(contentRef.current, projectName), 800)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const newSub = await apiFetch<CharterSubmission>('/api/charter/submissions', {
        method: 'POST',
        body: JSON.stringify({ project_name: projectName, content: contentRef.current }),
      })
      setSubmissions(prev => [newSub, ...prev])
      setRightPanel({ submission: newSub })
    } finally {
      setSubmitting(false)
    }
  }

  function stripHtml(html: string) { return html.replace(/<[^>]*>/g, '').trim() }

  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf')
    const { default: html2canvas } = await import('html2canvas')
    const el = document.getElementById('charter-content')!
    const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
    pdf.save(`과제정의서_${projectName || 'charter'}.pdf`)
  }

  async function exportDocx() {
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx')
    const { saveAs } = await import('file-saver')
    const src = rightPanel === 'editor' ? content : (rightPanel as { submission: CharterSubmission }).submission.content
    const name = rightPanel === 'editor' ? projectName : (rightPanel as { submission: CharterSubmission }).submission.project_name ?? '과제정의서'
    const sections = SECTIONS.map(s => [
      new Paragraph({ text: s.label, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: stripHtml(src[s.key] ?? ''), break: 1 })] }),
    ]).flat()
    const doc = new Document({
      sections: [{ children: [new Paragraph({ text: name, heading: HeadingLevel.HEADING_1 }), ...sections] }],
    })
    const blob = await Packer.toBlob(doc)
    saveAs(blob, `과제정의서_${name}.docx`)
  }

  const isEditor = rightPanel === 'editor'
  const viewingSub = !isEditor ? (rightPanel as { submission: CharterSubmission }).submission : null

  return (
    <div className="flex gap-0" style={{ height: 'calc(100vh - 40px)', minHeight: 0 }}>

      {/* Left panel — submission list */}
      <div className="flex flex-col border-r flex-shrink-0" style={{ width: '220px', borderColor: 'var(--border-subtle)', background: 'var(--background)' }}>
        <div className="px-3 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>제출 이력</span>
          <button
            onClick={() => setRightPanel('editor')}
            className="text-xs px-2 py-1 rounded font-semibold"
            style={{ background: isEditor ? 'rgba(37,99,235,0.15)' : 'var(--surface-secondary)', color: isEditor ? 'var(--blue-600)' : 'var(--text-secondary)' }}
          >
            + 새 작성
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {submissions.length === 0 && (
            <p className="text-xs p-3" style={{ color: 'var(--text-disabled)' }}>제출 이력이 없습니다.</p>
          )}
          {submissions.map(sub => {
            const isActive = viewingSub?.id === sub.id
            return (
              <button
                key={sub.id}
                onClick={() => setRightPanel({ submission: sub })}
                className="w-full text-left px-3 py-2.5 border-b"
                style={{
                  borderColor: 'var(--border-subtle)',
                  background: isActive ? 'rgba(37,99,235,0.08)' : 'transparent',
                }}
              >
                <p className="text-xs font-semibold truncate" style={{ color: isActive ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                  {sub.project_name || '(제목 없음)'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-disabled)' }}>
                  {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right panel — editor or viewer */}
      <div className="flex-1 overflow-y-auto">
        {isEditor ? (
          <div className="p-6 max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>과제정의서</h1>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {saving ? '저장 중...' : lastSaved ? `마지막 저장: ${lastSaved.toLocaleTimeString('ko-KR')}` : '자동 저장'}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={exportDocx} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}>
                  📄 DOCX
                </button>
                <button onClick={exportPdf} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}>
                  📕 PDF
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                  style={{ background: 'var(--blue-600)', color: '#fff' }}
                >
                  {submitting ? '제출 중...' : '제출하기'}
                </button>
              </div>
            </div>

            <div id="charter-content" className="flex flex-col gap-3">
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>프로젝트명</span>
                  <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>
                </div>
                <input
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  onBlur={handleNameBlur}
                  placeholder="프로젝트명을 입력하세요"
                  className="w-full p-3 text-sm"
                  style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)', outline: 'none', border: 'none' }}
                />
              </div>
              {SECTIONS.map(s => (
                <SectionEditor
                  key={s.key}
                  label={s.label}
                  required={s.required}
                  content={content[s.key] ?? ''}
                  onBlur={html => handleSectionBlur(s.key, html)}
                />
              ))}
            </div>
          </div>
        ) : viewingSub ? (
          <div className="p-6 max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                  {viewingSub.project_name || '(제목 없음)'}
                </h1>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  제출일: {new Date(viewingSub.submitted_at).toLocaleString('ko-KR')}
                </p>
              </div>
              <button onClick={exportDocx} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--blue-600)', border: '1px solid var(--blue-600)' }}>
                📄 DOCX
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {SECTIONS.map(s => (
                <SectionViewer key={s.key} label={s.label} html={viewingSub.content[s.key] ?? ''} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
