'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { DurationToggle }  from '@/components/one-on-one/DurationToggle'
import { DateStrip }       from '@/components/one-on-one/DateStrip'
import { TimeSlotGrid }    from '@/components/one-on-one/TimeSlotGrid'
import { WeekCalendar }    from '@/components/one-on-one/WeekCalendar'
import { BookingStatus }   from '@/components/one-on-one/BookingStatus'
import type { Slot }          from '@/lib/one-on-one/calendar'
import type { BusyInterval }  from '@/lib/one-on-one/champion-google'
import type { OneOnOneBooking } from '@/lib/types'

type ViewMode = 'chip' | 'calendar'

function getMonday(kstDateStr?: string | null): string {
  const ref = kstDateStr
    ? new Date(kstDateStr + 'T00:00:00+09:00')
    : new Date(Date.now() + 9 * 3600 * 1000)
  const dow = ref.getUTCDay()
  const daysToMon = dow === 0 ? 1 : dow === 1 ? 0 : -(dow - 1)
  const monMs = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + daysToMon)
  const mon = new Date(monMs)
  return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth()+1).padStart(2,'0')}-${String(mon.getUTCDate()).padStart(2,'0')}`
}

function filterSlots(slots: Slot[], busy: BusyInterval[] | null): Slot[] {
  if (!busy) return slots
  return slots.filter(s => !busy.some(b => s.start < b.end && s.end > b.start))
}

export default function OneOnOnePage() {
  const searchParams = useSearchParams()

  const [viewMode,       setViewMode]       = useState<ViewMode>('chip')
  const [duration,       setDuration]       = useState<30 | 60>(30)
  const [champConnected, setChampConnected] = useState(false)

  // 칩 뷰 state
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [chipSlots,    setChipSlots]    = useState<Slot[]>([])
  const [chipBusy,     setChipBusy]     = useState<BusyInterval[] | null>(null)
  const [chipLoading,  setChipLoading]  = useState(false)

  // 캘린더 뷰 state
  const [weekStart,  setWeekStart]  = useState<string>(() => getMonday())
  const [calSlots,   setCalSlots]   = useState<Slot[]>([])
  const [calBusy,    setCalBusy]    = useState<BusyInterval[] | null>(null)
  const [calLoading, setCalLoading] = useState(false)

  // 공통 state
  const [selectedSlot,   setSelectedSlot]   = useState<Slot | null>(null)
  const [booking,        setBooking]         = useState<OneOnOneBooking | null>(null)
  const [bookingLoading, setBookingLoading]  = useState(true)
  const [submitting,     setSubmitting]      = useState(false)
  const [cancelling,     setCancelling]      = useState(false)
  const [error,          setError]           = useState<string | null>(null)

  // OAuth 결과 처리
  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      toast.success('Google Calendar가 연결되었습니다.')
      setChampConnected(true)
    }
    if (searchParams.get('error') === 'oauth_failed') {
      toast.error('Google Calendar 연결에 실패했습니다.')
    }
  }, [searchParams])

  // 기존 booking 조회 + 초기 Google Calendar 연결 상태
  useEffect(() => {
    apiFetch<{ booking: OneOnOneBooking | null; championConnected: boolean }>('/api/one-on-one/my-booking')
      .then(r => {
        setBooking(r.booking)
        if (r.championConnected) setChampConnected(true)
      })
      .catch(() => {})
      .finally(() => setBookingLoading(false))
  }, [])

  // 칩 뷰: 날짜/duration 변경 시 슬롯 재조회
  useEffect(() => {
    if (viewMode !== 'chip' || !selectedDate) return
    setChipLoading(true)
    setSelectedSlot(null)
    apiFetch<{ slots: Slot[]; championBusy: BusyInterval[] | null; championConnected: boolean }>(
      `/api/one-on-one/slots?date=${selectedDate}&duration=${duration}`
    )
      .then(r => {
        setChipSlots(r.slots)
        setChipBusy(r.championBusy)
        setChampConnected(r.championConnected)
      })
      .catch(() => { setChipSlots([]); setChipBusy(null) })
      .finally(() => setChipLoading(false))
  }, [selectedDate, duration, viewMode])

  // 캘린더 뷰: 주/duration 변경 시 week-data 조회
  const loadWeekData = useCallback(() => {
    if (viewMode !== 'calendar') return
    setCalLoading(true)
    setSelectedSlot(null)
    apiFetch<{ slots: Slot[]; championBusy: BusyInterval[] | null; championConnected: boolean }>(
      `/api/one-on-one/week-data?weekStart=${weekStart}&duration=${duration}`
    )
      .then(r => {
        setCalSlots(r.slots)
        setCalBusy(r.championBusy)
        setChampConnected(r.championConnected)
      })
      .catch(() => { setCalSlots([]); setCalBusy(null) })
      .finally(() => setCalLoading(false))
  }, [viewMode, weekStart, duration])

  useEffect(() => { loadWeekData() }, [loadWeekData])

  async function handleBook() {
    if (!selectedSlot) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiFetch<{ booking: OneOnOneBooking }>('/api/one-on-one/book', {
        method: 'POST',
        body: JSON.stringify({
          duration,
          slotStart:       selectedSlot.start,
          slotEnd:         selectedSlot.end,
          availableAdmins: selectedSlot.availableAdmins,
        }),
      })
      setBooking(res.booking)
      setSelectedSlot(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '신청 실패')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel() {
    if (!booking) return
    setCancelling(true)
    try {
      await apiFetch('/api/one-on-one/cancel', {
        method: 'POST',
        body: JSON.stringify({ bookingId: booking.id }),
      })
      setBooking(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '취소 실패')
    } finally {
      setCancelling(false)
    }
  }

  if (bookingLoading) {
    return (
      <div>
        <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>1-on-1 신청하기</h1>
        <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>로딩 중...</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>1-on-1 신청하기</h1>
      <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
        AX Office 담당자들의 가능한 일정을 보여드려요.
      </p>

      {/* Google Calendar 연결 배너 — 뷰 무관하게 항상 표시 */}
      {!champConnected && (
        <div
          className="flex items-center justify-between rounded-xl border px-4 py-3 mb-4"
          style={{ background: '#fffbeb', borderColor: '#fde68a' }}
        >
          <div>
            <p className="text-xs font-semibold" style={{ color: '#92400e' }}>내 Google Calendar 연결</p>
            <p className="text-xs" style={{ color: '#b45309' }}>내 일정과 겹치는 빈 시간만 보여드려요.</p>
          </div>
          <a
            href="/api/auth/google/champion"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: '#f59e0b', color: '#fff', textDecoration: 'none' }}
          >
            연결하기
          </a>
        </div>
      )}

      {/* 슬롯 선택 폼 — 항상 표시 */}
      <>
        <div className="flex items-center justify-between mb-4">
          <DurationToggle value={duration} onChange={(d) => { setDuration(d); setSelectedSlot(null) }} />

          {/* 뷰 모드 토글 */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-secondary)' }}>
            {(['chip', 'calendar'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); setSelectedSlot(null) }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{
                  background: viewMode === mode ? '#fff' : 'transparent',
                  color:      viewMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border:     viewMode === mode ? '1px solid var(--border-subtle)' : 'none',
                  cursor:     'pointer',
                  boxShadow:  viewMode === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {mode === 'chip' ? '슬롯 뷰' : '캘린더 뷰'}
              </button>
            ))}
          </div>
        </div>

        {viewMode === 'chip' ? (
          <>
            <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
            {selectedDate ? (
              <TimeSlotGrid
                slots={filterSlots(chipSlots, chipBusy)}
                selected={selectedSlot}
                onSelect={setSelectedSlot}
                loading={chipLoading}
              />
            ) : (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--text-disabled)' }}>
                날짜를 먼저 선택해주세요.
              </p>
            )}
          </>
        ) : (
          <>
            {/* 주 네비게이션 */}
            <div className="flex items-center gap-3 mb-3">
              {(() => {
                const todayMon = getMonday()
                const [ty, tm, td] = todayMon.split('-').map(Number)
                const nextMonDate = new Date(Date.UTC(ty, tm-1, td+7))
                const maxMon = `${nextMonDate.getUTCFullYear()}-${String(nextMonDate.getUTCMonth()+1).padStart(2,'0')}-${String(nextMonDate.getUTCDate()).padStart(2,'0')}`
                const [y,m,d] = weekStart.split('-').map(Number)
                const prevStr = new Date(Date.UTC(y,m-1,d-7)).toISOString().slice(0,10)
                const nextStr = new Date(Date.UTC(y,m-1,d+7)).toISOString().slice(0,10)
                const leftDisabled = weekStart === todayMon
                const rightDisabled = weekStart === maxMon
                return (
                  <>
                    <button
                      disabled={leftDisabled}
                      onClick={() => { if (prevStr >= todayMon) setWeekStart(prevStr) }}
                      className="p-1.5 rounded-lg text-sm"
                      style={{
                        background: 'var(--surface-secondary)',
                        border: '1px solid var(--border-subtle)',
                        cursor: leftDisabled ? 'not-allowed' : 'pointer',
                        opacity: leftDisabled ? 0.4 : 1,
                      }}
                    >←</button>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      {weekStart} 주
                    </span>
                    <button
                      disabled={rightDisabled}
                      onClick={() => { if (nextStr <= maxMon) setWeekStart(nextStr) }}
                      className="p-1.5 rounded-lg text-sm"
                      style={{
                        background: 'var(--surface-secondary)',
                        border: '1px solid var(--border-subtle)',
                        cursor: rightDisabled ? 'not-allowed' : 'pointer',
                        opacity: rightDisabled ? 0.4 : 1,
                      }}
                    >→</button>
                  </>
                )
              })()}
            </div>

            <WeekCalendar
              weekStart={weekStart}
              duration={duration}
              slots={filterSlots(calSlots, calBusy)}
              championBusy={calBusy}
              selected={selectedSlot}
              onSelect={setSelectedSlot}
              loading={calLoading}
            />
          </>
        )}

        {error && (
          <p className="text-xs mb-3 mt-2" style={{ color: 'var(--error)' }}>{error}</p>
        )}

        {selectedSlot && (
          <button
            onClick={handleBook}
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-bold mt-4"
            style={{
              background: submitting ? 'var(--text-disabled)' : 'var(--blue-600)',
              color: '#fff',
              border: 'none',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '신청 중...' : '신청하기'}
          </button>
        )}
      </>

      {/* 내 일정 — 접이식 섹션 */}
      {booking && booking.status !== 'cancelled' && (
        <details open style={{ marginTop: 24 }}>
          <summary
            className="flex items-center gap-1.5 cursor-pointer select-none"
            style={{
              listStyle: 'none',
              padding: '10px 0',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>▼</span>
            내 일정
          </summary>
          <div style={{ marginTop: 8 }}>
            <BookingStatus
              booking={booking}
              onCancel={handleCancel}
              onRebook={() => setBooking(null)}
              cancelling={cancelling}
            />
          </div>
        </details>
      )}
    </div>
  )
}
