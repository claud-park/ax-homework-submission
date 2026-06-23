'use client'
import { formatSlotLabel } from '@/lib/one-on-one/slot-utils'
import type { OneOnOneBooking } from '@/lib/types'

interface Props {
  booking: OneOnOneBooking
  onCancel: () => Promise<void>
  onRebook: () => void   // cancelled 상태에서 다시 신청 시
  cancelling: boolean
}

export function BookingStatus({ booking, onCancel, onRebook, cancelling }: Props) {
  const slotLabel = formatSlotLabel(booking.slot_start)
  const durationLabel = `${booking.duration_minutes}분`

  if (booking.status === 'pending') {
    return (
      <div
        className="rounded-xl border p-5"
        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span>⏳</span>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            확정 대기 중
          </p>
        </div>
        <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
          일시: {slotLabel} ({durationLabel})
        </p>
        <p className="text-xs mb-4" style={{ color: 'var(--text-disabled)' }}>
          어드민이 #ax-tf에서 확정하면 Google Calendar 일정이 생성됩니다.
        </p>
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{
            background: '#fff',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            cursor: cancelling ? 'not-allowed' : 'pointer',
          }}
        >
          {cancelling ? '취소 중...' : '신청 취소'}
        </button>
      </div>
    )
  }

  if (booking.status === 'confirmed') {
    return (
      <div
        className="rounded-xl border p-5"
        style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span>✅</span>
          <p className="text-sm font-bold" style={{ color: 'var(--success)' }}>
            확정됨
          </p>
        </div>
        <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
          일시: {slotLabel} ({durationLabel})
        </p>
        {booking.confirmed_by && (
          <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            담당: {booking.confirmed_by.toUpperCase()}
          </p>
        )}
        <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
          Google Calendar에 일정이 추가되었습니다.
        </p>
      </div>
    )
  }

  // cancelled
  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: 'var(--surface-primary)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span>❌</span>
        <p className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
          취소됨
        </p>
      </div>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        일시: {slotLabel} ({durationLabel})
      </p>
      <button
        onClick={onRebook}
        className="text-xs px-3 py-1.5 rounded-lg font-semibold"
        style={{
          background: 'var(--blue-600)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        다시 신청하기
      </button>
    </div>
  )
}
