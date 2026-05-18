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

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--amber)', approved: 'var(--success)', rejected: 'var(--error)',
}
const STATUS_LABEL: Record<string, string> = { pending: '검토 중', approved: '승인됨', rejected: '반려됨' }

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<DeadlineChangeRequest[]>([])

  useEffect(() => {
    apiFetch<DeadlineChangeRequest[]>('/api/admin/deadline-requests').then(setRequests)
  }, [])

  async function handleReview(id: string, status: 'approved' | 'rejected', review_note?: string) {
    try {
      const updated = await apiFetch<DeadlineChangeRequest>(`/api/admin/deadline-requests/${id}`, {
        method: 'PATCH', body: JSON.stringify({ status, review_note }),
      })
      setRequests(prev => prev.map(r => r.id === id ? updated : r))
      toast.success(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.')
    } catch (e) {
      toast.error('승인/반려 처리 실패: ' + (e as Error).message)
    }
  }

  // Per milestone: all pending + most recent resolved
  const displayed = (() => {
    const byMilestone = new Map<string, DeadlineChangeRequest[]>()
    for (const r of requests) {
      const list = byMilestone.get(r.milestone_id) ?? []
      list.push(r)
      byMilestone.set(r.milestone_id, list)
    }
    const result: DeadlineChangeRequest[] = []
    Array.from(byMilestone.values()).forEach(reqs => {
      reqs.filter((r: DeadlineChangeRequest) => r.status === 'pending').forEach((r: DeadlineChangeRequest) => result.push(r))
      const resolved = reqs.find((r: DeadlineChangeRequest) => r.status === 'approved' || r.status === 'rejected')
      if (resolved) result.push(resolved)
    })
    return result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })()

  return (
    <div>
      <h1 className="text-lg font-bold mb-6" style={{ color: 'var(--text-primary)' }}>기한 변경 요청</h1>
      <div className="flex flex-col gap-3">
        {displayed.map(req => (
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
              <span className="text-xs font-semibold px-2 py-1 rounded" style={{ color: STATUS_COLOR[req.status], background: `${STATUS_COLOR[req.status]}20` }}>
                {STATUS_LABEL[req.status]}
              </span>
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
                      <AlertDialogAction onClick={() => handleReview(req.id, 'approved')}>승인</AlertDialogAction>
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
                      <AlertDialogAction onClick={() => handleReview(req.id, 'rejected')}>반려</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        ))}
        {displayed.length === 0 && <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>기한 변경 요청이 없습니다.</p>}
      </div>
    </div>
  )
}
