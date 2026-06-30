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

// 캘린더 초대용: 주어진 어드민들의 Google 이메일 조회 (연결 안 된 어드민은 제외)
export async function getAdminEmails(adminIds: AdminId[]): Promise<string[]> {
  if (adminIds.length === 0) return []
  const { data, error } = await schedulerSupabase
    .from('admin_google_tokens')
    .select('email')
    .in('admin_id', adminIds)

  if (error || !data) {
    console.error('어드민 이메일 조회 실패:', error?.message)
    return []
  }
  return data.map((r) => r.email).filter((e): e is string => !!e)
}

export async function getAuthenticatedClient(adminId: AdminId): Promise<OAuth2Client> {
  const { data, error } = await schedulerSupabase
    .from('admin_google_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('admin_id', adminId)
    .single()

  if (error || !data) {
    throw new Error(`${adminId} Google 토큰 없음. 스케줄러 어드민 페이지에서 연결 필요.`)
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
