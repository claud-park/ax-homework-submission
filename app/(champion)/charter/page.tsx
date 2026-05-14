'use client'
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { apiFetch } from '@/lib/api-client'
import type { ProjectCharter } from '@/lib/types'

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
        <span className="text-xs font-semibold" style={{ color: '#ccc' }}>{label}</span>
        {required && <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>}
      </div>
      <div style={{ background: 'var(--surface-secondary)' }}>
        <EditorContent editor={editor} className="p-3 min-h-16 text-sm prose prose-invert max-w-none" />
      </div>
    </div>
  )
}

type CharterContent = ProjectCharter['content']

export default function CharterPage() {
  const [projectName, setProjectName] = useState('')
  const [content, setContent] = useState<CharterContent>({})
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
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
  }, [])

  async function save(newContent: CharterContent, name: string) {
    setSaving(true)
    try {
      await apiFetch('/api/charter', { method: 'PUT', body: JSON.stringify({ project_name: name, content: newContent }) })
      setLastSaved(new Date())
    } catch {
      // save failed silently — saving indicator will reset
    } finally {
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

  async function exportPdf() {
    const { default: jsPDF } = await import('jspdf')
    const { default: html2canvas } = await import('html2canvas')
    const el = document.getElementById('charter-content')!
    const canvas = await html2canvas(el, { backgroundColor: '#141414', scale: 2 })
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const imgHeight = (canvas.height * pageWidth) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight)
    pdf.save(`제정의서_${projectName || 'charter'}.pdf`)
  }

  async function exportDocx() {
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx')
    const { saveAs } = await import('file-saver')
    const sections = SECTIONS.map(s => [
      new Paragraph({ text: s.label, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun({ text: stripHtml(content[s.key] ?? ''), break: 1 })] }),
    ]).flat()
    const doc = new Document({
      sections: [{ children: [new Paragraph({ text: projectName || '제정의서', heading: HeadingLevel.HEADING_1 }), ...sections] }],
    })
    const blob = await Packer.toBlob(doc)
    saveAs(blob, `제정의서_${projectName || 'charter'}.docx`)
  }

  function stripHtml(html: string) {
    return html.replace(/<[^>]*>/g, '').trim()
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>제정의서</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {saving ? '저장 중...' : lastSaved ? `마지막 저장: ${lastSaved.toLocaleTimeString('ko-KR')}` : '자동 저장'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportDocx} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(125,211,252,0.1)', color: '#7dd3fc', border: '1px solid #7dd3fc' }}>
            📄 DOCX
          </button>
          <button onClick={exportPdf} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--error)', border: '1px solid var(--error)' }}>
            📕 PDF
          </button>
        </div>
      </div>

      <div id="charter-content" className="flex flex-col gap-3">
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
            <span className="text-xs font-semibold" style={{ color: '#ccc' }}>프로젝트명</span>
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
  )
}
