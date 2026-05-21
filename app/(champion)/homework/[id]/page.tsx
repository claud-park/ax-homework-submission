'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { apiFetch } from '@/lib/api-client'
import type { Homework, Submission, Comment, CharterSubmission, Milestone, ProjectCharter } from '@/lib/types'
import DOMPurify from 'dompurify'
import { CharterCommentPanel } from '@/components/CharterCommentPanel'
import DateRangePicker from '@/components/DateRangePicker'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { FullPageSpinner } from '@/components/ui/spinner'

// ─── shared constants ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { pending: '검토 중', accepted: '합격', declined: '불합격' }
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}
const MILESTONE_STATUS_LABEL: Record<string, string> = {
  not_started: '미시작', in_progress: '진행 중', completed: '완료', delayed: '지연',
}
const MILESTONE_STATUS_COLOR: Record<string, string> = {
  not_started: 'var(--text-disabled)', in_progress: 'var(--blue-600)',
  completed: 'var(--success)', delayed: 'var(--error)',
}

type SectionKey = 'problem_definition' | 'goal' | 'scope_in' | 'scope_out' | 'expected_outcomes' | 'risks'
type CharterContent = ProjectCharter['content']
const CHARTER_SECTIONS: { key: SectionKey; label: string; required?: boolean }[] = [
  { key: 'problem_definition', label: '문제 정의 (AS-IS)', required: true },
  { key: 'goal', label: '목표 (TO-BE)', required: true },
  { key: 'scope_in', label: '범위 In (Scope In)', required: true },
  { key: 'scope_out', label: '범위 Out (Scope Out)', required: true },
  { key: 'expected_outcomes', label: '기대 효과' },
  { key: 'risks', label: '리스크' },
]

// ─── submission tab components ───────────────────────────────────────────────

function CommentItem({ comment, isOwn, onEdit }: {
  comment: Comment; isOwn: boolean; onEdit: (c: Comment, body: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!body.trim() || body.trim() === comment.body) { setEditing(false); return }
    setSaving(true)
    try { await onEdit(comment, body.trim()); setEditing(false) }
    finally { setSaving(false) }
  }

  const isAdmin = comment.author_role === 'admin'
  const badge = isAdmin
    ? { label: '관리자', color: 'var(--amber)', bg: 'rgba(217,119,6,0.1)' }
    : { label: '챔피언', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.1)' }

  return (
    <div className="mb-2 p-2 rounded-lg" style={{ background: 'var(--surface-secondary)' }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0"
          style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>
          {badge.label}
        </span>
        {editing ? (
          <div className="flex-1">
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
              className="w-full text-xs rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-accent"
              style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2 mt-1">
              <button onClick={() => { setEditing(false); setBody(comment.body) }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                취소
              </button>
              <button onClick={save} disabled={saving || !body.trim()}
                className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>
                저장
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-between gap-2">
            <p className="text-xs" style={{ color: 'var(--text-primary)' }}>{comment.body}</p>
            {isOwn && (
              <button onClick={() => setEditing(true)} className="text-xs shrink-0"
                style={{ color: 'var(--text-disabled)' }}>편집</button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs mt-1 ml-[52px]" style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
        {new Date(comment.created_at).toLocaleString('ko-KR')}
        {comment.updated_at !== comment.created_at && ' · 편집됨'}
      </p>
    </div>
  )
}

// ─── charter tab components ──────────────────────────────────────────────────

function SectionEditor({ label, required, content, onBlur }: {
  label: string; required?: boolean; content: string; onBlur: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content,
    onBlur: ({ editor }) => onBlur(editor.getHTML()),
  })
  return (
    <div className="rounded-xl border overflow-hidden focus-within:ring-2 focus-within:ring-blue-accent" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b"
        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {required && <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>}
      </div>
      <div style={{ background: 'var(--surface-secondary)' }}>
        <EditorContent editor={editor} className="p-3 min-h-16 text-sm prose max-w-none [&_.ProseMirror]:outline-none" />
      </div>
    </div>
  )
}

// Keyed by charter id or 'new' to force TipTap remount when switching
function CharterEditor({ homeworkId, charter, onSaved }: {
  homeworkId: number
  charter: CharterSubmission | undefined
  onSaved: (c: CharterSubmission) => void
}) {
  const [projectName, setProjectName] = useState(charter?.project_name ?? '')
  const [saving, setSaving] = useState(false)
  const contentRef = useRef<CharterContent>(charter?.content ?? {})

  async function handleSave() {
    setSaving(true)
    try {
      if (charter) {
        const updated = await apiFetch<CharterSubmission>(`/api/charter/submissions/${charter.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ project_name: projectName, content: contentRef.current }),
        })
        onSaved(updated)
      } else {
        const created = await apiFetch<CharterSubmission>('/api/charter/submissions', {
          method: 'POST',
          body: JSON.stringify({ project_name: projectName, content: contentRef.current, homework_id: homeworkId }),
        })
        onSaved(created)
      }
      toast.success('과제정의서가 저장되었습니다.')
    } catch (e: unknown) {
      toast.error('저장 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {charter
              ? `마지막 수정: ${new Date(charter.updated_at).toLocaleString('ko-KR')}`
              : '새 과제정의서'}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--blue-600)', color: '#fff' }}
        >
          {saving ? '저장 중...' : charter ? '재제출하기' : '제출하기'}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b"
            style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>프로젝트명</span>
            <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>
          </div>
          <input
            type="text"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="프로젝트명을 입력하세요"
            className="w-full p-3 text-sm bg-transparent outline-none"
            style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}
          />
        </div>
        {CHARTER_SECTIONS.map(s => (
          <SectionEditor
            key={s.key}
            label={s.label}
            required={s.required}
            content={(charter?.content ?? {})[s.key] ?? ''}
            onBlur={html => { contentRef.current = { ...contentRef.current, [s.key]: html } }}
          />
        ))}
      </div>
    </div>
  )
}

function CharterTab({ homeworkId }: { homeworkId: number }) {
  const [loading, setLoading] = useState(true)
  const [charter, setCharter] = useState<CharterSubmission | null | 'new'>(null)

  useEffect(() => {
    apiFetch<CharterSubmission[]>(`/api/charter/submissions?homework_id=${homeworkId}`)
      .then(data => { setCharter(data[0] ?? null); setLoading(false) })
      .catch((e: Error) => { toast.error('과제정의서 로드 실패: ' + e.message); setLoading(false) })
  }, [homeworkId])

  if (loading) {
    return <FullPageSpinner />
  }

  if (charter === null) {
    return (
      <div className="p-6">
        <div className="mb-6 p-4 rounded-xl border text-center" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>아직 작성된 과제정의서가 없습니다.</p>
          <button
            onClick={() => setCharter('new')}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            과제정의서 작성하기
          </button>
        </div>
      </div>
    )
  }

  const existing = charter === 'new' ? undefined : charter

  // No id yet (writing for first time): editor only, no panel
  if (!existing) {
    return (
      <div className="p-6">
        <CharterEditor key="new" homeworkId={homeworkId} charter={undefined} onSaved={saved => setCharter(saved)} />
      </div>
    )
  }

  // Existing charter: split layout — editor left, feedback panel right
  return (
    <div className="flex" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
      <div className="flex-1 overflow-y-auto p-6 border-r" style={{ borderColor: 'var(--border-subtle)' }}>
        <CharterEditor key={existing.id} homeworkId={homeworkId} charter={existing} onSaved={saved => setCharter(saved)} />
      </div>
      <div className="flex flex-col" style={{ width: '320px', minWidth: '280px' }}>
        <CharterCommentPanel charterId={existing.id} />
      </div>
    </div>
  )
}

// ─── milestone tab components ─────────────────────────────────────────────────

function MilestonesTab({ homeworkId }: { homeworkId: number }) {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ week_number: '1', title: '', start_date: '', due_date: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null)
  const [editForm, setEditForm] = useState({ week_number: '1', title: '', start_date: '', due_date: '', description: '' })
  const [editSaving, setEditSaving] = useState(false)

  const inputStyle = {
    background: 'var(--surface-secondary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    color: 'var(--text-primary)',
    padding: '8px 12px',
    fontSize: '13px',
  }

  useEffect(() => {
    apiFetch<Milestone[]>(`/api/milestones?homework_id=${homeworkId}`)
      .then(data => { setMilestones(data); setLoading(false) })
      .catch((e: Error) => { toast.error('마일스톤 로드 실패: ' + e.message); setLoading(false) })
  }, [homeworkId])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.start_date || !form.due_date) { setFormError('작업 기간을 선택해주세요.'); return }
    setSaving(true); setFormError('')
    try {
      const m = await apiFetch<Milestone>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({ ...form, week_number: parseInt(form.week_number), homework_id: homeworkId }),
      })
      setMilestones(prev => [...prev, m])
      setShowForm(false)
      setForm({ week_number: '1', title: '', start_date: '', due_date: '', description: '' })
      toast.success('마일스톤이 추가되었습니다.')
    } catch {
      setFormError('마일스톤 추가에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  function openEdit(m: Milestone) {
    setEditingMilestone(m)
    setEditForm({ week_number: String(m.week_number), title: m.title, start_date: m.start_date, due_date: m.due_date, description: m.description ?? '' })
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editingMilestone) return
    if (!editForm.start_date || !editForm.due_date) { setFormError('작업 기간을 선택해주세요.'); return }
    setEditSaving(true)
    try {
      const updated = await apiFetch<Milestone>(`/api/milestones/${editingMilestone.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...editForm, week_number: parseInt(editForm.week_number) }),
      })
      setMilestones(prev => prev.map(m => m.id === updated.id ? updated : m))
      setEditingMilestone(null)
      toast.success('마일스톤이 수정되었습니다.')
    } catch {
      setFormError('수정에 실패했습니다.')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/api/milestones/${id}`, { method: 'DELETE' })
      setMilestones(prev => prev.filter(m => m.id !== id))
      setEditingMilestone(null)
      toast.success('마일스톤이 삭제되었습니다.')
    } catch {
      setFormError('삭제에 실패했습니다.')
    }
  }

  if (loading) return <FullPageSpinner />

  return (
    <div className="p-6 max-w-2xl">
      {milestones.length === 0 && !showForm ? (
        <div className="mb-4 p-4 rounded-xl border text-center" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-primary)' }}>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>등록된 마일스톤이 없습니다.</p>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--blue-600)', color: '#fff' }}>
            첫 마일스톤 추가하기
          </button>
        </div>
      ) : (
        <>
          {milestones.length > 0 && (
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)' }}>
                <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>주차</th>
                <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤</th>
                <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>기간</th>
                <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>상태</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {milestones.map(m => (
                <tr key={m.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                  <td className="py-3 pr-4">
                    <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}>
                      {m.week_number}주차
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</p>
                    {m.description && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{m.description}</p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {m.start_date} ~ {m.due_date}
                  </td>
                  <td className="py-3">
                    <span className="text-xs font-semibold" style={{ color: MILESTONE_STATUS_COLOR[m.status] }}>
                      {MILESTONE_STATUS_LABEL[m.status]}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => openEdit(m)}
                      title="편집"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-disabled)', fontSize: '13px', padding: '2px 4px' }}
                    >
                      ✏
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="text-sm font-semibold"
              style={{ color: 'var(--blue-600)' }}>
              + 마일스톤 추가
            </button>
          )}
        </>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="p-4 rounded-xl border flex flex-col gap-3" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>새 마일스톤</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>주차</label>
              <input type="number" value={form.week_number} onChange={e => setForm(f => ({ ...f, week_number: e.target.value }))} min="1" required style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>작업 기간</label>
            <DateRangePicker
              startDate={form.start_date}
              endDate={form.due_date}
              onChange={(s, e) => setForm(f => ({ ...f, start_date: s, due_date: e }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>설명</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="선택사항" rows={2} style={{ ...inputStyle, resize: 'none', width: '100%' }} />
          </div>
          {formError && <p className="text-xs" style={{ color: 'var(--error)' }}>{formError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowForm(false); setFormError('') }}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
              취소
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      )}

      {/* Edit modal */}
      <Dialog
        open={!!editingMilestone}
        onOpenChange={open => { if (!open) setEditingMilestone(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>마일스톤 편집</DialogTitle>
          </DialogHeader>
          {editingMilestone && (
            <form onSubmit={handleEditSave} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>주차</label>
                  <input type="number" value={editForm.week_number} onChange={e => setEditForm(f => ({ ...f, week_number: e.target.value }))} min="1" required style={inputStyle} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤 이름</label>
                  <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} required style={inputStyle} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>작업 기간</label>
                <DateRangePicker
                  startDate={editForm.start_date}
                  endDate={editForm.due_date}
                  onChange={(s, e) => setEditForm(f => ({ ...f, start_date: s, due_date: e }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>설명</label>
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="선택사항" rows={2} style={{ ...inputStyle, resize: 'none', width: '100%' }} />
              </div>

              <DialogFooter className="border-t pt-4" style={{ borderColor: 'var(--border-subtle)' }}>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button type="button"
                      className="px-3 py-2 rounded-lg text-xs font-semibold mr-auto"
                      style={{ color: 'var(--error)', border: '1px solid var(--error)' }}>
                      삭제
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>마일스톤 삭제</AlertDialogTitle>
                      <AlertDialogDescription>정말 삭제하시겠습니까? 되돌릴 수 없습니다.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(editingMilestone.id)}>삭제</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button type="button" onClick={() => setEditingMilestone(null)}
                  className="px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                  취소
                </button>
                <button type="submit" disabled={editSaving} className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--blue-600)', color: '#fff' }}>
                  {editSaving ? '저장 중...' : '저장'}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

type Tab = 'submission' | 'charter' | 'milestones'

export default function HomeworkDetailPage() {
  const { id } = useParams<{ id: string }>()
  const homeworkId = Number(id)
  const [homework, setHomework] = useState<Homework | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newComments, setNewComments] = useState<Record<string, string>>({})
  const [submittingComment, setSubmittingComment] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('charter')

  useEffect(() => {
    apiFetch<Homework>(`/api/homeworks/${id}`).then(setHomework).catch((e: Error) => toast.error('과제 로드 실패: ' + e.message))
    apiFetch<Submission[]>(`/api/submissions/mine/${id}`).then(setSubmissions).catch((e: Error) => toast.error('제출 이력 로드 실패: ' + e.message))
    import('@/lib/supabase/client').then(({ createSupabaseBrowserClient }) => {
      createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
        setUserId(session?.user?.id ?? null)
      })
    })
  }, [id])

  const latest = submissions[0]
  const canSubmit = !latest || latest.status === 'declined'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setUploading(true); setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('homework_id', id)
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createSupabaseBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body,
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const updated = await apiFetch<Submission[]>(`/api/submissions/mine/${id}`)
      setSubmissions(updated); setFile(null)
      toast.success('과제가 제출되었습니다.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleAddComment(subId: string) {
    const body = newComments[subId]?.trim()
    if (!body) return
    setSubmittingComment(subId)
    try {
      const newComment = await apiFetch<Comment>(`/api/submissions/${subId}/comments`, {
        method: 'POST', body: JSON.stringify({ body }),
      })
      setSubmissions(prev => prev.map(s =>
        s.id === subId ? { ...s, comments: [...(s.comments ?? []), newComment] } : s
      ))
      setNewComments(prev => ({ ...prev, [subId]: '' }))
      toast.success('코멘트가 작성되었습니다.')
    } catch (e: unknown) {
      toast.error('코멘트 작성 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmittingComment(null)
    }
  }

  async function handleEditComment(subId: string, comment: Comment, newBody: string) {
    try {
      const updated = await apiFetch<Comment>(`/api/submissions/${subId}/comments/${comment.id}`, {
        method: 'PATCH', body: JSON.stringify({ body: newBody }),
      })
      setSubmissions(prev => prev.map(s =>
        s.id === subId
          ? { ...s, comments: (s.comments ?? []).map(c => c.id === comment.id ? updated : c) }
          : s
      ))
    } catch (e: unknown) {
      toast.error('코멘트 수정 실패: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'charter', label: '과제정의서' },
    { key: 'milestones', label: '마일스톤 (WBS)' },
    { key: 'submission', label: '과제 제출' },
  ]

  return (
    <div>
      {/* Homework header */}
      {homework && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              # {String(homework.id).padStart(2, '0')}
            </span>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{homework.title}</h1>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>마감: {homework.due_date}</p>
          {homework.description && (
            <div
              className="text-sm rounded-xl p-4 border prose max-w-none"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(homework.description) }}
            />
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b mb-6 whitespace-nowrap" style={{ borderColor: 'var(--border-subtle)' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors"
            style={{
              borderColor: activeTab === t.key ? 'var(--blue-600)' : 'transparent',
              color: activeTab === t.key ? 'var(--blue-600)' : 'var(--text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: 과제 제출 */}
      {activeTab === 'submission' && (
        <div className="max-w-2xl">
          {canSubmit && (
            <form onSubmit={handleSubmit} className="mb-8 p-4 rounded-xl border"
              style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                {latest?.status === 'declined' ? '재제출' : '제출하기'}
              </p>

              {/* Custom file picker */}
              <label
                className="flex items-center gap-3 w-full rounded-lg border cursor-pointer mb-3 overflow-hidden"
                style={{ borderColor: file ? 'var(--blue-600)' : 'var(--border-subtle)', background: 'var(--surface-secondary)' }}
              >
                <span
                  className="shrink-0 px-3 py-2 text-xs font-semibold border-r"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  파일 선택
                </span>
                <span className="text-sm truncate" style={{ color: file ? 'var(--text-primary)' : 'var(--text-disabled)' }}>
                  {file ? file.name : '파일을 선택하세요'}
                </span>
                <input
                  type="file"
                  className="sr-only"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              {error && <p className="text-xs mb-2" style={{ color: 'var(--error)' }}>{error}</p>}
              <button type="submit" disabled={!file || uploading}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>
                {uploading ? '업로드 중...' : '제출하기'}
              </button>
            </form>
          )}

          <div>
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--text-secondary)' }}>제출 이력</h2>
            <div className="flex flex-col gap-3">
              {submissions.map(sub => (
                <div key={sub.id} className="p-4 rounded-xl border"
                  style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      시도 #{sub.attempt_number} · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}>
                      {STATUS_LABEL[sub.status]}
                    </span>
                  </div>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>

                  {sub.comments && sub.comments.length > 0 && (
                    <div className="mb-3 border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                      {sub.comments.map(c => (
                        <CommentItem key={c.id} comment={c}
                          isOwn={c.author_role === 'user' && c.author_id === userId}
                          onEdit={(comment, newBody) => handleEditComment(sub.id, comment, newBody)} />
                      ))}
                    </div>
                  )}

                  <div className="border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
                    <textarea
                      value={newComments[sub.id] ?? ''}
                      onChange={e => setNewComments(prev => ({ ...prev, [sub.id]: e.target.value }))}
                      onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault()
                          handleAddComment(sub.id)
                        }
                      }}
                      placeholder="코멘트 입력..." rows={2}
                      className="w-full text-xs rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-accent"
                      style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
                    <button
                      onClick={() => handleAddComment(sub.id)}
                      disabled={submittingComment === sub.id || !newComments[sub.id]?.trim()}
                      className="mt-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                      style={{ background: 'var(--blue-600)', color: '#fff' }}>
                      코멘트 작성
                    </button>
                  </div>
                </div>
              ))}
              {submissions.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>아직 제출 이력이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: 과제정의서 */}
      {activeTab === 'charter' && <CharterTab homeworkId={homeworkId} />}

      {/* Tab: 마일스톤 */}
      {activeTab === 'milestones' && <MilestonesTab homeworkId={homeworkId} />}
    </div>
  )
}
