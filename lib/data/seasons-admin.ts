import type { SupabaseClient } from '@supabase/supabase-js'
import type { Season } from '@/lib/types'

export async function listSeasons(supabase: SupabaseClient): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[seasons-admin] listSeasons failed:', error.message)
    return []
  }
  return (data ?? []) as Season[]
}

export async function createSeason(
  supabase: SupabaseClient,
  input: { name: string; startDate: string | null },
): Promise<Season> {
  const { data, error } = await supabase
    .from('seasons')
    .insert({ name: input.name, start_date: input.startDate, status: 'recruiting', is_current: false })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? '시즌 생성 실패')
  return data as Season
}
