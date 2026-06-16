'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import type { Milestone } from '@/lib/types'
import { TEMPLATES } from '@/lib/milestone-templates'
import { scheduleRelativeMilestones } from '@/lib/milestone-schedule'
import MilestoneDraftRow, { type DraftMilestone } from './MilestoneDraftRow'
import { Spinner } from '@/components/ui/spinner'

type Tab = 'ai' | 'template' | 'direct'
type Scheduled = { title: string; description?: string; start_date: string; due_date: string; children?: Scheduled[] }

let counter = 0
function tempId(): string { counter += 1; return `draft-${counter}` }

function toDraft(s: Scheduled, source: DraftMilestone['source']): DraftMilestone {
  return {
    tempId: tempId(), title: s.title, description: s.description,
    start_date: s.start_date, due_date: s.due_date, source,
    children: s.children?.map(c => toDraft(c, source)),
  }
}

function today(): string { return new Date().toISOString().slice(0, 10) }

export default function MilestoneDraftDrawer({
  open, onClose, onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: (created: Milestone[]) => void
}) {
  const [tab, setTab] = useState<Tab>('ai')
  const [rows, setRows] = useState<DraftMilestone[]>([])
  const [prompt, setPrompt] = useState('')
  const [useCharter, setUseCharter] = useState(true)
  const [startDate, setStartDate] = useState(today())
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [refining, setRefining] = useState(false)
  const [recentInstructions, setRecentInstructions] = useState<string[]>([])

  if (!open) return null

  const hasInvalid = rows.length === 0 || rows.some(r => !r.title.trim() ||
    (r.children ?? []).some(c => !c.title.trim()))
  const totalCount = rows.reduce((sum, r) => sum + 1 + (r.children?.length ?? 0), 0)

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { milestones } = await apiFetch<{ milestones: Scheduled[] }>('/api/milestones/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, useCharter, startDate }),
      })
      setRows(milestones.map(m => toDraft(m, 'ai')))
    } catch {
      toast.error('초안 생성에 실패했어요. 다시 시도하거나 템플릿을 사용해 주세요.')
    } finally {
      setGenerating(false)
    }
  }

  function handleTemplate(id: string) {
    const t = TEMPLATES.find(x => x.id === id)
    if (!t) return
    const scheduled = scheduleRelativeMilestones(startDate, t.milestones) as Scheduled[]
    setRows(scheduled.map(m => toDraft(m, 'template')))
  }

  function addEmptyRow() {
    setRows(prev => [...prev, {
      tempId: tempId(), title: '', start_date: null, due_date: null, source: 'manual',
    }])
  }

  function updateRow(i: number, next: DraftMilestone) {
    setRows(prev => prev.map((r, idx) => idx === i ? next : r))
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = rows.map(r => ({
        title: r.title, description: r.description ?? null,
        start_date: r.start_date, due_date: r.due_date, source: r.source,
        children: (r.children ?? []).map(c => ({
          title: c.title, description: c.description ?? null,
          start_date: c.start_date, due_date: c.due_date, source: c.source,
        })),
      }))
      const { milestones } = await apiFetch<{ milestones: Milestone[] }>('/api/milestones/batch', {
        method: 'POST',
        body: JSON.stringify({ milestones: payload }),
      })
      toast.success(`${milestones.length}개 마일스톤을 저장했어요.`)
      onSaved(milestones)
      setRows([])
      onClose()
    } catch {
      toast.error('저장에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRefine() {
    if (!instruction.trim()) return
    setRefining(true)
    try {
      const { milestones } = await apiFetch<{ milestones: Scheduled[] }>('/api/milestones/refine', {
        method: 'POST',
        body: JSON.stringify({ milestones: rows, startDate, instruction }),
      })
      setRows(milestones.map(m => toDraft(m, 'ai')))
      setRecentInstructions(prev => [instruction.trim(), ...prev].slice(0, 2))
      setInstruction('')
    } catch {
      toast.error('수정에 실패했어요. 다시 시도해 주세요.')
    } finally {
      setRefining(false)
    }
  }

  const TAB_BTN = (t: Tab, label: string) => (
    <button type="button" onClick={() => setTab(t)}
      className="text-xs px-3 py-1.5 rounded-full font-semibold"
      style={{
        background: tab === t ? 'var(--blue-600)' : 'transparent',
        color: tab === t ? '#fff' : 'var(--text-secondary)',
        border: tab === t ? 'none' : '1px solid var(--border)',
      }}>{label}</button>
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.35)' }}>
      <div className="h-full w-full max-w-md flex flex-col"
        style={{ background: 'var(--background)', borderLeft: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>마일스톤 추가</h3>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ color: 'var(--text-secondary)' }}>✕</button>
        </div>

        <div className="flex gap-2 px-4 py-3">
          {TAB_BTN('ai', 'AI로 생성')}
          {TAB_BTN('template', '템플릿에서')}
          {TAB_BTN('direct', '직접 입력')}
        </div>

        <div className="px-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          {tab === 'ai' && (
            <div className="flex flex-col gap-2">
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5}
                placeholder="(선택) 예: 8주 출시 일정, 격주 데모 포함"
                style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)', width: '100%', resize: 'none' }} />
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={useCharter} onChange={e => setUseCharter(e.target.checked)} />
                Charter 내용 활용
              </label>
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                시작일 <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)' }} />
              </label>
              <button type="button" onClick={handleGenerate} disabled={generating}
                className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50 self-start flex items-center gap-1.5"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>
                {generating ? (<><Spinner size="sm" className="text-white" /> 생성 중…</>) : '✨ 생성'}
              </button>
            </div>
          )}
          {tab === 'template' && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                시작일 <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)' }} />
              </label>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map(t => (
                  <button key={t.id} type="button" onClick={() => handleTemplate(t.id)}
                    className="text-xs px-3 py-1.5 rounded-full"
                    style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>{t.label}</button>
                ))}
              </div>
            </div>
          )}
          {tab === 'direct' && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>아래에서 행을 직접 추가하세요.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {rows.map((r, i) => (
            <div key={r.tempId} className="border-b" style={{ borderColor: 'var(--border)' }}>
              <MilestoneDraftRow row={r} onChange={n => updateRow(i, n)} onRemove={() => removeRow(i)} />
              {(r.children ?? []).map((c, ci) => (
                <MilestoneDraftRow key={c.tempId} row={c} isChild
                  onChange={n => updateRow(i, { ...r, children: r.children!.map((x, xi) => xi === ci ? n : x) })}
                  onRemove={() => updateRow(i, { ...r, children: r.children!.filter((_, xi) => xi !== ci) })} />
              ))}
            </div>
          ))}
          <button type="button" onClick={addEmptyRow}
            className="text-xs px-3 py-1.5 rounded-full mt-3"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>+ 행 추가</button>
        </div>

        {rows.length > 0 && (
          <div className="px-4 py-3 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !refining && instruction.trim()) handleRefine() }}
                placeholder="수정 요청 (예: 베타를 2주로 늘려줘)"
                style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--text-primary)', width: '100%' }}
              />
              <button type="button" onClick={handleRefine} disabled={refining || !instruction.trim()}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                style={{ background: 'var(--blue-600)', color: '#fff' }}>
                {refining ? (<><Spinner size="sm" className="text-white" /> 수정 중…</>) : '수정 ▸'}
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              ✓ 기간·구조·순서 조정 (예: &ldquo;베타 2주 늘려&rdquo;, &ldquo;리서치 빼&rdquo;)<br />
              ✗ 특정 날짜·휴가 지정은 아직 안 돼요 — 시작일을 직접 바꿔 주세요
            </p>
            {recentInstructions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recentInstructions.map((t, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--surface-secondary, #eef2f7)', color: 'var(--text-secondary)' }}>↺ {t}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>취소</button>
          <button type="button" onClick={handleSave} disabled={hasInvalid || saving}
            className="text-xs px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
            style={{ background: 'var(--blue-600)', color: '#fff' }}>
            {saving ? '저장 중…' : `${totalCount}개 마일스톤 저장`}
          </button>
        </div>
      </div>
    </div>
  )
}
