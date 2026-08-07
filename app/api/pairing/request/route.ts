import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePairingCode } from '@/lib/pairing-tokens'
import { isRateLimited } from '@/lib/rate-limit'

const TTL_MS = 10 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (isRateLimited(`pairing-request:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const supabase = createServiceClient()

  let code = generatePairingCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from('device_pairing_codes')
      .select('code')
      .eq('code', code)
      .eq('status', 'pending')
      .single()
    if (!existing) break
    code = generatePairingCode()
  }

  const expiresAt = new Date(Date.now() + TTL_MS).toISOString()
  const { error } = await supabase
    .from('device_pairing_codes')
    .insert({ code, status: 'pending', expires_at: expiresAt })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ code, expires_at: expiresAt })
}
