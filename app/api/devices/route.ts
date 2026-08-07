import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .select('id, label, last_used_at, created_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ devices: data })
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'validation_failed' }, { status: 400 })

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('personal_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
