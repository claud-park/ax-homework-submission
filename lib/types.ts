export type SubmissionStatus = 'pending' | 'accepted' | 'declined'
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed'
export type RequestStatus = 'pending' | 'approved' | 'rejected'

export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface Homework {
  id: number
  title: string
  description: string | null
  due_date: string
  created_at: string
}

export interface Submission {
  id: string
  user_id: string
  homework_id: number
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
  homework_id: number | null
  project_name: string | null
  content: ProjectCharter['content']
  submitted_at: string
  updated_at: string
}

export interface ProjectCharter {
  id: string
  user_id: string
  project_name: string | null
  content: {
    problem_definition?: string
    goal?: string
    scope_in?: string
    scope_out?: string
    expected_outcomes?: string
    risks?: string
  }
  updated_at: string
  created_at: string
}

export interface Milestone {
  id: string
  user_id: string
  homework_id: number | null
  week_number: number
  title: string
  description: string | null
  start_date: string
  due_date: string
  status: MilestoneStatus
  is_manual_progress: boolean
  display_order: number
  created_at: string
  updated_at: string
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

export interface HomeworkWithCount extends Homework {
  submission_count: number
  user_count: number
}

export interface KanbanData {
  pending: (Submission & { user: User })[]
  accepted: (Submission & { user: User })[]
  declined: (Submission & { user: User })[]
  not_submitted: User[]
}
