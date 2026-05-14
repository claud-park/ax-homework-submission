import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: milestone } = await supabase.from('milestones').select('id').eq('id', params.id).eq('user_id', user.id).single()
  if (!milestone) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 })

  const filePath = `${user.id}/${params.id}/${file.name}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage.from('milestone-deliverables').upload(filePath, arrayBuffer, { contentType: file.type, upsert: true })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  await supabase.from('milestone_deliverables').insert({ milestone_id: params.id, file_path: filePath, file_name: file.name })
  await supabase.from('milestones').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', params.id).eq('user_id', user.id)

  return NextResponse.json({ ok: true }, { status: 201 })
}
