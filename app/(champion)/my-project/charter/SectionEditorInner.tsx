'use client'
import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'

interface Props {
  content: string
  placeholder?: string
  onBlur: (html: string) => void
  onDirty?: () => void
}

export default function SectionEditorInner({ content, placeholder, onBlur, onDirty }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    ],
    content,
    onBlur: ({ editor }) => onBlur(editor.getHTML()),
    onUpdate: () => onDirty?.(),
  })

  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(content, { emitUpdate: false })
  }, [editor, content])

  return (
    <EditorContent
      editor={editor}
      className="p-3 min-h-24 text-sm prose max-w-none [&_.ProseMirror]:outline-none"
    />
  )
}
