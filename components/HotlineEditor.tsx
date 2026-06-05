// components/HotlineEditor.tsx
'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { ImageIcon, Paperclip, Send, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { apiUpload } from '@/lib/api-client'
import type { PendingAttachment } from '@/lib/types'

interface UploadResponse {
  file_path: string
  file_name: string
  file_size: number
  mime_type: string
  url?: string
}

interface HotlineEditorProps {
  onSend: (body: string, attachments: PendingAttachment[]) => Promise<void>
  disabled?: boolean
  placeholder?: string
}

export function HotlineEditor({ onSend, disabled, placeholder = '메시지 입력...' }: HotlineEditorProps) {
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendRef = useRef<() => void>(() => {})

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      handleKeyDown(_view, event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          sendRef.current()
          return true
        }
        return false
      },
    },
  })

  const canSend = editor ? (!editor.isEmpty || pendingAttachments.length > 0) : false

  async function handleSend() {
    if (!editor || !canSend || sending || disabled || uploading) return
    const body = editor.getHTML()
    const atts = [...pendingAttachments]
    setSending(true)
    try {
      await onSend(body, atts)
      editor.commands.clearContent()
      setPendingAttachments([])
    } finally {
      setSending(false)
    }
  }
  // Always point ref to the latest handleSend (captures current state)
  sendRef.current = handleSend

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    e.target.value = ''
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiUpload<UploadResponse>('/api/hotline/upload', formData)
      if (res.url) {
        editor.chain().focus().setImage({ src: res.url }).run()
      }
    } catch {
      // silently skip — file not uploaded
    } finally {
      setUploading(false)
    }
  }

  async function handleFileAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiUpload<UploadResponse>('/api/hotline/upload', formData)
      setPendingAttachments(prev => [...prev, {
        file_name: res.file_name,
        file_path: res.file_path,
        file_size: res.file_size,
        mime_type: res.mime_type,
      }])
    } catch {
      // silently skip
    } finally {
      setUploading(false)
    }
  }

  if (!editor) return null

  const isDisabled = !!disabled || sending || uploading

  return (
    <div
      className="flex flex-col"
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        background: 'var(--surface-secondary)',
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-2 pt-1.5 pb-1 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-faint)' }}
      >
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          className="p-1 rounded text-xs font-bold transition-colors"
          style={{
            color: 'var(--text-primary)',
            background: editor.isActive('bold') ? 'var(--border-subtle)' : 'transparent',
            opacity: editor.isActive('bold') ? 1 : 0.45,
          }}
          title="굵게 (Ctrl+B)"
          disabled={isDisabled}
        >B</button>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
          className="p-1 rounded text-xs italic transition-colors"
          style={{
            color: 'var(--text-primary)',
            background: editor.isActive('italic') ? 'var(--border-subtle)' : 'transparent',
            opacity: editor.isActive('italic') ? 1 : 0.45,
          }}
          title="기울임 (Ctrl+I)"
          disabled={isDisabled}
        >I</button>
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); editor.chain().focus().toggleCode().run() }}
          className="p-1 rounded text-xs font-mono transition-colors"
          style={{
            color: 'var(--text-primary)',
            background: editor.isActive('code') ? 'var(--border-subtle)' : 'transparent',
            opacity: editor.isActive('code') ? 1 : 0.45,
          }}
          title="코드"
          disabled={isDisabled}
        >{`<>`}</button>
        <div style={{ width: 1, height: 14, background: 'var(--border-faint)', margin: '0 2px', flexShrink: 0 }} />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={isDisabled}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-primary)', opacity: isDisabled ? 0.3 : 0.5 }}
          title="이미지 삽입"
        >
          <ImageIcon size={13} />
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-primary)', opacity: isDisabled ? 0.3 : 0.5 }}
          title="파일 첨부"
        >
          <Paperclip size={13} />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileAttach} />
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="text-flo-caption1 px-3 py-2 outline-none"
        style={{
          color: 'var(--text-primary)',
          minHeight: 60,
          maxHeight: 160,
          overflowY: 'auto',
        }}
      />

      {/* Pending file attachments */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-1.5">
          {pendingAttachments.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
            >
              <Paperclip size={10} />
              <span className="max-w-[120px] truncate">{a.file_name}</span>
              <button
                type="button"
                onClick={() => setPendingAttachments(prev => prev.filter((_, j) => j !== i))}
                className="opacity-50 hover:opacity-100 ml-0.5"
                style={{ lineHeight: 1 }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Send button */}
      <div className="flex justify-end px-2 pb-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || isDisabled}
          aria-label="전송"
          className="flex items-center justify-center rounded-lg transition-opacity disabled:opacity-30"
          style={{ width: 32, height: 32, background: 'var(--accent)', color: '#fff', flexShrink: 0 }}
          title="전송 (Enter)"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
