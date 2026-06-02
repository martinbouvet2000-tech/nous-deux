import { useEffect, useState } from 'react'
import { Heart, Plus, X, Film, Tv, FileVideo, Star, Check, Compass, MapPin, Utensils, Palette, Sparkles, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { WatchItem, BucketItem } from '@/types/database'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

type MainTab = 'watch' | 'bucket'
type StatusFilter = 'all' | 'to_watch' | 'watching' | 'watched'
type BucketFilter = 'all' | 'todo' | 'done'

const TYPE_ICONS = {
  movie: Film,
  series: Tv,
  documentary: FileVideo,
} as const

const STATUS_LABELS: Record<WatchItem['status'], string> = {
  to_watch: 'A voir',
  watching: 'En cours',
  watched: 'Vu',
}

const BUCKET_CATEGORIES: { key: BucketItem['category']; label: string; emoji: string; icon: typeof MapPin }[] = [
  { key: 'travel', label: 'Voyages', emoji: '✈️', icon: MapPin },
  { key: 'experience', label: 'Experiences', emoji: '🎯', icon: Compass },
  { key: 'milestone', label: 'Etapes', emoji: '💍', icon: Trophy },
  { key: 'food', label: 'Food', emoji: '🍽️', icon: Utensils },
  { key: 'creative', label: 'Creatif', emoji: '🎨', icon: Palette },
  { key: 'other', label: 'Autre', emoji: '⭐', icon: Sparkles },
]

const BUCKET_EMOJIS = ['✈️', '🏖️', '🗼', '🎢', '🎯', '💍', '🏠', '🍽️', '🎨', '🎵', '🌅', '🎭', '⛷️', '🚗', '🎪', '⭐']

export default function Activities() {
  const { profile } = useAuthStore()
  const [mainTab, setMainTab] = useState<MainTab>('watch')

  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
          <div className="w-8 h-8 rounded-xl bg-[rgba(232,184,109,0.12)] flex items-center justify-center">
            <Heart size={16} className="text-[#E8B86D]" />
          </div>
          Activites
        </h2>
      </div>

      {/* Main tab switcher */}
      <div className="flex gap-1 p-1 bg-[#1A1714] rounded-xl">
        <button
          onClick={() => setMainTab('watch')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
            mainTab === 'watch'
              ? 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]'
              : 'text-[#6B6359] hover:text-[#9B9287]'
          }`}
        >
          <Film size={15} />
          Films & Series
        </button>
        <button
          onClick={() => setMainTab('bucket')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
            mainTab === 'bucket'
              ? 'bg-[rgba(232,184,109,0.12)] text-[#E8B86D]'
              : 'text-[#6B6359] hover:text-[#9B9287]'
          }`}
        >
          <Compass size={15} />
          Bucket List
        </button>
      </div>

      {mainTab === 'watch' ? <WatchSection /> : <BucketSection />}
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

  const fetchItems = async () => {
    const { data } = await supabase
      .from('watch_items')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  useEffect(() => {
    fetchItems()
    const channel = supabase
      .channel('watch-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_items' }, () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const addItem = async () => {
    if (!profile || !title.trim()) return
    setSaving(true)
    await supabase.from('watch_items').insert({
      title: title.trim(),
      type,
      status: 'to_watch',
      notes: notes.trim() || null,
      added_by: profile.id,
    })
    setTitle(''); setNotes(''); setShowForm(false); setSaving(false)
    fetchItems()
  }

  const updateStatus = async (item: WatchItem, status: WatchItem['status']) => {
    await supabase.from('watch_items').update({ status }).eq('id', item.id)
    fetchItems()
  }

  const updateRating = async (item: WatchItem, rating: number) => {
    await supabase.from('watch_items').update({ rating, status: 'watched' }).eq('id', item.id)
    fetchItems()
  }

  const deleteItem = async (id: string) => {
    await supabase.from('watch_items').delete().eq('id', id)
    fetchItems()
  }

  const filtered = filter === 'all' ? items : items.filter((i) => i.status === filter)
  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Tout' },
    { key: 'to_watch', label: 'A voir' },
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
              className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-medium tracking-wide transition-all duration-300 ${
                filter === f.key
                  ? 'bg-[rgba(212,165,116,0.12)] text-[#D4A574]'
                  : 'text-[#6B6359] hover:text-[#9B9287]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out shrink-0"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] text-center py-12">
          <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />
          <div className="w-14 h-14 rounded-2xl bg-[rgba(212,165,116,0.1)] flex items-center justify-center mx-auto mb-4">
            <Film size={24} className="text-[#D4A574]/60" />
          </div>
          <p className="text-[#9B9287] text-sm leading-relaxed">
            {filter === 'all' ? 'Rien pour le moment' : `Aucun contenu "${filters.find((f) => f.key === filter)?.label}"`}
          </p>
          <p className="text-[#6B6359] text-[11px] tracking-wide mt-1.5">Ajoutez des films, series ou documentaires a regarder ensemble</p>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const Icon = TYPE_ICONS[item.type]
          return (
            <div key={item.id} className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] hover:bg-[#252118] transition-all duration-500 ease-out group">
              <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500" />

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
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      item.status === 'watched' ? 'bg-[rgba(16,185,129,0.12)] text-emerald-400'
                      : item.status === 'watching' ? 'bg-[rgba(232,184,109,0.12)] text-[#E8B86D]'
                      : 'bg-[rgba(255,255,255,0.03)] text-[#6B6359]'
                    }`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  {item.notes && <p className="text-[11px] text-[#6B6359] mt-0.5">{item.notes}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => updateRating(item, star)} className="transition-colors duration-300">
                          <Star size={14} className={item.rating && star <= item.rating ? 'text-[#E8B86D] fill-[#E8B86D]' : 'text-[#6B6359]/30'} />
                        </button>
                      ))}
                    </div>
                    {item.status !== 'watched' && (
                      <div className="flex gap-1 ml-auto">
                        {item.status === 'to_watch' && (
                          <button
                            onClick={() => updateStatus(item, 'watching')}
                            className="text-[10px] text-[#6B6359] hover:text-[#E8B86D] px-2 py-0.5 rounded-lg bg-[rgba(255,255,255,0.03)] transition-colors duration-300"
                          >
                            Commencer
                          </button>
                        )}
                        <button
                          onClick={() => updateStatus(item, 'watched')}
                          className="text-[10px] text-[#6B6359] hover:text-emerald-400 px-2 py-0.5 rounded-lg bg-[rgba(255,255,255,0.03)] flex items-center gap-0.5 transition-colors duration-300"
                        >
                          <Check size={10} /> Vu
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-transparent group-hover:text-[#6B6359] hover:!text-red-400 shrink-0 transition-colors duration-300"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] w-full max-w-md space-y-4"
            style={{ animation: 'fadeIn 400ms ease-out' }}
          >
            <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0]">Ajouter un contenu</h3>
              <button onClick={() => setShowForm(false)} className="text-[#6B6359] hover:text-[#F0EAE0] transition-colors duration-300"><X size={18} /></button>
            </div>
            <div className="flex gap-2">
              {([['movie', 'Film', Film], ['series', 'Serie', Tv], ['documentary', 'Docu', FileVideo]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium tracking-wide transition-all duration-300 ${
                    type === t
                      ? 'bg-[rgba(212,165,116,0.15)] text-[#D4A574] shadow-[0_0_0_1px_rgba(212,165,116,0.2)]'
                      : 'bg-[rgba(255,255,255,0.03)] text-[#6B6359] hover:text-[#9B9287]'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Titre"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
              autoFocus
            />
            <textarea
              placeholder="Notes (optionnel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] resize-none"
            />
            <button
              onClick={addItem}
              disabled={saving || !title.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? '...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* ═══════════════ BUCKET LIST SECTION ═══════════════ */
function BucketSection() {
  const { profile, partnerProfile } = useAuthStore()
  const [items, setItems] = useState<BucketItem[]>([])
  const [filter, setFilter] = useState<BucketFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('✈️')
  const [category, setCategory] = useState<BucketItem['category']>('travel')
  const [saving, setSaving] = useState(false)

  const fetchItems = async () => {
    const { data } = await supabase
      .from('bucket_items')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  useEffect(() => {
    fetchItems()
    const channel = supabase
      .channel('bucket-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bucket_items' }, () => fetchItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const addItem = async () => {
    if (!profile || !title.trim()) return
    setSaving(true)
    await supabase.from('bucket_items').insert({
      title: title.trim(),
      emoji,
      category,
      created_by: profile.id,
    })
    setTitle(''); setShowForm(false); setSaving(false)
    fetchItems()
  }

  const toggleDone = async (item: BucketItem) => {
    const newDone = !item.is_done
    await supabase.from('bucket_items').update({
      is_done: newDone,
      done_date: newDone ? new Date().toISOString().split('T')[0] : null,
    }).eq('id', item.id)
    fetchItems()
  }

  const deleteItem = async (id: string) => {
    await supabase.from('bucket_items').delete().eq('id', id)
    fetchItems()
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
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17]">
          <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] tracking-wide text-[#6B6359] font-medium">
              {doneCount}/{items.length} accomplis
            </p>
            <p className="text-[11px] font-medium text-[#E8B86D]">{progress}%</p>
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
            { key: 'todo' as BucketFilter, label: 'A faire' },
            { key: 'done' as BucketFilter, label: 'Fait' },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`py-1.5 px-3 rounded-md text-[11px] font-medium tracking-wide transition-all duration-300 ${
                filter === f.key
                  ? 'bg-[rgba(232,184,109,0.12)] text-[#E8B86D]'
                  : 'text-[#6B6359] hover:text-[#9B9287]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out"
        >
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] text-center py-12">
          <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />
          <div className="w-14 h-14 rounded-2xl bg-[rgba(232,184,109,0.1)] flex items-center justify-center mx-auto mb-4">
            <Compass size={24} className="text-[#E8B86D]/60" />
          </div>
          <p className="text-[#9B9287] text-sm leading-relaxed">
            {filter === 'all' ? 'Votre bucket list est vide' : filter === 'done' ? 'Rien d\'accompli encore' : 'Tout est fait !'}
          </p>
          <p className="text-[#6B6359] text-[11px] tracking-wide mt-1.5">Ajoutez vos reves et projets de couple</p>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const cat = BUCKET_CATEGORIES.find(c => c.key === item.category)
          return (
            <div
              key={item.id}
              className={`relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] hover:bg-[#252118] transition-all duration-500 ease-out group ${item.is_done ? 'opacity-70' : ''}`}
            >
              <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500" />

              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleDone(item)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-all duration-300 ${
                    item.is_done
                      ? 'bg-[rgba(16,185,129,0.12)] shadow-[0_0_0_1px_rgba(16,185,129,0.2)]'
                      : 'bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(232,184,109,0.1)]'
                  }`}
                >
                  {item.is_done ? '✅' : item.emoji}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${item.is_done ? 'line-through text-[#6B6359]' : 'text-[#F0EAE0]'}`}>
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {cat && (
                      <span className="text-[10px] text-[#6B6359]">
                        {cat.emoji} {cat.label}
                      </span>
                    )}
                    {item.is_done && item.done_date && (
                      <span className="text-[10px] text-emerald-400">
                        {format(parseISO(item.done_date), 'd MMM yyyy', { locale: fr })}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-transparent group-hover:text-[#6B6359] hover:!text-red-400 shrink-0 transition-colors duration-300"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] w-full max-w-md space-y-4"
            style={{ animation: 'fadeIn 400ms ease-out' }}
          >
            <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0]">Nouveau reve</h3>
              <button onClick={() => setShowForm(false)} className="text-[#6B6359] hover:text-[#F0EAE0] transition-colors duration-300"><X size={18} /></button>
            </div>

            {/* Category */}
            <div className="grid grid-cols-3 gap-1.5">
              {BUCKET_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-medium tracking-wide transition-all duration-300 ${
                    category === cat.key
                      ? 'bg-[rgba(232,184,109,0.15)] text-[#E8B86D] shadow-[0_0_0_1px_rgba(232,184,109,0.2)]'
                      : 'bg-[rgba(255,255,255,0.03)] text-[#6B6359] hover:text-[#9B9287]'
                  }`}
                >
                  {cat.emoji} {cat.label}
                </button>
              ))}
            </div>

            {/* Emoji picker */}
            <div className="flex gap-1.5 flex-wrap">
              {BUCKET_EMOJIS.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`text-lg p-1.5 rounded-lg transition-all duration-300 ${
                    emoji === e
                      ? 'bg-[rgba(232,184,109,0.15)] shadow-[0_0_16px_rgba(212,165,116,0.1)]'
                      : 'hover:bg-[rgba(212,165,116,0.06)]'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Ex: Voir les aurores boreales ensemble"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
              autoFocus
            />

            <button
              onClick={addItem}
              disabled={saving || !title.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? '...' : 'Ajouter a la liste'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
