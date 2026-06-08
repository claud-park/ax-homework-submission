'use client'
import { useEffect, useCallback, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Link2,
  ListOrdered, List, Quote, Code, FileCode,
  Table as TableIcon, Plus, Trash2,
} from 'lucide-react'

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

const GRID_MAX = 8

function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hovered, setHovered] = useState<{ r: number; c: number } | null>(null)

  const rows = hovered ? Math.max(hovered.r + 1, 3) : 3
  const cols = hovered ? Math.max(hovered.c + 1, 3) : 3
  const displayRows = Math.min(rows + 1, GRID_MAX)
  const displayCols = Math.min(cols + 1, GRID_MAX)

  return (
    <div
      onMouseLeave={() => setHovered(null)}
      style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${displayCols}, 18px)`,
          gap: 2,
        }}
      >
        {Array.from({ length: displayRows * displayCols }).map((_, idx) => {
          const r = Math.floor(idx / displayCols)
          const c = idx % displayCols
          const isHighlighted = hovered ? r <= hovered.r && c <= hovered.c : false
          return (
            <div
              key={idx}
              onMouseEnter={() => setHovered({ r, c })}
              onMouseDown={e => { e.preventDefault(); onPick(r + 1, c + 1) }}
              style={{
                width: 18, height: 18, borderRadius: 2, cursor: 'pointer',
                background: isHighlighted ? 'var(--blue-600)' : 'var(--surface-secondary)',
                border: `1px solid ${isHighlighted ? 'var(--blue-600)' : 'var(--border)'}`,
                opacity: isHighlighted ? 0.85 : 1,
                transition: 'background 0.08s, border-color 0.08s',
              }}
            />
          )
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-disabled)', margin: 0, textAlign: 'center' }}>
        {hovered ? `${hovered.r + 1} × ${hovered.c + 1}` : '크기를 선택해요'}
      </p>
    </div>
  )
}

function TableContextToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor || !editor.isActive('table')) return null

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)',
    background: 'var(--surface-primary)', color: 'var(--text-secondary)',
    fontSize: 11, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      padding: '3px 6px', borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--surface-primary)',
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-disabled)', marginRight: 2 }}>테이블</span>

      <button type="button" style={btnStyle}
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnBefore().run() }}>
        <Plus size={10} />열 앞 추가
      </button>
      <button type="button" style={btnStyle}
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run() }}>
        <Plus size={10} />열 뒤 추가
      </button>
      <button type="button" style={{ ...btnStyle, color: 'var(--error)' }}
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run() }}>
        <Trash2 size={10} />열 삭제
      </button>

      <Sep />

      <button type="button" style={btnStyle}
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowBefore().run() }}>
        <Plus size={10} />행 앞 추가
      </button>
      <button type="button" style={btnStyle}
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run() }}>
        <Plus size={10} />행 뒤 추가
      </button>
      <button type="button" style={{ ...btnStyle, color: 'var(--error)' }}
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteRow().run() }}>
        <Trash2 size={10} />행 삭제
      </button>

      <Sep />

      <button type="button" style={{ ...btnStyle, color: 'var(--error)' }}
        onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run() }}>
        <Trash2 size={10} />테이블 삭제
      </button>
    </div>
  )
}

export default function SectionEditorInner({ content, placeholder, onBlur, onDirty }: Props) {
  const [tablePickerOpen, setTablePickerOpen] = useState(false)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const tableBtnRef = useRef<HTMLButtonElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
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

  useEffect(() => {
    if (!tablePickerOpen) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const btn = tableBtnRef.current
      const picker = document.getElementById('table-grid-portal')
      if (btn && !btn.contains(target) && picker && !picker.contains(target)) {
        setTablePickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [tablePickerOpen])

  function openTablePicker() {
    if (!tableBtnRef.current) return
    const r = tableBtnRef.current.getBoundingClientRect()
    setPickerPos({ top: r.bottom + 4, left: r.left })
    setTablePickerOpen(v => !v)
  }

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

  const handleInsertTable = useCallback((rows: number, cols: number) => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
    setTablePickerOpen(false)
  }, [editor])

  if (!editor) return null

  return (
    <div>
      {/* Main toolbar */}
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

        <Sep />

        {/* Table insert button with grid picker (portal to escape overflow:hidden) */}
        <button
          ref={tableBtnRef}
          type="button"
          title="테이블 삽입"
          onMouseDown={e => { e.preventDefault(); openTablePicker() }}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 4, border: 'none', padding: 0, flexShrink: 0,
            background: (tablePickerOpen || editor.isActive('table')) ? 'var(--surface-secondary)' : 'transparent',
            color: (tablePickerOpen || editor.isActive('table')) ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <TableIcon size={12} strokeWidth={2.5} />
        </button>
        {tablePickerOpen && createPortal(
          <div
            id="table-grid-portal"
            style={{
              position: 'fixed',
              top: pickerPos.top,
              left: pickerPos.left,
              zIndex: 9999,
              background: 'var(--surface-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              minWidth: 160,
            }}
          >
            <TableGridPicker onPick={handleInsertTable} />
          </div>,
          document.body
        )}
      </div>

      {/* Table context toolbar — only shown when cursor is inside a table */}
      <TableContextToolbar editor={editor} />

      <EditorContent
        editor={editor}
        className="p-3 min-h-24 text-sm charter-editor [&_.ProseMirror]:outline-none"
      />
    </div>
  )
}
