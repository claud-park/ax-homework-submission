'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api-client'
import { DurationToggle } from '@/components/one-on-one/DurationToggle'
import { DateStrip }      from '@/components/one-on-one/DateStrip'
import { TimeSlotGrid }   from '@/components/one-on-one/TimeSlotGrid'
import { BookingStatus }  from '@/components/one-on-one/BookingStatus'
import type { Slot } from '@/lib/one-on-one/calendar'
import type { OneOnOneBooking } from '@/lib/types'

export default function OneOnOnePage() {
  const [duration,     setDuration]     = useState<30 | 60>(30)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots,        setSlots]        = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [booking,      setBooking]      = useState<OneOnOneBooking | null>(null)
  const [bookingLoading, setBookingLoading] = useState(true)
  const [submitting,   setSubmitting]   = useState(false)
  const [cancelling,   setCancelling]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // 페이지 로드 시 기존 booking 조회
  useEffect(() => {
    apiFetch<{ booking: OneOnOneBooking | null }>('/api/one-on-one/my-booking')
      .then((r) => setBooking(r.booking))
      .catch(() => {})
      .finally(() => setBookingLoading(false))
  }, [])

  // 날짜 또는 duration 변경 시 슬롯 재조회
  useEffect(() => {
    if (!selectedDate) return
    setSlotsLoading(true)
    setSelectedSlot(null)
    apiFetch<{ slots: Slot[] }>(`/api/one-on-one/slots?date=${selectedDate}&duration=${duration}`)
      .then((r) => setSlots(r.slots))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false))
  }, [selectedDate, duration])

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
        <h1 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          1-on-1 신청하기
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-disabled)' }}>로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
        1-on-1 신청하기
      </h1>
      <p className="text-xs mb-6" style={{ color: 'var(--text-secondary)' }}>
        claud, alex, jennifer 중 가능한 시간을 선택해 신청하세요.
      </p>

      {/* 기존 pending/confirmed booking이 있으면 상태 표시 */}
      {booking && booking.status !== 'cancelled' ? (
        <BookingStatus
          booking={booking}
          onCancel={handleCancel}
          onRebook={() => setBooking(null)}
          cancelling={cancelling}
        />
      ) : (
        <>
          <DurationToggle value={duration} onChange={setDuration} />
          <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} />

          {selectedDate && (
            <TimeSlotGrid
              slots={slots}
              selected={selectedSlot}
              onSelect={setSelectedSlot}
              loading={slotsLoading}
            />
          )}

          {error && (
            <p className="text-xs mb-3" style={{ color: 'var(--error)' }}>{error}</p>
          )}

          {selectedSlot && (
            <button
              onClick={handleBook}
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-bold"
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
      )}
    </div>
  )
}
