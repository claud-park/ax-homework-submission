export type SubmissionStatus = 'pending' | 'accepted' | 'declined'
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed'
export type RequestStatus = 'pending' | 'approved' | 'rejected'
export type PublishStatus = 'draft' | 'published'
export type BottleneckType = 'technical' | 'resource' | 'external' | 'other'

export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface Submission {
  id: string
  user_id: string
  file_path: string
  file_name: string
  status: SubmissionStatus
  attempt_number: number
  submitted_at: string
  comments?: Comment[]
  user?: User
}

export interface Comment {
  id: string
  submission_id: string
  body: string
  author_role: 'admin' | 'user'
  author_id: string | null
  created_at: string
  updated_at: string
}

export interface CharterSubmission {
  id: string
  user_id: string
  project_name: string | null
  content: {
    summary?: string
    problem?: string
    user?: string
    goal?: string
    solution?: string
    build?: string
    timeline?: string
  }
  submitted_at: string
  updated_at: string
  publish_status: PublishStatus
  admin_approved_at: string | null
}

export interface ProjectCharter {
  id: string
  user_id: string
  project_name: string | null
  content: CharterSubmission['content']
  updated_at: string
  created_at: string
}

export interface Milestone {
  id: string
  user_id: string
  week_number: number | null
  title: string
  description: string | null
  start_date: string
  due_date: string
  status: MilestoneStatus
  is_manual_progress: boolean
  is_manual_completed: boolean
  bottleneck_type: BottleneckType | null
  bottleneck_note: string | null
  bottleneck_admin_comment: string | null
  bottleneck_reviewed_at: string | null
  display_order: number
  created_at: string
  updated_at: string
  publish_status: PublishStatus
  deliverables?: MilestoneDeliverable[]
}

export interface MilestoneDeliverable {
  id: string
  milestone_id: string
  file_path: string
  file_name: string
  uploaded_at: string
}

export interface DeadlineChangeRequest {
  id: string
  milestone_id: string
  user_id: string
  original_due_date: string
  requested_due_date: string
  reason: string
  status: RequestStatus
  reviewed_by: string | null
  support_assignee: string | null
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  milestone?: Milestone
  user?: User
}

export interface CharterComment {
  id: string
  charter_submission_id: string
  parent_id: string | null
  body: string
  author_role: 'admin' | 'user'
  author_id: string | null
  is_resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  replies?: CharterComment[]
}

export interface ChampionSummary {
  userId: string
  name: string
  department: string
  projectName: string | null
  charterStatus: PublishStatus | null
  charterSubmissionId: string | null
  weeklyStatus: Record<number, MilestoneStatus>
}

export interface ChampionProject {
  user: User
  charter: (CharterSubmission & { comments: CharterComment[] }) | null
  milestones: Milestone[]
  latestSubmission: Submission | null
}

export interface KanbanCard {
  userId: string
  user: User
  latestSubmission: {
    id: string
    status: SubmissionStatus
    attemptNumber: number
    fileName: string
    submittedAt: string
  } | null
  milestoneTotal: number
  milestoneCompleted: number
  hasCharter: boolean
  pendingDeadlineRequests: number
}

export type KanbanColumn = 'not_started' | 'in_progress' | 'reviewing' | 'accepted' | 'declined'
export type KanbanDataV2 = Record<KanbanColumn, KanbanCard[]>
