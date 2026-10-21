import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'check-up-sessions'

/** Storage 에 업로드된 세션 오디오 청크의 전체 경로(이름순). 목록 실패 시 []. */
export async function listStoredChunkPaths(
  supabase: SupabaseClient,
  sessionId: string
): Promise<string[]> {
  const dir = `sessions/${sessionId}`
  const { data: listed, error } = await supabase.storage.from(BUCKET).list(dir, { limit: 100 })
  if (error || !listed) return []
  return listed
    .map(o => o.name)
    .filter(n => /^chunk_\d+\.wav$/.test(n))
    .sort()
    .map(n => `${dir}/${n}`)
}
