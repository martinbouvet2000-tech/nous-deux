import { useState, useCallback, type FormEvent } from 'react'
import { Plus, X, Clock, Lock, Mail, Hourglass, Clapperboard, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useLiveData } from '@/hooks/useLiveData'
import type { Capsule } from '@/types/database'
import { parseISO, isPast, isToday } from 'date-fns'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import Tabs from '@/components/ui/Tabs'
import VlogFeed from '@/components/vlog/VlogFeed'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { shine, unshine } from '@/lib/shine'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE } from '@/lib/ui'
import { capitalizeFirst, describeDateInput, formatLongDateFR, toDateInputValue } from '@/lib/dates'

type Tab = 'vlog' | 'capsules'


/** Icône native des champs date : éclaircie pour rester lisible sur le thème sombre */
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
  const [tab, setTab] = useState<Tab>('vlog')
  const [capsules, setCapsules] = useState<Capsule[]>([])
  const [showCapsuleForm, setShowCapsuleForm] = useState(false)
  const [showVlogComposer, setShowVlogComposer] = useState(false)

  const [capContent, setCapContent] = useState('')
  const [capRevealDate, setCapRevealDate] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchCapsules = useCallback(async () => {
    // Lecture via la fonction SECURITY DEFINER get_capsules() : le SELECT direct sur la table
    // `capsules` est révoqué côté base. La fonction renvoie les capsules du couple (triées par
    // reveal_date) en masquant `content` (NULL) tant que la capsule n'est pas révélée pour le
    // destinataire — le contenu reste donc scellé côté serveur, pas seulement côté UI.
    const { data } = await run(supabase.rpc('get_capsules'), { errorMessage: 'Impossible de charger les capsules.' })
    if (data) setCapsules(data as Capsule[])
  }, [])

  useLiveData({
    channel: `memories:${profile?.id ?? 'anon'}`,
    load: fetchCapsules,
    bind: (ch) => ch.on('postgres_changes', { event: '*', schema: 'public', table: 'capsules' }, () => fetchCapsules()),
  })

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
      toast.success(`Capsule scellée jusqu'au ${formatLongDateFR(parseISO(capRevealDate))}`)
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

  const deleteCapsule = async (c: Capsule) => {
    const yes = await confirm({ title: 'Détruire cette capsule ?', message: 'Elle ne sera jamais lue.', confirmLabel: 'Détruire', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('capsules').delete().eq('id', c.id), { errorMessage: 'Suppression impossible.' })
    if (ok) fetchCapsules()
  }

  const partnerName = partnerProfile?.display_name ?? 'ton/ta partenaire'

  // Écho français de la date saisie, sous le sélecteur natif (cf. CalendarPage)
  const capsuleEcho = describeDateInput(capRevealDate)

  const headerAction =
    tab === 'vlog' ? (
      <button onClick={() => setShowVlogComposer(true)} className={BTN_PRIMARY}>
        <Clapperboard size={14} aria-hidden="true" /> Ajouter un vlog
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
        subtitle={
          tab === 'vlog'
            ? 'Votre quotidien en images — et les étapes qui comptent, marquées dans le fil.'
            : 'Les mots gardés pour plus tard, scellés jusqu’à la date choisie.'
        }
        action={headerAction}
        tabs={
          <Tabs<Tab>
            label="Sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'vlog', label: 'Vlog', icon: Clapperboard },
              { key: 'capsules', label: 'Capsules', icon: Lock },
            ]}
          />
        }
      />

      {tab === 'vlog' && (
        <VlogFeed composerOpen={showVlogComposer} onOpenComposer={() => setShowVlogComposer(true)} onCloseComposer={() => setShowVlogComposer(false)} />
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
                const revealDate = formatLongDateFR(parseISO(capsule.reveal_date))
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
                                ? `Ouverte le ${formatLongDateFR(parseISO(capsule.opened_at!))}`
                                : 'Prête à ouvrir !'
                              : `Disponible le ${revealDate}`}
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
                  <input id="cap-date" type="date" value={capRevealDate} onChange={(e) => setCapRevealDate(e.target.value)} min={toDateInputValue(new Date())} className={`${INPUT}`} required lang="fr-FR" aria-describedby="cap-when" />
                  {/* Le sélecteur natif s'affiche au format du système : on relit la date en français. */}
                  <p id="cap-when" className="mt-1.5 text-[12px] text-[#F0EAE0]/70 min-h-[16px]" aria-live="polite">
                    {capsuleEcho && (
                      <>
                        <CalendarDays size={12} className="inline-block align-[-1px] mr-1.5 text-[#D4A574]" aria-hidden="true" />
                        {capitalizeFirst(capsuleEcho)}
                      </>
                    )}
                  </p>
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
