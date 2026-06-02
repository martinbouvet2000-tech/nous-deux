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
      <div className="px-5 md:px-8 py-4 border-b border-white/[0.04] bg-[#1A1714]/80 backdrop-blur-2xl">
        <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
          <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
            <Heart size={16} className="text-[#C2788E]" />
          </div>
          Pensees du jour
          {partnerProfile && (
            <span className="text-[11px] tracking-wide text-[#6B6359] font-normal ml-auto">
              avec {partnerProfile.display_name}
            </span>
          )}
        </h2>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5 space-y-6 scrollbar-thin scrollbar-thumb-[rgba(212,165,116,0.08)]">
        {Object.keys(grouped).length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1E1B17] flex items-center justify-center mb-4">
              <Smile size={28} className="text-[#6B6359]" />
            </div>
            <p className="text-[#9B9287] text-sm leading-relaxed">Aucune pensee encore...</p>
            <p className="text-[#6B6359] text-[11px] tracking-wide mt-1.5">Envoie la premiere</p>
          </div>
        )}

        {Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            {/* Date separator */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-white/[0.04]" />
              <p className="text-[11px] text-[#6B6359] font-medium uppercase tracking-wider">
                {format(new Date(date), 'EEEE d MMMM', { locale: fr })}
              </p>
              <div className="flex-1 h-px bg-white/[0.04]" />
            </div>

            {/* Messages */}
            <div className="space-y-2.5">
              {items.map((thought) => {
                const isMine = thought.sender_id === profile?.id
                return (
                  <div
                    key={thought.id}
                    className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    style={{ animation: 'fadeIn 400ms ease-out' }}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 transition-all duration-300 ${
                        isMine
                          ? 'bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E] rounded-br-lg shadow-[0_2px_20px_rgba(212,165,116,0.15)]'
                          : 'bg-[#1E1B17] text-[#F0EAE0] rounded-bl-lg'
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
                        isMine ? 'text-[#110F0E]/50' : 'text-[#6B6359]'
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
      <div className="px-5 md:px-8 py-3 border-t border-white/[0.04] bg-[#1A1714]/90 backdrop-blur-2xl">
        <div className="flex gap-2.5 max-w-lg mx-auto">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendThought()}
            placeholder="Une pensee pour l'autre..."
            className="flex-1 bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
          />
          <button
            onClick={sendThought}
            disabled={sending || !message.trim()}
            className="inline-flex items-center justify-center px-4 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
