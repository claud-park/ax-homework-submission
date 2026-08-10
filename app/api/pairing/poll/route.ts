import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { claimPairingToken } from '@/lib/pairing-tokens'

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

  // TTL applies regardless of status — an approved-but-never-polled code must not
  // leave its plaintext token retrievable forever.
  if (pairing.status !== 'expired' && new Date(pairing.expires_at) < new Date()) {
    await supabase
      .from('device_pairing_codes')
      .update({ status: 'expired', issued_token: null })
      .eq('code', code)
    return NextResponse.json({ status: 'expired' })
  }

  if (pairing.status !== 'approved') return NextResponse.json({ status: pairing.status })

  const token = await claimPairingToken(supabase, code)
  if (!token) return NextResponse.json({ status: 'expired' })

  return NextResponse.json({ status: 'approved', token })
}
