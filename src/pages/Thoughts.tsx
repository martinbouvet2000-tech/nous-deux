import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Heart, Smile, ChevronUp } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Thought } from '@/types/database'
import { run } from '@/lib/db'
import { INPUT } from '@/lib/ui'

const PAGE = 50

export default function Thoughts() {
  const { profile, partnerProfile } = useAuthStore()
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const markAsRead = useCallback(async (items: Thought[]) => {
    if (!profile) return
    const unread = items.filter((t) => t.receiver_id === profile.id && !t.is_read)
    if (unread.length === 0) return
    await supabase.from('thoughts').update({ is_read: true }).in('id', unread.map((t) => t.id))
  }, [profile])

  /** Charge les N derniers messages (tri décroissant côté serveur, remis dans l'ordre côté client). */
  const loadLatest = useCallback(async () => {
    if (!profile) return
    const { data } = await run(
      supabase.from('thoughts').select('*').order('created_at', { ascending: false }).limit(PAGE),
      { errorMessage: 'Impossible de charger vos pensées.' },
    )
    if (data) {
      const ordered = [...data].reverse()
      setThoughts(ordered)
      setHasMore(data.length === PAGE)
      markAsRead(ordered)
    }
  }, [profile, markAsRead])

  /** Charge les messages plus anciens que le premier affiché. */
  const loadOlder = async () => {
    if (!profile || thoughts.length === 0 || loadingMore) return
    setLoadingMore(true)
    const oldest = thoughts[0].created_at
    const el = listRef.current
    const prevHeight = el?.scrollHeight ?? 0
    const { data } = await run(
      supabase.from('thoughts').select('*').lt('created_at', oldest).order('created_at', { ascending: false }).limit(PAGE),
    )
    if (data) {
      setThoughts((prev) => [...[...data].reverse(), ...prev])
      setHasMore(data.length === PAGE)
      // Conserve la position de lecture
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight
      })
    }
    setLoadingMore(false)
  }

  useEffect(() => {
    if (!profile) return
    loadLatest()

    // On n'écoute QUE ce qui m'est adressé (mes propres envois sont ajoutés localement)
    const channel = supabase
      .channel(`thoughts:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thoughts', filter: `receiver_id=eq.${profile.id}` }, (payload) => {
        const t = payload.new as Thought
        setThoughts((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]))
        markAsRead([t])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'thoughts', filter: `sender_id=eq.${profile.id}` }, (payload) => {
        const t = payload.new as Thought
        setThoughts((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_read: t.is_read } : x)))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile, loadLatest, markAsRead])

  const lastId = thoughts[thoughts.length - 1]?.id
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lastId])

  const sendThought = async () => {
    const content = message.trim()
    if (!profile || !partnerProfile || !content || sending) return
    setSending(true)
    setMessage('')
    // Optimiste : le message apparaît tout de suite
    const tempId = `temp-${Date.now()}`
    const optimistic: Thought = {
      id: tempId, sender_id: profile.id, receiver_id: partnerProfile.id,
      content, image_url: null, is_read: false, created_at: new Date().toISOString(),
    }
    setThoughts((prev) => [...prev, optimistic])

    const { ok, data } = await run<Thought>(
      supabase.from('thoughts').insert({ sender_id: profile.id, receiver_id: partnerProfile.id, content }).select('*').single(),
      { errorMessage: "Ta pensée n'est pas partie. Réessaie." },
    )
    if (ok && data) {
      setThoughts((prev) => prev.map((t) => (t.id === tempId ? data : t)))
    } else {
      setThoughts((prev) => prev.filter((t) => t.id !== tempId))
      setMessage(content) // on rend le texte à l'utilisateur
    }
    setSending(false)
    inputRef.current?.focus()
  }

  const grouped = thoughts.reduce<Record<string, Thought[]>>((acc, t) => {
    const d = format(new Date(t.created_at), 'yyyy-MM-dd')
    ;(acc[d] ||= []).push(t)
    return acc
  }, {})

  const dayLabel = (d: string) => {
    const date = new Date(d + 'T12:00:00')
    if (isToday(date)) return "Aujourd'hui"
    if (isYesterday(date)) return 'Hier'
    return format(date, 'EEEE d MMMM', { locale: fr })
  }

  const lastMine = [...thoughts].reverse().find((t) => t.sender_id === profile?.id)

  return (
    <div className="flex flex-col h-[calc(100dvh-5rem)] md:h-dvh">
      {/* Header */}
      <div className="px-5 md:px-8 py-4 border-b border-white/[0.04] bg-[#1A1714]/80 backdrop-blur-2xl">
        <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
          <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
            <Heart size={16} className="text-[#C2788E]" aria-hidden="true" />
          </div>
          Pensées
          {partnerProfile && (
            <span className="text-xs tracking-wide text-[#8A8177] font-normal ml-auto">avec {partnerProfile.display_name}</span>
          )}
        </h2>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-5 md:px-8 py-5 space-y-6" role="log" aria-live="polite" aria-relevant="additions">
        {hasMore && (
          <div className="text-center">
            <button onClick={loadOlder} disabled={loadingMore} className="inline-flex items-center gap-1.5 text-xs text-[#8A8177] hover:text-[#D4A574] transition-colors disabled:opacity-50">
              <ChevronUp size={14} aria-hidden="true" /> {loadingMore ? 'Chargement…' : 'Voir les pensées plus anciennes'}
            </button>
          </div>
        )}

        {thoughts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1E1B17] flex items-center justify-center mb-4">
              <Smile size={28} className="text-[#8A8177]" aria-hidden="true" />
            </div>
            <p className="text-[#9B9287] text-sm leading-relaxed">Aucune pensée pour l'instant…</p>
            <p className="text-[#8A8177] text-xs tracking-wide mt-1.5">
              {partnerProfile ? 'Envoie la première' : 'Lie ton/ta partenaire dans les Réglages pour commencer'}
            </p>
          </div>
        )}

        {Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-white/[0.04]" />
              <p className="text-xs text-[#8A8177] font-medium uppercase tracking-wider">{dayLabel(date)}</p>
              <div className="flex-1 h-px bg-white/[0.04]" />
            </div>

            <div className="space-y-2.5">
              {items.map((thought) => {
                const isMine = thought.sender_id === profile?.id
                const pending = thought.id.startsWith('temp-')
                return (
                  <div key={thought.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`} style={{ animation: 'fadeIn 300ms ease-out' }}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 transition-all duration-300 ${
                        isMine
                          ? 'bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E] rounded-br-lg shadow-[0_2px_20px_rgba(212,165,116,0.15)]'
                          : 'bg-[#1E1B17] text-[#F0EAE0] rounded-bl-lg'
                      } ${pending ? 'opacity-70' : ''}`}
                    >
                      {thought.image_url && <img src={thought.image_url} alt="" className="rounded-xl mb-2 max-w-full" />}
                      {thought.content && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{thought.content}</p>}
                      <p className={`text-xs mt-1.5 ${isMine ? 'text-[#110F0E]/55' : 'text-[#8A8177]'}`}>
                        {format(new Date(thought.created_at), 'HH:mm')}
                        {isMine && lastMine?.id === thought.id && !pending && (
                          <span className="ml-1.5">{thought.is_read ? '· Lu' : '· Envoyé'}</span>
                        )}
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
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendThought()}
            placeholder={partnerProfile ? "Une pensée pour l'autre…" : 'Lie ton/ta partenaire pour écrire'}
            disabled={!partnerProfile}
            maxLength={2000}
            aria-label="Écrire une pensée"
            className={`${INPUT} flex-1`}
          />
          <button
            onClick={sendThought}
            disabled={sending || !message.trim() || !partnerProfile}
            aria-label="Envoyer"
            className="inline-flex items-center justify-center px-4 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/60"
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
