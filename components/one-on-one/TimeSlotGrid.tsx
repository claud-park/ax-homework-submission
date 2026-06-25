'use client'
import { formatTimeKST } from '@/lib/one-on-one/slot-utils'
import type { Slot } from '@/lib/one-on-one/calendar'
import type { AdminId } from '@/lib/one-on-one/google-auth'

const ADMIN_NAME: Record<AdminId, string> = {
  claud:    'Claud',
  alex:     'Alex',
  jennifer: 'Jennifer',
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
          가능한 시간을 찾고 있어요...
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
                  background: isSelected ? 'rgba(37,99,235,0.1)' : 'var(--surface-secondary)',
                  color:      isSelected ? 'var(--blue-600)' : 'var(--text-primary)',
                  border:     isSelected ? '1.5px solid var(--blue-600)' : '1px solid var(--border-subtle)',
                  cursor:     'pointer',
                }}
              >
                <span className="text-sm font-bold">{formatTimeKST(slot.start)}</span>
                <div className="flex flex-wrap gap-0.5 justify-center">
                  {slot.availableAdmins.map((adminId) => (
                    <span
                      key={adminId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '1px 5px',
                        borderRadius: 4,
                        fontSize: 9,
                        fontWeight: 700,
                        background: isSelected ? 'rgba(37,99,235,0.12)' : 'rgba(0,0,0,0.07)',
                        color: isSelected ? 'var(--blue-600)' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ADMIN_NAME[adminId]}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
