'use client'
import { formatTimeKST } from '@/lib/one-on-one/slot-utils'
import type { Slot } from '@/lib/one-on-one/calendar'

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
                className="py-2 rounded-lg text-sm font-semibold"
                style={{
                  background:   isSelected ? 'var(--blue-600)' : 'var(--surface-secondary)',
                  color:        isSelected ? '#fff' : 'var(--text-primary)',
                  border:       isSelected ? 'none' : '1px solid var(--border-subtle)',
                  cursor:       'pointer',
                }}
              >
                {formatTimeKST(slot.start)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
