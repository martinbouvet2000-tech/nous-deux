import { useState, useEffect, useCallback } from 'react'
import { PenLine, X, Send, Quote } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { LoveNote } from '@/types/database'
import { run } from '@/lib/db'
import { INPUT, ICON_BTN } from '@/lib/ui'

const SEND_BTN = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/60'

export default function LoveNoteWidget() {
  const { profile, partnerProfile } = useAuthStore()
  const [noteForMe, setNoteForMe] = useState<LoveNote | null>(null)
  const [noteFromMe, setNoteFromMe] = useState<LoveNote | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState(false)

  const loadNotes = useCallback(async () => {
    if (!profile || !partnerProfile) return
    const [received, sent] = await Promise.all([
      supabase.from('love_notes').select('*').eq('sender_id', partnerProfile.id).eq('receiver_id', profile.id)
        .eq('is_active', true).order('created_at', { ascending: false }).limit(1),
      supabase.from('love_notes').select('*').eq('sender_id', profile.id).eq('receiver_id', partnerProfile.id)
        .eq('is_active', true).order('created_at', { ascending: false }).limit(1),
    ])
    setNoteForMe(received.data?.[0] ?? null)
    setNoteFromMe(sent.data?.[0] ?? null)
  }, [profile, partnerProfile])

  useEffect(() => {
    if (!profile || !partnerProfile) return
    loadNotes()
    const channel = supabase
      .channel(`love-notes:${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'love_notes', filter: `receiver_id=eq.${profile.id}` }, () => loadNotes())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile, partnerProfile, loadNotes])

  const sendNote = async () => {
    const content = draft.trim()
    if (!profile || !partnerProfile || !content || sending) return
    setSending(true)

    // On insère d'abord (si ça échoue, l'ancien mot reste), puis on désactive les précédents
    const { ok, data } = await run<LoveNote>(
      supabase.from('love_notes').insert({ sender_id: profile.id, receiver_id: partnerProfile.id, content }).select('*').single(),
      { errorMessage: "Ton petit mot n'est pas parti." },
    )
    if (ok && data) {
      await supabase.from('love_notes').update({ is_active: false })
        .eq('sender_id', profile.id).eq('receiver_id', partnerProfile.id).neq('id', data.id)
      setDraft('')
      setShowEditor(false)
      setJustSent(true)
      setTimeout(() => setJustSent(false), 3000)
      loadNotes()
    }
    setSending(false)
  }

  if (!partnerProfile) return null

  const editor = (
    <div className="flex gap-2">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && sendNote()}
        placeholder="Ex : Tu me manques, j'ai hâte de te voir…"
        aria-label="Ton petit mot"
        className={`${INPUT} py-2.5 flex-1`}
        maxLength={500}
        autoFocus
      />
      <button onClick={() => { setShowEditor(false); setDraft('') }} className={ICON_BTN} aria-label="Annuler">
        <X size={16} aria-hidden="true" />
      </button>
      <button onClick={sendNote} disabled={sending || !draft.trim()} className={SEND_BTN} aria-label="Envoyer le petit mot">
        <Send size={14} aria-hidden="true" />
      </button>
    </div>
  )

  // Mot reçu → bannière "lettre"
  if (noteForMe) {
    return (
      <div className="relative overflow-hidden rounded-2xl animate-fade-in group">
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(194,120,142,0.08)] via-[rgba(212,165,116,0.05)] to-[rgba(194,120,142,0.08)]" aria-hidden="true" />
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[rgba(194,120,142,0.08)] blur-[60px]" aria-hidden="true" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-[rgba(212,165,116,0.06)] blur-[50px]" aria-hidden="true" />
        <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-[rgba(194,120,142,0.15)] to-transparent opacity-70 group-hover:opacity-100 transition-opacity duration-500" aria-hidden="true" />

        <div className="relative px-5 py-5 md:px-6 md:py-6 bg-[rgba(255,255,255,0.02)] rounded-2xl backdrop-blur-sm">
          <div className="flex items-start gap-3.5">
            <div className="shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
                <Quote size={14} className="text-[#C2788E]" aria-hidden="true" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#D99AAD] font-medium uppercase tracking-wider mb-2">Petit mot de {partnerProfile.display_name}</p>
              <p className="text-base md:text-lg font-light leading-relaxed tracking-tight text-[#F0EAE0]/90 italic break-words">« {noteForMe.content} »</p>
              <p className="text-xs tracking-wide text-[#8A8177] mt-2.5">
                {formatDistanceToNow(new Date(noteForMe.created_at), { addSuffix: true, locale: fr })}
              </p>
            </div>
            <button onClick={() => setShowEditor(true)} className={`${ICON_BTN} w-8 h-8 shrink-0`} aria-label="Répondre par un petit mot" title="Écrire un mot">
              <PenLine size={14} aria-hidden="true" />
            </button>
          </div>
          {showEditor && <div className="mt-4 pt-3 border-t border-white/[0.04] animate-slide-up">{editor}</div>}
        </div>
      </div>
    )
  }

  // Pas de mot reçu → invitation compacte à écrire
  return (
    <div className="relative overflow-hidden rounded-2xl group">
      <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500 z-10" aria-hidden="true" />
      <div className="relative px-5 py-4 md:px-6 rounded-2xl bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118]">
        {justSent ? (
          <div className="flex items-center justify-center gap-2 py-1 animate-bounce-in" role="status">
            <span className="text-[#C2788E] text-sm font-medium leading-relaxed">Petit mot envoyé avec amour</span>
          </div>
        ) : showEditor ? (
          <div className="animate-slide-up">
            <p className="text-xs tracking-wide text-[#9B9287] mb-2.5 font-medium">Écris un petit mot pour {partnerProfile.display_name}</p>
            {editor}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center shrink-0">
                <PenLine size={14} className="text-[#C2788E]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#F0EAE0]/80 leading-relaxed">
                  {noteFromMe ? `Ton mot pour ${partnerProfile.display_name}` : `Envoie un petit mot à ${partnerProfile.display_name}`}
                </p>
                {noteFromMe && <p className="text-xs tracking-wide text-[#8A8177] italic truncate">« {noteFromMe.content} »</p>}
              </div>
            </div>
            <button onClick={() => setShowEditor(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[#9B9287] bg-transparent hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] active:scale-[0.98] transition-all duration-300 shrink-0">
              <PenLine size={12} aria-hidden="true" />
              {noteFromMe ? 'Modifier' : 'Écrire'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
