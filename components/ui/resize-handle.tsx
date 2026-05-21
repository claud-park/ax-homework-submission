'use client'
import { useCallback, useRef, useState } from 'react'

export function useResizableWidth({
  initialWidth,
  min = 200,
  max = 1200,
  side,
}: {
  initialWidth: number
  min?: number
  max?: number
  // 'right' — handle sits on the right edge, dragging right grows the element
  // 'left'  — handle sits on the left edge, dragging left grows the element
  side: 'left' | 'right'
}) {
  const [width, setWidth] = useState(initialWidth)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startWidth: width }

      const handleMove = (ev: MouseEvent) => {
        const drag = dragRef.current
        if (!drag) return
        const dx = ev.clientX - drag.startX
        const delta = side === 'right' ? dx : -dx
        const next = Math.max(min, Math.min(max, drag.startWidth + delta))
        setWidth(next)
      }
      const handleUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width, min, max, side],
  )

  return { width, setWidth, onMouseDown }
}

export function ResizeHandle({
  side,
  onMouseDown,
}: {
  side: 'left' | 'right'
  onMouseDown: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      className={`absolute top-0 ${side === 'left' ? 'left-0' : 'right-0'} h-full w-1.5 cursor-col-resize z-20 hover:bg-blue-accent/40 active:bg-blue-accent/60 transition-colors`}
    />
  )
}
