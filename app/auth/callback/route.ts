import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${origin}/login?error=no_code`)

  const supabase = createServiceClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  const user = data.user
  await supabase.from('users').upsert({
    id: user.id,
    email: user.email ?? '',
    name: user.user_metadata?.full_name ?? user.email ?? '',
    avatar_url: user.user_metadata?.avatar_url ?? null,
  }, { onConflict: 'id' })

  return NextResponse.redirect(`${origin}/`)
}
