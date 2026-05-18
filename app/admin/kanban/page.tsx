'use client'
import { useEffect, useState, useCallback } from 'react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { apiFetch } from '@/lib/api-client'
import type { Homework, KanbanCard, KanbanColumn, KanbanDataV2 } from '@/lib/types'

const COLS: { key: KanbanColumn; label: string; color: string; cardBorder: string; cardBg: string }[] = [
  { key: 'not_started', label: '미시작',  color: 'var(--text-disabled)', cardBorder: 'var(--border-subtle)',    cardBg: 'var(--surface-secondary)' },
  { key: 'in_progress', label: '진행 중', color: 'var(--amber)',          cardBorder: 'rgba(217,119,6,0.3)',    cardBg: 'rgba(217,119,6,0.04)'     },
  { key: 'reviewing',   label: '검토 중', color: 'var(--blue-600)',       cardBorder: 'rgba(37,99,235,0.3)',    cardBg: 'rgba(37,99,235,0.04)'     },
  { key: 'accepted',    label: '합격',    color: 'var(--success)',         cardBorder: 'rgba(22,163,74,0.3)',    cardBg: 'rgba(22,163,74,0.04)'     },
  { key: 'declined',    label: '불합격',  color: 'var(--error)',           cardBorder: 'rgba(220,38,38,0.3)',    cardBg: 'rgba(220,38,38,0.04)'     },
]

const DROPPABLE_COLS: KanbanColumn[] = ['accepted', 'declined']

function cardDragId(card: KanbanCard) {
  return `${card.userId}_${card.homeworkId}`
}

function KanbanCardView({
  card,
  col,
  draggable,
  showHomework,
}: {
  card: KanbanCard
  col: typeof COLS[0]
  draggable: boolean
  showHomework: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: cardDragId(card),
    disabled: !draggable,
  })

  const initial = card.user.name?.[0] ?? '?'
  const barPct = card.milestoneTotal > 0
    ? Math.round((card.milestoneCompleted / card.milestoneTotal) * 100)
    : 0

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className="rounded-xl border text-xs p-3"
      style={{
        background: col.cardBg,
        borderColor: col.cardBorder,
        opacity: isDragging ? 0.4 : 1,
        cursor: draggable ? 'grab' : 'default',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          aria-label={card.user.name}
          className="flex-shrink-0 flex items-center justify-center rounded-full font-bold"
          style={{
            width: 28, height: 28,
            background: col.cardBg,
            color: col.color,
            fontSize: 12,
            border: `1px solid ${col.cardBorder}`,
          }}
        >
          {initial}
        </div>
        <div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{card.user.name}</div>
          {showHomework && (
            <div style={{ color: 'var(--text-disabled)' }}>
              #{String(card.homeworkId).padStart(2, '0')} {card.homeworkTitle}
            </div>
          )}
        </div>
      </div>

      {card.milestoneTotal > 0 && (
        <div className="mb-2">
          <div className="flex justify-between mb-1" style={{ color: 'var(--text-disabled)' }}>
            <span>마일스톤</span>
            <span style={{ color: col.color, fontWeight: 600 }}>
              {card.milestoneCompleted} / {card.milestoneTotal} 완료
            </span>
          </div>
          <div style={{ height: 4, background: col.cardBorder, borderRadius: 2 }}>
            <div
              style={{
                width: `${barPct}%`,
                height: '100%',
                background: col.color,
                borderRadius: 2,
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {card.hasCharter && (
          <span
            className="rounded px-1.5 py-0.5"
            style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--blue-600)' }}
          >
            📋 과제정의서 제출
          </span>
        )}
        {card.pendingDeadlineRequests > 0 && (
          <span
            className="rounded px-1.5 py-0.5"
            style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--error)' }}
          >
            ⚠️ 기한변경 {card.pendingDeadlineRequests}건
          </span>
        )}
      </div>

      {card.latestSubmission && (
        <div className="mt-2 truncate" style={{ color: 'var(--text-disabled)' }}>
          {card.latestSubmission.fileName} · 시도 {card.latestSubmission.attemptNumber}회
        </div>
      )}
    </div>
  )
}

function DroppableCol({
  col,
  cards,
  showHomework,
  isDropTarget,
}: {
  col: typeof COLS[0]
  cards: KanbanCard[]
  showHomework: boolean
  isDropTarget: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key, disabled: !isDropTarget })

  return (
    <div
      ref={setNodeRef}
      className="flex-1 min-w-0 rounded-xl p-3 transition-colors"
      style={{
        minHeight: 200,
        background: isOver ? 'rgba(37,99,235,0.06)' : 'var(--surface-primary)',
        border: `1px solid ${isOver ? 'var(--blue-600)' : 'var(--border-subtle)'}`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <div
          className="rounded-full flex-shrink-0"
          style={{ width: 8, height: 8, background: col.color }}
        />
        <h3
          className="text-xs font-bold tracking-wide uppercase"
          style={{ color: col.color }}
        >
          {col.label} / {cards.length}
        </h3>
      </div>
      <div className="flex flex-col gap-2">
        {cards.map(card => (
          <KanbanCardView
            key={cardDragId(card)}
            card={card}
            col={col}
            draggable={col.key === 'reviewing'}
            showHomework={showHomework}
          />
        ))}
      </div>
    </div>
  )
}

const EMPTY_DATA: KanbanDataV2 = {
  not_started: [],
  in_progress: [],
  reviewing: [],
  accepted: [],
  declined: [],
}

export default function AdminKanbanPage() {
  const [homeworks, setHomeworks] = useState<Homework[]>([])
  const [selectedHw, setSelectedHw] = useState<string>('')
  const [data, setData] = useState<KanbanDataV2>(EMPTY_DATA)
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchKanban = useCallback(() => {
    const url = selectedHw ? `/api/admin/kanban?homework_id=${selectedHw}` : '/api/admin/kanban'
    apiFetch<KanbanDataV2>(url).then(setData).catch(() => {
      setToast('데이터 로드 실패')
      setTimeout(() => setToast(null), 3000)
    })
  }, [selectedHw])

  useEffect(() => {
    apiFetch<Homework[]>('/api/admin/homeworks').then(setHomeworks)
  }, [])

  useEffect(() => { fetchKanban() }, [fetchKanban])

  function onDragStart(event: DragStartEvent) {
    const card = data.reviewing.find(c => cardDragId(c) === event.active.id) ?? null
    setActiveCard(card)
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over || !active) return
    const dragId = active.id as string
    const targetCol = over.id as KanbanColumn
    if (!DROPPABLE_COLS.includes(targetCol)) return

    const card = data.reviewing.find(c => cardDragId(c) === dragId)
    if (!card?.latestSubmission) return
    const submission = card.latestSubmission

    const newStatus = targetCol === 'accepted' ? 'accepted' : 'declined'
    const submissionId = submission.id

    setData(prev => ({
      ...prev,
      reviewing: prev.reviewing.filter(c => cardDragId(c) !== dragId),
      [targetCol]: [
        ...prev[targetCol],
        { ...card, latestSubmission: { ...submission, status: newStatus } },
      ],
    }))

    try {
      await apiFetch(`/api/admin/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
    } catch {
      showToast('상태 변경 실패. 되돌립니다.')
      fetchKanban()
    }
  }

  const showHomework = selectedHw === ''

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          제출 현황 (Kanban)
        </h1>
        <select
          value={selectedHw}
          onChange={e => setSelectedHw(e.target.value)}
          className="text-sm rounded-lg px-3 py-2"
          style={{
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="">전체 과제</option>
          {homeworks.map(hw => (
            <option key={hw.id} value={hw.id}>
              #{String(hw.id).padStart(2, '0')} {hw.title}
            </option>
          ))}
        </select>
      </div>

      {toast && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{
            background: 'rgba(220,38,38,0.1)',
            color: 'var(--error)',
            border: '1px solid var(--error)',
          }}
        >
          {toast}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3" style={{ overflowX: 'auto', minWidth: 0 }}>
          {COLS.map(col => (
            <DroppableCol
              key={col.key}
              col={col}
              cards={data[col.key]}
              showHomework={showHomework}
              isDropTarget={DROPPABLE_COLS.includes(col.key)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard && (
            <KanbanCardView
              card={activeCard}
              col={COLS.find(c => c.key === 'reviewing')!}
              draggable={false}
              showHomework={showHomework}
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
