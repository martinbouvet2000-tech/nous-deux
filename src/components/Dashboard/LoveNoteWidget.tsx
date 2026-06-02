import { useState, useEffect } from 'react'
import { PenLine, X, Send, Quote } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface LoveNote {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  is_active: boolean
  created_at: string
}

export default function LoveNoteWidget() {
  const { profile, partnerProfile } = useAuthStore()
  const [noteForMe, setNoteForMe] = useState<LoveNote | null>(null)
  const [noteFromMe, setNoteFromMe] = useState<LoveNote | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState(false)

  useEffect(() => {
    if (!profile) return
    loadNotes()

    const channel = supabase
      .channel('love-notes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'love_notes' }, () => {
        loadNotes()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile, partnerProfile])

  const loadNotes = async () => {
    if (!profile) return

    // Note received from partner (active)
    if (partnerProfile) {
      const { data: received } = await supabase
        .from('love_notes')
        .select('*')
        .eq('sender_id', partnerProfile.id)
        .eq('receiver_id', profile.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)

      setNoteForMe(received?.[0] ?? null)
    }

    // Note I sent (active)
    if (partnerProfile) {
      const { data: sent } = await supabase
        .from('love_notes')
        .select('*')
        .eq('sender_id', profile.id)
        .eq('receiver_id', partnerProfile.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)

      setNoteFromMe(sent?.[0] ?? null)
    }
  }

  const sendNote = async () => {
    if (!profile || !partnerProfile || !draft.trim()) return
    setSending(true)

    // Deactivate previous notes from me
    await supabase
      .from('love_notes')
      .update({ is_active: false })
      .eq('sender_id', profile.id)
      .eq('receiver_id', partnerProfile.id)

    // Insert new note
    await supabase.from('love_notes').insert({
      sender_id: profile.id,
      receiver_id: partnerProfile.id,
      content: draft.trim(),
    })

    setDraft('')
    setSending(false)
    setShowEditor(false)
    setJustSent(true)
    setTimeout(() => setJustSent(false), 3000)
    loadNotes()
  }

  // If no partner, don't show
  if (!partnerProfile) return null

  // Note received from partner — show as handwritten note banner
  if (noteForMe) {
    return (
      <div className="relative overflow-hidden rounded-2xl animate-fade-in group">
        {/* Atmospheric background — warm rose-gold flush like blushing */}
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(194,120,142,0.08)] via-[rgba(212,165,116,0.05)] to-[rgba(194,120,142,0.08)]" />
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[rgba(194,120,142,0.08)] blur-[60px]" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-[rgba(212,165,116,0.06)] blur-[50px]" />

        {/* Top edge glow */}
        <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-[rgba(194,120,142,0.15)] to-transparent opacity-70 group-hover:opacity-100 transition-opacity duration-500 ease-out" />

        <div className="relative px-5 py-5 md:px-6 md:py-6 bg-[rgba(255,255,255,0.02)] rounded-2xl backdrop-blur-sm">
          <div className="flex items-start gap-3.5">
            {/* Quote icon */}
            <div className="shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
                <Quote size={14} className="text-[#C2788E]" />
              </div>
            </div>

            {/* Note content — like a handwritten letter */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[#D99AAD] font-medium uppercase tracking-wider mb-2">
                Petit mot de {partnerProfile.display_name}
              </p>
              <p className="text-base md:text-lg font-light leading-relaxed tracking-tight text-[#F0EAE0]/90 italic">
                "{noteForMe.content}"
              </p>
              <p className="text-[11px] tracking-wide text-[#6B6359] mt-2.5">
                {formatDistanceToNow(new Date(noteForMe.created_at), { addSuffix: true, locale: fr })}
              </p>
            </div>

            {/* Write back button */}
            <button
              onClick={() => setShowEditor(true)}
              className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-[#6B6359] hover:text-[#D4A574] hover:bg-[rgba(212,165,116,0.06)] transition-all duration-300 ease-out"
              title="Ecrire un mot"
            >
              <PenLine size={14} />
            </button>
          </div>

          {/* Editor inline */}
          {showEditor && (
            <div className="mt-4 pt-3 border-t border-white/[0.04] animate-slide-up">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendNote()}
                  placeholder="Ecris un petit mot..."
                  className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-2.5 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] flex-1"
                  maxLength={200}
                  autoFocus
                />
                <button
                  onClick={() => { setShowEditor(false); setDraft('') }}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-[#6B6359] hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] transition-all duration-300 ease-out"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={sendNote}
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // No note received — show write prompt (compact)
  return (
    <div className="relative overflow-hidden rounded-2xl group">
      {/* Top edge glow */}
      <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500 ease-out z-10" />

      <div className="relative px-5 py-4 md:px-6 rounded-2xl bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118]">
        {justSent ? (
          <div className="flex items-center justify-center gap-2 py-1 animate-bounce-in">
            <span className="text-[#C2788E] text-sm font-medium leading-relaxed">Petit mot envoye avec amour</span>
          </div>
        ) : showEditor ? (
          <div className="animate-slide-up">
            <p className="text-[11px] tracking-wide text-[#9B9287] mb-2.5 font-medium">
              Ecris un petit mot pour {partnerProfile.display_name}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendNote()}
                placeholder="Ex: Tu me manques, j'ai hate de te voir..."
                className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-2.5 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] flex-1"
                maxLength={200}
                autoFocus
              />
              <button
                onClick={() => { setShowEditor(false); setDraft('') }}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-[#6B6359] hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] transition-all duration-300 ease-out"
              >
                <X size={16} />
              </button>
              <button
                onClick={sendNote}
                disabled={sending || !draft.trim()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
                <PenLine size={14} className="text-[#C2788E]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#F0EAE0]/80 leading-relaxed">
                  {noteFromMe
                    ? `Ton mot pour ${partnerProfile.display_name}`
                    : `Envoie un petit mot a ${partnerProfile.display_name}`
                  }
                </p>
                {noteFromMe && (
                  <p className="text-[11px] tracking-wide text-[#6B6359] italic truncate max-w-[200px]">"{noteFromMe.content}"</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowEditor(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[#9B9287] bg-transparent hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] active:scale-[0.98] transition-all duration-300 ease-out"
            >
              <PenLine size={12} />
              {noteFromMe ? 'Modifier' : 'Ecrire'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
