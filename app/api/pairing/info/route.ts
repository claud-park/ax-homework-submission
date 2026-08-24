import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'validation_failed' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: pairing } = await supabase
    .from('device_pairing_codes')
    .select('status, scope, expires_at')
    .eq('code', code)
    .single()
  if (!pairing) return NextResponse.json({ status: 'expired' })

  if (pairing.status === 'pending' && new Date(pairing.expires_at) < new Date()) {
    return NextResponse.json({ status: 'expired' })
  }

  return NextResponse.json({ status: pairing.status, scope: pairing.scope })
}
