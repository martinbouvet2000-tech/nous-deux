import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, X, Film, Tv, FileVideo, Star, Check, Play, Compass, MapPin, Utensils, Palette, Sparkles, Trophy, ListTodo } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { WatchItem, BucketItem } from '@/types/database'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import Tabs from '@/components/ui/Tabs'
import EmptyState from '@/components/ui/EmptyState'
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

/** Pastilles de statut — toujours dans la palette chaude (or / rose), jamais de vert */
const STATUS_CHIP: Record<WatchItem['status'], string> = {
  to_watch: 'bg-white/[0.05] text-[#9B9287]',
  watching: 'bg-[#E8B86D]/12 text-[#E8B86D]',
  watched: 'bg-[#D4A574]/12 text-[#D4A574]',
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

const TABS: { key: MainTab; label: string; icon: typeof Film }[] = [
  { key: 'watch', label: 'Films & séries', icon: Film },
  { key: 'bucket', label: 'Nos rêves', icon: Compass },
  { key: 'projects', label: 'Projets', icon: ListTodo },
]

const SUBTITLES: Record<MainTab, string> = {
  watch: 'Tout ce qu’on se garde pour les soirs à deux — films, séries et documentaires.',
  bucket: 'La liste de tout ce qu’on veut vivre ensemble, un jour ou l’autre.',
  projects: 'Vos listes partagées : courses, préparatifs, projets…',
}

const ACTION_LABELS: Record<MainTab, string> = {
  watch: 'Ajouter un film',
  bucket: 'Ajouter un rêve',
  projects: 'Nouvelle liste',
}

/** Pastille ronde or/rose — vocabulaire visuel commun aux cartes de cette page */
const MEDALLION =
  'size-11 shrink-0 rounded-full grid place-items-center bg-gradient-to-br from-[#D4A574]/15 to-[#C2788E]/15 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]'

/** Bouton de suppression discret — invisible au repos sur desktop, mais cible ≥ 44px */
const DELETE_BTN =
  'p-2.5 -m-2.5 shrink-0 rounded-full text-[#9B9287] hover:text-[#F0A5AD] hover:bg-[rgba(224,108,117,0.10)] transition-all duration-200 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100'

/** Filtres secondaires — une seule rangée de chips, un seul style d'état actif */
function FilterChips<K extends string>({ options, value, onChange, label }: {
  options: { key: K; label: string }[]
  value: K
  onChange: (k: K) => void
  label: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.06)] h-10"
    >
      {options.map((o) => {
        const active = value === o.key
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`h-8 px-4 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50 ${
              active ? 'bg-[#D4A574]/15 text-[#D4A574]' : 'text-[#9B9287] hover:text-[#F0EAE0]'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function Activities() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const mainTab: MainTab = raw === 'bucket' || raw === 'projects' ? raw : 'watch'
  const setMainTab = (t: MainTab) => setParams(t === 'watch' ? {} : { tab: t }, { replace: true })

  // Les modales des sous-sections sont pilotées depuis l'en-tête de page
  const [watchOpen, setWatchOpen] = useState(false)
  const [bucketOpen, setBucketOpen] = useState(false)
  const [projectsSignal, setProjectsSignal] = useState(0)

  const openFromHeader = () => {
    if (mainTab === 'watch') setWatchOpen(true)
    else if (mainTab === 'bucket') setBucketOpen(true)
    else setProjectsSignal((n) => n + 1)
  }

  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl xl:max-w-[1160px] xl:px-10 mx-auto space-y-6">
      <PageHeader
        eyebrow="À deux"
        title="Nos envies"
        accent="à deux"
        subtitle={SUBTITLES[mainTab]}
        action={
          <button onClick={openFromHeader} className={BTN_PRIMARY}>
            <Plus size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{ACTION_LABELS[mainTab]}</span>
            <span className="sr-only sm:hidden">{ACTION_LABELS[mainTab]}</span>
          </button>
        }
        tabs={<Tabs tabs={TABS} value={mainTab} onChange={setMainTab} label="Sections" />}
      />

      {mainTab === 'watch' && <WatchSection open={watchOpen} onClose={() => setWatchOpen(false)} />}
      {mainTab === 'bucket' && <BucketSection open={bucketOpen} onClose={() => setBucketOpen(false)} />}
      {mainTab === 'projects' && <TodosSection openSignal={projectsSignal} />}
    </div>
  )
}

/* ═══════════════ WATCH SECTION ═══════════════ */
function WatchSection({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuthStore()
  const [items, setItems] = useState<WatchItem[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
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
    if (ok) { setTitle(''); setNotes(''); onClose(); fetchItems() }
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

  const emptyText = filter === 'all'
    ? 'Ajoutez un film, une série ou un documentaire — et gardez-le au chaud pour votre prochaine soirée.'
    : 'Rien dans ce filtre pour l’instant. Essayez « Tout » pour voir toute votre liste.'

  return (
    <div className="space-y-5 reveal">
      <FilterChips options={filters} value={filter} onChange={setFilter} label="Filtrer par statut" />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Film}
          title={filter === 'all' ? 'Rien à regarder ensemble, pour l’instant' : `Aucun titre « ${filters.find((f) => f.key === filter)?.label} »`}
          text={emptyText}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const Icon = TYPE_ICONS[item.type]
            return (
              <article key={item.id} className={`${CARD} group flex flex-col gap-3`}>
                <div className={CARD_EDGE} aria-hidden="true" />

                <div className="flex items-start gap-3">
                  <span className={MEDALLION} aria-hidden="true">
                    <Icon size={17} className="text-[#D4A574]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] leading-snug text-[#F0EAE0] text-balance font-normal">{item.title}</h2>
                    <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[item.status]}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <button onClick={() => deleteItem(item)} className={DELETE_BTN} aria-label={`Retirer ${item.title}`}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>

                {item.notes && <p className="text-[13px] leading-relaxed text-[#9B9287]">{item.notes}</p>}

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex -ml-1.5" role="group" aria-label={`Note de ${item.title}`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => updateRating(item, star)}
                        className="p-1.5 rounded-full transition-colors duration-200 hover:bg-white/[0.05]"
                        aria-label={`Noter ${star} sur 5`}
                      >
                        <Star size={20} className={`size-5 ${item.rating && star <= item.rating ? 'fill-[#D4A574] text-[#D4A574]' : 'text-[#F0EAE0]/25'}`} aria-hidden="true" />
                      </button>
                    ))}
                  </div>

                  {item.status !== 'watched' && (
                    <div className="flex items-center gap-2">
                      {item.status === 'to_watch' && (
                        <button
                          onClick={() => updateStatus(item, 'watching')}
                          className="h-9 px-4 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 text-[#F0EAE0]/90 bg-white/[0.055] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-white/[0.09] transition-colors duration-200"
                        >
                          <Play size={13} aria-hidden="true" /> Commencer
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus(item, 'watched')}
                        className="h-9 px-4 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 bg-[#D4A574]/12 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.25)] hover:bg-[#D4A574]/20 transition-colors duration-200"
                      >
                        <Check size={13} aria-hidden="true" /> Vu
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {open && (
        <Modal title="Ajouter un film ou une série" onClose={onClose}>
          <form onSubmit={addItem} className="space-y-4">
            <div className="flex gap-2" role="radiogroup" aria-label="Type">
              {([['movie', 'Film', Film], ['series', 'Série', Tv], ['documentary', 'Docu', FileVideo]] as const).map(([t, label, Icon]) => (
                <button
                  type="button"
                  key={t}
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                    type === t ? 'bg-[#D4A574]/15 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.25)]' : 'bg-white/[0.04] text-[#9B9287] hover:text-[#F0EAE0]'
                  }`}
                >
                  <Icon size={15} aria-hidden="true" /> {label}
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
              <button type="button" onClick={onClose} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={saving || !title.trim()} className={`${BTN_PRIMARY} flex-1`}>{saving ? '…' : 'Ajouter'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

/* ═══════════════ BUCKET LIST SECTION ═══════════════ */
function BucketSection({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuthStore()
  const [items, setItems] = useState<BucketItem[]>([])
  const [filter, setFilter] = useState<BucketFilter>('all')
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
    if (ok) { setTitle(''); onClose(); fetchItems() }
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

  const filters: { key: BucketFilter; label: string }[] = [
    { key: 'all', label: 'Tout' },
    { key: 'todo', label: 'À faire' },
    { key: 'done', label: 'Fait' },
  ]

  return (
    <div className="space-y-5 reveal">
      {/* Progression — seulement quand il y a quelque chose à célébrer */}
      {doneCount > 0 && (
        <div className={CARD}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="text-[13px] text-[#9B9287]">
              <span className="num text-[#F0EAE0]">{doneCount}</span> rêve{doneCount > 1 ? 's' : ''} accompli{doneCount > 1 ? 's' : ''} sur <span className="num">{items.length}</span>
            </p>
            <p className="font-display num text-[17px] text-[#D4A574]">{progress}%</p>
          </div>
          <div className="h-1.5 rounded-full bg-[#F0EAE0]/[0.07] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Rêves accomplis">
            <div className="h-full rounded-full bg-gradient-to-r from-[#D4A574] to-[#C2788E] transition-[width] duration-700" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <FilterChips options={filters} value={filter} onChange={setFilter} label="Filtrer les rêves" />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Compass}
          title={filter === 'all' ? 'Aucun rêve écrit, pour l’instant' : filter === 'done' ? 'Rien d’accompli — mais ça vient' : 'Tout est déjà vécu !'}
          text={filter === 'all' ? 'Notez ici les voyages, les envies et les petites folies que vous voulez vivre à deux.' : 'Changez de filtre pour retrouver le reste de votre liste.'}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const cat = BUCKET_CATEGORIES.find(c => c.key === item.category)
            return (
              <article key={item.id} className={`${CARD} group flex items-center gap-3`}>
                <div className={CARD_EDGE} aria-hidden="true" />

                <button
                  onClick={() => toggleDone(item)}
                  role="checkbox"
                  aria-checked={item.is_done}
                  aria-label={`${item.is_done ? 'Marquer comme à faire' : 'Marquer comme accompli'} : ${item.title}`}
                  className={`${MEDALLION} transition-all duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50`}
                >
                  {item.is_done
                    ? <Check size={19} className="text-[#D4A574]" aria-hidden="true" />
                    : <span className="emoji text-[20px] leading-none" aria-hidden="true">{item.emoji}</span>}
                </button>

                <div className="flex-1 min-w-0">
                  <h2 className={`text-[15px] leading-snug font-normal ${item.is_done ? 'line-through text-[#9B9287]' : 'text-[#F0EAE0]'}`}>{item.title}</h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[#9B9287]">
                    {cat && (
                      <span>
                        <span className="emoji" aria-hidden="true">{cat.emoji}</span> {cat.label}
                      </span>
                    )}
                    {item.is_done && item.done_date && (
                      <span className="num text-[#D4A574]">{format(parseISO(item.done_date), 'd MMM yyyy', { locale: fr })}</span>
                    )}
                  </div>
                </div>

                <button onClick={() => deleteItem(item)} className={DELETE_BTN} aria-label={`Retirer ${item.title}`}>
                  <X size={16} aria-hidden="true" />
                </button>
              </article>
            )
          })}
        </div>
      )}

      {open && (
        <Modal title="Ajouter un rêve" onClose={onClose}>
          <form onSubmit={addItem} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Catégorie">
              {BUCKET_CATEGORIES.map(cat => (
                <button
                  type="button"
                  key={cat.key}
                  role="radio"
                  aria-checked={category === cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`min-h-11 flex items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                    category === cat.key ? 'bg-[#D4A574]/15 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.25)]' : 'bg-white/[0.04] text-[#9B9287] hover:text-[#F0EAE0]'
                  }`}
                >
                  <span className="emoji" aria-hidden="true">{cat.emoji}</span> {cat.label}
                </button>
              ))}
            </div>
            <div>
              <span className={LABEL}>Emoji</span>
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Emoji">
                {BUCKET_EMOJIS.map(e => (
                  <button type="button" key={e} onClick={() => setEmoji(e)} aria-label={`Emoji ${e}`} aria-pressed={emoji === e}
                    className={`size-11 grid place-items-center rounded-xl text-[20px] transition-all duration-200 ${emoji === e ? 'bg-[#D4A574]/15 shadow-[inset_0_0_0_1.5px_rgba(212,165,116,0.45)]' : 'bg-white/[0.03] hover:bg-[#D4A574]/10'}`}>
                    <span className="emoji" aria-hidden="true">{e}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="b-title" className={LABEL}>Le rêve</label>
              <input id="b-title" type="text" placeholder="Ex : Voir les aurores boréales ensemble" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} maxLength={120} required autoFocus />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={saving || !title.trim()} className={`${BTN_PRIMARY} flex-1`}>{saving ? '…' : 'Ajouter à la liste'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
