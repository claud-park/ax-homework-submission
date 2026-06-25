import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { CheckUpSession } from '@/lib/types'

/**
 * 세션 미팅 노트 편집 상태/저장 — admin·champion 디테일이 공유.
 * notes/isEditingNotes 초기화는 소비 컴포넌트의 load()에서 setter로 수행한다.
 * onConflictReload: 409 등 저장 실패 시 최신 데이터 재조회 콜백.
 */
export function useSessionNotes(
  sessionId: string,
  session: CheckUpSession | null,
  setSession: (s: CheckUpSession) => void,
  onConflictReload: () => void,
) {
  const [notes, setNotes] = useState('')
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [saving, setSaving] = useState(false)

  async function saveNotes() {
    setSaving(true)
    try {
      const updated = await apiFetch<CheckUpSession>(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes, expectedUpdatedAt: session?.updated_at }),
      })
      setSession(updated)
      setNotes(updated.notes ?? '')
      toast.success('저장되었습니다.')
      setIsEditingNotes(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
      onConflictReload()
    } finally {
      setSaving(false)
    }
  }

  return { notes, setNotes, isEditingNotes, setIsEditingNotes, saving, saveNotes }
}
