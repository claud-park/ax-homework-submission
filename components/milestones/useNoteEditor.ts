'use client'
import { useEffect, useState } from 'react'
import type { Milestone } from '@/lib/types'

export interface NoteEditor {
  editing: boolean
  value: string
  saving: boolean
  open: () => void
  cancel: () => void
  setValue: (v: string) => void
  save: () => Promise<void>
}

/** 노트 편집 상태. 행/카드가 소유해 상세 패널이 접혀도 초안이 유지된다. */
export function useNoteEditor(
  m: Pick<Milestone, 'id' | 'note'>,
  onNoteUpdate: (id: string, note: string | null) => Promise<void>,
): NoteEditor {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEditing(false)
    setValue('')
  }, [m.id])

  function open() {
    setValue(m.note ?? '')
    setEditing(true)
  }

  function cancel() {
    setEditing(false)
  }

  async function save() {
    const trimmed = value.trim()
    const next = trimmed === '' ? null : trimmed
    if (next === (m.note ?? null)) { setEditing(false); return }
    setSaving(true)
    try {
      await onNoteUpdate(m.id, next)
      setEditing(false)
    } catch {
      // keep the editor open with the draft; the parent surfaces the error
    } finally {
      setSaving(false)
    }
  }

  return { editing, value, saving, open, cancel, setValue, save }
}
