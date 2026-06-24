import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import type { OAuth2Client } from 'googleapis-common'

export interface BusyInterval { start: string; end: string }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/champion/callback`
      : `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/auth/google/champion/callback`
  )
}

export function getChampionAuthUrl(userId: string, nonce: string): string {
  const client = createOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    state: nonce,  // NOT userId — use nonce for CSRF
    prompt: 'consent',
  })
}

export async function exchangeChampionCode(code: string, userId: string): Promise<void> {
  const client = createOAuth2Client()
  const { tokens } = await client.getToken(code)
  if (!tokens.access_token) {
    throw new Error('access_token 없음')
  }

  const expiresAt = new Date(tokens.expiry_date ?? Date.now() + 3600_000).toISOString()
  const now = new Date().toISOString()

  if (!tokens.refresh_token) {
    // refresh_token 없으면 기존 행 있을 때만 access_token UPDATE
    const { data: existing } = await supabase
      .from('champion_google_tokens')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (!existing) {
      throw new Error('refresh_token 없음. Google 계정에서 앱 권한 취소 후 재시도하세요.')
    }
    const { error } = await supabase
      .from('champion_google_tokens')
      .update({ access_token: tokens.access_token, expires_at: expiresAt, updated_at: now })
      .eq('user_id', userId)
    if (error) throw new Error(`토큰 갱신 실패: ${error.message}`)
    return
  }

  // email은 Supabase auth에서 가져옴 (Google userinfo API 호출 불필요)
  const { data: authUser } = await supabase.auth.admin.getUserById(userId)
  const email = authUser?.user?.email ?? ''

  const { error } = await supabase.from('champion_google_tokens').upsert(
    {
      user_id:       userId,
      email,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
      updated_at:    now,
    },
    { onConflict: 'user_id' }
  )
  if (error) throw new Error(`토큰 저장 실패: ${error.message}`)
}

export async function isChampionConnected(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('champion_google_tokens')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function getChampionBusy(
  userId: string,
  timeMin: string,
  timeMax: string
): Promise<BusyInterval[]> {
  const { data, error } = await supabase
    .from('champion_google_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()
  if (error || !data) return []

  const client = createOAuth2Client()
  client.setCredentials({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expiry_date:   new Date(data.expires_at).getTime(),
  })

  // 토큰 자동 갱신 시 DB 업데이트
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await supabase
        .from('champion_google_tokens')
        .update({
          access_token: tokens.access_token,
          expires_at:   new Date(tokens.expiry_date!).toISOString(),
          updated_at:   new Date().toISOString(),
        })
        .eq('user_id', userId)
    }
  })

  try {
    const cal = google.calendar({ version: 'v3', auth: client })
    const res = await cal.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: 'Asia/Seoul',
        items: [{ id: 'primary' }],
      },
    })
    return (res.data.calendars?.['primary']?.busy ?? []) as BusyInterval[]
  } catch {
    return []
  }
}
