import { useEffect, useState } from 'react'
import { Heart, Plus, X, Film, Tv, FileVideo, Star, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { WatchItem } from '@/types/database'

type StatusFilter = 'all' | 'to_watch' | 'watching' | 'watched'

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

export default function Activities() {
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

    setTitle('')
    setNotes('')
    setShowForm(false)
    setSaving(false)
    fetchItems()
  }

  const updateStatus = async (item: WatchItem, status: WatchItem['status']) => {
    await supabase.from('watch_items').update({ status }).eq('id', item.id)
    fetchItems()
  }

  const updateRating = async (item: WatchItem, rating: number) => {
    await supabase
      .from('watch_items')
      .update({ rating, status: 'watched' })
      .eq('id', item.id)
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
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Heart size={18} className="text-accent" />
          Activités
        </h2>
        <button onClick={() => setShowForm(true)} className="btn btn-primary text-xs px-3 py-1.5">
          <Plus size={14} /> Ajouter
        </button>
      </div>

      <div className="flex gap-1 p-1 bg-surface rounded-lg">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${filter === f.key ? 'bg-primary/20 text-primary' : 'text-text-muted'}`}
          >
            {f.label}
          </button>
        ))}
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
                  item.status === 'watched' ? 'bg-success/20 text-success' : item.status === 'watching' ? 'bg-accent/20 text-accent' : 'bg-primary/20 text-primary'
                }`}>
                  <Icon size={16} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{item.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      item.status === 'watched' ? 'bg-success/20 text-success' : item.status === 'watching' ? 'bg-accent/20 text-accent' : 'bg-surface-lighter text-text-muted'
                    }`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>

                  {item.notes && (
                    <p className="text-xs text-text-muted mt-0.5">{item.notes}</p>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => updateRating(item, star)}
                          className="transition-colors"
                        >
                          <Star
                            size={14}
                            className={item.rating && star <= item.rating ? 'text-accent fill-accent' : 'text-text-muted/30'}
                          />
                        </button>
                      ))}
                    </div>

                    {item.status !== 'watched' && (
                      <div className="flex gap-1 ml-auto">
                        {item.status === 'to_watch' && (
                          <button
                            onClick={() => updateStatus(item, 'watching')}
                            className="text-[10px] text-text-muted hover:text-accent px-1.5 py-0.5 rounded bg-surface-lighter"
                          >
                            Commencer
                          </button>
                        )}
                        <button
                          onClick={() => updateStatus(item, 'watched')}
                          className="text-[10px] text-text-muted hover:text-success px-1.5 py-0.5 rounded bg-surface-lighter flex items-center gap-0.5"
                        >
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Ajouter un contenu</h3>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-2">
              {([['movie', 'Film', Film], ['series', 'Série', Tv], ['documentary', 'Docu', FileVideo]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${type === t ? 'bg-primary/20 text-primary ring-1 ring-primary' : 'bg-surface-lighter text-text-muted'}`}
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
              className="input"
              autoFocus
            />

            <textarea
              placeholder="Notes (optionnel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input"
            />

            <button onClick={addItem} disabled={saving || !title.trim()} className="btn btn-primary w-full">
              {saving ? '...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
