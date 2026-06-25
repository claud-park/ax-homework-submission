import type { Milestone } from '@/lib/types'

/**
 * Returns only the milestones that belong to a specific charter submission.
 *
 * A champion may own multiple charters; milestones are tied to a charter via
 * `charter_submission_id`. Filtering by `user_id` would incorrectly surface
 * every charter's milestones on a single charter's detail page, so we scope by
 * the charter id instead.
 *
 * Orphan milestones (FK `charter_submission_id === null`, e.g. legacy data) are
 * attributed to the champion's first charter only — matching the champion's own
 * milestones edit view and the Gantt chart. Pass `includeOrphans: true` when the
 * charter being rendered is that first charter.
 */
export function filterMilestonesByCharter<T extends Pick<Milestone, 'charter_submission_id'>>(
  milestones: T[],
  charterSubmissionId: string,
  options: { includeOrphans?: boolean } = {},
): T[] {
  const { includeOrphans = false } = options
  return milestones.filter(m => {
    if (m.charter_submission_id === charterSubmissionId) return true
    if (includeOrphans && m.charter_submission_id === null) return true
    return false
  })
}
