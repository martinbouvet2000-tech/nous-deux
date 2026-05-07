import { useState, useEffect, useRef } from 'react'
import { Send, Image as ImageIcon, Heart } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Thought } from '@/types/database'

export default function Thoughts() {
  const { profile, partnerProfile } = useAuthStore()
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profile) return
    loadThoughts()

    const channel = supabase
      .channel('thoughts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thoughts' }, () => {
        loadThoughts()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thoughts])

  const loadThoughts = async () => {
    if (!profile) return

    const { data } = await supabase
      .from('thoughts')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100)

    if (data) {
      setThoughts(data)
      markAsRead(data)
    }
  }

  const markAsRead = async (items: Thought[]) => {
    if (!profile) return
    const unread = items.filter((t) => t.receiver_id === profile.id && !t.is_read)
    if (unread.length === 0) return

    await supabase
      .from('thoughts')
      .update({ is_read: true })
      .in('id', unread.map((t) => t.id))
  }

  const sendThought = async () => {
    if (!profile || !partnerProfile || !message.trim()) return
    setSending(true)

    await supabase.from('thoughts').insert({
      sender_id: profile.id,
      receiver_id: partnerProfile.id,
      content: message.trim(),
    })

    setMessage('')
    setSending(false)
  }

  const groupByDate = (items: Thought[]) => {
    const groups: { [date: string]: Thought[] } = {}
    items.forEach((t) => {
      const date = format(new Date(t.created_at), 'yyyy-MM-dd')
      if (!groups[date]) groups[date] = []
      groups[date].push(t)
    })
    return groups
  }

  const grouped = groupByDate(thoughts)

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] md:h-dvh">
      <div className="px-4 py-3 border-b border-surface-lighter">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Heart size={18} className="text-secondary" />
          Pensées du jour
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            <p className="text-center text-xs text-text-muted mb-3">
              {format(new Date(date), 'EEEE d MMMM', { locale: fr })}
            </p>
            <div className="space-y-2">
              {items.map((thought) => {
                const isMine = thought.sender_id === profile?.id
                return (
                  <div
                    key={thought.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                        isMine
                          ? 'bg-primary text-white rounded-br-md'
                          : 'bg-surface-lighter text-text rounded-bl-md'
                      }`}
                    >
                      {thought.image_url && (
                        <img
                          src={thought.image_url}
                          alt=""
                          className="rounded-lg mb-2 max-w-full"
                        />
                      )}
                      {thought.content && <p className="text-sm">{thought.content}</p>}
                      <p className={`text-[10px] mt-1 ${isMine ? 'text-white/60' : 'text-text-muted'}`}>
                        {format(new Date(thought.created_at), 'HH:mm')}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-surface-lighter bg-surface/80 backdrop-blur-sm">
        <div className="flex gap-2 max-w-lg mx-auto">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendThought()}
            placeholder="Une pensée pour l'autre..."
            className="flex-1 bg-surface-lighter rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={sendThought}
            disabled={sending || !message.trim()}
            className="btn btn-primary px-3 rounded-xl"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
