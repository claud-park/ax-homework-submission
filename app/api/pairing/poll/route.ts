import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.toUpperCase()
  if (!code) return NextResponse.json({ error: 'validation_failed' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: pairing } = await supabase
    .from('device_pairing_codes')
    .select('*')
    .eq('code', code)
    .single()
  if (!pairing) return NextResponse.json({ status: 'expired' })

  if (pairing.status === 'pending' && new Date(pairing.expires_at) < new Date()) {
    await supabase.from('device_pairing_codes').update({ status: 'expired' }).eq('code', code)
    return NextResponse.json({ status: 'expired' })
  }

  if (pairing.status !== 'approved') return NextResponse.json({ status: pairing.status })
  if (!pairing.issued_token) return NextResponse.json({ status: 'expired' })

  const token = pairing.issued_token
  await supabase.from('device_pairing_codes').update({ issued_token: null }).eq('code', code)
  return NextResponse.json({ status: 'approved', token })
}
