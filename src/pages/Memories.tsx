import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { Camera, Plus, X, Clock, Lock, Mail, Hourglass } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { TimelineEvent, Capsule } from '@/types/database'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { fr } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import Tabs from '@/components/ui/Tabs'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { shine, unshine } from '@/lib/shine'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE, EYEBROW } from '@/lib/ui'

type Tab = 'timeline' | 'capsules'
const TIMELINE_EMOJIS = ['💕', '✈️', '🎉', '🏠', '💍', '🎂', '📸', '🌅', '🎓', '⭐']

/** Icône native des champs date : éclaircie pour rester lisible sur le thème sombre */
const DATE_PICKER_FIX =
  '[&::-webkit-calendar-picker-indicator]:invert-[.8] [&::-webkit-calendar-picker-indicator]:opacity-60'

/** Suppression discrète : visible au doigt, révélée au survol/focus sur desktop */
const DELETE_BTN =
  'shrink-0 -mr-1.5 -mt-1.5 grid size-11 place-items-center rounded-full text-[#9B9287] hover:text-[#F0A5AD] hover:bg-white/[0.06] transition-all duration-200 opacity-100 md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100'

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

  /* Regroupement de la timeline par année (la requête est déjà triée du plus récent au plus ancien) */
  const timelineByYear = timelineEvents.reduce<{ year: string; items: TimelineEvent[] }[]>((acc, ev) => {
    const year = format(parseISO(ev.event_date), 'yyyy')
    const last = acc[acc.length - 1]
    if (last && last.year === year) last.items.push(ev)
    else acc.push({ year, items: [ev] })
    return acc
  }, [])
  /** Deux colonnes sur grand écran seulement quand la timeline a de la matière */
  const twoCols = timelineEvents.length >= 3

  const headerAction =
    tab === 'timeline' ? (
      <button onClick={() => setShowTimelineForm(true)} className={BTN_PRIMARY}>
        <Plus size={14} aria-hidden="true" /> Ajouter un moment
      </button>
    ) : (
      <button onClick={() => setShowCapsuleForm(true)} className={BTN_PRIMARY} disabled={!partnerProfile} title={partnerProfile ? undefined : 'Lie ton/ta partenaire d’abord'}>
        <Plus size={14} aria-hidden="true" /> Créer une capsule
      </button>
    )

  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl lg:max-w-[1080px] mx-auto space-y-6 reveal">
      <PageHeader
        eyebrow="Votre histoire"
        title="Souvenirs"
        subtitle="Les moments qui comptent, et les mots gardés pour plus tard."
        action={headerAction}
        tabs={
          <Tabs<Tab>
            label="Sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'timeline', label: 'Notre histoire', icon: Camera },
              { key: 'capsules', label: 'Capsules', icon: Lock },
            ]}
          />
        }
      />

      {tab === 'timeline' && (
        <>
          {timelineEvents.length === 0 ? (
            <EmptyState
              icon={Camera}
              title="Votre histoire commence ici"
              text="Ajoutez les moments qui vous ont construits : la rencontre, le premier voyage, les retrouvailles…"
            />
          ) : (
            <div className="space-y-8">
              {timelineByYear.map(({ year, items }) => (
                <section key={year} aria-label={`Souvenirs de ${year}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="h-px w-10 bg-gradient-to-r from-transparent to-[#D4A574]/30" aria-hidden="true" />
                    <span className={`${EYEBROW} num`}>{year}</span>
                    <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#D4A574]/30" aria-hidden="true" />
                  </div>

                  <div className="relative">
                    <span
                      className={`absolute left-[21px] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#D4A574]/25 to-transparent ${twoCols ? 'lg:hidden' : ''}`}
                      aria-hidden="true"
                    />
                    <ol className={twoCols ? 'grid gap-4 lg:grid-cols-2' : 'space-y-4'}>
                      {items.map((event) => (
                        <li key={event.id} className="grid grid-cols-[44px_1fr] gap-4 items-start">
                          <span
                            className="size-11 rounded-full grid place-items-center bg-gradient-to-br from-[#D4A574]/18 to-[#C2788E]/18 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.25),0_0_0_4px_#110F0E]"
                            aria-hidden="true"
                          >
                            <span className="emoji text-lg leading-none">{event.emoji}</span>
                          </span>
                          <article className={`${CARD} group`} onMouseMove={shine} onMouseLeave={unshine}>
                            <div className={CARD_EDGE} aria-hidden="true" />
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h2 className="text-[15px] text-[#F0EAE0] leading-snug font-normal">{event.title}</h2>
                                <p className="text-xs text-[#9B9287] num mt-0.5">{format(parseISO(event.event_date), 'd MMMM yyyy', { locale: fr })}</p>
                              </div>
                              {event.created_by === profile?.id && (
                                <button onClick={() => deleteTimelineEvent(event)} className={DELETE_BTN} aria-label={`Supprimer ${event.title}`}>
                                  <X size={15} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                            {event.description && <p className="text-[13px] text-[#9B9287] mt-2 leading-relaxed whitespace-pre-wrap">{event.description}</p>}
                          </article>
                        </li>
                      ))}
                    </ol>
                  </div>
                </section>
              ))}
            </div>
          )}

          {showTimelineForm && (
            <Modal title="Nouveau moment" description="Un instant à graver dans votre histoire commune." onClose={() => setShowTimelineForm(false)}>
              <form onSubmit={addTimelineEvent} className="space-y-4">
                <div>
                  <span className={LABEL}>Emoji</span>
                  <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Emoji">
                    {TIMELINE_EMOJIS.map((e) => (
                      <button
                        type="button"
                        key={e}
                        onClick={() => setTlEmoji(e)}
                        role="radio"
                        aria-checked={tlEmoji === e}
                        aria-label={`Emoji ${e}`}
                        className={`h-12 rounded-xl text-xl transition-all duration-200 ${tlEmoji === e ? 'bg-[rgba(212,165,116,0.15)] shadow-[inset_0_0_0_1.5px_#E8C9A0]' : 'bg-white/[0.03] hover:bg-[rgba(212,165,116,0.08)]'}`}
                      >
                        <span className="emoji" aria-hidden="true">{e}</span>
                      </button>
                    ))}
                  </div>
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
                  <input id="tl-date" type="date" value={tlDate} onChange={(e) => setTlDate(e.target.value)} className={`${INPUT} ${DATE_PICKER_FIX}`} required lang="fr-FR" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowTimelineForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
                  <button type="submit" disabled={saving || !tlTitle.trim()} className={`${BTN_PRIMARY} flex-1`}>{saving ? 'Enregistrement…' : 'Ajouter'}</button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}

      {tab === 'capsules' && (
        <>
          {capsules.length === 0 ? (
            <EmptyState
              icon={Hourglass}
              title="Pas encore de capsule"
              text="Écrivez un mot qui ne s'ouvrira qu'à une date choisie — même le serveur le garde scellé jusque-là."
            />
          ) : (
            <ul className="space-y-3">
              {capsules.map((capsule) => {
                const revealable = canReveal(capsule)
                const isMine = capsule.sender_id === profile?.id
                const revealDate = format(parseISO(capsule.reveal_date), 'd MMMM yyyy', { locale: fr })
                const sealed = isMine && !capsule.is_opened && !!capsule.content
                return (
                  <li key={capsule.id} className={`${CARD} group`} onMouseMove={shine} onMouseLeave={unshine}>
                    <div className={CARD_EDGE} aria-hidden="true" />
                    <div className="flex items-center gap-3">
                      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${revealable ? 'bg-[#D4A574]/12 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.25)]' : 'bg-white/[0.04] text-[#9B9287]'}`} aria-hidden="true">
                        {capsule.is_opened ? <Mail size={18} /> : <Lock size={18} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] text-[#F0EAE0] truncate">{isMine ? `Pour ${partnerName}` : `De ${partnerName}`}</p>
                        <p className="text-xs text-[#9B9287] flex items-center gap-1.5 mt-0.5">
                          <Clock size={11} aria-hidden="true" />
                          <span className="num">
                            {revealable
                              ? capsule.is_opened
                                ? `Ouverte le ${format(parseISO(capsule.opened_at!), 'd MMM yyyy', { locale: fr })}`
                                : 'Prête à ouvrir !'
                              : `Disponible le ${format(parseISO(capsule.reveal_date), 'd MMM yyyy', { locale: fr })}`}
                          </span>
                        </p>
                      </div>
                      {revealable && !capsule.is_opened && !isMine && (
                        <button onClick={() => openCapsule(capsule)} className={BTN_PRIMARY}>Ouvrir</button>
                      )}
                      {revealable && !capsule.is_opened && isMine && <span className="text-xs text-[#9B9287] shrink-0">En attente</span>}
                      {isMine && !capsule.is_opened && (
                        <button onClick={() => deleteCapsule(capsule)} className={DELETE_BTN} aria-label="Détruire la capsule">
                          <X size={15} aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {/* Message scellé : mon texte reste flouté jusqu'à l'ouverture */}
                    {sealed && (
                      <div className="relative mt-3 rounded-xl bg-white/[0.03] p-4 overflow-hidden min-h-[104px]">
                        <p className="text-sm text-[#F0EAE0] leading-relaxed whitespace-pre-wrap blur-[6px] select-none pointer-events-none line-clamp-3" aria-hidden="true">
                          {capsule.content}
                        </p>
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1E1B17]/45 px-4 text-center">
                          <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_6px_18px_-8px_rgba(212,165,116,0.9)]" aria-hidden="true">
                            <Lock size={16} />
                          </span>
                          <span className="font-display text-[15px] text-[#F0EAE0]">
                            {revealable ? `En attente de ${partnerName}` : <>Scellée jusqu'au <span className="num">{revealDate}</span></>}
                          </span>
                        </div>
                      </div>
                    )}

                    {capsule.is_opened && capsule.content && (
                      <div className="mt-3 rounded-xl bg-white/[0.03] p-4">
                        <p className="text-sm text-[#F0EAE0] leading-relaxed whitespace-pre-wrap">{capsule.content}</p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {showCapsuleForm && (
            <Modal title="Nouvelle capsule temporelle" description={`Écris un message pour ${partnerName} — il/elle pourra le lire uniquement à la date choisie.`} onClose={() => setShowCapsuleForm(false)}>
              <form onSubmit={addCapsule} className="space-y-4">
                <div>
                  <label htmlFor="cap-content" className={LABEL}>Ton message</label>
                  <textarea id="cap-content" value={capContent} onChange={(e) => setCapContent(e.target.value)} rows={5} className={`${INPUT} resize-none`} maxLength={5000} required placeholder="Ce que tu veux lui dire, à lire plus tard…" />
                </div>
                <div>
                  <label htmlFor="cap-date" className={LABEL}>Date de révélation</label>
                  <input id="cap-date" type="date" value={capRevealDate} onChange={(e) => setCapRevealDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} className={`${INPUT} ${DATE_PICKER_FIX}`} required lang="fr-FR" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowCapsuleForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
                  <button type="submit" disabled={saving || !capContent.trim() || !capRevealDate} className={`${BTN_PRIMARY} flex-1`}>{saving ? 'Scellage…' : 'Sceller la capsule'}</button>
                </div>
              </form>
            </Modal>
          )}
        </>
      )}
    </div>
  )
}
