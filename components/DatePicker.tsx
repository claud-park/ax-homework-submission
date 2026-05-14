'use client'
import { useEffect, useRef, useState } from 'react'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
  style?: React.CSSProperties
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function DatePicker({ value, onChange, required, placeholder = '날짜 선택', style }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => value ? parseInt(value.slice(0, 4)) : new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.slice(5, 7)) - 1 : new Date().getMonth())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (value) {
      setViewYear(parseInt(value.slice(0, 4)))
      setViewMonth(parseInt(value.slice(5, 7)) - 1)
    }
  }, [value])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  function select(day: number) {
    const mm = String(viewMonth + 1).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    onChange(`${viewYear}-${mm}-${dd}`)
    setOpen(false)
  }

  const today = new Date()
  function isSelected(day: number) {
    if (!value) return false
    return value === `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  function isToday(day: number) {
    return today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day
  }

  const display = value
    ? `${value.slice(0, 4)}년 ${parseInt(value.slice(5, 7))}월 ${parseInt(value.slice(8, 10))}일`
    : placeholder

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...style,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          cursor: 'pointer',
          textAlign: 'left',
          color: value ? 'var(--text-primary)' : 'var(--text-disabled)',
        }}
      >
        <span>{display}</span>
        <span style={{ fontSize: '14px', flexShrink: 0 }}>📅</span>
      </button>

      {required && (
        <input
          type="date"
          value={value}
          required
          readOnly
          tabIndex={-1}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
        />
      )}

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 200,
          background: 'var(--surface-primary)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '14px',
          padding: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          minWidth: '260px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <button type="button" onClick={prevMonth} style={{ padding: '4px 10px', borderRadius: '7px', background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>‹</button>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {viewYear}년 {viewMonth + 1}월
            </span>
            <button type="button" onClick={nextMonth} style={{ padding: '4px 10px', borderRadius: '7px', background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '6px' }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-disabled)', padding: '2px 0', fontWeight: 600 }}>{d}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {cells.map((day, i) => (
              <button
                key={i}
                type="button"
                disabled={!day}
                onClick={() => day && select(day)}
                style={{
                  textAlign: 'center',
                  fontSize: '12px',
                  padding: '6px 0',
                  borderRadius: '7px',
                  cursor: day ? 'pointer' : 'default',
                  border: 'none',
                  background: day && isSelected(day)
                    ? 'var(--blue-600)'
                    : day && isToday(day)
                    ? 'rgba(37,99,235,0.1)'
                    : 'transparent',
                  color: !day
                    ? 'transparent'
                    : isSelected(day)
                    ? '#fff'
                    : isToday(day)
                    ? 'var(--blue-600)'
                    : 'var(--text-primary)',
                  fontWeight: day && (isSelected(day) || isToday(day)) ? 700 : 400,
                }}
              >
                {day ?? ''}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
