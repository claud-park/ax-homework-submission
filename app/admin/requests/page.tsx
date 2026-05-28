'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { DeadlineChangeRequest } from '@/lib/types'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Inbox } from 'lucide-react'

const DEADLINE_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', approved: 'var(--success)', rejected: 'var(--error)',
}
const DEADLINE_STATUS_LABEL: Record<string, string> = {
  pending: '검토 중', approved: '승인됨', rejected: '반려됨',
}

type Tab = 'pending' | 'reviewed'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pending', label: '답변 대기중' },
  { id: 'reviewed', label: '확인 완료' },
]

export default function AdminRequestsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<DeadlineChangeRequest[]>('/api/admin/deadline-requests')
      .then(setRequests)
      .catch((e: Error) => toast.error('기한 변경 요청 로드 실패: ' + e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleDeadlineReview(id: string, status: 'approved' | 'rejected') {
    try {
      const updated = await apiFetch<DeadlineChangeRequest>(`/api/admin/deadline-requests/${id}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      })
      setRequests(prev => prev.map(r => r.id === id ? updated : r))
      toast.success(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.')
    } catch (e) {
      toast.error('승인/반려 처리 실패: ' + (e as Error).message)
    }
  }

  const pendingList = requests
    .filter(r => r.status === 'pending')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const reviewedList = requests
    .filter(r => r.status !== 'pending')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const displayList = activeTab === 'pending' ? pendingList : reviewedList

  return (
    <div className="flex flex-col gap-0">
      <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>기한 변경 요청</h1>

      {/* 탭 */}
      <div className="flex gap-1 border-b mb-6" style={{ borderColor: 'var(--border-subtle)' }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id
          const badge = tab.id === 'pending' ? pendingList.length : reviewedList.length
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 text-xs px-4 py-2 font-medium transition-colors"
              style={{
                color: active ? 'var(--blue-600)' : 'var(--text-secondary)',
                borderBottom: active ? '2px solid var(--blue-600)' : '2px solid transparent',
                marginBottom: -1,
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {tab.label}
              {badge > 0 && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: tab.id === 'pending' ? 'rgba(248,113,113,0.15)' : 'color-mix(in srgb, var(--success) 12%, transparent)',
                    color: tab.id === 'pending' ? 'var(--error)' : 'var(--success)',
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 w-full rounded-xl animate-pulse" style={{ background: 'var(--surface-secondary)' }} />
          ))
        ) : displayList.map(req => (
          <div key={req.id} className="p-4 rounded-xl border" style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {req.user?.avatar_url && (
                    <img src={req.user.avatar_url} alt={req.user.name} className="w-5 h-5 rounded-full" />
                  )}
                  <span className="text-xs font-semibold" style={{ color: 'var(--blue-600)' }}>{req.user?.name}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  {req.milestone?.week_number && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}>
                      {req.milestone.week_number}주차
                    </span>
                  )}
                  <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{req.milestone?.title}</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {req.original_due_date} → {req.requested_due_date}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>사유: {req.reason}</p>
              </div>
              {activeTab === 'reviewed' && (
                <span
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={{ color: DEADLINE_STATUS_COLOR[req.status], background: `${DEADLINE_STATUS_COLOR[req.status]}20` }}
                >
                  {DEADLINE_STATUS_LABEL[req.status]}
                </span>
              )}
            </div>
            {req.status === 'pending' && (
              <div className="flex gap-2 mt-3">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(74,222,128,0.15)', color: 'var(--success)', border: '1px solid var(--success)' }}>
                      ✓ 승인
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>기한변경 요청 승인</AlertDialogTitle>
                      <AlertDialogDescription>마일스톤 마감일이 요청 날짜로 변경됩니다. 진행하시겠습니까?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeadlineReview(req.id, 'approved')}>승인</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
                      ✗ 반려
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>기한변경 요청 반려</AlertDialogTitle>
                      <AlertDialogDescription>이 요청을 반려하시겠습니까?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeadlineReview(req.id, 'rejected')}>반려</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        ))}
        {!loading && displayList.length === 0 && (
          <EmptyState icon={Inbox} title={activeTab === 'pending' ? '답변 대기중인 요청이 없습니다' : '확인 완료된 요청이 없습니다'} />
        )}
      </div>
    </div>
  )
}
