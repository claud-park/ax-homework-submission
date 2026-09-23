import type { SupabaseClient } from '@supabase/supabase-js'
import { parseName } from '@/lib/utils'

export interface PublicCharterEntry {
  championName: string
  projectTitle: string
  oneLiner: string
  statusBadge: 'draft' | 'in_review' | 'approved'
}

interface PublicCharterRow {
  user_id: string
  project_name: string | null
  title: string | null
  content: { summary?: string } | null
  publish_status: 'draft' | 'published'
  admin_approved_at: string | null
}

function deriveStatusBadge(row: PublicCharterRow): PublicCharterEntry['statusBadge'] {
  if (row.admin_approved_at) return 'approved'
  if (row.publish_status === 'published') return 'in_review'
  return 'draft'
}

export async function getPublicCharters(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<PublicCharterEntry[]> {
  const { data: charters, error } = await supabase
    .from('charter_submissions')
    .select('user_id, project_name, title, content, publish_status, admin_approved_at')
    .eq('season_id', seasonId)
    .eq('is_public', true)
  if (error) {
    console.error('[viewer] getPublicCharters charters failed:', error.message)
    return []
  }
  const rows = (charters ?? []) as PublicCharterRow[]
  if (rows.length === 0) return []

  const userIds = rows.map((r) => r.user_id)
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, name')
    .in('id', userIds)
  if (usersErr) {
    console.error('[viewer] getPublicCharters users failed:', usersErr.message)
  }
  const nameMap = new Map((users ?? []).map((u: { id: string; name: string }) => [u.id, u.name]))

  return rows.map((row) => ({
    championName: parseName(nameMap.get(row.user_id) ?? '').displayName,
    projectTitle: row.project_name?.trim() || '제목없음',
    oneLiner: row.title?.trim() || row.content?.summary?.trim() || '',
    statusBadge: deriveStatusBadge(row),
  }))
}
