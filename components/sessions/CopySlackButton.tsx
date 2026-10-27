'use client'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { notesToSlackText } from '@/lib/notes/slackText'

export function CopySlackButton({ notes }: { notes: string }) {
  if (!notes || !notes.trim()) return null

  async function handleCopy() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(notesToSlackText(notes))
      toast.success('Slack용으로 복사했어요. Slack에 붙여 넣어 주세요.')
    } catch {
      toast.error('복사하지 못했어요. 브라우저 권한을 확인해 주세요.')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs"
      style={{ color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <Copy className="h-3 w-3" /> Slack용 복사
    </button>
  )
}
