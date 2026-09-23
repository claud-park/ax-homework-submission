import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublicCharters } from '@/lib/data/viewer'

function createQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    then: (resolve: (value: unknown) => void) => resolve(result),
  }
  return builder
}

function createSupabaseMock(responses: Record<string, { data: unknown; error: unknown }>) {
  return {
    from: vi.fn((table: string) => createQueryBuilder(responses[table])),
  } as unknown as SupabaseClient
}

describe('getPublicCharters', () => {
  it('returns only public charters with champion name, title, and a derived status badge', async () => {
    const supabase = createSupabaseMock({
      charter_submissions: {
        data: [
          { user_id: 'u1', project_name: '프로젝트A', title: '한줄소개A', content: {}, publish_status: 'published', admin_approved_at: '2026-09-01T00:00:00Z' },
          { user_id: 'u2', project_name: '프로젝트B', title: null, content: { summary: '요약B' }, publish_status: 'draft', admin_approved_at: null },
        ],
        error: null,
      },
      users: { data: [{ id: 'u1', name: '홍길동/개발팀' }, { id: 'u2', name: '김철수/기획팀' }], error: null },
    })
    const result = await getPublicCharters(supabase, 's2')
    expect(result).toEqual([
      { championName: '홍길동', projectTitle: '프로젝트A', oneLiner: '한줄소개A', statusBadge: 'approved' },
      { championName: '김철수', projectTitle: '프로젝트B', oneLiner: '요약B', statusBadge: 'draft' },
    ])
  })

  it('strips HTML tags when oneLiner falls back to content.summary', async () => {
    const supabase = createSupabaseMock({
      charter_submissions: {
        data: [
          { user_id: 'u1', project_name: '프로젝트C', title: null, content: { summary: '<p>우리는 사내 배포 프로세스를 개선합니다</p><ul><li>bullet</li></ul>' }, publish_status: 'published', admin_approved_at: null },
        ],
        error: null,
      },
      users: { data: [{ id: 'u1', name: '이영희/인프라팀' }], error: null },
    })
    const [entry] = await getPublicCharters(supabase, 's2')
    expect(entry.oneLiner).not.toContain('<')
    expect(entry.oneLiner).not.toContain('>')
    expect(entry.oneLiner).toBe('우리는 사내 배포 프로세스를 개선합니다 bullet')
  })

  it('returns an empty array when there are no public charters', async () => {
    const supabase = createSupabaseMock({
      charter_submissions: { data: [], error: null },
      users: { data: [], error: null },
    })
    expect(await getPublicCharters(supabase, 's2')).toEqual([])
  })

  it('returns an empty array on a query error', async () => {
    const supabase = createSupabaseMock({
      charter_submissions: { data: null, error: { message: 'boom' } },
      users: { data: null, error: null },
    })
    expect(await getPublicCharters(supabase, 's2')).toEqual([])
  })
})
