import type { ProcessUsage } from '@/lib/audio-pipeline/types'

export type SubmissionStatus = 'pending' | 'accepted' | 'declined'
export type MilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed'
export type MilestoneSource = 'manual' | 'ai' | 'template'
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
  file_path: string | null
  file_name: string | null
  link_url: string | null
  status: SubmissionStatus
  attempt_number: number
  submitted_at: string
  feedback: string | null
  feedback_updated_at: string | null
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
  title: string | null
  project_name: string | null
  content: {
    summary?: string
    problem?: string
    user?: string
    goal?: string
    solution?: string
    build?: string
    timeline?: string
    closing?: string
  }
  submitted_at: string
  updated_at: string
  publish_status: PublishStatus
  admin_approved_at: string | null
}

export interface ProjectCharter {
  id: string
  user_id: string
  charter_submission_id: string | null
  project_name: string | null
  content: CharterSubmission['content']
  updated_at: string
  created_at: string
}

export interface Milestone {
  id: string
  user_id: string
  charter_submission_id: string | null
  week_number: number | null
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  status: MilestoneStatus
  is_manual_progress: boolean
  is_manual_completed: boolean
  bottleneck_type: BottleneckType | null
  bottleneck_note: string | null
  bottleneck_admin_comment: string | null
  bottleneck_reviewed_at: string | null
  note: string | null
  parent_milestone_id: string | null
  display_order: number
  source: MilestoneSource
  created_at: string
  updated_at: string
  publish_status: PublishStatus
  children?: Milestone[]
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
  charters: (CharterSubmission & { comments: CharterComment[] })[]
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
    fileName: string | null
    linkUrl: string | null
    submittedAt: string
  } | null
  milestoneTotal: number
  milestoneCompleted: number
  charterCount: number
  approvedCharterCount: number
  pendingDeadlineRequests: number
}


export type KanbanColumn = 'not_started' | 'in_progress' | 'reviewing' | 'accepted' | 'declined'
export type KanbanDataV2 = Record<KanbanColumn, KanbanCard[]>

export interface HotlineAttachment {
  id: string
  message_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  created_at: string
}

export interface PendingAttachment {
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
}

export interface HotlineMessage {
  id: string
  champion_user_id: string
  sender_id: string
  sender_role: 'champion' | 'admin'
  body: string
  read_by_champion: boolean
  read_by_admin: boolean
  created_at: string
  attachments?: HotlineAttachment[]
}

export interface HotlineThread {
  champion_user_id: string
  champion_name: string
  last_message: string
  last_message_at: string
  last_sender_role: 'champion' | 'admin'
  unread_count: number
}

// ─── User Group ──────────────────────────────────────────────────────────────

export type UserGroup = 'champion' | 'partner' | 'admin'

export interface UserManagementEntry {
  id: string
  name: string
  displayName: string
  department: string
  email: string
  userGroup: UserGroup
  createdAt: string
}

// ─── Check-up Sessions ───────────────────────────────────────────────────────

export type SessionProcessingStatus = 'idle' | 'uploading' | 'transcribing' | 'summarizing' | 'done' | 'error' | 'low_quality'

export interface CheckUpSession {
  id: string
  champion_user_id: string
  admin_user_id: string | null
  session_date: string
  session_time: string | null
  title: string
  notes: string | null
  audio_file_path: string | null
  audio_chunk_paths: string[] | null
  recording_duration_sec: number | null
  processing_status: SessionProcessingStatus
  processing_started_at?: string | null
  processing_usage?: ProcessUsage | null
  raw_transcript: string | null
  created_at: string
  updated_at: string
  action_items?: SessionActionItem[]
  comments?: SessionComment[]
  milestones?: Milestone[]
  champion?: User
}

export interface SessionActionItem {
  id: string
  session_id: string
  body: string
  is_completed: boolean
  completed_at: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface SessionComment {
  id: string
  session_id: string
  body: string
  author_id: string
  author_role: 'admin' | 'champion'
  created_at: string
  updated_at: string
  author?: User
}

export interface OneOnOneBooking {
  id: string
  champion_user_id: string
  champion_name: string
  champion_email: string
  duration_minutes: 30 | 60
  slot_start: string       // ISO UTC
  slot_end: string         // ISO UTC
  available_admins: string[]
  agenda: string | null
  status: 'pending' | 'confirmed' | 'cancelled'
  confirmed_by: string | null
  slack_ts: string | null
  slack_channel: string | null
  created_at: string
  updated_at: string
}
