import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, X, Film, Tv, FileVideo, Star, Check, Compass, MapPin, Utensils, Palette, Sparkles, Trophy, ListTodo } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { WatchItem, BucketItem } from '@/types/database'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE } from '@/lib/ui'
import TodosSection from '@/pages/Todos'

type MainTab = 'watch' | 'bucket' | 'projects'
type StatusFilter = 'all' | 'to_watch' | 'watching' | 'watched'
type BucketFilter = 'all' | 'todo' | 'done'

const TYPE_ICONS = {
  movie: Film,
  series: Tv,
  documentary: FileVideo,
} as const

const STATUS_LABELS: Record<WatchItem['status'], string> = {
  to_watch: 'À voir',
  watching: 'En cours',
  watched: 'Vu',
}

const BUCKET_CATEGORIES: { key: BucketItem['category']; label: string; emoji: string; icon: typeof MapPin }[] = [
  { key: 'travel', label: 'Voyages', emoji: '✈️', icon: MapPin },
  { key: 'experience', label: 'Expériences', emoji: '🎯', icon: Compass },
  { key: 'milestone', label: 'Étapes', emoji: '💍', icon: Trophy },
  { key: 'food', label: 'Gourmandise', emoji: '🍽️', icon: Utensils },
  { key: 'creative', label: 'Créatif', emoji: '🎨', icon: Palette },
  { key: 'other', label: 'Autre', emoji: '⭐', icon: Sparkles },
]

const BUCKET_EMOJIS = ['✈️', '🏖️', '🗼', '🎢', '🎯', '💍', '🏠', '🍽️', '🎨', '🎵', '🌅', '🎭', '⛷️', '🚗', '🎪', '⭐']

const TABS: { key: MainTab; label: string; icon: typeof Film; tint: string }[] = [
  { key: 'watch', label: 'Films & séries', icon: Film, tint: 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]' },
  { key: 'bucket', label: 'Nos rêves', icon: Compass, tint: 'bg-[rgba(232,184,109,0.12)] text-[#E8B86D]' },
  { key: 'projects', label: 'Projets', icon: ListTodo, tint: 'bg-[rgba(194,120,142,0.12)] text-[#D99AAD]' },
]

export default function Activities() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const mainTab: MainTab = raw === 'bucket' || raw === 'projects' ? raw : 'watch'
  const setMainTab = (t: MainTab) => setParams(t === 'watch' ? {} : { tab: t }, { replace: true })

  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
      <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
        <div className="w-8 h-8 rounded-xl bg-[rgba(232,184,109,0.12)] flex items-center justify-center">
          <Sparkles size={16} className="text-[#E8B86D]" aria-hidden="true" />
        </div>
        À deux
      </h2>

      <div className="flex gap-1 p-1 bg-[#1A1714] rounded-xl" role="tablist" aria-label="Sections">
        {TABS.map(({ key, label, icon: Icon, tint }) => (
          <button
            key={key}
            role="tab"
            aria-selected={mainTab === key}
            onClick={() => setMainTab(key)}
            className={`flex-1 py-2.5 px-2 rounded-lg text-[13px] font-medium transition-all duration-300 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50 ${
              mainTab === key ? tint : 'text-[#8A8177] hover:text-[#B5ACA1]'
            }`}
          >
            <Icon size={14} aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {mainTab === 'watch' && <WatchSection />}
      {mainTab === 'bucket' && <BucketSection />}
      {mainTab === 'projects' && <TodosSection />}
    </div>
  )
}

/* ═══════════════ WATCH SECTION ═══════════════ */
function WatchSection() {
  const { profile } = useAuthStore()
  const [items, setItems] = useState<WatchItem[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<WatchItem['type']>('movie')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => {
    const { data } = await run(supabase.from('watch_items').select('*').order('created_at', { ascending: false }).limit(300), { errorMessage: 'Impossible de charger la liste.' })
    if (data) setItems(data)
  }, [])

  useEffect(() => {
    fetchItems()
    const channel = supabase
      .channel(`watch:${profile?.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_items' }, () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchItems, profile?.id])

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !title.trim()) return
    setSaving(true)
    const { ok } = await run(
      supabase.from('watch_items').insert({ title: title.trim(), type, status: 'to_watch', notes: notes.trim() || null, added_by: profile.id }),
      { errorMessage: "Impossible d'ajouter ce titre." },
    )
    setSaving(false)
    if (ok) { setTitle(''); setNotes(''); setShowForm(false); fetchItems() }
  }

  const updateStatus = async (item: WatchItem, status: WatchItem['status']) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status } : i)))
    const { ok } = await run(supabase.from('watch_items').update({ status }).eq('id', item.id))
    if (!ok) fetchItems()
  }

  const updateRating = async (item: WatchItem, rating: number) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, rating, status: 'watched' } : i)))
    const { ok } = await run(supabase.from('watch_items').update({ rating, status: 'watched' }).eq('id', item.id))
    if (!ok) fetchItems()
  }

  const deleteItem = async (item: WatchItem) => {
    const yes = await confirm({ title: 'Retirer ce titre ?', message: `« ${item.title} » sera retiré de votre liste.`, confirmLabel: 'Retirer', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('watch_items').delete().eq('id', item.id), { errorMessage: 'Suppression impossible (seule la personne qui l’a ajouté peut le retirer).' })
    if (ok) fetchItems()
  }

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter)
  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Tout' },
    { key: 'to_watch', label: 'À voir' },
    { key: 'watching', label: 'En cours' },
    { key: 'watched', label: 'Vus' },
  ]

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 p-1 bg-[#1A1714] rounded-lg flex-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium tracking-wide transition-all duration-300 ${
                filter === f.key
                  ? 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]'
                  : 'text-[#8A8177] hover:text-[#9B9287]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className={`${BTN_PRIMARY} px-3 shrink-0`} aria-label="Ajouter un film ou une série">
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className={`${CARD} text-center py-12`}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="w-14 h-14 rounded-2xl bg-[rgba(212,165,116,0.1)] flex items-center justify-center mx-auto mb-4">
            <Film size={24} className="text-[#D4A574]/60" />
          </div>
          <p className="text-[#9B9287] text-sm leading-relaxed">
            {filter === 'all' ? 'Rien pour le moment' : `Aucun contenu "${filters.find((f) => f.key === filter)?.label}"`}
          </p>
          <p className="text-[#8A8177] text-xs tracking-wide mt-1.5">Ajoutez des films, séries ou documentaires à regarder ensemble</p>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const Icon = TYPE_ICONS[item.type]
          return (
            <div key={item.id} className={`${CARD} hover:bg-[#252118] group`}>
              <div className={CARD_EDGE} aria-hidden="true" />

              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  item.status === 'watched' ? 'bg-[rgba(16,185,129,0.12)] text-emerald-400'
                  : item.status === 'watching' ? 'bg-[rgba(232,184,109,0.12)] text-[#E8B86D]'
                  : 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]'
                }`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-[#F0EAE0]">{item.title}</p>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                      item.status === 'watched' ? 'bg-[rgba(16,185,129,0.12)] text-emerald-400'
                      : item.status === 'watching' ? 'bg-[rgba(232,184,109,0.12)] text-[#E8B86D]'
                      : 'bg-[rgba(255,255,255,0.03)] text-[#8A8177]'
                    }`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  {item.notes && <p className="text-xs text-[#8A8177] mt-0.5">{item.notes}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => updateRating(item, star)} className="transition-colors duration-300 p-0.5" aria-label={`Noter ${star} sur 5`}>
                          <Star size={14} className={item.rating && star <= item.rating ? 'text-[#E8B86D] fill-[#E8B86D]' : 'text-[#8A8177]/30'} />
                        </button>
                      ))}
                    </div>
                    {item.status !== 'watched' && (
                      <div className="flex gap-1 ml-auto">
                        {item.status === 'to_watch' && (
                          <button
                            onClick={() => updateStatus(item, 'watching')}
                            className="text-[11px] text-[#8A8177] hover:text-[#E8B86D] px-2 py-0.5 rounded-lg bg-[rgba(255,255,255,0.03)] transition-colors duration-300"
                          >
                            Commencer
                          </button>
                        )}
                        <button
                          onClick={() => updateStatus(item, 'watched')}
                          className="text-[11px] text-[#8A8177] hover:text-emerald-400 px-2 py-0.5 rounded-lg bg-[rgba(255,255,255,0.03)] flex items-center gap-0.5 transition-colors duration-300"
                        >
                          <Check size={10} /> Vu
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteItem(item)}
                  className="text-[#8A8177]/40 hover:text-red-400 shrink-0 transition-colors duration-300 p-1"
                  aria-label={`Retirer ${item.title}`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <Modal title="Ajouter un film ou une série" onClose={() => setShowForm(false)}>
          <form onSubmit={addItem} className="space-y-4">
            <div className="flex gap-2" role="radiogroup" aria-label="Type">
              {([['movie', 'Film', Film], ['series', 'Série', Tv], ['documentary', 'Docu', FileVideo]] as const).map(([t, label, Icon]) => (
                <button
                  type="button"
                  key={t}
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium tracking-wide transition-all duration-300 ${
                    type === t ? 'bg-[rgba(212,165,116,0.15)] text-[#D4A574] shadow-[0_0_0_1px_rgba(212,165,116,0.2)]' : 'bg-[rgba(255,255,255,0.03)] text-[#8A8177] hover:text-[#B5ACA1]'
                  }`}
                >
                  <Icon size={14} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="w-title" className={LABEL}>Titre</label>
              <input id="w-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} maxLength={120} required autoFocus />
            </div>
            <div>
              <label htmlFor="w-notes" className={LABEL}>Notes (optionnel)</label>
              <textarea id="w-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${INPUT} resize-none`} maxLength={500} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={saving || !title.trim()} className={`${BTN_PRIMARY} flex-1 py-2.5`}>{saving ? '…' : 'Ajouter'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

/* ═══════════════ BUCKET LIST SECTION ═══════════════ */
function BucketSection() {
  const { profile } = useAuthStore()
  const [items, setItems] = useState<BucketItem[]>([])
  const [filter, setFilter] = useState<BucketFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('✈️')
  const [category, setCategory] = useState<BucketItem['category']>('travel')
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => {
    const { data } = await run(supabase.from('bucket_items').select('*').order('created_at', { ascending: false }).limit(300), { errorMessage: 'Impossible de charger vos rêves.' })
    if (data) setItems(data)
  }, [])

  useEffect(() => {
    fetchItems()
    const channel = supabase
      .channel(`bucket:${profile?.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bucket_items' }, () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchItems, profile?.id])

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !title.trim()) return
    setSaving(true)
    const { ok } = await run(
      supabase.from('bucket_items').insert({ title: title.trim(), emoji, category, created_by: profile.id }),
      { errorMessage: "Impossible d'ajouter ce rêve." },
    )
    setSaving(false)
    if (ok) { setTitle(''); setShowForm(false); fetchItems() }
  }

  const toggleDone = async (item: BucketItem) => {
    const newDone = !item.is_done
    const done_date = newDone ? format(new Date(), 'yyyy-MM-dd') : null
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_done: newDone, done_date } : i)))
    const { ok } = await run(supabase.from('bucket_items').update({ is_done: newDone, done_date }).eq('id', item.id))
    if (!ok) fetchItems()
  }

  const deleteItem = async (item: BucketItem) => {
    const yes = await confirm({ title: 'Retirer ce rêve ?', message: `« ${item.title} » sera retiré de votre liste.`, confirmLabel: 'Retirer', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('bucket_items').delete().eq('id', item.id), { errorMessage: 'Suppression impossible (seule la personne qui l’a ajouté peut le retirer).' })
    if (ok) fetchItems()
  }

  const filtered = filter === 'all'
    ? items
    : filter === 'done'
      ? items.filter(i => i.is_done)
      : items.filter(i => !i.is_done)

  const doneCount = items.filter(i => i.is_done).length
  const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0

  return (
    <>
      {/* Progress bar */}
      {items.length > 0 && (
        <div className={CARD}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs tracking-wide text-[#8A8177] font-medium">
              {doneCount}/{items.length} accomplis
            </p>
            <p className="text-xs font-medium text-[#E8B86D]">{progress}%</p>
          </div>
          <div className="h-1.5 bg-[rgba(255,255,255,0.03)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#E8B86D] to-[#D4A574] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 p-1 bg-[#1A1714] rounded-lg">
          {([
            { key: 'all' as BucketFilter, label: 'Tout' },
            { key: 'todo' as BucketFilter, label: 'À faire' },
            { key: 'done' as BucketFilter, label: 'Fait' },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`py-1.5 px-3 rounded-md text-xs font-medium tracking-wide transition-all duration-300 ${
                filter === f.key
                  ? 'bg-[rgba(232,184,109,0.12)] text-[#E8B86D]'
                  : 'text-[#8A8177] hover:text-[#9B9287]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className={BTN_PRIMARY}>
          <Plus size={14} aria-hidden="true" /> Ajouter
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className={`${CARD} text-center py-12`}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="w-14 h-14 rounded-2xl bg-[rgba(232,184,109,0.1)] flex items-center justify-center mx-auto mb-4">
            <Compass size={24} className="text-[#E8B86D]/60" />
          </div>
          <p className="text-[#9B9287] text-sm leading-relaxed">
            {filter === 'all' ? 'Votre liste de rêves est vide' : filter === 'done' ? 'Rien d\'accompli encore' : 'Tout est fait !'}
          </p>
          <p className="text-[#8A8177] text-xs tracking-wide mt-1.5">Ajoutez vos rêves et envies à réaliser ensemble</p>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const cat = BUCKET_CATEGORIES.find(c => c.key === item.category)
          return (
            <div
              key={item.id}
              className={`${CARD} hover:bg-[#252118] group ${item.is_done ? 'opacity-70' : ''}`}
            >
              <div className={CARD_EDGE} aria-hidden="true" />

              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleDone(item)}
                  role="checkbox"
                  aria-checked={item.is_done}
                  aria-label={`${item.is_done ? 'Marquer comme à faire' : 'Marquer comme accompli'} : ${item.title}`}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50 ${
                    item.is_done
                      ? 'bg-[rgba(16,185,129,0.12)] shadow-[0_0_0_1px_rgba(16,185,129,0.2)]'
                      : 'bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(232,184,109,0.1)]'
                  }`}
                >
                  {item.is_done ? '✅' : item.emoji}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${item.is_done ? 'line-through text-[#8A8177]' : 'text-[#F0EAE0]'}`}>
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {cat && (
                      <span className="text-[11px] text-[#8A8177]">
                        {cat.emoji} {cat.label}
                      </span>
                    )}
                    {item.is_done && item.done_date && (
                      <span className="text-[11px] text-emerald-400">
                        {format(parseISO(item.done_date), 'd MMM yyyy', { locale: fr })}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => deleteItem(item)}
                  className="text-[#8A8177]/40 hover:text-red-400 shrink-0 transition-colors duration-300 p-1"
                  aria-label={`Retirer ${item.title}`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <Modal title="Nouveau rêve" onClose={() => setShowForm(false)}>
          <form onSubmit={addItem} className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Catégorie">
              {BUCKET_CATEGORIES.map(cat => (
                <button
                  type="button"
                  key={cat.key}
                  role="radio"
                  aria-checked={category === cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium tracking-wide transition-all duration-300 ${
                    category === cat.key ? 'bg-[rgba(232,184,109,0.15)] text-[#E8B86D] shadow-[0_0_0_1px_rgba(232,184,109,0.2)]' : 'bg-[rgba(255,255,255,0.03)] text-[#8A8177] hover:text-[#B5ACA1]'
                  }`}
                >
                  <span aria-hidden="true">{cat.emoji}</span> {cat.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Emoji">
              {BUCKET_EMOJIS.map(e => (
                <button type="button" key={e} onClick={() => setEmoji(e)} aria-label={`Emoji ${e}`} aria-pressed={emoji === e}
                  className={`text-lg p-1.5 rounded-lg transition-all duration-300 ${emoji === e ? 'bg-[rgba(232,184,109,0.15)] shadow-[0_0_16px_rgba(212,165,116,0.1)]' : 'hover:bg-[rgba(212,165,116,0.06)]'}`}>
                  {e}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="b-title" className={LABEL}>Le rêve</label>
              <input id="b-title" type="text" placeholder="Ex : Voir les aurores boréales ensemble" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} maxLength={120} required autoFocus />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={saving || !title.trim()} className={`${BTN_PRIMARY} flex-1 py-2.5`}>{saving ? '…' : 'Ajouter à la liste'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
