import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeBatch, type BatchInput } from '@/lib/milestone-batch'

export async function POST(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const body = await req.json().catch(() => ({}))
  const charter_submission_id: string | null = body?.charter_submission_id ?? null
  const result = normalizeBatch((body?.milestones ?? []) as BatchInput[])
  if (!result.ok) {
    return NextResponse.json({ error: 'validation_failed', message: result.error }, { status: 400 })
  }

  const supabase = createServiceClient()
  const createdIds: string[] = []

  try {
    const created = []
    for (const parent of result.parents) {
      const { data: p, error: pErr } = await supabase
        .from('milestones')
        .insert({
          user_id: user.id,
          charter_submission_id,
          title: parent.title,
          description: parent.description ?? null,
          start_date: parent.start_date ?? null,
          due_date: parent.due_date ?? null,
          source: parent.source,
          publish_status: 'published',
          parent_milestone_id: null,
        })
        .select()
        .single()
      if (pErr || !p) throw new Error(pErr?.message ?? 'parent insert failed')
      createdIds.push(p.id)
      created.push(p)

      for (const child of parent.children) {
        const { data: c, error: cErr } = await supabase
          .from('milestones')
          .insert({
            user_id: user.id,
            charter_submission_id,
            title: child.title,
            description: child.description ?? null,
            start_date: child.start_date ?? null,
            due_date: child.due_date ?? null,
            source: child.source,
            publish_status: 'published',
            parent_milestone_id: p.id,
          })
          .select()
          .single()
        if (cErr || !c) throw new Error(cErr?.message ?? 'child insert failed')
        createdIds.push(c.id)
        created.push(c)
      }
    }
    return NextResponse.json({ milestones: created }, { status: 201 })
  } catch (err) {
    // Roll back everything created in this batch so the user never sees a partial save.
    if (createdIds.length) {
      const { error: rollbackError } = await supabase.from('milestones').delete().in('id', createdIds).eq('user_id', user.id)
      if (rollbackError) console.error('milestone batch rollback failed', { userId: user.id, createdIds, rollbackError })
    }
    console.error('milestone batch insert failed', err)
    return NextResponse.json({ error: 'batch_failed' }, { status: 500 })
  }
}
