import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

async function getCharterAndVerifyAccess(
  supabase: ReturnType<typeof createServiceClient>,
  charterId: string,
  userId: string,
  isAdmin: boolean
) {
  const { data: charter } = await supabase
    .from('charter_submissions')
    .select('id, user_id')
    .eq('id', charterId)
    .single()
  if (!charter) return null
  if (!isAdmin && charter.user_id !== userId) return null
  return charter
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()
  const charter = await getCharterAndVerifyAccess(supabase, params.id, user.id, isAdmin)
  if (!charter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await supabase
    .from('charter_comments')
    .select('*')
    .eq('charter_submission_id', params.id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isAdmin = !!user.user_metadata?.is_admin
  const supabase = createServiceClient()
  const charter = await getCharterAndVerifyAccess(supabase, params.id, user.id, isAdmin)
  if (!charter) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { body } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Body required' }, { status: 400 })
  const { data, error } = await supabase
    .from('charter_comments')
    .insert({
      charter_submission_id: params.id,
      parent_id: null,
      body: body.trim(),
      author_role: isAdmin ? 'admin' : 'user',
      author_id: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
