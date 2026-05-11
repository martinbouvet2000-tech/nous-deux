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
  to_watch: 'À voir',
  watching: 'En cours',
  watched: 'Vu',
}

const BUCKET_CATEGORIES: { key: BucketItem['category']; label: string; emoji: string; icon: typeof MapPin }[] = [
  { key: 'travel', label: 'Voyages', emoji: '✈️', icon: MapPin },
  { key: 'experience', label: 'Expériences', emoji: '🎯', icon: Compass },
  { key: 'milestone', label: 'Étapes', emoji: '💍', icon: Trophy },
  { key: 'food', label: 'Food', emoji: '🍽️', icon: Utensils },
  { key: 'creative', label: 'Créatif', emoji: '🎨', icon: Palette },
  { key: 'other', label: 'Autre', emoji: '⭐', icon: Sparkles },
]

const BUCKET_EMOJIS = ['✈️', '🏖️', '🗼', '🎢', '🎯', '💍', '🏠', '🍽️', '🎨', '🎵', '🌅', '🎭', '⛷️', '🚗', '🎪', '⭐']

export default function Activities() {
  const { profile } = useAuthStore()
  const [mainTab, setMainTab] = useState<MainTab>('watch')

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Heart size={18} className="text-accent" />
          Activités
        </h2>
      </div>

      {/* Main tab switcher */}
      <div className="flex gap-1 p-1 bg-surface rounded-xl">
        <button
          onClick={() => setMainTab('watch')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            mainTab === 'watch'
              ? 'bg-gradient-to-r from-primary/20 to-primary/10 text-primary shadow-sm'
              : 'text-text-muted hover:text-text'
          }`}
        >
          <Film size={15} />
          Films & Séries
        </button>
        <button
          onClick={() => setMainTab('bucket')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            mainTab === 'bucket'
              ? 'bg-gradient-to-r from-accent/20 to-accent/10 text-accent shadow-sm'
              : 'text-text-muted hover:text-text'
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
    { key: 'to_watch', label: 'À voir' },
    { key: 'watching', label: 'En cours' },
    { key: 'watched', label: 'Vus' },
  ]

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-surface rounded-lg flex-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-primary/20 text-primary' : 'text-text-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary text-xs px-3 py-1.5 ml-2 shrink-0">
          <Plus size={14} />
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🎬</p>
          <p className="text-text-muted text-sm">
            {filter === 'all' ? 'Rien pour le moment' : `Aucun contenu "${filters.find((f) => f.key === filter)?.label}"`}
          </p>
          <p className="text-xs text-text-muted mt-1">Ajoutez des films, séries ou documentaires à regarder ensemble</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((item) => {
          const Icon = TYPE_ICONS[item.type]
          return (
            <div key={item.id} className="card group">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  item.status === 'watched' ? 'bg-success/20 text-success'
                  : item.status === 'watching' ? 'bg-accent/20 text-accent'
                  : 'bg-primary/20 text-primary'
                }`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{item.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      item.status === 'watched' ? 'bg-success/20 text-success'
                      : item.status === 'watching' ? 'bg-accent/20 text-accent'
                      : 'bg-surface-lighter text-text-muted'
                    }`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  {item.notes && <p className="text-xs text-text-muted mt-0.5">{item.notes}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} onClick={() => updateRating(item, star)} className="transition-colors">
                          <Star size={14} className={item.rating && star <= item.rating ? 'text-accent fill-accent' : 'text-text-muted/30'} />
                        </button>
                      ))}
                    </div>
                    {item.status !== 'watched' && (
                      <div className="flex gap-1 ml-auto">
                        {item.status === 'to_watch' && (
                          <button onClick={() => updateStatus(item, 'watching')} className="text-[10px] text-text-muted hover:text-accent px-1.5 py-0.5 rounded bg-surface-lighter">
                            Commencer
                          </button>
                        )}
                        <button onClick={() => updateStatus(item, 'watched')} className="text-[10px] text-text-muted hover:text-success px-1.5 py-0.5 rounded bg-surface-lighter flex items-center gap-0.5">
                          <Check size={10} /> Vu
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => deleteItem(item.id)} className="text-text-muted/0 group-hover:text-text-muted hover:!text-danger shrink-0">
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="card w-full max-w-md space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Ajouter un contenu</h3>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text"><X size={18} /></button>
            </div>
            <div className="flex gap-2">
              {([['movie', 'Film', Film], ['series', 'Série', Tv], ['documentary', 'Docu', FileVideo]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                    type === t ? 'bg-primary/20 text-primary ring-1 ring-primary' : 'bg-surface-lighter text-text-muted'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
            <input type="text" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} className="input" autoFocus />
            <textarea placeholder="Notes (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input" />
            <button onClick={addItem} disabled={saving || !title.trim()} className="btn btn-primary w-full">
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
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-text-muted font-medium">
              {doneCount}/{items.length} accomplis
            </p>
            <p className="text-xs font-bold text-accent">{progress}%</p>
          </div>
          <div className="h-2 bg-surface-lighter rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-surface rounded-lg">
          {([
            { key: 'all' as BucketFilter, label: 'Tout' },
            { key: 'todo' as BucketFilter, label: 'À faire' },
            { key: 'done' as BucketFilter, label: 'Fait ✓' },
          ]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-accent/20 text-accent' : 'text-text-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary text-xs px-3 py-1.5">
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">🌍</p>
          <p className="text-text-muted text-sm">
            {filter === 'all' ? 'Votre bucket list est vide' : filter === 'done' ? 'Rien d\'accompli encore' : 'Tout est fait !'}
          </p>
          <p className="text-xs text-text-muted mt-1">Ajoutez vos rêves et projets de couple</p>
        </div>
      )}

      {/* Group by category */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const cat = BUCKET_CATEGORIES.find(c => c.key === item.category)
          return (
            <div
              key={item.id}
              className={`card group transition-all ${item.is_done ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center gap-3">
                {/* Emoji + checkbox */}
                <button
                  onClick={() => toggleDone(item)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-all ${
                    item.is_done
                      ? 'bg-success/20 ring-1 ring-success/30'
                      : 'bg-surface-lighter hover:bg-accent/15'
                  }`}
                >
                  {item.is_done ? '✅' : item.emoji}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm ${item.is_done ? 'line-through text-text-muted' : ''}`}>
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {cat && (
                      <span className="text-[10px] text-text-dim">
                        {cat.emoji} {cat.label}
                      </span>
                    )}
                    {item.is_done && item.done_date && (
                      <span className="text-[10px] text-success">
                        ✓ {format(parseISO(item.done_date), 'd MMM yyyy', { locale: fr })}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => deleteItem(item.id)}
                  className="text-text-muted/0 group-hover:text-text-muted hover:!text-danger shrink-0"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="card w-full max-w-md space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Nouveau rêve</h3>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text"><X size={18} /></button>
            </div>

            {/* Category */}
            <div className="grid grid-cols-3 gap-1.5">
              {BUCKET_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                    category === cat.key
                      ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                      : 'bg-surface-lighter text-text-muted hover:text-text'
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
                  className={`text-lg p-1.5 rounded-lg transition-all ${
                    emoji === e ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-surface-lighter'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Ex: Voir les aurores boréales ensemble"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input"
              autoFocus
            />

            <button onClick={addItem} disabled={saving || !title.trim()} className="btn btn-primary w-full">
              {saving ? '...' : 'Ajouter à la liste'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
