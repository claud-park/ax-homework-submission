import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api/guard'

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req)
  if (admin instanceof NextResponse) return admin
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('milestones')
    .select('*, users(*)')
    .eq('publish_status', 'published')
    .not('bottleneck_type', 'is', null)
    .not('bottleneck_reviewed_at', 'is', null)
    .order('bottleneck_reviewed_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
