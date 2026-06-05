// components/HotlineFileChip.tsx
'use client'
import { Download, Paperclip } from 'lucide-react'
import { useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import type { HotlineAttachment } from '@/lib/types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

interface Props {
  attachment: HotlineAttachment
  onDark?: boolean
}

export function HotlineFileChip({ attachment, onDark = false }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    if (loading) return
    setLoading(true)
    try {
      const { url } = await apiFetch<{ url: string }>('/api/hotline/download', {
        method: 'POST',
        body: JSON.stringify({ file_path: attachment.file_path }),
      })
      window.open(url, '_blank', 'noopener')
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-opacity disabled:opacity-50"
      style={{
        background: onDark ? 'rgba(255,255,255,0.15)' : 'var(--border-subtle)',
        color: onDark ? '#fff' : 'var(--text-secondary)',
        maxWidth: 200,
      }}
      title="다운로드"
    >
      <Paperclip size={11} style={{ flexShrink: 0 }} />
      <span className="truncate flex-1 text-left">{attachment.file_name}</span>
      <span style={{ opacity: 0.6, flexShrink: 0 }}>{formatBytes(attachment.file_size)}</span>
      <Download size={11} style={{ flexShrink: 0, opacity: 0.7 }} />
    </button>
  )
}
