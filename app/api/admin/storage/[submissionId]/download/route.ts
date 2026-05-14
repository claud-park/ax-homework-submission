import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { submissionId: string } }) {
  const admin = await verifyAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const supabase = createServiceClient()
  const { data: submission, error } = await supabase
    .from('submissions')
    .select('file_path')
    .eq('id', params.submissionId)
    .single()
  if (error || !submission)
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  const { data: signedData, error: signError } = await supabase.storage
    .from('submissions')
    .createSignedUrl(submission.file_path, 60)
  if (signError || !signedData)
    return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 })
  return NextResponse.redirect(signedData.signedUrl)
}
