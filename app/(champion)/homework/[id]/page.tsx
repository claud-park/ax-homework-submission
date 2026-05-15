'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { apiFetch } from '@/lib/api-client'
import type { Homework, Submission, Comment, CharterSubmission, Milestone, ProjectCharter, CharterComment } from '@/lib/types'
import DOMPurify from 'dompurify'

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
              className="w-full text-xs rounded p-2 resize-none"
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
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b"
        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {required && <span className="text-xs" style={{ color: 'var(--amber)' }}>필수</span>}
      </div>
      <div style={{ background: 'var(--surface-secondary)' }}>
        <EditorContent editor={editor} className="p-3 min-h-16 text-sm prose max-w-none" />
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

function ChampionCommentThread({ comment, currentUserId, onReply, onEdit }: {
  comment: CharterComment
  currentUserId: string | null
  onReply: (parentId: string, body: string) => Promise<void>
  onEdit: (commentId: string, body: string) => Promise<void>
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [saving, setSaving] = useState(false)

  const isOwn = comment.author_id === currentUserId
  const isAdminComment = comment.author_role === 'admin'
  const badge = isAdminComment
    ? { label: '관리자', color: 'var(--blue-600)', bg: 'rgba(37,99,235,0.08)' }
    : { label: '챔피언', color: 'var(--success)', bg: 'rgba(22,163,74,0.08)' }
  const dimmed = comment.parent_id === null && comment.is_resolved

  async function submitReply() {
    if (!replyBody.trim()) return
    setSaving(true)
    try { await onReply(comment.id, replyBody.trim()); setReplyBody(''); setReplyOpen(false) } finally { setSaving(false) }
  }

  async function submitEdit() {
    if (!editBody.trim() || editBody.trim() === comment.body) { setEditOpen(false); return }
    setSaving(true)
    try { await onEdit(comment.id, editBody.trim()); setEditOpen(false) } finally { setSaving(false) }
  }

  return (
    <div style={{ opacity: dimmed ? 0.5 : 1, marginBottom: '8px' }}>
      <div className="rounded-xl border p-3"
        style={{
          background: 'var(--surface-primary)',
          borderColor: dimmed ? 'var(--border-subtle)' : comment.parent_id === null ? 'var(--blue-600)' : 'var(--border-subtle)',
          borderLeftWidth: comment.parent_id === null ? '3px' : '1px',
        }}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
              style={{ color: badge.color, background: badge.bg, fontSize: '10px' }}>{badge.label}</span>
            <span style={{ color: 'var(--text-disabled)', fontSize: '10px' }}>
              {new Date(comment.created_at).toLocaleString('ko-KR')}
              {comment.updated_at !== comment.created_at && ' · 편집됨'}
            </span>
          </div>
          {comment.parent_id === null && comment.is_resolved && (
            <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>✓ 해결됨</span>
          )}
        </div>

        {editOpen ? (
          <div>
            <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={2}
              className="w-full text-xs rounded-lg p-2 resize-none mb-1"
              style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
            <div className="flex gap-2">
              <button onClick={() => { setEditOpen(false); setEditBody(comment.body) }}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
              <button onClick={submitEdit} disabled={saving}
                className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>저장</button>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: dimmed ? 'var(--text-disabled)' : 'var(--text-primary)', textDecoration: dimmed ? 'line-through' : 'none' }}>
            {comment.body}
          </p>
        )}

        {!editOpen && !dimmed && (
          <div className="flex gap-3 mt-2">
            {isOwn && <button onClick={() => setEditOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>편집</button>}
            {comment.parent_id === null && !replyOpen && (
              <button onClick={() => setReplyOpen(true)} className="text-xs" style={{ color: 'var(--text-disabled)' }}>↩ 답글</button>
            )}
          </div>
        )}
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-4 border-l pl-3 mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
          {comment.replies.map(r => (
            <ChampionCommentThread key={r.id} comment={r} currentUserId={currentUserId}
              onReply={onReply} onEdit={onEdit} />
          ))}
        </div>
      )}

      {replyOpen && (
        <div className="ml-4 border-l pl-3 mt-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <textarea value={replyBody} onChange={e => setReplyBody(e.target.value)} rows={2}
            placeholder="답글 작성..."
            className="w-full text-xs rounded-lg p-2 resize-none mb-1"
            style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
          <div className="flex gap-2">
            <button onClick={() => { setReplyOpen(false); setReplyBody('') }}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>취소</button>
            <button onClick={submitReply} disabled={saving || !replyBody.trim()}
              className="text-xs px-2 py-1 rounded font-semibold disabled:opacity-50"
              style={{ background: 'var(--blue-600)', color: '#fff' }}>답글 작성</button>
          </div>
        </div>
      )}
    </div>
  )
}

function CharterCommentSection({ charterId }: { charterId: string }) {
  const [comments, setComments] = useState<CharterComment[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [newBody, setNewBody] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    import('@/lib/supabase/client').then(({ createSupabaseBrowserClient }) => {
      createSupabaseBrowserClient().auth.getSession().then(({ data: { session } }) => {
        setCurrentUserId(session?.user?.id ?? null)
      })
    })
    apiFetch<CharterComment[]>(`/api/charter/submissions/${charterId}/comments`).then(flat => {
      const map = new Map<string, CharterComment>()
      flat.forEach(c => map.set(c.id, { ...c, replies: [] }))
      const roots: CharterComment[] = []
      map.forEach(c => {
        if (c.parent_id) map.get(c.parent_id)?.replies?.push(c)
        else roots.push(c)
      })
      setComments(roots)
    })
  }, [charterId])

  function updateInTree(list: CharterComment[], updated: CharterComment): CharterComment[] {
    return list.map(c => {
      if (c.id === updated.id) return { ...updated, replies: c.replies }
      return { ...c, replies: c.replies ? updateInTree(c.replies, updated) : [] }
    })
  }

  async function handlePost() {
    if (!newBody.trim()) return
    setPosting(true)
    try {
      const created = await apiFetch<CharterComment>(`/api/charter/submissions/${charterId}/comments`, {
        method: 'POST', body: JSON.stringify({ body: newBody.trim() }),
      })
      setComments(prev => [...prev, { ...created, replies: [] }])
      setNewBody('')
    } finally { setPosting(false) }
  }

  async function handleReply(parentId: string, body: string) {
    const created = await apiFetch<CharterComment>(
      `/api/charter/submissions/${charterId}/comments/${parentId}/replies`,
      { method: 'POST', body: JSON.stringify({ body }) }
    )
    setComments(prev => prev.map(c => c.id === parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c))
  }

  async function handleEdit(commentId: string, body: string) {
    const updated = await apiFetch<CharterComment>(`/api/charter/comments/${commentId}`, {
      method: 'PATCH', body: JSON.stringify({ body }),
    })
    setComments(prev => updateInTree(prev, updated))
  }

  return (
    <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
      <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>피드백</p>
      {comments.length === 0 && (
        <p className="text-sm mb-3" style={{ color: 'var(--text-disabled)' }}>아직 피드백이 없습니다.</p>
      )}
      {comments.map(c => (
        <ChampionCommentThread key={c.id} comment={c} currentUserId={currentUserId}
          onReply={handleReply} onEdit={handleEdit} />
      ))}
      <div className="mt-3">
        <textarea value={newBody} onChange={e => setNewBody(e.target.value)}
          placeholder="새 코멘트 작성..."
          rows={2}
          className="w-full text-sm rounded-lg p-3 resize-none mb-2"
          style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }} />
        <div className="flex justify-end">
          <button onClick={handlePost} disabled={posting || !newBody.trim()}
            className="text-sm px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}>
            {posting ? '작성 중...' : '작성'}
          </button>
        </div>
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
  }, [homeworkId])

  if (loading) {
    return <p className="text-sm p-6" style={{ color: 'var(--text-disabled)' }}>로딩 중...</p>
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
  return (
    <div className="p-6">
      <CharterEditor
        key={existing?.id ?? 'new'}
        homeworkId={homeworkId}
        charter={existing}
        onSaved={saved => setCharter(saved)}
      />
      {existing && <CharterCommentSection charterId={existing.id} />}
    </div>
  )
}

// ─── milestone tab components ─────────────────────────────────────────────────

function MilestonesTab({ homeworkId }: { homeworkId: number }) {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', start_date: '', due_date: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    apiFetch<Milestone[]>(`/api/milestones?homework_id=${homeworkId}`)
      .then(data => { setMilestones(data); setLoading(false) })
  }, [homeworkId])

  async function handleCreate() {
    if (!form.title || !form.start_date || !form.due_date) {
      setFormError('마일스톤 이름, 시작일, 마감일은 필수입니다.'); return
    }
    setSaving(true); setFormError('')
    try {
      const m = await apiFetch<Milestone>('/api/milestones', {
        method: 'POST',
        body: JSON.stringify({ ...form, homework_id: homeworkId }),
      })
      setMilestones(prev => [...prev, m])
      setShowForm(false)
      setForm({ title: '', start_date: '', due_date: '', description: '' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-sm p-6" style={{ color: 'var(--text-disabled)' }}>로딩 중...</p>

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
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)' }}>
                <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>마일스톤</th>
                <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>기간</th>
                <th className="pb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map(m => (
                <tr key={m.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
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
                </tr>
              ))}
            </tbody>
          </table>
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
        <div className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>새 마일스톤</p>
          <div className="flex flex-col gap-2">
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="마일스톤 이름 *"
              className="w-full text-sm p-2 rounded-lg border"
              style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>시작일 *</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full text-sm p-2 rounded-lg border"
                  style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }} />
              </div>
              <div className="flex-1">
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>마감일 *</label>
                <input type="date" value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full text-sm p-2 rounded-lg border"
                  style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }} />
              </div>
            </div>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="설명 (선택)"
              rows={2}
              className="w-full text-sm p-2 rounded-lg border resize-none"
              style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
            />
            {formError && <p className="text-xs" style={{ color: 'var(--error)' }}>{formError}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setFormError('') }}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                취소
              </button>
              <button onClick={handleCreate} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [activeTab, setActiveTab] = useState<Tab>('submission')

  useEffect(() => {
    apiFetch<Homework>(`/api/homeworks/${id}`).then(setHomework)
    apiFetch<Submission[]>(`/api/submissions/mine/${id}`).then(setSubmissions)
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
    } finally {
      setSubmittingComment(null)
    }
  }

  async function handleEditComment(subId: string, comment: Comment, newBody: string) {
    const updated = await apiFetch<Comment>(`/api/submissions/${subId}/comments/${comment.id}`, {
      method: 'PATCH', body: JSON.stringify({ body: newBody }),
    })
    setSubmissions(prev => prev.map(s =>
      s.id === subId
        ? { ...s, comments: (s.comments ?? []).map(c => c.id === comment.id ? updated : c) }
        : s
    ))
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'submission', label: '과제 제출' },
    { key: 'charter', label: '과제정의서' },
    { key: 'milestones', label: '마일스톤 (WBS)' },
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
      <div className="flex border-b mb-6" style={{ borderColor: 'var(--border-subtle)' }}>
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
                      placeholder="코멘트 입력..." rows={2}
                      className="w-full text-xs rounded-lg p-2 resize-none"
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
