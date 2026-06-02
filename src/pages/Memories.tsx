import { useEffect, useState } from 'react'
import { Camera, Plus, X, Heart, Clock, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { TimelineEvent, Capsule } from '@/types/database'
import { format, parseISO, isPast } from 'date-fns'
import { fr } from 'date-fns/locale'

type Tab = 'timeline' | 'capsules'

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

  const TIMELINE_EMOJIS = ['💕', '✈️', '🎉', '🏠', '💍', '🎂', '📸', '🌅', '🎓', '⭐']

  const fetchTimeline = async () => {
    const { data } = await supabase
      .from('timeline_events')
      .select('*')
      .order('event_date', { ascending: false })

    if (data) setTimelineEvents(data)
  }

  const fetchCapsules = async () => {
    const { data } = await supabase
      .from('capsules')
      .select('*')
      .order('reveal_date', { ascending: true })

    if (data) setCapsules(data)
  }

  useEffect(() => {
    fetchTimeline()
    fetchCapsules()

    const channel = supabase
      .channel('memories-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timeline_events' }, () => fetchTimeline())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'capsules' }, () => fetchCapsules())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const addTimelineEvent = async () => {
    if (!profile || !tlTitle.trim()) return
    setSaving(true)

    await supabase.from('timeline_events').insert({
      title: tlTitle.trim(),
      description: tlDescription.trim() || null,
      emoji: tlEmoji,
      event_date: tlDate,
      created_by: profile.id,
    })

    setShowTimelineForm(false)
    setTlTitle('')
    setTlDescription('')
    setSaving(false)
    fetchTimeline()
  }

  const addCapsule = async () => {
    if (!profile || !partnerProfile || !capContent.trim() || !capRevealDate) return
    setSaving(true)

    await supabase.from('capsules').insert({
      sender_id: profile.id,
      receiver_id: partnerProfile.id,
      content: capContent.trim(),
      reveal_date: capRevealDate,
    })

    setShowCapsuleForm(false)
    setCapContent('')
    setCapRevealDate('')
    setSaving(false)
    fetchCapsules()
  }

  const openCapsule = async (capsule: Capsule) => {
    if (!isPast(parseISO(capsule.reveal_date)) || capsule.is_opened) return

    await supabase
      .from('capsules')
      .update({ is_opened: true, opened_at: new Date().toISOString() })
      .eq('id', capsule.id)

    fetchCapsules()
  }

  const deleteTimelineEvent = async (id: string) => {
    await supabase.from('timeline_events').delete().eq('id', id)
    fetchTimeline()
  }

  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
        <div className="w-8 h-8 rounded-xl bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
          <Camera size={16} className="text-[#C2788E]" />
        </div>
        Souvenirs
      </h2>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[#1A1714] rounded-xl">
        <button
          onClick={() => setTab('timeline')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-300 ${
            tab === 'timeline'
              ? 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]'
              : 'text-[#6B6359] hover:text-[#9B9287]'
          }`}
        >
          Timeline
        </button>
        <button
          onClick={() => setTab('capsules')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-300 ${
            tab === 'capsules'
              ? 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]'
              : 'text-[#6B6359] hover:text-[#9B9287]'
          }`}
        >
          Capsules
        </button>
      </div>

      {tab === 'timeline' && (
        <>
          <div className="flex justify-end">
            <button
              onClick={() => setShowTimelineForm(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out"
            >
              <Plus size={14} /> Ajouter un moment
            </button>
          </div>

          {/* Empty state */}
          {timelineEvents.length === 0 && (
            <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] text-center py-12">
              <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />
              <div className="w-14 h-14 rounded-2xl bg-[rgba(194,120,142,0.1)] flex items-center justify-center mx-auto mb-4">
                <Camera size={24} className="text-[#C2788E]/60" />
              </div>
              <p className="text-[#9B9287] text-sm leading-relaxed">Votre histoire commence ici</p>
              <p className="text-[#6B6359] text-[11px] tracking-wide mt-1.5">Ajoutez les moments importants de votre couple</p>
            </div>
          )}

          {/* Timeline */}
          <div className="relative">
            {timelineEvents.length > 0 && (
              <div className="absolute left-5 top-0 bottom-0 w-px bg-white/[0.04]" />
            )}

            <div className="space-y-4">
              {timelineEvents.map((event) => (
                <div key={event.id} className="flex gap-4 relative">
                  <div className="w-10 h-10 rounded-full bg-[#1E1B17] flex items-center justify-center shrink-0 z-10 text-lg shadow-[0_0_0_4px_#110F0E]">
                    {event.emoji}
                  </div>
                  <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] flex-1 group hover:bg-[#252118] transition-all duration-500 ease-out">
                    <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500" />
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm text-[#F0EAE0]">{event.title}</p>
                        <p className="text-[11px] tracking-wide text-[#6B6359] mt-0.5">
                          {format(parseISO(event.event_date), 'd MMMM yyyy', { locale: fr })}
                        </p>
                      </div>
                      {event.created_by === profile?.id && (
                        <button
                          onClick={() => deleteTimelineEvent(event.id)}
                          className="text-transparent group-hover:text-[#6B6359] hover:!text-red-400 transition-colors duration-300"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {event.description && (
                      <p className="text-[11px] text-[#9B9287] mt-2 leading-relaxed">{event.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline form modal */}
          {showTimelineForm && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
              <div
                className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] w-full max-w-md space-y-4"
                style={{ animation: 'fadeIn 400ms ease-out' }}
              >
                <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0]">Nouveau moment</h3>
                  <button onClick={() => setShowTimelineForm(false)} className="text-[#6B6359] hover:text-[#F0EAE0] transition-colors duration-300">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {TIMELINE_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setTlEmoji(e)}
                      className={`text-xl p-1.5 rounded-lg transition-all duration-300 ${
                        tlEmoji === e
                          ? 'bg-[rgba(212,165,116,0.15)] shadow-[0_0_12px_rgba(212,165,116,0.1)]'
                          : 'hover:bg-[rgba(212,165,116,0.06)]'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder="Titre du moment"
                  value={tlTitle}
                  onChange={(e) => setTlTitle(e.target.value)}
                  className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
                  autoFocus
                />

                <textarea
                  placeholder="Description (optionnel)"
                  value={tlDescription}
                  onChange={(e) => setTlDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] resize-none"
                />

                <div>
                  <label className="block text-[11px] tracking-wide text-[#6B6359] mb-1.5">Date</label>
                  <input
                    type="date"
                    value={tlDate}
                    onChange={(e) => setTlDate(e.target.value)}
                    className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
                  />
                </div>

                <button
                  onClick={addTimelineEvent}
                  disabled={saving || !tlTitle.trim()}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? '...' : 'Ajouter'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'capsules' && (
        <>
          <div className="flex justify-end">
            <button
              onClick={() => setShowCapsuleForm(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out"
            >
              <Plus size={14} /> Creer une capsule
            </button>
          </div>

          {/* Empty state */}
          {capsules.length === 0 && (
            <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] text-center py-12">
              <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />
              <div className="w-14 h-14 rounded-2xl bg-[rgba(212,165,116,0.1)] flex items-center justify-center mx-auto mb-4">
                <Heart size={24} className="text-[#D4A574]/60" />
              </div>
              <p className="text-[#9B9287] text-sm leading-relaxed">Pas encore de capsule</p>
              <p className="text-[#6B6359] text-[11px] tracking-wide mt-1.5">Ecris un message qui sera revele a une date future</p>
            </div>
          )}

          {/* Capsules list */}
          <div className="space-y-3">
            {capsules.map((capsule) => {
              const canOpen = isPast(parseISO(capsule.reveal_date))
              const isMine = capsule.sender_id === profile?.id

              return (
                <div key={capsule.id} className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] hover:bg-[#252118] transition-all duration-500 ease-out group">
                  <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500" />

                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${
                      canOpen ? 'bg-[rgba(212,165,116,0.12)]' : 'bg-[rgba(255,255,255,0.03)]'
                    }`}>
                      {capsule.is_opened ? '💌' : '🔒'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#F0EAE0]">
                        {isMine ? `Pour ${partnerProfile?.display_name ?? 'ton/ta partenaire'}` : `De ${partnerProfile?.display_name ?? 'ton/ta partenaire'}`}
                      </p>
                      <p className="text-[11px] text-[#6B6359] flex items-center gap-1 mt-0.5">
                        <Clock size={10} />
                        {canOpen
                          ? capsule.is_opened
                            ? `Ouvert le ${format(parseISO(capsule.opened_at!), 'd MMM yyyy', { locale: fr })}`
                            : 'Pret a ouvrir !'
                          : `Disponible le ${format(parseISO(capsule.reveal_date), 'd MMM yyyy', { locale: fr })}`
                        }
                      </p>
                    </div>
                    {canOpen && !capsule.is_opened && !isMine && (
                      <button
                        onClick={() => openCapsule(capsule)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out"
                      >
                        Ouvrir
                      </button>
                    )}
                    {canOpen && !capsule.is_opened && isMine && (
                      <span className="text-[11px] tracking-wide text-[#6B6359]">En attente</span>
                    )}
                  </div>

                  {capsule.is_opened && (
                    <div className="mt-3 p-3 bg-[rgba(255,255,255,0.03)] rounded-xl">
                      <p className="text-sm text-[#F0EAE0] leading-relaxed">{capsule.content}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Capsule form modal */}
          {showCapsuleForm && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
              <div
                className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] w-full max-w-md space-y-4"
                style={{ animation: 'fadeIn 400ms ease-out' }}
              >
                <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0]">Nouvelle capsule temporelle</h3>
                  <button onClick={() => setShowCapsuleForm(false)} className="text-[#6B6359] hover:text-[#F0EAE0] transition-colors duration-300">
                    <X size={18} />
                  </button>
                </div>

                <p className="text-[11px] tracking-wide text-[#6B6359] leading-relaxed">
                  Ecris un message pour {partnerProfile?.display_name ?? 'ton/ta partenaire'} -- il/elle pourra le lire uniquement a la date choisie.
                </p>

                <textarea
                  placeholder="Ton message..."
                  value={capContent}
                  onChange={(e) => setCapContent(e.target.value)}
                  rows={4}
                  className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] resize-none"
                  autoFocus
                />

                <div>
                  <label className="block text-[11px] tracking-wide text-[#6B6359] mb-1.5">Date de revelation</label>
                  <input
                    type="date"
                    value={capRevealDate}
                    onChange={(e) => setCapRevealDate(e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
                  />
                </div>

                <button
                  onClick={addCapsule}
                  disabled={saving || !capContent.trim() || !capRevealDate}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? '...' : 'Sceller la capsule'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
