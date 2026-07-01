'use client'
import { useEffect, useRef, useState } from 'react'
import { apiFetch, apiUpload } from '@/lib/api-client'
import type { Submission, Comment } from '@/lib/types'
import { toast } from 'sonner'
import { Upload, FileCheck, Link, Download, Send } from 'lucide-react'
import { DesktopOnlyNotice } from '@/components/DesktopOnlyNotice'
import { track, AnalyticsEvent } from '@/lib/analytics'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

type SubWithComments = Submission & { comments?: Comment[] }

const STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', accepted: '합격', declined: '불합격',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', accepted: 'var(--success)', declined: 'var(--error)',
}

export function SubmissionClient({ initialSubmissions }: { initialSubmissions: SubWithComments[] }) {
  const [submissions, setSubmissions] = useState<SubWithComments[]>(initialSubmissions)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [submittingLink, setSubmittingLink] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [newComment, setNewComment] = useState<Record<string, string>>({})
  const [posting, setPosting] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const viewedDeclinedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    submissions.forEach(sub => {
      if (sub.status === 'declined' && !viewedDeclinedRef.current.has(sub.id)) {
        viewedDeclinedRef.current.add(sub.id)
        track(AnalyticsEvent.SUBMISSION_DECLINED_VIEWED, { attempt_number: sub.attempt_number })
      }
    })
  }, [submissions])

  async function downloadFile(subId: string) {
    setDownloadingId(subId)
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/submissions/${subId}/download`)
      window.open(url, '_blank')
    } catch (e) {
      toast.error('다운로드 URL 생성 실패: ' + (e as Error).message)
    } finally {
      setDownloadingId(null)
    }
  }

  async function postComment(subId: string) {
    const trimmed = (newComment[subId] ?? '').trim()
    if (!trimmed) return
    setPosting(subId)
    try {
      await apiFetch(`/api/submissions/${subId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: trimmed }),
      })
      setNewComment(prev => ({ ...prev, [subId]: '' }))
      load()
    } catch (e) {
      toast.error('코멘트 작성 실패: ' + (e as Error).message)
    } finally {
      setPosting(null)
    }
  }

  function load() {
    setLoading(true)
    apiFetch<SubWithComments[]>('/api/submissions/mine')
      .then(setSubmissions)
      .catch((e: Error) => toast.error('로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await apiUpload('/api/submissions', formData)
      toast.success('제출되었습니다.')
      track(AnalyticsEvent.SUBMISSION_COMPLETED, {
        type: 'file',
        attempt_number: submissions.length + 1,
        is_resubmission: submissions.length > 0,
      })
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '제출 실패')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleLinkSubmit() {
    const trimmed = linkUrl.trim()
    if (!trimmed) return
    setSubmittingLink(true)
    try {
      await apiFetch('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({ link_url: trimmed }),
      })
      toast.success('제출되었습니다.')
      track(AnalyticsEvent.SUBMISSION_COMPLETED, {
        type: 'link',
        attempt_number: submissions.length + 1,
        is_resubmission: submissions.length > 0,
      })
      setLinkUrl('')
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '제출 실패')
    } finally {
      setSubmittingLink(false)
    }
  }

  const latest = submissions[0] ?? null

  return (
    <div>
      <DesktopOnlyNotice />
      <div className="hidden md:block">
      {/* 제출 섹션 */}
      <div
        className="rounded-xl border p-4 mb-6"
        style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
      >
        {latest && (
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            최근 제출: {latest.link_url ? latest.link_url : latest.file_name} · 시도 {latest.attempt_number}회
          </p>
        )}

        {/* 파일 업로드 */}
        <div className="flex items-center gap-3 mb-3">
          <label
            className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm cursor-pointer"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--background)',
              color: 'var(--text-secondary)',
              opacity: uploading ? 0.6 : 1,
            }}
          >
            <Upload className="h-4 w-4 shrink-0" />
            <span className="truncate">{uploading ? '업로드 중...' : '파일 선택'}</span>
            <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0"
            style={{ background: 'var(--blue-600)', color: '#fff', opacity: uploading ? 0.6 : 1 }}
          >
            {uploading ? '업로드 중...' : latest ? '파일 재제출' : '파일 제출'}
          </button>
        </div>

        {/* 구분선 */}
        <div className="flex items-center gap-2 my-3">
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>또는</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        </div>

        {/* 링크 제출 */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border"
            style={{ borderColor: 'var(--border)', background: 'var(--background)' }}
          >
            <Link className="h-4 w-4 shrink-0" style={{ color: 'var(--text-disabled)' }} />
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLinkSubmit() }}
              placeholder="https://..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: 'var(--text-primary)' }}
              disabled={submittingLink}
            />
          </div>
          <button
            onClick={handleLinkSubmit}
            disabled={submittingLink || !linkUrl.trim()}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0 disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}
          >
            {submittingLink ? '제출 중...' : latest ? '링크 재제출' : '링크 제출'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))}
        </div>
      ) : submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Upload className="h-8 w-8" style={{ color: 'var(--text-disabled)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>아직 제출하지 않았습니다</p>
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>파일 또는 링크로 제출하세요.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {submissions.map(sub => (
            <div
              key={sub.id}
              className="flex flex-col p-4 rounded-xl border gap-3"
              style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
            >
              {/* 파일/링크 + 상태배지 row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {sub.link_url
                    ? <Link className="h-4 w-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                    : <FileCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                  }
                  <div className="min-w-0">
                    {sub.link_url ? (
                      <a
                        href={sub.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium truncate block"
                        style={{ color: 'var(--blue-600)' }}
                      >
                        {sub.link_url}
                      </a>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{sub.file_name}</p>
                        <button
                          onClick={() => downloadFile(sub.id)}
                          disabled={downloadingId === sub.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium shrink-0"
                          style={{ color: 'var(--blue-600)', background: 'rgba(37,99,235,0.08)', border: 'none', cursor: 'pointer', opacity: downloadingId === sub.id ? 0.5 : 1 }}
                        >
                          <Download className="h-3 w-3" />
                          {downloadingId === sub.id ? '...' : '다운로드'}
                        </button>
                      </div>
                    )}
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      시도 {sub.attempt_number}회 · {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                </div>
                <span
                  className="text-xs font-semibold px-2 py-1 rounded-md shrink-0 ml-3"
                  style={{ color: STATUS_COLOR[sub.status], background: `${STATUS_COLOR[sub.status]}20` }}
                >
                  {STATUS_LABEL[sub.status]}
                </span>
              </div>

              {/* 관리자 피드백 블록 (feedback 있을 때만) */}
              {sub.feedback && (
                <div
                  style={{
                    borderLeft: '3px solid var(--blue-600)',
                    borderRadius: '0 6px 6px 0',
                    background: 'rgba(37,99,235,0.04)',
                    padding: '8px 10px 8px 12px',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-disabled)' }}>
                      관리자 피드백
                    </span>
                    {sub.feedback_updated_at && (
                      <span className="text-xs" style={{ color: 'var(--text-disabled)' }}>
                        · {new Date(sub.feedback_updated_at).toLocaleString('ko-KR')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {sub.feedback}
                  </p>
                </div>
              )}

              {/* 코멘트 */}
              {(() => {
                const comments = (sub.comments ?? []).slice().sort(
                  (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                )
                return (
                  <div className="flex flex-col gap-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-disabled)' }}>
                      코멘트{comments.length > 0 ? ` (${comments.length})` : ''}
                    </p>
                    {comments.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        {comments.map(c => (
                          <div
                            key={c.id}
                            className="rounded-lg border px-3 py-2 text-xs"
                            style={{
                              background: c.author_role === 'admin' ? 'rgba(37,99,235,0.04)' : 'var(--surface-secondary)',
                              borderColor: c.author_role === 'admin' ? 'rgba(37,99,235,0.15)' : 'var(--border)',
                            }}
                          >
                            <div className="flex justify-between mb-1">
                              <span className="font-semibold" style={{ color: c.author_role === 'admin' ? 'var(--blue-600)' : 'var(--text-primary)' }}>
                                {c.author_role === 'admin' ? '관리자' : '나'}
                              </span>
                              <span style={{ color: 'var(--text-disabled)' }}>{relativeTime(c.created_at)}</span>
                            </div>
                            <p className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>{c.body}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <textarea
                        value={newComment[sub.id] ?? ''}
                        onChange={e => setNewComment(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault()
                            postComment(sub.id)
                          }
                        }}
                        placeholder="코멘트 작성 (Cmd+Enter)"
                        rows={3}
                        className="flex-1 text-xs rounded-lg border p-2 resize-none outline-none"
                        style={{ background: 'var(--background)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                      />
                      <button
                        onClick={() => postComment(sub.id)}
                        disabled={posting === sub.id || !(newComment[sub.id] ?? '').trim()}
                        className="inline-flex items-center justify-center rounded-lg px-3 disabled:opacity-40 shrink-0"
                        style={{ background: 'var(--blue-600)', color: '#fff', border: 'none', cursor: 'pointer' }}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
