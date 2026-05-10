import { useState, useEffect, useRef } from 'react'
import { Send, Heart, Smile } from 'lucide-react'
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
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-lighter/50 bg-surface/50 backdrop-blur-xl">
        <h2 className="text-lg font-bold flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center">
            <Heart size={16} className="text-secondary" />
          </div>
          Pensées du jour
          {partnerProfile && (
            <span className="text-xs text-text-dim font-normal ml-auto">
              avec {partnerProfile.display_name}
            </span>
          )}
        </h2>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {Object.keys(grouped).length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
            <Smile size={40} className="text-text-dim mb-3" />
            <p className="text-text-muted text-sm">Aucune pensée encore…</p>
            <p className="text-text-dim text-xs mt-1">Envoie la première ! 💌</p>
          </div>
        )}

        {Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 divider" />
              <p className="text-[11px] text-text-dim font-medium uppercase tracking-wider">
                {format(new Date(date), 'EEEE d MMMM', { locale: fr })}
              </p>
              <div className="flex-1 divider" />
            </div>

            {/* Messages */}
            <div className="space-y-2.5">
              {items.map((thought) => {
                const isMine = thought.sender_id === profile?.id
                return (
                  <div
                    key={thought.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 transition-all ${
                        isMine
                          ? 'bg-gradient-to-br from-primary to-primary-dark text-white rounded-br-lg shadow-lg shadow-primary/10'
                          : 'bg-gradient-to-br from-surface-lighter to-surface-light text-text rounded-bl-lg border border-surface-lighter/50'
                      }`}
                    >
                      {thought.image_url && (
                        <img
                          src={thought.image_url}
                          alt=""
                          className="rounded-xl mb-2 max-w-full"
                        />
                      )}
                      {thought.content && (
                        <p className="text-sm leading-relaxed">{thought.content}</p>
                      )}
                      <p className={`text-[10px] mt-1.5 ${
                        isMine ? 'text-white/50' : 'text-text-dim'
                      }`}>
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

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-surface-lighter/30 bg-surface/80 backdrop-blur-xl">
        <div className="flex gap-2.5 max-w-lg mx-auto">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendThought()}
            placeholder="Une pensée pour l'autre…"
            className="input flex-1 py-3"
          />
          <button
            onClick={sendThought}
            disabled={sending || !message.trim()}
            className="btn btn-primary px-4 rounded-xl"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
