import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api/guard'
import { createServiceClient } from '@/lib/supabase/server'
import { generatePersonalAccessToken, generateAdminAccessToken, hashToken, canApprovePairing } from '@/lib/pairing-tokens'
import { isPatBearer, isAdminUser } from '@/lib/auth'
import { isRateLimited } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  if (isPatBearer(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await requireUser(req)
  if (user instanceof NextResponse) return user

  const body = await req.json()
  const code = typeof body.code === 'string' ? body.code.toUpperCase() : ''
  if (!code) return NextResponse.json({ error: 'validation_failed' }, { status: 400 })

  if (isRateLimited(`pairing-approve:${code}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const supabase = createServiceClient()
  const { data: pairing } = await supabase
    .from('device_pairing_codes')
    .select('*')
    .eq('code', code)
    .eq('status', 'pending')
    .single()
  if (!pairing) return NextResponse.json({ error: 'invalid_or_expired_code' }, { status: 404 })

  if (new Date(pairing.expires_at) < new Date()) {
    await supabase.from('device_pairing_codes').update({ status: 'expired' }).eq('code', code)
    return NextResponse.json({ error: 'invalid_or_expired_code' }, { status: 404 })
  }

  if (!canApprovePairing(pairing.scope, isAdminUser(user))) {
    return NextResponse.json({ error: 'admin_required' }, { status: 403 })
  }

  const token = pairing.scope === 'admin' ? generateAdminAccessToken() : generatePersonalAccessToken()
  const { error: insertError } = await supabase.from('personal_access_tokens').insert({
    user_id: user.id,
    token_hash: hashToken(token),
    scope: pairing.scope,
    label: `Paired ${new Date().toISOString().slice(0, 10)}${pairing.scope === 'admin' ? ' (admin)' : ''}`,
  })
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  const { error: updateError } = await supabase
    .from('device_pairing_codes')
    .update({ status: 'approved', user_id: user.id, issued_token: token })
    .eq('code', code)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
