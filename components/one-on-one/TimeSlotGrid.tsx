'use client'
import { formatTimeKST } from '@/lib/one-on-one/slot-utils'
import type { Slot } from '@/lib/one-on-one/calendar'
import type { AdminId } from '@/lib/one-on-one/google-auth'

const ADMIN_META: Record<AdminId, { name: string; color: string; bg: string; selectedBg: string }> = {
  claud:    { name: 'Claud',    color: '#1d4ed8', bg: '#dbeafe', selectedBg: 'rgba(219,234,254,0.3)' },
  alex:     { name: 'Alex',     color: '#15803d', bg: '#dcfce7', selectedBg: 'rgba(220,252,231,0.3)' },
  jennifer: { name: 'Jennifer', color: '#7c3aed', bg: '#ede9fe', selectedBg: 'rgba(237,233,254,0.3)' },
}

interface Props {
  slots: Slot[]
  selected: Slot | null
  onSelect: (slot: Slot) => void
  loading: boolean
}

export function TimeSlotGrid({ slots, selected, onSelect, loading }: Props) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
        시간 선택
      </p>

      {loading ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--text-disabled)' }}>
          가용 슬롯 조회 중...
        </p>
      ) : slots.length === 0 ? (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--text-disabled)' }}>
          이 날짜는 예약 가능한 슬롯이 없습니다.
        </p>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
        >
          {slots.map((slot) => {
            const isSelected = selected?.start === slot.start
            return (
              <button
                key={slot.start}
                onClick={() => onSelect(slot)}
                className="flex flex-col items-center gap-1.5 py-2.5 px-2 rounded-xl"
                style={{
                  background: isSelected ? 'var(--blue-600)' : 'var(--surface-secondary)',
                  color:      isSelected ? '#fff' : 'var(--text-primary)',
                  border:     isSelected ? 'none' : '1px solid var(--border-subtle)',
                  cursor:     'pointer',
                }}
              >
                <span className="text-sm font-bold">{formatTimeKST(slot.start)}</span>
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {slot.availableAdmins.map((adminId) => {
                    const m = ADMIN_META[adminId]
                    return (
                      <span
                        key={adminId}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '1px 5px',
                          borderRadius: 4,
                          fontSize: 9,
                          fontWeight: 700,
                          background: isSelected ? m.selectedBg : m.bg,
                          color: isSelected ? '#fff' : m.color,
                          border: isSelected ? '1px solid rgba(255,255,255,0.4)' : 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.name}
                      </span>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
