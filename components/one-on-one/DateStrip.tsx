'use client'
import { useState } from 'react'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DOW_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function getWorkdays(weekOffset: number): Array<{
  date: string   // 'YYYY-MM-DD'
  monthLabel: string
  dayNum: number
  dowLabel: string
  isPast: boolean
}> {
  const nowUtc   = new Date()
  const kstNow   = new Date(nowUtc.getTime() + KST_OFFSET_MS)
  const todayStr = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth()+1).padStart(2,'0')}-${String(kstNow.getUTCDate()).padStart(2,'0')}`

  // 이번 주 월요일(KST) 기준
  const dow = kstNow.getUTCDay()  // 0=Sun
  const daysToMonday = dow === 0 ? 1 : dow === 1 ? 0 : -(dow - 1)
  const mondayUtcMs = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + daysToMonday + weekOffset * 7
  )

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mondayUtcMs + i * 86400000)
    const yyyy = d.getUTCFullYear()
    const mm   = String(d.getUTCMonth() + 1).padStart(2, '0')
    const dd   = String(d.getUTCDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    return {
      date:       dateStr,
      monthLabel: MONTH_SHORT[d.getUTCMonth()],
      dayNum:     d.getUTCDate(),
      dowLabel:   DOW_SHORT[d.getUTCDay()],
      isPast:     dateStr < todayStr,
    }
  })
}

interface Props {
  selectedDate: string | null
  onSelect: (date: string) => void
}

export function DateStrip({ selectedDate, onSelect }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const days = getWorkdays(weekOffset)

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
        날짜 선택
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
          disabled={weekOffset === 0}
          className="p-1.5 rounded-lg"
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-subtle)',
            cursor: weekOffset === 0 ? 'not-allowed' : 'pointer',
            opacity: weekOffset === 0 ? 0.4 : 1,
          }}
        >
          ←
        </button>

        <div className="flex gap-1.5 overflow-x-auto flex-1">
          {days.map((d) => {
            const selected = d.date === selectedDate
            return (
              <button
                key={d.date}
                onClick={() => !d.isPast && onSelect(d.date)}
                disabled={d.isPast}
                className="flex flex-col items-center px-2 py-2 rounded-xl flex-1"
                style={{
                  background:   selected ? 'var(--blue-600)' : 'var(--surface-secondary)',
                  border:       selected ? 'none' : '1px solid var(--border-subtle)',
                  color:        d.isPast ? 'var(--text-disabled)' : selected ? '#fff' : 'var(--text-primary)',
                  cursor:       d.isPast ? 'not-allowed' : 'pointer',
                  opacity:      d.isPast ? 0.5 : 1,
                }}
              >
                <span className="text-[10px]">{d.monthLabel}</span>
                <span className="text-lg font-bold leading-tight">{d.dayNum}</span>
                <span className="text-[10px]">{d.dowLabel}</span>
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setWeekOffset(Math.min(1, weekOffset + 1))}
          disabled={weekOffset === 1}
          className="p-1.5 rounded-lg"
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-subtle)',
            cursor: weekOffset === 1 ? 'not-allowed' : 'pointer',
            opacity: weekOffset === 1 ? 0.4 : 1,
          }}
        >
          →
        </button>
      </div>
    </div>
  )
}
