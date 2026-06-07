import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await verifyJWT(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data: submission, error } = await supabase
    .from('submissions')
    .select('file_path')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (error || !submission?.file_path)
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const { data: signedData, error: signError } = await supabase.storage
    .from('submissions')
    .createSignedUrl(submission.file_path, 60)

  if (signError || !signedData)
    return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 })

  return NextResponse.json({ url: signedData.signedUrl })
}
