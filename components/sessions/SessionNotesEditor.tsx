'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown, type MarkdownStorage } from 'tiptap-markdown'
import { useEffect } from 'react'

function getMarkdown(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return ''
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown()
}

export function SessionNotesEditor({ value, onChange }: { value: string; onChange: (md: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: value || '',
    onUpdate: ({ editor }) => onChange(getMarkdown(editor)),
    editorProps: {
      attributes: {
        class: 'ProseMirror text-sm leading-relaxed focus:outline-none min-h-[160px]',
      },
    },
  })

  // 외부 value가 바뀌면(예: 다른 세션 선택) 에디터 동기화
  useEffect(() => {
    if (editor && value !== getMarkdown(editor)) {
      editor.commands.setContent(value || '')
    }
  }, [value, editor])

  return (
    <div className="rounded-xl border p-3" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
      <EditorContent editor={editor} />
    </div>
  )
}
