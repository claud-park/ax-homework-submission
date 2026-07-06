import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import type { SessionActionItem } from '@/lib/types'
import { useConfirm } from '@/components/ui/confirm'

/** 세션 액션 아이템 CRUD 상태/핸들러 — admin·champion 디테일이 공유 */
export function useSessionActionItems(sessionId: string) {
  const confirm = useConfirm()
  const [actionItems, setActionItems] = useState<SessionActionItem[]>([])
  const [newItemBody, setNewItemBody] = useState('')
  const [addingItem, setAddingItem] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemBody, setEditingItemBody] = useState('')

  async function addItem() {
    if (!newItemBody.trim()) return
    setAddingItem(true)
    try {
      const item = await apiFetch<SessionActionItem>(`/api/sessions/${sessionId}/action-items`, {
        method: 'POST',
        body: JSON.stringify({ body: newItemBody.trim(), display_order: actionItems.length }),
      })
      setActionItems(v => [...v, item])
      setNewItemBody('')
    } catch { toast.error('추가 실패') } finally { setAddingItem(false) }
  }

  async function toggleItem(item: SessionActionItem) {
    try {
      const updated = await apiFetch<SessionActionItem>(
        `/api/sessions/${sessionId}/action-items/${item.id}`,
        { method: 'PATCH', body: JSON.stringify({ is_completed: !item.is_completed }) }
      )
      setActionItems(v => v.map(i => i.id === item.id ? updated : i))
    } catch { toast.error('업데이트 실패') }
  }

  async function deleteItem(itemId: string) {
    if (!(await confirm({ description: '이 액션 아이템을 삭제할까요?', confirmText: '삭제', destructive: true }))) return
    try {
      await apiFetch(`/api/sessions/${sessionId}/action-items/${itemId}`, { method: 'DELETE' })
      setActionItems(v => v.filter(i => i.id !== itemId))
    } catch { toast.error('삭제 실패') }
  }

  function startEdit(item: SessionActionItem) {
    setEditingItemId(item.id)
    setEditingItemBody(item.body)
  }

  function cancelEdit() { setEditingItemId(null) }

  async function saveItemBody(itemId: string) {
    try {
      const updated = await apiFetch<SessionActionItem>(`/api/sessions/${sessionId}/action-items/${itemId}`, {
        method: 'PATCH', body: JSON.stringify({ body: editingItemBody.trim() }),
      })
      setActionItems(v => v.map(i => i.id === itemId ? updated : i))
      setEditingItemId(null)
    } catch { toast.error('수정 실패') }
  }

  return {
    actionItems, setActionItems,
    newItemBody, setNewItemBody, addingItem,
    editingItemId, editingItemBody, setEditingItemBody,
    addItem, toggleItem, deleteItem, startEdit, cancelEdit, saveItemBody,
  }
}
