// app/admin/hotline/HotlineInboxClient.tsx
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import type { HotlineMessage, HotlineThread, PendingAttachment } from '@/lib/types'
import { HotlineEditor } from '@/components/HotlineEditor'
import { HotlineFileChip } from '@/components/HotlineFileChip'
import DOMPurify from 'dompurify'

export function HotlineInboxClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [threads, setThreads] = useState<HotlineThread[]>([])
  const [messages, setMessages] = useState<HotlineMessage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('champion'))
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadThreads = useCallback(() => {
    apiFetch<HotlineThread[]>('/api/admin/hotline').then(setThreads).catch(() => {})
  }, [])

  useEffect(() => { loadThreads() }, [loadThreads])

  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    apiFetch<HotlineMessage[]>(`/api/admin/hotline/messages?champion=${selectedId}`)
      .then(setMessages)
      .catch(() => {})
    apiFetch('/api/hotline/read', {
      method: 'PATCH',
      body: JSON.stringify({ champion_user_id: selectedId }),
    }).then(() => {
      setThreads(prev => prev.map(t =>
        t.champion_user_id === selectedId ? { ...t, unread_count: 0 } : t
      ))
    }).catch(() => {})
  }, [selectedId])

  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [messages])

  function selectChampion(id: string) {
    setSelectedId(id)
    router.replace(`/admin/hotline?champion=${id}`, { scroll: false })
  }

  async function handleSend(body: string, attachments: PendingAttachment[]) {
    if (!selectedId) return
    const msg = await apiFetch<HotlineMessage>('/api/admin/hotline/messages', {
      method: 'POST',
      body: JSON.stringify({ champion_user_id: selectedId, body, attachments }),
    })
    setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
    loadThreads()
  }

  const selectedThread = threads.find(t => t.champion_user_id === selectedId)

  return (
    <div
      className="flex h-full rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)', minHeight: 'calc(100vh - 120px)' }}
    >
      {/* Thread list */}
      <div
        className="w-72 flex-shrink-0 flex flex-col"
        style={{ borderRight: '1px solid var(--border-subtle)', background: 'var(--surface-primary)' }}
      >
        <div
          className="px-4 py-3 text-flo-body2 font-semibold flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-faint)', color: 'var(--text-primary)' }}
        >
          전체 대화
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 && (
            <p className="text-flo-caption1 text-center mt-10" style={{ color: 'var(--text-disabled)' }}>
              수신된 메시지가 없습니다
            </p>
          )}
          {threads.map(t => (
            <button
              key={t.champion_user_id}
              onClick={() => selectChampion(t.champion_user_id)}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{
                background: selectedId === t.champion_user_id
                  ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                  : 'transparent',
                borderBottom: '1px solid var(--border-faint)',
                borderLeft: selectedId === t.champion_user_id ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-flo-caption1 font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                  {t.champion_name}
                </span>
                {t.unread_count > 0 && (
                  <span
                    className="flex items-center justify-center text-flo-caption2 font-bold rounded-full flex-shrink-0"
                    style={{ minWidth: 18, height: 18, background: '#ef4444', color: '#fff', fontSize: 10, padding: '0 4px' }}
                  >
                    {t.unread_count}
                  </span>
                )}
              </div>
              <p className="text-flo-caption2 truncate" style={{ color: 'var(--text-secondary)' }}>
                {t.last_sender_role === 'admin' ? '(나) ' : ''}{t.last_message}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex-1 flex flex-col" style={{ background: 'var(--background)' }}>
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-flo-body2" style={{ color: 'var(--text-disabled)' }}>
              좌측에서 대화를 선택하세요
            </p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div
              className="px-5 py-3 flex items-center gap-3 flex-shrink-0"
              style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-primary)' }}
            >
              <div
                className="flex items-center justify-center rounded-full text-flo-caption1 font-bold flex-shrink-0"
                style={{
                  width: 32, height: 32,
                  background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                {selectedThread?.champion_name?.[0] ?? '?'}
              </div>
              <span className="text-flo-body2 font-semibold" style={{ color: 'var(--text-primary)' }}>
                {selectedThread?.champion_name ?? selectedId}
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender_role === 'admin' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className="hotline-msg-body text-flo-caption1 px-3 py-2 rounded-2xl max-w-[70%] break-words"
                    style={
                      msg.sender_role === 'admin'
                        ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 }
                        : { background: 'var(--surface-secondary)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                    }
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.body) }}
                  />
                  {msg.attachments && msg.attachments.filter(a => !a.mime_type.startsWith('image/')).length > 0 && (
                    <div className="flex flex-col gap-1 mt-1" style={{ maxWidth: '70%' }}>
                      {msg.attachments
                        .filter(a => !a.mime_type.startsWith('image/'))
                        .map(a => (
                          <HotlineFileChip key={a.id} attachment={a} onDark={msg.sender_role === 'admin'} />
                        ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Editor */}
            <div
              className="flex-shrink-0 px-4 py-3"
              style={{ borderTop: '1px solid var(--border-faint)', background: 'var(--surface-primary)' }}
            >
              <HotlineEditor onSend={handleSend} placeholder="Admin으로 답장..." />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
