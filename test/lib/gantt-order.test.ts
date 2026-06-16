import { describe, it, expect } from 'vitest'
import { orderMilestonesForGantt } from '@/lib/gantt-order'

describe('orderMilestonesForGantt', () => {
  it('orders depth-0 by display_order and nests each parent\'s children by display_order', () => {
    // Intentionally shuffled input (simulating fragile/arbitrary DB tie order)
    const ms = [
      { id: 'c2', parent_milestone_id: 'p1', display_order: 1, start_date: '2026-06-20' },
      { id: 'p2', parent_milestone_id: null, display_order: 1, start_date: '2026-07-01' },
      { id: 'c1', parent_milestone_id: 'p1', display_order: 0, start_date: '2026-06-18' },
      { id: 'p1', parent_milestone_id: null, display_order: 0, start_date: '2026-06-16' },
    ]
    const out = orderMilestonesForGantt(ms).map(m => m.id)
    expect(out).toEqual(['p1', 'c1', 'c2', 'p2'])
  })

  it('reflects a child reorder (display_order swap) regardless of array order', () => {
    // parent p, children reordered so b(0) comes before a(1)
    const ms = [
      { id: 'a', parent_milestone_id: 'p', display_order: 1, start_date: '2026-06-16' },
      { id: 'b', parent_milestone_id: 'p', display_order: 0, start_date: '2026-06-20' },
      { id: 'p', parent_milestone_id: null, display_order: 0, start_date: '2026-06-16' },
    ]
    expect(orderMilestonesForGantt(ms).map(m => m.id)).toEqual(['p', 'b', 'a'])
  })

  it('falls back to start_date when display_order ties (default 0)', () => {
    const ms = [
      { id: 'p', parent_milestone_id: null, display_order: 0, start_date: '2026-06-16' },
      { id: 'late', parent_milestone_id: 'p', display_order: 0, start_date: '2026-06-25' },
      { id: 'early', parent_milestone_id: 'p', display_order: 0, start_date: '2026-06-18' },
    ]
    expect(orderMilestonesForGantt(ms).map(m => m.id)).toEqual(['p', 'early', 'late'])
  })
})
