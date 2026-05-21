'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import DatePicker from '@/components/DatePicker'
import { SaveOrPublishButtons } from '@/components/SaveOrPublishButtons'
import { DraftBadge } from '@/components/DraftBadge'
import { FullPageSpinner } from '@/components/ui/spinner'
import type { Homework } from '@/lib/types'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// Reuse TipTapEditor (copy-paste minimal definition; identical to new/page.tsx)
function TipTapEditor({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  const btnStyle = (active: boolean) => ({
    padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
    background: active ? 'var(--blue-600)' : 'var(--surface-secondary)',
    color: active ? '#fff' : 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)', cursor: 'pointer',
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

export default function EditHomeworkPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [homework, setHomework] = useState<Homework | null>(null)
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errors, setErrors] = useState<{ title?: string; due_date?: string }>({})

  const editor = useEditor({ extensions: [StarterKit, Underline], content: '' })

  useEffect(() => {
    apiFetch<Homework>(`/api/admin/homeworks/${id}`)
      .then(hw => {
        setHomework(hw)
        setTitle(hw.title)
        setDueDate(hw.due_date ?? '')
        editor?.commands.setContent(hw.description ?? '')
      })
      .catch((e: Error) => toast.error('과제 로드 실패: ' + e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editor])

  async function submit(publishStatus: 'draft' | 'published') {
    if (!homework) return
    setErrors({})
    setSaving(true)
    try {
      const updated = await apiFetch<Homework>(`/api/admin/homeworks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          description: editor?.getHTML() ?? '',
          due_date: dueDate || null,
          publish_status: publishStatus,
        }),
      })
      setHomework(updated)
      if (publishStatus === 'published' && homework.publish_status === 'draft') {
        toast.success('과제가 게시되었습니다.')
        router.push('/admin')
      } else if (publishStatus === 'draft') {
        toast.success('임시저장되었습니다.')
      } else {
        toast.success('저장되었습니다.')
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
      } catch { /* not JSON */ }
      toast.error(publishStatus === 'draft' ? '임시저장 실패: ' + msg : '저장 실패: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await apiFetch(`/api/admin/homeworks/${id}`, { method: 'DELETE' })
      toast.success('임시저장이 삭제되었습니다.')
      router.push('/admin')
    } catch (e: unknown) {
      toast.error('삭제 실패: ' + (e instanceof Error ? e.message : 'Error'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <FullPageSpinner />
  if (!homework) return <p className="text-sm p-4" style={{ color: 'var(--error)' }}>과제를 찾을 수 없습니다.</p>

  const inputStyle = {
    background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '10px',
    color: 'var(--text-primary)', padding: '10px 14px', fontSize: '14px', width: '100%', outline: 'none',
  }
  const errorStyle = { color: 'var(--error)', fontSize: '11px', marginTop: '4px' }
  const isDraft = homework.publish_status === 'draft'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin" className="text-sm" style={{ color: 'var(--text-secondary)' }}>← 대시보드</a>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>과제 편집</h1>
        {isDraft && <DraftBadge />}
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
        <div className="flex items-center justify-between pt-2">
          {isDraft ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  disabled={deleting}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    color: 'var(--error)', border: '1px solid var(--error)', background: 'transparent',
                    cursor: deleting ? 'wait' : 'pointer',
                  }}
                >
                  삭제
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>임시저장 삭제</AlertDialogTitle>
                  <AlertDialogDescription>정말 삭제하시겠습니까? 되돌릴 수 없습니다.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <span />}
          <SaveOrPublishButtons
            status={homework.publish_status}
            saving={saving}
            onSaveDraft={() => submit('draft')}
            onPublish={() => submit('published')}
          />
        </div>
      </div>
    </div>
  )
}
