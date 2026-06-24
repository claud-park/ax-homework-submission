'use client'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import {
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

function getMarkdown(editor: Editor | null): string {
  if (!editor) return ''
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown()
}

function ToolBtn({ active, onClick, title, children }: {
  active?: boolean
  onClick: () => void
  title: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      // onMouseDown + preventDefault: keep the editor selection while toggling
      onMouseDown={e => { e.preventDefault(); onClick() }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 4, border: 'none', padding: 0, flexShrink: 0, cursor: 'pointer',
        background: active ? 'var(--surface-secondary)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <span style={{ display: 'inline-block', width: 1, height: 16, flexShrink: 0, background: 'var(--border-subtle)', margin: '0 2px' }} />
}

export function SessionNotesEditor({ value, onChange }: { value: string; onChange: (md: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: value || '',
    onUpdate: ({ editor }) => onChange(getMarkdown(editor)),
    editorProps: {
      attributes: { class: 'focus:outline-none' },
    },
  })

  // 외부 value가 바뀌면(예: 다른 세션 선택/AI 요약) 에디터 동기화
  useEffect(() => {
    if (editor && value !== getMarkdown(editor)) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="notes-editor rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
      <div
        className="flex items-center gap-0.5 flex-wrap px-2 py-1.5"
        style={{ borderBottom: '1px solid var(--border-faint, var(--border-subtle))' }}
      >
        <ToolBtn title="굵게 (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></ToolBtn>
        <ToolBtn title="기울임 (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></ToolBtn>
        <ToolBtn title="취소선" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={14} /></ToolBtn>
        <Sep />
        <ToolBtn title="제목 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={14} /></ToolBtn>
        <ToolBtn title="제목 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></ToolBtn>
        <ToolBtn title="제목 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={14} /></ToolBtn>
        <Sep />
        <ToolBtn title="글머리 목록" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></ToolBtn>
        <ToolBtn title="번호 목록" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></ToolBtn>
        <ToolBtn title="인용" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></ToolBtn>
        <ToolBtn title="코드" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}><Code size={14} /></ToolBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
