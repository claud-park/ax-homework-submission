import type { MilestoneSource } from '@/lib/types'

export interface BatchInput {
  title: string
  description?: string | null
  start_date: string | null
  due_date: string | null
  source: MilestoneSource
  children?: BatchInput[]
}

export interface NormalizedParent {
  title: string
  description: string | null
  start_date: string | null
  due_date: string | null
  source: MilestoneSource
  children: Omit<NormalizedParent, 'children'>[]
}

export type NormalizeResult =
  | { ok: true; parents: NormalizedParent[]; total: number }
  | { ok: false; error: string }

function validateOne(m: BatchInput): string | null {
  if (!m.title || !m.title.trim()) return '제목은 필수입니다.'
  if (m.start_date && m.due_date && m.start_date > m.due_date) return '시작일이 종료일보다 늦습니다.'
  return null
}

export function normalizeBatch(rows: BatchInput[]): NormalizeResult {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: '저장할 마일스톤이 없습니다.' }
  const parents: NormalizedParent[] = []
  let total = 0
  for (const m of rows) {
    const err = validateOne(m)
    if (err) return { ok: false, error: err }
    total++
    const children: Omit<NormalizedParent, 'children'>[] = []
    for (const c of m.children ?? []) {
      const cErr = validateOne(c)
      if (cErr) return { ok: false, error: cErr }
      total++
      children.push({
        title: c.title.trim(),
        description: c.description ?? null,
        start_date: c.start_date,
        due_date: c.due_date,
        source: c.source,
      })
    }
    parents.push({
      title: m.title.trim(),
      description: m.description ?? null,
      start_date: m.start_date,
      due_date: m.due_date,
      source: m.source,
      children,
    })
  }
  return { ok: true, parents, total }
}
