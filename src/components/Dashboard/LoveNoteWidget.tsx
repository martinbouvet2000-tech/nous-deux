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

  // Note received from partner — show as banner
  if (noteForMe) {
    return (
      <div className="relative overflow-hidden rounded-2xl animate-fade-in">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-secondary/10 via-primary/8 to-secondary/10" />
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-secondary/10 blur-[60px]" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-primary/10 blur-[50px]" />

        <div className="relative px-5 py-5 bg-white/[0.03] rounded-2xl backdrop-blur-sm">
          <div className="flex items-start gap-3">
            {/* Quote icon */}
            <div className="shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center">
                <Quote size={14} className="text-secondary" />
              </div>
            </div>

            {/* Note content */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-secondary-light font-semibold uppercase tracking-wider mb-1.5">
                Petit mot de {partnerProfile.display_name}
              </p>
              <p className="text-base md:text-lg font-medium leading-relaxed text-text/90 italic">
                "{noteForMe.content}"
              </p>
              <p className="text-[10px] text-text-dim mt-2">
                {formatDistanceToNow(new Date(noteForMe.created_at), { addSuffix: true, locale: fr })}
              </p>
            </div>

            {/* Write back button */}
            <button
              onClick={() => setShowEditor(true)}
              className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-text-dim hover:text-primary hover:bg-primary/10 transition-all"
              title="Écrire un mot"
            >
              <PenLine size={14} />
            </button>
          </div>

          {/* Editor inline */}
          {showEditor && (
            <div className="mt-4 pt-3 border-t border-surface-lighter/30 animate-slide-up">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendNote()}
                  placeholder="Écris un petit mot..."
                  className="input flex-1 text-sm py-2.5"
                  maxLength={200}
                  autoFocus
                />
                <button
                  onClick={() => { setShowEditor(false); setDraft('') }}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-text-dim hover:text-text hover:bg-surface-lighter/50 transition-all"
                >
                  <X size={16} />
                </button>
                <button
                  onClick={sendNote}
                  disabled={sending || !draft.trim()}
                  className="btn btn-secondary px-3 py-2 text-sm"
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
    <div className="relative overflow-hidden rounded-2xl">
      <div className="relative px-5 py-4 border-t border-white/[0.04] rounded-2xl bg-gradient-to-r from-surface-lighter/20 to-surface/40 backdrop-blur-sm">
        {justSent ? (
          <div className="flex items-center justify-center gap-2 py-1 animate-bounce-in">
            <span className="text-secondary text-sm font-medium">Petit mot envoyé avec amour !</span>
            <span className="text-lg">💌</span>
          </div>
        ) : showEditor ? (
          <div className="animate-slide-up">
            <p className="text-xs text-text-muted mb-2.5 font-medium">
              Écris un petit mot pour {partnerProfile.display_name}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendNote()}
                placeholder="Ex: Tu me manques, j'ai hâte de te voir..."
                className="input flex-1 text-sm py-2.5"
                maxLength={200}
                autoFocus
              />
              <button
                onClick={() => { setShowEditor(false); setDraft('') }}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-text-dim hover:text-text hover:bg-surface-lighter/50 transition-all"
              >
                <X size={16} />
              </button>
              <button
                onClick={sendNote}
                disabled={sending || !draft.trim()}
                className="btn btn-secondary px-3 py-2 text-sm"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-secondary/15 flex items-center justify-center">
                <PenLine size={14} className="text-secondary" />
              </div>
              <div>
                <p className="text-sm font-medium text-text/80">
                  {noteFromMe
                    ? `Ton mot pour ${partnerProfile.display_name}`
                    : `Envoie un petit mot à ${partnerProfile.display_name}`
                  }
                </p>
                {noteFromMe && (
                  <p className="text-xs text-text-dim italic truncate max-w-[200px]">"{noteFromMe.content}"</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowEditor(true)}
              className="btn btn-ghost text-xs px-3 py-2"
            >
              <PenLine size={12} />
              {noteFromMe ? 'Modifier' : 'Écrire'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
