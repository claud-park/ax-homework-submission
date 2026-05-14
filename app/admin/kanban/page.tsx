'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { apiFetch } from '@/lib/api-client'
import type { Submission, User, Homework, KanbanData } from '@/lib/types'

type KanbanCard = Submission & { user: User }
type ColumnKey = 'not_submitted' | 'pending' | 'accepted' | 'declined'

const COLS: { key: ColumnKey; label: string }[] = [
  { key: 'not_submitted', label: '미제출' },
  { key: 'pending', label: '검토 중' },
  { key: 'accepted', label: '합격' },
  { key: 'declined', label: '불합격' },
]
const COL_COLOR: Record<ColumnKey, string> = {
  not_submitted: 'var(--text-disabled)',
  pending: 'var(--amber)',
  accepted: 'var(--success)',
  declined: 'var(--error)',
}

function DroppableColumn({ col, children }: { col: typeof COLS[0]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key })
  return (
    <div
      ref={setNodeRef}
      className="flex-1 min-w-0 rounded-xl p-3 transition-colors"
      style={{
        background: isOver ? 'rgba(37,99,235,0.08)' : 'var(--surface-primary)',
        border: `1px solid ${isOver ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
        minHeight: '200px',
      }}
    >
      <h3 className="text-xs font-bold mb-3 uppercase tracking-wide" style={{ color: COL_COLOR[col.key] }}>{col.label}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function DraggableCard({ card, draggable }: { card: KanbanCard; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled: !draggable })
  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className="p-3 rounded-xl border text-xs"
      style={{
        background: 'var(--surface-secondary)',
        borderColor: 'var(--border-subtle)',
        opacity: isDragging ? 0.4 : 1,
        cursor: draggable ? 'grab' : 'default',
      }}
    >
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{card.user.name}</p>
      <p style={{ color: 'var(--text-secondary)' }}>#{card.homework_id} · 시도 {card.attempt_number}</p>
      <p className="mt-1 truncate" style={{ color: 'var(--text-disabled)' }}>{card.file_name}</p>
    </div>
  )
}

function NotSubmittedCard({ user }: { user: User }) {
  return (
    <div className="p-3 rounded-xl border text-xs" style={{ background: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)' }}>
      <p className="font-semibold" style={{ color: 'var(--text-disabled)' }}>{user.name}</p>
    </div>
  )
}

export default function AdminKanbanPage() {
  const [homeworks, setHomeworks] = useState<Homework[]>([])
  const [selectedHw, setSelectedHw] = useState<string>('')
  const [data, setData] = useState<KanbanData>({ pending: [], accepted: [], declined: [], not_submitted: [] })
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const fetchKanban = useCallback(() => {
    const url = selectedHw ? `/api/admin/kanban?homework_id=${selectedHw}` : '/api/admin/kanban'
    apiFetch<KanbanData>(url).then(setData)
  }, [selectedHw])

  useEffect(() => {
    apiFetch<Homework[]>('/api/admin/homeworks').then(setHomeworks)
  }, [])

  useEffect(() => { fetchKanban() }, [fetchKanban])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function onDragStart(event: DragStartEvent) {
    const card = data.pending.find(c => c.id === event.active.id) ?? null
    setActiveCard(card)
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over || !active) return
    const cardId = active.id as string
    const targetCol = over.id as ColumnKey
    if (targetCol === 'not_submitted') return

    const newStatus = targetCol === 'pending' ? 'pending' : targetCol === 'accepted' ? 'accepted' : 'declined'

    // Optimistic update
    const card = data.pending.find(c => c.id === cardId)
    if (!card) return
    setData(prev => ({
      ...prev,
      pending: prev.pending.filter(c => c.id !== cardId),
      [targetCol]: [...prev[targetCol as keyof Pick<KanbanData, 'pending' | 'accepted' | 'declined'>], { ...card, status: newStatus }],
    }))

    try {
      await apiFetch(`/api/admin/submissions/${cardId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
    } catch {
      showToast('상태 변경 실패. 되돌립니다.')
      fetchKanban()
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>제출 현황 (Kanban)</h1>
        <select
          value={selectedHw}
          onChange={e => setSelectedHw(e.target.value)}
          className="text-sm rounded-lg px-3 py-2"
          style={{ background: 'var(--surface-primary)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
        >
          <option value="">전체 과제</option>
          {homeworks.map(hw => (
            <option key={hw.id} value={hw.id}>#{String(hw.id).padStart(2, '0')} {hw.title}</option>
          ))}
        </select>
      </div>

      {toast && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--error)', border: '1px solid var(--error)' }}>
          {toast}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4">
          {COLS.map(col => (
            <DroppableColumn key={col.key} col={col}>
              {col.key === 'not_submitted'
                ? data.not_submitted.map(u => <NotSubmittedCard key={u.id} user={u} />)
                : data[col.key as keyof Pick<KanbanData, 'pending' | 'accepted' | 'declined'>].map(card => (
                  <DraggableCard key={card.id} card={card} draggable={col.key === 'pending'} />
                ))
              }
            </DroppableColumn>
          ))}
        </div>
        <DragOverlay>
          {activeCard && <DraggableCard card={activeCard} draggable={false} />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
