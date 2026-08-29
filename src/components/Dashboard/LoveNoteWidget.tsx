import { useState, useEffect, useCallback, useRef } from 'react'
import { PenLine, X, Send, Quote, Loader2, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useLiveData } from '@/hooks/useLiveData'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { LoveNote } from '@/types/database'
import { run, humanizeError } from '@/lib/db'
import { INPUT, ICON_BTN } from '@/lib/ui'

const SEND_BTN = 'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/60'

/** Durée d'affichage de la confirmation avant de revenir à l'état normal */
const CONFIRM_MS = 4000

type SendStatus = 'idle' | 'sending' | 'sent'

export default function LoveNoteWidget() {
  const { profile, partnerProfile } = useAuthStore()
  const [noteForMe, setNoteForMe] = useState<LoveNote | null>(null)
  const [noteFromMe, setNoteFromMe] = useState<LoveNote | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<SendStatus>('idle')
  /** Message d'échec affiché sous le champ — le texte saisi, lui, reste en place */
  const [sendError, setSendError] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useLiveData({
    enabled: !!profile && !!partnerProfile,
    channel: profile ? `love-notes:${profile.id}` : null,
    load: loadNotes,
    bind: (ch) => ch.on('postgres_changes', { event: '*', schema: 'public', table: 'love_notes', filter: `receiver_id=eq.${profile?.id}` }, () => loadNotes()),
  })

  // Le minuteur de confirmation ne doit pas survivre au démontage du widget
  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

  const sending = status === 'sending'

  const sendNote = async () => {
    const content = draft.trim()
    if (!profile || !partnerProfile || !content || sending) return
    setSendError(null)
    setStatus('sending')

    // On insère d'abord (si ça échoue, l'ancien mot reste), puis on désactive les précédents.
    // `silent` : le message d'échec s'affiche ici, sous le champ, juste à côté du texte conservé —
    // bien plus parlant qu'un toast qui passe pendant qu'on regarde ailleurs.
    const { ok, data, error } = await run<LoveNote>(
      supabase.from('love_notes').insert({ sender_id: profile.id, receiver_id: partnerProfile.id, content }).select('*').single(),
      { silent: true },
    )

    if (!ok || !data) {
      setStatus('idle')
      setSendError(`${humanizeError(error, "Ton petit mot n'est pas parti.")} Ton texte est gardé ici — réessaie dans un instant.`)
      return
    }

    await run(
      supabase.from('love_notes').update({ is_active: false })
        .eq('sender_id', profile.id).eq('receiver_id', partnerProfile.id).neq('id', data.id),
      { silent: true },
    )

    // La ligne est écrite en base : on peut le dire sans rien promettre de plus.
    // Rien ne nous dit qu'il a été lu — on dit donc « envoyé », pas « reçu ».
    setDraft('')
    setShowEditor(false)
    setStatus('sent')
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setStatus('idle'), CONFIRM_MS)
    loadNotes()
  }

  const closeEditor = () => {
    setShowEditor(false)
    setDraft('')
    setSendError(null)
  }

  if (!partnerProfile) return null

  const confirmation = (
    <div className="flex items-center justify-center gap-2 py-1 motion-safe:animate-bounce-in" role="status" aria-live="polite">
      <Check size={14} className="shrink-0 text-[#C2788E]" aria-hidden="true" />
      <span className="text-[#C2788E] text-sm font-medium leading-relaxed text-balance">
        Petit mot envoyé — {partnerProfile.display_name} le trouvera en ouvrant Awy
      </span>
    </div>
  )

  const editor = (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); if (sendError) setSendError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') sendNote() }}
          placeholder="Ex : Tu me manques, j'ai hâte de te voir…"
          aria-label="Ton petit mot"
          aria-invalid={!!sendError}
          className={`${INPUT} py-2.5 flex-1`}
          maxLength={500}
          disabled={sending}
          autoFocus
        />
        <button onClick={closeEditor} disabled={sending} className={ICON_BTN} aria-label="Annuler">
          <X size={16} aria-hidden="true" />
        </button>
        <button
          onClick={sendNote}
          disabled={sending || !draft.trim()}
          className={SEND_BTN}
          aria-label={sending ? 'Envoi du petit mot en cours' : 'Envoyer le petit mot'}
          aria-busy={sending}
        >
          {sending
            ? <Loader2 size={14} className="motion-safe:animate-spin" aria-hidden="true" />
            : <Send size={14} aria-hidden="true" />}
        </button>
      </div>

      {/* Le champ n'est jamais vidé tant que la ligne n'est pas en base : rien ne se perd. */}
      <p className="mt-2 text-xs leading-relaxed text-[#9B9287] min-h-4" role="status" aria-live="polite">
        {sending ? 'Envoi en cours…' : ''}
      </p>
      {sendError && (
        <p className="text-xs leading-relaxed text-[#F0A5AD] motion-safe:animate-fade-in" role="alert">
          {sendError}
        </p>
      )}
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

        <div className="lux-card relative px-5 py-5 md:px-6 md:py-6 rounded-2xl">
          <div className="flex items-start gap-3.5">
            <div className="shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
                <Quote size={14} className="text-[#C2788E]" aria-hidden="true" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-[#D99AAD] font-medium uppercase tracking-[0.18em] mb-2">Petit mot de {partnerProfile.display_name}</p>
              <p className="font-display-italic text-xl md:text-[1.45rem] leading-snug text-[#F0EAE0]/92 break-words text-balance">« {noteForMe.content} »</p>
              <p className="text-xs tracking-wide text-[#9B9287] mt-2.5">
                {formatDistanceToNow(new Date(noteForMe.created_at), { addSuffix: true, locale: fr })}
              </p>
            </div>
            <button onClick={() => setShowEditor(true)} className={`${ICON_BTN} w-8 h-8 shrink-0`} aria-label="Répondre par un petit mot" title="Écrire un mot">
              <PenLine size={14} aria-hidden="true" />
            </button>
          </div>
          {/* La réponse envoyée depuis cette carte se confirme ici, sous la lettre */}
          {showEditor && <div className="mt-4 pt-3 border-t border-white/[0.04] animate-slide-up">{editor}</div>}
          {!showEditor && status === 'sent' && (
            <div className="mt-4 pt-3 border-t border-white/[0.04]">{confirmation}</div>
          )}
        </div>
      </div>
    )
  }

  // Pas de mot reçu → invitation compacte à écrire
  return (
    <div className="relative overflow-hidden rounded-2xl group">
      <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-500 z-10" aria-hidden="true" />
      <div className="lux-card relative px-5 py-4 md:px-6 rounded-2xl transition-all duration-500 ease-out">
        {status === 'sent' ? (
          confirmation
        ) : showEditor ? (
          <div className="animate-slide-up">
            <p className="text-xs leading-relaxed tracking-wide text-[#9B9287] mb-2.5 font-medium">Écris un petit mot pour {partnerProfile.display_name}</p>
            {editor}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center shrink-0">
                <PenLine size={14} className="text-[#C2788E]" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-[16px] text-[#F0EAE0] leading-snug">
                  {noteFromMe ? `Ton mot pour ${partnerProfile.display_name}` : `Envoie un petit mot à ${partnerProfile.display_name}`}
                </p>
                {noteFromMe && <p className="font-display-italic text-sm text-[#9B9287] truncate">« {noteFromMe.content} »</p>}
              </div>
            </div>
            <button onClick={() => setShowEditor(true)} className="btn-tertiary shrink-0">
              <PenLine size={12} aria-hidden="true" />
              {noteFromMe ? 'Modifier' : 'Écrire'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
