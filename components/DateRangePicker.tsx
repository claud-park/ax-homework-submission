'use client'
import { useEffect, useRef, useState } from 'react'
import { HOLIDAYS_FALLBACK, toKey, parseKey, countWorkingDays } from '@/lib/holidays'

export { countWorkingDays } from '@/lib/holidays'

function formatKo(key: string): string {
  const d = parseKey(key)
  const DOW = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface Props {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
}

export default function DateRangePicker({ startDate, endDate, onChange }: Props) {
  const todayKey = toKey(new Date())

  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => (startDate ? parseKey(startDate) : new Date()).getFullYear())
  const [viewMonth, setViewMonth] = useState(() => (startDate ? parseKey(startDate) : new Date()).getMonth())
  const [step, setStep] = useState<'idle' | 'end'>('idle')
  const [firstKey, setFirstKey] = useState<string | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [holidays, setHolidays] = useState<Record<string, string>>(HOLIDAYS_FALLBACK)
  const fetchedYears = useRef<Set<number>>(new Set())

  // 연도별 공휴일을 API에서 fetch하고 누적 저장 (API 키 없으면 빈 객체 → fallback 유지)
  useEffect(() => {
    const thisYear = new Date().getFullYear()
    const yearsToFetch = [thisYear, thisYear + 1, viewYear]
    const newYears = yearsToFetch.filter(y => !fetchedYears.current.has(y))
    if (newYears.length === 0) return

    Promise.all(
      newYears.map(y =>
        fetch(`/api/holidays?year=${y}`)
          .then(r => r.ok ? r.json() : {})
          .catch(() => ({}))
      )
    ).then(results => {
      const merged: Record<string, string> = {}
      results.forEach(r => Object.assign(merged, r))
      if (Object.keys(merged).length === 0) return // API 키 없음 → fallback 유지
      newYears.forEach(y => fetchedYears.current.add(y))
      setHolidays(prev => ({ ...prev, ...merged }))
    })
  }, [viewYear])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setStep('idle'); setFirstKey(null); setHoverKey(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function getRange(): [string, string] | null {
    if (step === 'end' && firstKey && hoverKey) {
      return firstKey <= hoverKey ? [firstKey, hoverKey] : [hoverKey, firstKey]
    }
    if (startDate && endDate && startDate <= endDate) return [startDate, endDate]
    return null
  }

  const range = getRange()

  function handleDayClick(key: string) {
    if (step === 'idle') {
      setFirstKey(key)
      setStep('end')
      onChange(key, '')
    } else {
      const [s, e] = firstKey! <= key ? [firstKey!, key] : [key, firstKey!]
      onChange(s, e)
      setStep('idle'); setFirstKey(null); setHoverKey(null); setOpen(false)
    }
  }

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const workingDays = startDate && endDate ? countWorkingDays(startDate, endDate, holidays) : null

  const triggerText = startDate && endDate
    ? `${formatKo(startDate)}  →  ${formatKo(endDate)}`
    : step === 'end' && firstKey
    ? `${formatKo(firstKey)}  →  마감일 선택 중…`
    : '작업 기간을 선택하세요'

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={() => {
          if (!open) { setStep('idle'); setFirstKey(null) }
          setOpen(o => !o)
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          background: 'var(--surface-secondary)',
          border: `1px solid ${open ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
          borderRadius: open ? '8px 8px 0 0' : '8px',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'border-color 0.15s, border-radius 0.15s',
        }}
      >
        <span style={{ fontSize: '18px', flexShrink: 0 }}>📅</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', color: 'var(--text-disabled)', marginBottom: '2px' }}>작업 기간</div>
          <div style={{
            fontSize: '13px',
            fontWeight: 600,
            color: startDate && endDate ? 'var(--text-primary)' : 'var(--text-disabled)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {triggerText}
          </div>
        </div>
        {workingDays !== null && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue-600)', flexShrink: 0, background: 'rgba(37,99,235,0.1)', padding: '2px 8px', borderRadius: '999px' }}>
            워킹데이 {workingDays}일
          </span>
        )}
      </button>

      {/* ── Calendar (inline expand, same stacking context) ── */}
      {open && (
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--blue-600)',
          borderTop: 'none',
          borderRadius: '0 0 14px 14px',
          overflow: 'hidden',
        }}>
          {/* Hint */}
          <div style={{
            padding: '5px 16px',
            fontSize: '11px',
            color: step === 'end' ? 'var(--blue-600)' : 'var(--text-disabled)',
            background: step === 'end' ? 'rgba(37,99,235,0.06)' : 'var(--surface-secondary)',
            borderBottom: '1px solid var(--border-subtle)',
            fontWeight: step === 'end' ? 600 : 400,
          }}>
            {step === 'idle' ? '시작일을 선택하세요' : '마감일을 선택하세요'}
          </div>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 6px' }}>
            <button type="button" onClick={prevMonth}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '20px', padding: '2px 8px', lineHeight: 1 }}>
              ‹
            </button>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {viewYear}년 {viewMonth + 1}월
            </span>
            <button type="button" onClick={nextMonth}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '20px', padding: '2px 8px', lineHeight: 1 }}>
              ›
            </button>
          </div>

          {/* DOW headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 14px 2px' }}>
            {DOW_LABELS.map((label, i) => (
              <div key={label} style={{
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: 700,
                padding: '4px 0',
                color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : 'var(--text-secondary)',
              }}>
                {label}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 14px 14px' }}>
            {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`blank-${i}`} style={{ height: '40px' }} />)}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const d = new Date(viewYear, viewMonth, day)
              const key = toKey(d)
              const dow = d.getDay()
              const holiday = holidays[key]
              const isSat = dow === 6
              const isSun = dow === 0
              const isToday = key === todayKey

              const isRangeStart = range ? key === range[0] : false
              const isRangeEnd = range ? key === range[1] : false
              const isBetween = range ? key > range[0] && key < range[1] : false
              const isSelected = isRangeStart || isRangeEnd || (step === 'end' && key === firstKey)
              const hasBothEnds = range !== null && range[0] !== range[1]

              let textColor = 'var(--text-primary)'
              if (isSelected) textColor = '#fff'
              else if (holiday || isSun) textColor = '#ef4444'
              else if (isSat) textColor = '#3b82f6'

              let cellBg = 'transparent'
              if (hasBothEnds) {
                if (isBetween) cellBg = 'rgba(37,99,235,0.1)'
                else if (isRangeStart) cellBg = 'linear-gradient(90deg, transparent 50%, rgba(37,99,235,0.1) 50%)'
                else if (isRangeEnd) cellBg = 'linear-gradient(90deg, rgba(37,99,235,0.1) 50%, transparent 50%)'
              }

              return (
                <div
                  key={key}
                  onClick={() => handleDayClick(key)}
                  onMouseEnter={() => { if (step === 'end') setHoverKey(key) }}
                  onMouseLeave={() => { if (step === 'end') setHoverKey(null) }}
                  title={holiday ?? undefined}
                  style={{
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    background: cellBg,
                  }}
                >
                  <div style={{
                    position: 'relative',
                    width: '34px',
                    height: '34px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    background: isSelected
                      ? '#2563eb'
                      : isToday
                      ? 'rgba(37,99,235,0.14)'
                      : 'transparent',
                    color: textColor,
                    fontSize: '13px',
                    fontWeight: isSelected || isToday ? 700 : 400,
                    transition: 'background 0.1s',
                  }}>
                    {day}
                    {holiday && !isSelected && (
                      <div style={{
                        position: 'absolute',
                        bottom: '3px',
                        width: '4px',
                        height: '4px',
                        borderRadius: '50%',
                        background: '#ef4444',
                      }} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary footer */}
          {startDate && endDate && workingDays !== null && (
            <div style={{
              borderTop: '1px solid var(--border-subtle)',
              padding: '10px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--surface-secondary)',
            }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {formatKo(startDate)} – {formatKo(endDate)}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue-600)' }}>
                워킹데이 <strong>{workingDays}</strong>일
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
