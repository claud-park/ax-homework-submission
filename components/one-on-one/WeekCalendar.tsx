'use client'
import { toKST, formatTimeKST } from '@/lib/one-on-one/slot-utils'
import type { Slot } from '@/lib/one-on-one/calendar'
import type { BusyInterval } from '@/lib/one-on-one/champion-google'
import type { AdminId } from '@/lib/one-on-one/google-auth'

const HOUR_PX    = 80           // px per hour
const START_HOUR = 10           // KST 10:00
const END_HOUR   = 17           // KST 17:00
const TOTAL_H    = END_HOUR - START_HOUR  // 7 hours

const ADMIN_NAME: Record<AdminId, string> = {
  claud:    'Claud',
  alex:     'Alex',
  jennifer: 'Jennifer',
}
const ADMIN_COLOR: Record<AdminId, string> = {
  claud:    '#2563eb',
  alex:     '#16a34a',
  jennifer: '#7c3aed',
}
const ADMIN_BG: Record<AdminId, string> = {
  claud:    '#dbeafe',
  alex:     '#dcfce7',
  jennifer: '#ede9fe',
}

const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function minuteTop(isoUtc: string): number {
  const kst = toKST(new Date(isoUtc))
  const mins = (kst.getUTCHours() - START_HOUR) * 60 + kst.getUTCMinutes()
  return (mins / 60) * HOUR_PX
}

function durationHeight(minutes: number): number {
  return (minutes / 60) * HOUR_PX
}

function isoToDateStr(isoUtc: string): string {
  const kst = toKST(new Date(isoUtc))
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth()+1).padStart(2,'0')}-${String(kst.getUTCDate()).padStart(2,'0')}`
}

function getWeekDates(weekStart: string): Array<{ date: string; label: string; dayNum: number; month: string }> {
  const [y, m, d] = weekStart.split('-').map(Number)
  return Array.from({ length: 5 }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d + i))
    const dateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`
    return {
      date:   dateStr,
      label:  DOW_SHORT[dt.getUTCDay()],
      dayNum: dt.getUTCDate(),
      month:  MONTH_SHORT[dt.getUTCMonth()],
    }
  })
}

// 점심시간 KST 11:30-13:00
const LUNCH_TOP    = ((11.5 - START_HOUR) / 1) * HOUR_PX   // (1.5h × 80px)
const LUNCH_HEIGHT = (1.5 / 1) * HOUR_PX                   // 1.5h

// 시간 레이블 (정시 + 30분)
const TIME_LABELS: string[] = []
for (let h = START_HOUR; h < END_HOUR; h++) {
  TIME_LABELS.push(`${String(h).padStart(2,'0')}:00`)
  TIME_LABELS.push(`${String(h).padStart(2,'0')}:30`)
}

interface WeekCalendarProps {
  weekStart: string
  duration: 30 | 60
  slots: Slot[]
  championBusy: BusyInterval[] | null
  selected: Slot | null
  onSelect: (slot: Slot) => void
  loading: boolean
}

export function WeekCalendar({
  weekStart, duration, slots, championBusy, selected, onSelect, loading
}: WeekCalendarProps) {
  const weekDates = getWeekDates(weekStart)
  const gridHeight = TOTAL_H * HOUR_PX

  // 날짜별로 슬롯 그룹화
  const slotsByDate: Record<string, Slot[]> = {}
  for (const slot of slots) {
    const d = isoToDateStr(slot.start)
    if (!slotsByDate[d]) slotsByDate[d] = []
    slotsByDate[d].push(slot)
  }

  // 챔피언 busy: 날짜별 그룹화
  const championBusyByDate: Record<string, BusyInterval[]> = {}
  if (championBusy) {
    for (const b of championBusy) {
      const d = isoToDateStr(b.start)
      if (!championBusyByDate[d]) championBusyByDate[d] = []
      championBusyByDate[d].push(b)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>캘린더 로딩 중...</p>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* 요일 헤더 */}
      <div style={{ display: 'flex', marginLeft: 48 }}>
        {weekDates.map(({ date, label, dayNum, month }) => {
          const isToday = date === toKST(new Date()).toISOString().slice(0,10)
          return (
            <div
              key={date}
              className="flex-1 text-center pb-2"
              style={{ minWidth: 80 }}
            >
              <p className="text-[10px] font-medium" style={{ color: 'var(--text-disabled)' }}>{month}</p>
              <div
                className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold mx-auto"
                style={{
                  background: isToday ? 'var(--blue-600)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--text-primary)',
                }}
              >
                {dayNum}
              </div>
              <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{label}</p>
            </div>
          )
        })}
      </div>

      {/* 그리드 */}
      <div style={{ display: 'flex' }}>
        {/* 시간 축 */}
        <div style={{ width: 48, flexShrink: 0, position: 'relative', height: gridHeight }}>
          {TIME_LABELS.map((label, i) => (
            <div
              key={label}
              style={{
                position: 'absolute',
                top: i * (HOUR_PX / 2) - 7,
                right: 8,
                fontSize: 10,
                color: 'var(--text-disabled)',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* 날짜별 컬럼 */}
        {weekDates.map(({ date }) => {
          const daySlots = slotsByDate[date] ?? []
          const dayChampBusy = championBusyByDate[date] ?? []

          return (
            <div
              key={date}
              style={{
                flex: 1,
                minWidth: 80,
                position: 'relative',
                height: gridHeight,
                borderLeft: '1px solid var(--border-subtle)',
              }}
            >
              {/* 시간선 */}
              {TIME_LABELS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: i * (HOUR_PX / 2),
                    left: 0,
                    right: 0,
                    borderTop: i % 2 === 0
                      ? '1px solid var(--border-subtle)'
                      : '1px dashed var(--border-subtle)',
                    opacity: 0.5,
                  }}
                />
              ))}

              {/* 점심시간 블록 */}
              <div
                style={{
                  position: 'absolute',
                  top: LUNCH_TOP,
                  left: 2,
                  right: 2,
                  height: LUNCH_HEIGHT,
                  background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 8px)',
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
              />

              {/* 가용 슬롯 */}
              {daySlots.map((slot) => {
                const isSelected = selected?.start === slot.start
                const top    = minuteTop(slot.start)
                const height = durationHeight(duration)
                return (
                  <button
                    key={slot.start}
                    onClick={() => onSelect(slot)}
                    style={{
                      position:  'absolute',
                      top:       top + 2,
                      left:      3,
                      right:     3,
                      height:    height - 4,
                      background: isSelected ? 'var(--blue-600)' : 'var(--surface-secondary)',
                      border: `1.5px solid ${isSelected ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
                      borderRadius: 6,
                      cursor:    'pointer',
                      padding:   '2px 4px',
                      display:   'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      overflow:  'hidden',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: isSelected ? '#fff' : 'var(--text-primary)',
                        lineHeight: 1.2,
                      }}
                    >
                      {formatTimeKST(slot.start)}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                      {slot.availableAdmins.map(adminId => (
                        <span
                          key={adminId}
                          style={{
                            padding: '1px 4px',
                            borderRadius: 3,
                            background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                            color: isSelected ? '#fff' : 'var(--text-secondary)',
                            fontSize: 8,
                            fontWeight: 700,
                            lineHeight: 1.4,
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

              {/* 챔피언 busy 오버레이 (Phase B) */}
              {dayChampBusy.map((b, i) => {
                const kstStart = toKST(new Date(b.start))
                const kstEnd   = toKST(new Date(b.end))
                const startH = kstStart.getUTCHours() + kstStart.getUTCMinutes() / 60
                const endH   = kstEnd.getUTCHours()   + kstEnd.getUTCMinutes()   / 60
                const clampedStart = Math.max(startH, START_HOUR)
                const clampedEnd   = Math.min(endH,   END_HOUR)
                if (clampedEnd <= clampedStart) return null
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top:    (clampedStart - START_HOUR) * HOUR_PX + 2,
                      left:   2,
                      right:  2,
                      height: (clampedEnd - clampedStart) * HOUR_PX - 4,
                      background: 'rgba(239,68,68,0.12)',
                      border: '1px solid rgba(239,68,68,0.25)',
                      borderRadius: 4,
                      pointerEvents: 'none',
                    }}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      {/* 범례 (Phase B 연결 시) */}
      {championBusy !== null && (
        <div className="flex items-center gap-4 mt-3 px-12">
          <div className="flex items-center gap-1.5">
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#dbeafe', border: '1.5px solid #2563eb' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>가용 슬롯</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>내 일정</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 12, height: 12, borderRadius: 3, background: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 6px)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>점심</span>
          </div>
        </div>
      )}
    </div>
  )
}
