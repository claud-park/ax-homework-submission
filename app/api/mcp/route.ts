import { z } from 'zod'
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { verifyMcpToken, getAuthenticatedIdentity } from '@/lib/mcp/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveSessionRole } from '@/lib/sessions/access'
import { allowedSessionUpdateFields, allowedActionItemUpdateFields } from '@/lib/sessions/permissions'

const handler = createMcpHandler((server) => {
  server.registerTool(
    'whoami',
    {
      title: 'Who Am I',
      description:
        'Returns the identity of the authenticated caller (champion or admin) — use this to sanity-check pairing before calling any other tool.',
    },
    async (ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      return {
        content: [{ type: 'text', text: JSON.stringify(identity) }],
      }
    },
  )

  server.registerTool(
    'list_champions',
    {
      title: 'List Champions',
      description:
        'Lists all champions (id + name) — admin-only. Used once per champion to resolve a name to a user_id, which should then be cached in the Obsidian note so this lookup is not repeated.',
    },
    async (ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      if (!identity.isAdmin) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'admin_required' }) }], isError: true }
      }
      const supabase = createServiceClient()
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('user_group', 'champion')
        .order('name', { ascending: true })
      if (error) return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true }
      return { content: [{ type: 'text', text: JSON.stringify(data) }] }
    },
  )

  server.registerTool(
    'get_session',
    {
      title: 'Get Session',
      description:
        'Looks up a 1-on-1 session by date. Champions always get their own session; admins must pass champion_user_id (any champion). Returns null if no session exists yet for that date.',
      inputSchema: z.object({
        date: z.string().describe('Session date, YYYY-MM-DD'),
        champion_user_id: z
          .string()
          .optional()
          .describe('Required for admin callers; ignored for champion callers, who always see their own sessions'),
      }),
    },
    async (args, ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      const { date, champion_user_id } = args
      const effectiveChampionId = identity.isAdmin ? champion_user_id : identity.userId
      if (!effectiveChampionId) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'champion_user_id required for admin callers' }) }],
          isError: true,
        }
      }

      const supabase = createServiceClient()
      const { data: sessions, error: lookupError } = await supabase
        .from('check_up_sessions')
        .select('*')
        .eq('champion_user_id', effectiveChampionId)
        .eq('session_date', date)
        .order('session_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (lookupError) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: lookupError.message }) }], isError: true }
      }
      if (sessions.length > 1) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'multiple_sessions_on_date',
              sessions: sessions.map((s) => ({ id: s.id, session_time: s.session_time, title: s.title })),
            }),
          }],
          isError: true,
        }
      }
      const session = sessions[0] ?? null
      if (!session) return { content: [{ type: 'text', text: JSON.stringify(null) }] }

      const { data: actionItems } = await supabase
        .from('session_action_items')
        .select('*')
        .eq('session_id', session.id)
        .order('display_order', { ascending: true })

      return {
        content: [{ type: 'text', text: JSON.stringify({ ...session, action_items: actionItems ?? [] }) }],
      }
    },
  )

  server.registerTool(
    'upsert_session',
    {
      title: 'Upsert Session',
      description:
        'Creates a session for a champion+date if none exists (admin PAT only — matches the existing site rule that only admins create sessions), or updates title/notes on an existing one (both champion and admin PATs, for their own/any session respectively).',
      inputSchema: z.object({
        champion_user_id: z.string().describe('Required for admin callers; ignored (forced to caller) for champion callers'),
        date: z.string().describe('Session date, YYYY-MM-DD'),
        title: z.string().optional(),
        notes: z.string().optional().describe('Markdown meeting notes'),
        expected_updated_at: z
          .string()
          .optional()
          .describe('Pass the updated_at value from a prior get_session call to detect concurrent edits — if the session changed since, the update is rejected with a conflict error instead of silently overwriting.'),
      }),
    },
    async (args, ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      const { champion_user_id, date, title, notes, expected_updated_at } = args
      const effectiveChampionId = identity.isAdmin ? champion_user_id : identity.userId
      if (!effectiveChampionId) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'champion_user_id required for admin callers' }) }],
          isError: true,
        }
      }

      const supabase = createServiceClient()
      const { data: sessions, error: lookupError } = await supabase
        .from('check_up_sessions')
        .select('*')
        .eq('champion_user_id', effectiveChampionId)
        .eq('session_date', date)
        .order('session_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
      if (lookupError) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: lookupError.message }) }], isError: true }
      }
      if (sessions.length > 1) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'multiple_sessions_on_date',
              sessions: sessions.map((s) => ({ id: s.id, session_time: s.session_time, title: s.title })),
            }),
          }],
          isError: true,
        }
      }
      const existing = sessions[0] ?? null

      if (!existing) {
        if (!identity.isAdmin) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'only admins can create a new session' }) }],
            isError: true,
          }
        }
        const { data: created, error } = await supabase
          .from('check_up_sessions')
          .insert({
            champion_user_id: effectiveChampionId,
            admin_user_id: identity.userId,
            session_date: date,
            title: title?.trim() || `${date} 1-on-1`,
            notes: notes ?? null,
          })
          .select()
          .single()
        if (error || !created) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: error?.message ?? 'create failed' }) }], isError: true }
        }
        return { content: [{ type: 'text', text: JSON.stringify(created) }] }
      }

      const role: 'admin' | 'owner' = identity.isAdmin ? 'admin' : 'owner'
      const allowed = allowedSessionUpdateFields(role)
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (allowed.includes('title') && title !== undefined) updates.title = title.trim()
      if (allowed.includes('notes') && notes !== undefined) updates.notes = notes

      let updateQuery = supabase.from('check_up_sessions').update(updates).eq('id', existing.id)
      if (expected_updated_at) updateQuery = updateQuery.eq('updated_at', expected_updated_at)

      const { data: updatedRows, error } = await updateQuery.select()
      if (error) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }], isError: true }
      }
      if (!updatedRows || updatedRows.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'conflict', message: '다른 사용자가 먼저 수정했습니다. get_session으로 다시 조회 후 재시도하세요.' }),
          }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(updatedRows[0]) }] }
    },
  )

  server.registerTool(
    'sync_action_items',
    {
      title: 'Sync Action Items',
      description:
        'Batch create/update action items for a session. Items with an id are updated (body, is_completed); items without an id are created and their new id is returned so the caller can write it back into the Obsidian file. Never deletes — items missing from the batch are left untouched.',
      inputSchema: z.object({
        session_id: z.string(),
        items: z.array(
          z.object({
            id: z.string().optional(),
            body: z.string(),
            is_completed: z.boolean(),
          }),
        ),
      }),
    },
    async (args, ctx) => {
      const identity = getAuthenticatedIdentity(ctx)
      const { session_id, items } = args
      const supabase = createServiceClient()
      const role = await resolveSessionRole(supabase, session_id, {
        id: identity.userId,
        app_metadata: { is_admin: identity.isAdmin },
      })
      if (!role) return { content: [{ type: 'text', text: JSON.stringify({ error: 'forbidden' }) }], isError: true }

      const allowed = allowedActionItemUpdateFields(role)
      const results: Array<{ index: number; status: 'created' | 'updated' | 'not_found' | 'error'; item?: Record<string, unknown>; error?: string }> = []
      const now = new Date().toISOString()

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.id) {
          const updates: Record<string, unknown> = { updated_at: now }
          if (allowed.includes('body')) updates.body = item.body.trim()
          if (allowed.includes('is_completed')) {
            updates.is_completed = item.is_completed
            updates.completed_at = item.is_completed ? now : null
          }
          const { data, error } = await supabase
            .from('session_action_items')
            .update(updates)
            .eq('id', item.id)
            .eq('session_id', session_id)
            .select()
            .maybeSingle()
          if (error) results.push({ index: i, status: 'error', error: error.message })
          else if (!data) results.push({ index: i, status: 'not_found' })
          else results.push({ index: i, status: 'updated', item: data })
        } else {
          const { data, error } = await supabase
            .from('session_action_items')
            .insert({
              session_id,
              body: item.body.trim(),
              is_completed: item.is_completed,
              completed_at: item.is_completed ? now : null,
              display_order: i,
            })
            .select()
            .single()
          if (error || !data) results.push({ index: i, status: 'error', error: error?.message ?? 'insert failed' })
          else results.push({ index: i, status: 'created', item: data })
        }
      }

      const hasFailure = results.some((r) => r.status === 'error' || r.status === 'not_found')
      return { content: [{ type: 'text', text: JSON.stringify(results) }], isError: hasFailure }
    },
  )
})

const authHandler = withMcpAuth(handler, verifyMcpToken, { required: true })

export { authHandler as GET, authHandler as POST }
