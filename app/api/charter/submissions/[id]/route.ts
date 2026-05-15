import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { project_name, content } = await req.json()
  if (!content) return NextResponse.json({ error: 'Missing content' }, { status: 400 })
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('charter_submissions')
    .update({ project_name, content, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
