'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { SubmissionDetailPanel } from '@/components/SubmissionDetailPanel'
import { DesktopOnlyNotice } from '@/components/DesktopOnlyNotice'
import type { KanbanCard, KanbanColumn, KanbanDataV2, SubmissionStatus } from '@/lib/types'

const COLS: { key: KanbanColumn; label: string; color: string; cardBorder: string; cardBg: string; avatarBg: string }[] = [
  { key: 'not_started', label: '미시작',  color: 'var(--text-disabled)', cardBorder: 'var(--border-subtle)',    cardBg: 'var(--surface-secondary)', avatarBg: 'var(--surface-secondary)' },
  { key: 'in_progress', label: '진행 중', color: 'var(--amber)',          cardBorder: 'rgba(217,119,6,0.3)',    cardBg: 'rgba(217,119,6,0.04)',     avatarBg: 'rgba(217,119,6,0.12)'      },
  { key: 'reviewing',   label: '검토 중', color: 'var(--blue-600)',       cardBorder: 'rgba(37,99,235,0.3)',    cardBg: 'rgba(37,99,235,0.04)',     avatarBg: 'rgba(37,99,235,0.12)'      },
  { key: 'accepted',    label: '합격',    color: 'var(--success)',         cardBorder: 'rgba(22,163,74,0.3)',    cardBg: 'rgba(22,163,74,0.04)',     avatarBg: 'rgba(22,163,74,0.12)'      },
  { key: 'declined',    label: '불합격',  color: 'var(--error)',           cardBorder: 'rgba(220,38,38,0.3)',    cardBg: 'rgba(220,38,38,0.04)',     avatarBg: 'rgba(220,38,38,0.12)'      },
]

const DRAGGABLE_COLS: KanbanColumn[] = ['reviewing']
const DROPPABLE_COLS: KanbanColumn[] = ['accepted', 'declined']
const NAVIGATE_COLS: KanbanColumn[] = ['not_started', 'in_progress']

function cardDragId(card: KanbanCard) {
  return card.userId
}

function colForStatus(status: SubmissionStatus): KanbanColumn {
  return status === 'pending' ? 'reviewing' : status
}

function statusForCol(col: KanbanColumn): SubmissionStatus | null {
  if (col === 'reviewing') return 'pending'
  if (col === 'accepted') return 'accepted'
  if (col === 'declined') return 'declined'
  return null
}

function KanbanCardView({
  card,
  col,
  draggable,
  clickable,
  onClick,
  onNavigate,
}: {
  card: KanbanCard
  col: typeof COLS[0]
  draggable: boolean
  clickable: boolean
  onClick?: () => void
  onNavigate?: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: cardDragId(card),
    disabled: !draggable,
  })

  const initial = card.user.name?.[0] ?? '?'
  const barPct = card.milestoneTotal > 0
    ? Math.round((card.milestoneCompleted / card.milestoneTotal) * 100)
    : 0

  const cursor = draggable ? 'grab' : (clickable || onNavigate) ? 'pointer' : 'default'

  function handleClick() {
    if (onNavigate) { onNavigate(); return }
    if (clickable) onClick?.()
  }

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={!draggable && (clickable || !!onNavigate) ? handleClick : undefined}
      role={!draggable && (clickable || !!onNavigate) ? 'button' : undefined}
      tabIndex={!draggable && (clickable || !!onNavigate) ? 0 : undefined}
      onKeyDown={!draggable && (clickable || !!onNavigate) ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      } : undefined}
      className="rounded-xl border text-xs p-3 transition-shadow hover:shadow-md"
      style={{
        background: col.cardBg,
        borderColor: col.cardBorder,
        opacity: isDragging ? 0.4 : 1,
        cursor,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          aria-label={card.user.name}
          role="img"
          className="flex-shrink-0 flex items-center justify-center rounded-full font-bold"
          style={{
            width: 28, height: 28,
            background: col.avatarBg,
            color: col.color,
            fontSize: 12,
            border: `1px solid ${col.cardBorder}`,
          }}
        >
          {initial}
        </div>
        <div>
          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{card.user.name}</div>
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
          {card.latestSubmission.linkUrl ?? card.latestSubmission.fileName} · 시도 {card.latestSubmission.attemptNumber}회
        </div>
      )}
    </div>
  )
}

const CLICKABLE_COLS: KanbanColumn[] = ['reviewing', 'accepted', 'declined']

function DroppableCol({
  col,
  cards,
  isDropTarget,
  onCardClick,
  onCardNavigate,
}: {
  col: typeof COLS[0]
  cards: KanbanCard[]
  isDropTarget: boolean
  onCardClick: (card: KanbanCard) => void
  onCardNavigate: (card: KanbanCard) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key, disabled: !isDropTarget })
  const isClickable = CLICKABLE_COLS.includes(col.key)
  const isNavigable = NAVIGATE_COLS.includes(col.key)

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
            draggable={DRAGGABLE_COLS.includes(col.key)}
            clickable={isClickable}
            onClick={() => onCardClick(card)}
            onNavigate={isNavigable ? () => onCardNavigate(card) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export function KanbanClient({ initialData }: { initialData: KanbanDataV2 }) {
  const router = useRouter()
  const [data, setData] = useState<KanbanDataV2>(initialData)
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null)
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null)
  const [loading, setLoading] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const fetchKanban = useCallback(() => {
    setLoading(true)
    apiFetch<KanbanDataV2>('/api/admin/kanban')
      .then(setData)
      .catch(() => toast.error('데이터 로드 실패'))
      .finally(() => setLoading(false))
  }, [])

  function findCardWithSource(dragId: string): { card: KanbanCard; sourceCol: KanbanColumn } | null {
    for (const colKey of DRAGGABLE_COLS) {
      const card = data[colKey].find(c => cardDragId(c) === dragId)
      if (card) return { card, sourceCol: colKey }
    }
    return null
  }

  function onDragStart(event: DragStartEvent) {
    const found = findCardWithSource(event.active.id as string)
    setActiveCard(found?.card ?? null)
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over || !active) return
    const dragId = active.id as string
    const targetCol = over.id as KanbanColumn
    const newStatus = statusForCol(targetCol)
    if (!newStatus) return

    const found = findCardWithSource(dragId)
    if (!found) return
    const submission = found.card.latestSubmission
    if (!submission) return
    const { card, sourceCol } = found
    if (sourceCol === targetCol) return

    const submissionId = submission.id

    setData(prev => ({
      ...prev,
      [sourceCol]: prev[sourceCol].filter(c => cardDragId(c) !== dragId),
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
      toast.success('상태가 변경되었습니다.')
    } catch {
      toast.error('상태 변경 실패. 되돌립니다.')
      fetchKanban()
    }
  }

  return (
    <div>
      <DesktopOnlyNotice />
      <div className="hidden md:block">
        <div className="flex items-center justify-between mb-6 whitespace-nowrap">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            제출 현황 (Kanban)
          </h1>
        </div>

        {loading ? (
          <div className="flex gap-3" style={{ overflowX: 'auto', minWidth: 0 }}>
            {COLS.map(col => (
              <div
                key={col.key}
                className="flex-1 rounded-xl animate-pulse"
                style={{ minWidth: 160, minHeight: 300, background: 'var(--surface-secondary)' }}
              />
            ))}
          </div>
        ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-3" style={{ overflowX: 'auto', minWidth: 0 }}>
            {COLS.map(col => (
              <DroppableCol
                key={col.key}
                col={col}
                cards={data[col.key]}
                isDropTarget={DROPPABLE_COLS.includes(col.key)}
                onCardClick={setSelectedCard}
                onCardNavigate={(card) => router.push(`/admin/champions/${card.userId}`)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeCard?.latestSubmission && (
              <KanbanCardView
                card={activeCard}
                col={COLS.find(c => c.key === colForStatus(activeCard.latestSubmission!.status))!}
                draggable={false}
                clickable={false}
              />
            )}
          </DragOverlay>
        </DndContext>
        )}

        <SubmissionDetailPanel
          card={selectedCard}
          open={selectedCard !== null}
          onOpenChange={(open) => { if (!open) setSelectedCard(null) }}
          onStatusChanged={fetchKanban}
        />
      </div>
    </div>
  )
}
