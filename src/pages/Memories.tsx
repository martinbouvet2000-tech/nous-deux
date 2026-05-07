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
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <Camera size={18} className="text-secondary" />
        Souvenirs
      </h2>

      <div className="flex gap-1 p-1 bg-surface rounded-lg">
        <button
          onClick={() => setTab('timeline')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${tab === 'timeline' ? 'bg-primary/20 text-primary' : 'text-text-muted'}`}
        >
          Timeline
        </button>
        <button
          onClick={() => setTab('capsules')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${tab === 'capsules' ? 'bg-primary/20 text-primary' : 'text-text-muted'}`}
        >
          Capsules
        </button>
      </div>

      {tab === 'timeline' && (
        <>
          <div className="flex justify-end">
            <button onClick={() => setShowTimelineForm(true)} className="btn btn-primary text-xs px-3 py-1.5">
              <Plus size={14} /> Ajouter un moment
            </button>
          </div>

          {timelineEvents.length === 0 && (
            <div className="card text-center py-10">
              <p className="text-3xl mb-2">📸</p>
              <p className="text-text-muted text-sm">Votre histoire commence ici</p>
              <p className="text-xs text-text-muted mt-1">Ajoutez les moments importants de votre couple</p>
            </div>
          )}

          <div className="relative">
            {timelineEvents.length > 0 && (
              <div className="absolute left-5 top-0 bottom-0 w-px bg-surface-lighter" />
            )}

            <div className="space-y-4">
              {timelineEvents.map((event) => (
                <div key={event.id} className="flex gap-4 relative">
                  <div className="w-10 h-10 rounded-full bg-surface-lighter flex items-center justify-center shrink-0 z-10 text-lg">
                    {event.emoji}
                  </div>
                  <div className="card flex-1 group">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{event.title}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {format(parseISO(event.event_date), 'd MMMM yyyy', { locale: fr })}
                        </p>
                      </div>
                      {event.created_by === profile?.id && (
                        <button onClick={() => deleteTimelineEvent(event.id)} className="text-text-muted/0 group-hover:text-text-muted hover:!text-danger transition-colors">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {event.description && (
                      <p className="text-xs text-text-muted mt-2">{event.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showTimelineForm && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
              <div className="card w-full max-w-md space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Nouveau moment</h3>
                  <button onClick={() => setShowTimelineForm(false)} className="text-text-muted hover:text-text">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {TIMELINE_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setTlEmoji(e)}
                      className={`text-xl p-1.5 rounded-lg ${tlEmoji === e ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-surface-lighter'}`}
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
                  className="input"
                  autoFocus
                />

                <textarea
                  placeholder="Description (optionnel)"
                  value={tlDescription}
                  onChange={(e) => setTlDescription(e.target.value)}
                  rows={2}
                  className="input"
                />

                <div>
                  <label className="block text-xs text-text-muted mb-1">Date</label>
                  <input
                    type="date"
                    value={tlDate}
                    onChange={(e) => setTlDate(e.target.value)}
                    className="input"
                  />
                </div>

                <button onClick={addTimelineEvent} disabled={saving || !tlTitle.trim()} className="btn btn-primary w-full">
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
            <button onClick={() => setShowCapsuleForm(true)} className="btn btn-primary text-xs px-3 py-1.5">
              <Plus size={14} /> Créer une capsule
            </button>
          </div>

          {capsules.length === 0 && (
            <div className="card text-center py-10">
              <p className="text-3xl mb-2">💌</p>
              <p className="text-text-muted text-sm">Pas encore de capsule</p>
              <p className="text-xs text-text-muted mt-1">Écris un message qui sera révélé à une date future</p>
            </div>
          )}

          <div className="space-y-3">
            {capsules.map((capsule) => {
              const canOpen = isPast(parseISO(capsule.reveal_date))
              const isMine = capsule.sender_id === profile?.id

              return (
                <div key={capsule.id} className="card">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${canOpen ? 'bg-primary/20' : 'bg-surface-lighter'}`}>
                      {capsule.is_opened ? '💌' : '🔒'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {isMine ? `Pour ${partnerProfile?.display_name ?? 'ton/ta partenaire'}` : `De ${partnerProfile?.display_name ?? 'ton/ta partenaire'}`}
                      </p>
                      <p className="text-xs text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {canOpen
                          ? capsule.is_opened
                            ? `Ouvert le ${format(parseISO(capsule.opened_at!), 'd MMM yyyy', { locale: fr })}`
                            : 'Prêt à ouvrir !'
                          : `Disponible le ${format(parseISO(capsule.reveal_date), 'd MMM yyyy', { locale: fr })}`
                        }
                      </p>
                    </div>
                    {canOpen && !capsule.is_opened && !isMine && (
                      <button onClick={() => openCapsule(capsule)} className="btn btn-primary text-xs px-3 py-1.5">
                        Ouvrir
                      </button>
                    )}
                    {canOpen && !capsule.is_opened && isMine && (
                      <span className="text-xs text-text-muted">En attente</span>
                    )}
                  </div>

                  {capsule.is_opened && (
                    <div className="mt-3 p-3 bg-surface-lighter rounded-lg">
                      <p className="text-sm">{capsule.content}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {showCapsuleForm && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
              <div className="card w-full max-w-md space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Nouvelle capsule temporelle</h3>
                  <button onClick={() => setShowCapsuleForm(false)} className="text-text-muted hover:text-text">
                    <X size={18} />
                  </button>
                </div>

                <p className="text-xs text-text-muted">
                  Écris un message pour {partnerProfile?.display_name ?? 'ton/ta partenaire'} — il/elle pourra le lire uniquement à la date choisie.
                </p>

                <textarea
                  placeholder="Ton message..."
                  value={capContent}
                  onChange={(e) => setCapContent(e.target.value)}
                  rows={4}
                  className="input"
                  autoFocus
                />

                <div>
                  <label className="block text-xs text-text-muted mb-1">Date de révélation</label>
                  <input
                    type="date"
                    value={capRevealDate}
                    onChange={(e) => setCapRevealDate(e.target.value)}
                    min={format(new Date(), 'yyyy-MM-dd')}
                    className="input"
                  />
                </div>

                <button onClick={addCapsule} disabled={saving || !capContent.trim() || !capRevealDate} className="btn btn-primary w-full">
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
