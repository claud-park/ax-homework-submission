// components/HotlineFAB.tsx
'use client'
import { useEffect, useRef, useState, useMemo } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { apiFetch } from '@/lib/api-client'
import type { HotlineMessage, PendingAttachment } from '@/lib/types'
import { HotlineEditor } from './HotlineEditor'
import { HotlineFileChip } from './HotlineFileChip'
import DOMPurify from 'dompurify'

export function HotlineFAB() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<HotlineMessage[]>([])
  const [unread, setUnread] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const supabase = useMemo(() => createSupabaseBrowserClient(), [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null)
    })
  }, [supabase])

  useEffect(() => {
    if (!userId) return
    apiFetch<HotlineMessage[]>('/api/hotline/messages')
      .then(data => {
        setMessages(data)
        const adminUnread = data.filter(m => m.sender_role === 'admin' && !m.read_by_champion).length
        setUnread(adminUnread)
      })
      .catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`hotline-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hotline_messages',
          filter: `champion_user_id=eq.${userId}`,
        },
        (payload) => {
          const msg = payload.new as HotlineMessage
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          if (msg.sender_role === 'admin') {
            setOpen(prev => {
              if (!prev) setUnread(u => u + 1)
              return prev
            })
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase])

  useEffect(() => {
    if (!open) return
    if (unread > 0) {
      apiFetch('/api/hotline/read', { method: 'PATCH', body: JSON.stringify({}) }).catch(() => {})
      setUnread(0)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function handleSend(body: string, attachments: PendingAttachment[]) {
    const newMsg = await apiFetch<HotlineMessage>('/api/hotline/messages', {
      method: 'POST',
      body: JSON.stringify({ body, attachments }),
    })
    setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg])
  }

  const fabAriaLabel = unread > 0
    ? `Admin 핫라인 ${open ? '닫기' : '열기'}, ${unread}개 읽지 않은 메시지`
    : `Admin 핫라인 ${open ? '닫기' : '열기'}`

  return (
    <>
      {open && (
        <div
          className="fixed z-50 flex flex-col"
          style={{
            bottom: '80px',
            right: '24px',
            width: '320px',
            height: '460px',
            background: 'var(--surface-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: '#4ade80' }}
              aria-hidden="true"
            />
            <span className="text-flo-body2 font-semibold flex-1">Admin 핫라인</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="p-1 rounded hover:opacity-70 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            role="log"
            aria-live="polite"
            aria-label="메시지 목록"
            className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2"
          >
            {messages.length === 0 && (
              <p className="text-flo-caption1 text-center mt-8" style={{ color: 'var(--text-disabled)' }}>
                Admin에게 궁금한 점을 자유롭게 문의하세요.
              </p>
            )}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender_role === 'champion' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className="hotline-msg-body text-flo-caption1 px-3 py-2 rounded-2xl max-w-[75%] break-words"
                  style={
                    msg.sender_role === 'champion'
                      ? { background: 'var(--accent)', color: '#fff', borderBottomRightRadius: 4 }
                      : { background: 'var(--surface-secondary)', color: 'var(--text-primary)', borderBottomLeftRadius: 4 }
                  }
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.body) }}
                />
                {msg.attachments && msg.attachments.filter(a => !a.mime_type.startsWith('image/')).length > 0 && (
                  <div className="flex flex-col gap-1 mt-1" style={{ maxWidth: '75%' }}>
                    {msg.attachments
                      .filter(a => !a.mime_type.startsWith('image/'))
                      .map(a => (
                        <HotlineFileChip key={a.id} attachment={a} onDark={msg.sender_role === 'champion'} />
                      ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Editor */}
          <div
            className="flex-shrink-0 px-3 py-3"
            style={{ borderTop: '1px solid var(--border-faint)' }}
          >
            <HotlineEditor onSend={handleSend} placeholder="메시지 입력..." />
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label={fabAriaLabel}
        aria-expanded={open}
        className="fixed z-50 flex items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
        style={{
          bottom: '24px',
          right: '24px',
          width: 48,
          height: 48,
          background: 'var(--accent)',
          color: '#fff',
          boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
        }}
      >
        <MessageCircle className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute flex items-center justify-center font-bold"
            style={{
              top: -4,
              right: -4,
              width: 18,
              height: 18,
              background: '#ef4444',
              borderRadius: '50%',
              border: '2px solid var(--background)',
              color: '#fff',
              fontSize: 10,
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </>
  )
}
