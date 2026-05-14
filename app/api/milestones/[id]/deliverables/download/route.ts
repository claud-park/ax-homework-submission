import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  // Verify ownership
  const { data: milestone } = await supabase.from('milestones').select('id').eq('id', params.id).eq('user_id', user.id).single()
  if (!milestone) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: deliverable } = await supabase
    .from('milestone_deliverables')
    .select('file_path, file_name')
    .eq('milestone_id', params.id)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .single()
  if (!deliverable) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: signedData, error: signError } = await supabase.storage
    .from('milestone-deliverables')
    .createSignedUrl(deliverable.file_path, 60)
  if (signError || !signedData) return NextResponse.json({ error: 'Could not generate URL' }, { status: 500 })
  return NextResponse.json({ url: signedData.signedUrl, file_name: deliverable.file_name })
}
