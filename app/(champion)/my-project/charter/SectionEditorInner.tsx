'use client'
import { useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link2, ListOrdered, List, Quote, Code, FileCode } from 'lucide-react'

interface Props {
  content: string
  placeholder?: string
  onBlur: (html: string) => void
  onDirty?: () => void
}

function ToolBtn({ active, onMouseDown, title, children }: {
  active?: boolean
  onMouseDown: (e: React.MouseEvent) => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={onMouseDown}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 4, border: 'none', padding: 0, flexShrink: 0,
        background: active ? 'var(--surface-secondary)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function Sep() {
  return (
    <span style={{
      display: 'inline-block', width: 1, height: 16, flexShrink: 0,
      background: 'var(--border-subtle)', margin: '0 2px',
    }} />
  )
}

export default function SectionEditorInner({ content, placeholder, onBlur, onDirty }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    ],
    content: content || null,
    onBlur: ({ editor }) => onBlur(editor.getHTML()),
    onUpdate: () => onDirty?.(),
  })

  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(content || null, { emitUpdate: false })
  }, [editor, content])

  const handleLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('링크 URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  if (!editor) return null

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        padding: '3px 6px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-primary)',
      }}>
        <ToolBtn active={editor.isActive('bold')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }} title="Bold (⌘B)">
          <Bold size={12} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }} title="Italic (⌘I)">
          <Italic size={12} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('underline')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleUnderline().run() }} title="Underline (⌘U)">
          <UnderlineIcon size={12} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('strike')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleStrike().run() }} title="Strikethrough">
          <Strikethrough size={12} strokeWidth={2.5} />
        </ToolBtn>

        <Sep />

        <ToolBtn active={editor.isActive('link')} onMouseDown={e => { e.preventDefault(); handleLink() }} title="Link">
          <Link2 size={12} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('orderedList')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }} title="Ordered List">
          <ListOrdered size={12} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('bulletList')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }} title="Bullet List">
          <List size={12} strokeWidth={2.5} />
        </ToolBtn>

        <Sep />

        <ToolBtn active={editor.isActive('blockquote')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run() }} title="Blockquote">
          <Quote size={12} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('code')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run() }} title="Inline Code">
          <Code size={12} strokeWidth={2.5} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('codeBlock')} onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run() }} title="Code Block">
          <FileCode size={12} strokeWidth={2.5} />
        </ToolBtn>
      </div>

      <EditorContent
        editor={editor}
        className="p-3 min-h-24 text-sm charter-editor [&_.ProseMirror]:outline-none"
      />
    </div>
  )
}
