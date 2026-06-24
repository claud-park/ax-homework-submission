import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import type { OAuth2Client } from 'googleapis-common'

// 스케줄러 DB (cross-DB): admin_google_tokens 테이블 읽기 전용
const schedulerSupabase = createClient(
  process.env.SCHEDULER_SUPABASE_URL!,
  process.env.SCHEDULER_SUPABASE_SERVICE_KEY!
)

export type AdminId = 'claud' | 'alex' | 'jennifer'
export const ADMIN_IDS: AdminId[] = ['claud', 'alex', 'jennifer']

export async function getAuthenticatedClient(adminId: AdminId): Promise<OAuth2Client> {
  const { data, error } = await schedulerSupabase
    .from('admin_google_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('admin_id', adminId)
    .single()

  if (error || !data) {
    throw new Error(`${adminId} Google 토큰 없음. Supabase error: ${error?.code} ${error?.message}`)
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  )
  client.setCredentials({
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expiry_date:   new Date(data.expires_at).getTime(),
  })

  // 토큰 자동 갱신 시 스케줄러 DB 업데이트
  client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await schedulerSupabase
        .from('admin_google_tokens')
        .update({
          access_token: tokens.access_token,
          expires_at: new Date(tokens.expiry_date!).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('admin_id', adminId)
    }
  })

  return client
}
