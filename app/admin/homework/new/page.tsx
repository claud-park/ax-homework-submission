'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import DatePicker from '@/components/DatePicker'
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'

function TipTapEditor({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btnStyle = (active: boolean) => ({
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 700,
    background: active ? 'var(--blue-600)' : 'var(--surface-secondary)',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
  })
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex gap-1 p-2 border-b" style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}>
        {[
          { label: 'B', cmd: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
          { label: 'I', cmd: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
          { label: 'U', cmd: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline') },
          { label: 'H2', cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }) },
          { label: '•', cmd: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
        ].map(b => (
          <button key={b.label} onMouseDown={e => { e.preventDefault(); b.cmd() }} style={btnStyle(b.active)}>{b.label}</button>
        ))}
      </div>
      <EditorContent editor={editor} className="p-3 min-h-32 text-sm prose max-w-none" />
    </div>
  )
}

export default function CreateHomeworkPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; due_date?: string }>({})

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: '',
  })

  async function submit(publishStatus: 'draft' | 'published') {
    setErrors({})
    setSaving(true)
    try {
      const created = await apiFetch<{ id: number; publish_status: string }>('/api/admin/homeworks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description: editor?.getHTML() ?? '',
          due_date: dueDate || null,
          publish_status: publishStatus,
        }),
      })
      if (publishStatus === 'draft') {
        toast.success('임시저장되었습니다.')
        router.push(`/admin/homework/${created.id}/edit`)
      } else {
        toast.success('과제가 게시되었습니다.')
        router.push('/admin')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error'
      try {
        const parsed = JSON.parse(msg)
        if (parsed.error === 'validation_failed' && Array.isArray(parsed.fields)) {
          const map: { title?: string; due_date?: string } = {}
          for (const f of parsed.fields) map[f.field as 'title'|'due_date'] = f.message
          setErrors(map)
          toast.error('게시 실패: 필수 항목을 확인해주세요')
          return
        }
      } catch { /* not a JSON validation error */ }
      toast.error(publishStatus === 'draft' ? '임시저장 실패: ' + msg : '게시 실패: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: 'var(--surface-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    color: 'var(--text-primary)',
    padding: '10px 14px',
    fontSize: '14px',
    width: '100%',
    outline: 'none',
  }
  const errorStyle = { color: 'var(--error)', fontSize: '11px', marginTop: '4px' }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 대시보드</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>새 과제 만들기</h1>
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <input type="text" placeholder="과제 제목" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
          {errors.title && <p style={errorStyle}>{errors.title}</p>}
        </div>
        <div>
          <DatePicker value={dueDate} onChange={setDueDate} placeholder="마감일 선택" style={inputStyle} />
          {errors.due_date && <p style={errorStyle}>{errors.due_date}</p>}
        </div>
        <div>
          <p className="text-xs mb-2 font-semibold" style={{ color: 'var(--text-secondary)' }}>과제 설명</p>
          <TipTapEditor editor={editor} />
        </div>
        <div className="flex justify-end pt-2">
          <SaveOrPublishButtons
            status="draft"
            saving={saving}
            onSaveDraft={() => submit('draft')}
            onPublish={() => submit('published')}
          />
        </div>
      </div>
    </div>
  )
}
