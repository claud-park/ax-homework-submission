// Deterministic milestone ordering shared by the Gantt view, mirroring the
// charter page's manual (drag) ordering. Sort by display_order, then start_date
// as a stable tiebreak (display_order defaults to 0, so siblings that were never
// reordered fall back to chronological order).

export interface OrderableMilestone {
  id: string
  parent_milestone_id: string | null
  display_order?: number | null
  start_date?: string | null
}

function compare(a: OrderableMilestone, b: OrderableMilestone): number {
  return (a.display_order ?? 0) - (b.display_order ?? 0)
    || (a.start_date ?? '').localeCompare(b.start_date ?? '')
}

// Returns a flat list where each depth-0 milestone is immediately followed by
// its depth-1 children, both ordered by display_order (then start_date).
export function orderMilestonesForGantt<T extends OrderableMilestone>(milestones: T[]): T[] {
  const childrenByParent = new Map<string, T[]>()
  for (const m of milestones) {
    if (m.parent_milestone_id) {
      const arr = childrenByParent.get(m.parent_milestone_id) ?? []
      arr.push(m)
      childrenByParent.set(m.parent_milestone_id, arr)
    }
  }
  return milestones
    .filter(m => !m.parent_milestone_id)
    .sort(compare)
    .flatMap(parent => [parent, ...(childrenByParent.get(parent.id) ?? []).sort(compare)])
}
