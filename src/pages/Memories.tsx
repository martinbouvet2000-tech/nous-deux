import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { Camera, Plus, X, Heart, Clock, Lock, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { TimelineEvent, Capsule } from '@/types/database'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE } from '@/lib/ui'

type Tab = 'timeline' | 'capsules'
const TIMELINE_EMOJIS = ['💕', '✈️', '🎉', '🏠', '💍', '🎂', '📸', '🌅', '🎓', '⭐']

/** Une capsule est "révélable" à partir de sa date (jour compris) */
const canReveal = (c: Capsule) => {
  const d = parseISO(c.reveal_date)
  return isToday(d) || isPast(d)
}

export default function Memories() {
  const { profile, partnerProfile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('timeline')
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [capsules, setCapsules] = useState<Capsule[]>([])
  const [showTimelineForm, setShowTimelineForm] = useState(false)
  const [showCapsuleForm, setShowCapsuleForm] = useState(false)

  const [tlTitle, setTlTitle] = useState('')
  const [tlDescription, setTlDescription] = useState('')
  const [tlEmoji, setTlEmoji] = useState('💕')
  const [tlDate, setTlDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const [capContent, setCapContent] = useState('')
  const [capRevealDate, setCapRevealDate] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTimeline = useCallback(async () => {
    const { data } = await run(supabase.from('timeline_events').select('*').order('event_date', { ascending: false }).limit(200), { errorMessage: 'Impossible de charger vos souvenirs.' })
    if (data) setTimelineEvents(data)
  }, [])

  const fetchCapsules = useCallback(async () => {
    const { data } = await run(supabase.from('capsules').select('*').order('reveal_date', { ascending: true }).limit(200), { errorMessage: 'Impossible de charger les capsules.' })
    if (data) setCapsules(data)
  }, [])

  useEffect(() => {
    fetchTimeline()
    fetchCapsules()
    const channel = supabase
      .channel(`memories:${profile?.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timeline_events' }, () => fetchTimeline())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'capsules' }, () => fetchCapsules())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchTimeline, fetchCapsules, profile?.id])

  const addTimelineEvent = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !tlTitle.trim() || !tlDate) return
    setSaving(true)
    const { ok } = await run(
      supabase.from('timeline_events').insert({ title: tlTitle.trim(), description: tlDescription.trim() || null, emoji: tlEmoji, event_date: tlDate, created_by: profile.id }),
      { errorMessage: "Le moment n'a pas pu être ajouté." },
    )
    setSaving(false)
    if (ok) {
      toast.success('Moment ajouté à votre histoire')
      setShowTimelineForm(false); setTlTitle(''); setTlDescription('')
      fetchTimeline()
    }
  }

  const addCapsule = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !partnerProfile || !capContent.trim() || !capRevealDate) return
    setSaving(true)
    const { ok } = await run(
      supabase.from('capsules').insert({ sender_id: profile.id, receiver_id: partnerProfile.id, content: capContent.trim(), reveal_date: capRevealDate }),
      { errorMessage: "La capsule n'a pas pu être scellée." },
    )
    setSaving(false)
    if (ok) {
      toast.success(`Capsule scellée jusqu'au ${format(parseISO(capRevealDate), 'd MMMM yyyy', { locale: fr })}`)
      setShowCapsuleForm(false); setCapContent(''); setCapRevealDate('')
      fetchCapsules()
    }
  }

  const openCapsule = async (capsule: Capsule) => {
    if (!canReveal(capsule) || capsule.is_opened) return
    const { ok } = await run(
      supabase.from('capsules').update({ is_opened: true, opened_at: new Date().toISOString() }).eq('id', capsule.id),
      { errorMessage: "Impossible d'ouvrir la capsule." },
    )
    if (ok) fetchCapsules()
  }

  const deleteTimelineEvent = async (ev: TimelineEvent) => {
    const yes = await confirm({ title: 'Supprimer ce souvenir ?', message: `« ${ev.title} » disparaîtra de votre timeline à tous les deux.`, confirmLabel: 'Supprimer', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('timeline_events').delete().eq('id', ev.id), { errorMessage: 'Suppression impossible.' })
    if (ok) fetchTimeline()
  }

  const deleteCapsule = async (c: Capsule) => {
    const yes = await confirm({ title: 'Détruire cette capsule ?', message: 'Elle ne sera jamais lue.', confirmLabel: 'Détruire', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('capsules').delete().eq('id', c.id), { errorMessage: 'Suppression impossible.' })
    if (ok) fetchCapsules()
  }

  const partnerName = partnerProfile?.display_name ?? 'ton/ta partenaire'

  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
      <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
        <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
          <Camera size={16} className="text-[#C2788E]" aria-hidden="true" />
        </div>
        Souvenirs
      </h2>

      <div className="flex gap-1 p-1 bg-[#1A1714] rounded-xl" role="tablist" aria-label="Sections">
        {([['timeline', 'Notre histoire'], ['capsules', 'Capsules temporelles']] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50 ${
              tab === key ? 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]' : 'text-[#8A8177] hover:text-[#B5ACA1]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowTimelineForm(true)} className={BTN_PRIMARY}>
              <Plus size={14} aria-hidden="true" /> Ajouter un moment
            </button>
          </div>

          {timelineEvents.length === 0 && (
            <div className={`${CARD} text-center py-12`}>
              <div className={CARD_EDGE} aria-hidden="true" />
              <div className="w-14 h-14 rounded-2xl bg-[rgba(194,120,142,0.1)] flex items-center justify-center mx-auto mb-4">
                <Camera size={24} className="text-[#C2788E]/60" aria-hidden="true" />
              </div>
              <p className="text-[#9B9287] text-sm leading-relaxed">Votre histoire commence ici</p>
              <p className="text-[#8A8177] text-xs tracking-wide mt-1.5">Ajoutez les moments importants de votre couple : rencontre, premier voyage, retrouvailles…</p>
            </div>
          )}

          <div className="relative">
            {timelineEvents.length > 0 && <div className="absolute left-5 top-0 bottom-0 w-px bg-white/[0.04]" aria-hidden="true" />}
            <ol className="space-y-4">
              {timelineEvents.map((event) => (
                <li key={event.id} className="flex gap-4 relative">
                  <div className="w-10 h-10 rounded-full bg-[#1E1B17] flex items-center justify-center shrink-0 z-10 text-lg shadow-[0_0_0_4px_#110F0E]" aria-hidden="true">
                    {event.emoji}
                  </div>
                  <div className={`${CARD} flex-1 group hover:bg-[#252118]`}>
                    <div className={CARD_EDGE} aria-hidden="true" />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm text-[#F0EAE0]">{event.title}</p>
                        <p className="text-xs tracking-wide text-[#8A8177] mt-0.5">{format(parseISO(event.event_date), 'd MMMM yyyy', { locale: fr })}</p>
                      </div>
                      {event.created_by === profile?.id && (
                        <button onClick={() => deleteTimelineEvent(event)} className="text-[#8A8177]/50 hover:text-red-400 transition-colors duration-300 p-1 -m-1" aria-label={`Supprimer ${event.title}`}>
                          <X size={14} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {event.description && <p className="text-xs text-[#9B9287] mt-2 leading-relaxed whitespace-pre-wrap">{event.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {showTimelineForm && (
            <Modal title="Nouveau moment" onClose={() => setShowTimelineForm(false)}>
              <form onSubmit={addTimelineEvent} className="space-y-4">
                <div className="flex gap-2 flex-wrap" role="group" aria-label="Emoji">
                  {TIMELINE_EMOJIS.map((e) => (
                    <button type="button" key={e} onClick={() => setTlEmoji(e)} aria-label={`Emoji ${e}`} aria-pressed={tlEmoji === e}
                      className={`text-xl p-1.5 rounded-lg transition-all duration-300 ${tlEmoji === e ? 'bg-[rgba(212,165,116,0.15)] shadow-[0_0_12px_rgba(212,165,116,0.1)]' : 'hover:bg-[rgba(212,165,116,0.06)]'}`}>
                      {e}
                    </button>
                  ))}
                </div>
                <div>
                  <label htmlFor="tl-title" className={LABEL}>Titre du moment</label>
                  <input id="tl-title" type="text" value={tlTitle} onChange={(e) => setTlTitle(e.target.value)} className={INPUT} maxLength={120} required placeholder="Ex : Notre premier voyage" />
                </div>
                <div>
                  <label htmlFor="tl-desc" className={LABEL}>Description (optionnel)</label>
                  <textarea id="tl-desc" value={tlDescription} onChange={(e) => setTlDescription(e.target.value)} rows={2} className={`${INPUT} resize-none`} maxLength={1000} />
                </div>
                <div>
                  <label htmlFor="tl-date" className={LABEL}>Date</label>
                  <input id="tl-date" type="date" value={tlDate} onChange={(e) => setTlDate(e.target.value)} className={INPUT} required />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowTimelineForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
                  <button type="submit" disabled={saving || !tlTitle.trim()} className={`${BTN_PRIMARY} flex-1 py-2.5`}>{saving ? 'Enregistrement…' : 'Ajouter'}</button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}

      {tab === 'capsules' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowCapsuleForm(true)} className={BTN_PRIMARY} disabled={!partnerProfile} title={partnerProfile ? undefined : 'Lie ton/ta partenaire d’abord'}>
              <Plus size={14} aria-hidden="true" /> Créer une capsule
            </button>
          </div>

          {capsules.length === 0 && (
            <div className={`${CARD} text-center py-12`}>
              <div className={CARD_EDGE} aria-hidden="true" />
              <div className="w-14 h-14 rounded-2xl bg-[rgba(212,165,116,0.1)] flex items-center justify-center mx-auto mb-4">
                <Heart size={24} className="text-[#D4A574]/60" aria-hidden="true" />
              </div>
              <p className="text-[#9B9287] text-sm leading-relaxed">Pas encore de capsule</p>
              <p className="text-[#8A8177] text-xs tracking-wide mt-1.5">Écris un message qui ne pourra être lu qu'à une date future — même le serveur le garde fermé jusque-là.</p>
            </div>
          )}

          <ul className="space-y-3">
            {capsules.map((capsule) => {
              const revealable = canReveal(capsule)
              const isMine = capsule.sender_id === profile?.id
              return (
                <li key={capsule.id} className={`${CARD} hover:bg-[#252118] group`}>
                  <div className={CARD_EDGE} aria-hidden="true" />
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${revealable ? 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]' : 'bg-[rgba(255,255,255,0.03)] text-[#8A8177]'}`} aria-hidden="true">
                      {capsule.is_opened ? <Mail size={18} /> : <Lock size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#F0EAE0]">{isMine ? `Pour ${partnerName}` : `De ${partnerName}`}</p>
                      <p className="text-xs text-[#8A8177] flex items-center gap-1 mt-0.5">
                        <Clock size={10} aria-hidden="true" />
                        {revealable
                          ? capsule.is_opened
                            ? `Ouverte le ${format(parseISO(capsule.opened_at!), 'd MMM yyyy', { locale: fr })}`
                            : 'Prête à ouvrir !'
                          : `Disponible le ${format(parseISO(capsule.reveal_date), 'd MMM yyyy', { locale: fr })}`}
                      </p>
                    </div>
                    {revealable && !capsule.is_opened && !isMine && (
                      <button onClick={() => openCapsule(capsule)} className={BTN_PRIMARY}>Ouvrir</button>
                    )}
                    {revealable && !capsule.is_opened && isMine && <span className="text-xs tracking-wide text-[#8A8177]">En attente</span>}
                    {isMine && !capsule.is_opened && (
                      <button onClick={() => deleteCapsule(capsule)} className="text-[#8A8177]/50 hover:text-red-400 transition-colors p-1" aria-label="Détruire la capsule">
                        <X size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {(capsule.is_opened || isMine) && capsule.content && (
                    <div className="mt-3 p-3 bg-[rgba(255,255,255,0.03)] rounded-xl">
                      <p className="text-sm text-[#F0EAE0] leading-relaxed whitespace-pre-wrap">{capsule.content}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {showCapsuleForm && (
            <Modal title="Nouvelle capsule temporelle" description={`Écris un message pour ${partnerName} — il/elle pourra le lire uniquement à la date choisie.`} onClose={() => setShowCapsuleForm(false)}>
              <form onSubmit={addCapsule} className="space-y-4">
                <div>
                  <label htmlFor="cap-content" className={LABEL}>Ton message</label>
                  <textarea id="cap-content" value={capContent} onChange={(e) => setCapContent(e.target.value)} rows={5} className={`${INPUT} resize-none`} maxLength={5000} required placeholder="Ce que tu veux lui dire, à lire plus tard…" />
                </div>
                <div>
                  <label htmlFor="cap-date" className={LABEL}>Date de révélation</label>
                  <input id="cap-date" type="date" value={capRevealDate} onChange={(e) => setCapRevealDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} className={INPUT} required />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowCapsuleForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
                  <button type="submit" disabled={saving || !capContent.trim() || !capRevealDate} className={`${BTN_PRIMARY} flex-1 py-2.5`}>{saving ? 'Scellage…' : 'Sceller la capsule'}</button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}
    </div>
  )
}
