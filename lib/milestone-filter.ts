import type { Milestone } from '@/lib/types'

/**
 * Returns only the milestones that belong to a specific charter submission.
 *
 * A champion may own multiple charters; milestones are tied to a charter via
 * `charter_submission_id`. Filtering by `user_id` would incorrectly surface
 * every charter's milestones on a single charter's detail page, so we scope by
 * the charter id instead.
 */
export function filterMilestonesByCharter<T extends Pick<Milestone, 'charter_submission_id'>>(
  milestones: T[],
  charterSubmissionId: string,
): T[] {
  return milestones.filter(m => m.charter_submission_id === charterSubmissionId)
}
