import { useEffect, useRef, useState, useCallback, type FormEvent } from 'react'
import { ListTodo, Plus, Check, X, ChevronRight, ChevronLeft, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { TodoList, TodoItem } from '@/types/database'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { BTN_PRIMARY, BTN_GHOST, INPUT, CARD, CARD_EDGE, LABEL } from '@/lib/ui'

const EMOJIS = ['📋', '🏠', '✈️', '🎁', '💰', '📦', '🍳', '💪', '📚', '🎯']

/** Bouton de suppression discret — invisible au repos sur desktop, mais cible ≥ 44px */
const DELETE_BTN =
  'p-2.5 -m-2.5 shrink-0 rounded-full text-[#9B9287] hover:text-[#F0A5AD] hover:bg-[rgba(224,108,117,0.10)] transition-all duration-200 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100'

interface Props {
  /** À chaque changement de valeur, la modale « Nouvelle liste » s'ouvre (piloté par l'en-tête de page) */
  openSignal?: number
}

/** Section "Projets communs" — listes de tâches partagées. Rendue dans l'onglet "À deux". */
export default function TodosSection({ openSignal }: Props) {
  const { profile } = useAuthStore()
  const [lists, setLists] = useState<TodoList[]>([])
  const [items, setItems] = useState<Record<string, TodoItem[]>>({})
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [showNewList, setShowNewList] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [newListEmoji, setNewListEmoji] = useState('📋')
  const [newItemTitle, setNewItemTitle] = useState('')
  const [saving, setSaving] = useState(false)

  // Ouverture pilotée depuis l'en-tête de page (bouton « Nouvelle liste »).
  // On mémorise la valeur au montage pour ne pas rouvrir la modale au retour sur l'onglet.
  const seenSignal = useRef(openSignal)
  useEffect(() => {
    if (openSignal !== seenSignal.current) { seenSignal.current = openSignal; setShowNewList(true) }
  }, [openSignal])

  const fetchLists = useCallback(async () => {
    const { data } = await run(supabase.from('todo_lists').select('*').order('created_at', { ascending: false }), { errorMessage: 'Impossible de charger les listes.' })
    if (data) setLists(data)
  }, [])

  const fetchItems = useCallback(async (listId: string) => {
    const { data } = await supabase.from('todo_items').select('*').eq('list_id', listId).order('created_at', { ascending: true })
    if (data) setItems((prev) => ({ ...prev, [listId]: data }))
  }, [])

  const fetchAllItems = useCallback(async () => {
    const { data } = await supabase.from('todo_items').select('*').order('created_at', { ascending: true })
    if (data) {
      const grouped: Record<string, TodoItem[]> = {}
      data.forEach((it) => { (grouped[it.list_id] ||= []).push(it) })
      setItems(grouped)
    }
  }, [])

  useEffect(() => {
    fetchLists()
    fetchAllItems()
    const channel = supabase
      .channel(`todos:${profile?.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_lists' }, () => fetchLists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items' }, () => fetchAllItems())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchLists, fetchAllItems, profile?.id])

  const createList = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!profile || !newListTitle.trim()) return
    setSaving(true)
    const { ok } = await run(
      supabase.from('todo_lists').insert({ title: newListTitle.trim(), emoji: newListEmoji, created_by: profile.id }),
      { errorMessage: "La liste n'a pas pu être créée." },
    )
    setSaving(false)
    if (ok) { setNewListTitle(''); setNewListEmoji('📋'); setShowNewList(false); fetchLists() }
  }

  const addItem = async () => {
    const title = newItemTitle.trim()
    if (!activeListId || !title) return
    setNewItemTitle('')
    const { ok } = await run(supabase.from('todo_items').insert({ list_id: activeListId, title }), { errorMessage: "La tâche n'a pas pu être ajoutée." })
    if (ok) fetchItems(activeListId); else setNewItemTitle(title)
  }

  const toggleItem = async (item: TodoItem) => {
    // Optimiste
    setItems((prev) => ({ ...prev, [item.list_id]: (prev[item.list_id] ?? []).map((i) => (i.id === item.id ? { ...i, is_done: !i.is_done } : i)) }))
    const { ok } = await run(supabase.from('todo_items').update({ is_done: !item.is_done }).eq('id', item.id))
    if (!ok) fetchItems(item.list_id)
  }

  const deleteItem = async (item: TodoItem) => {
    const { ok } = await run(supabase.from('todo_items').delete().eq('id', item.id), { errorMessage: 'Suppression impossible.' })
    if (ok) fetchItems(item.list_id)
  }

  const deleteList = async (list: TodoList) => {
    const n = items[list.id]?.length ?? 0
    const yes = await confirm({
      title: 'Supprimer cette liste ?',
      message: n > 0 ? `« ${list.title} » et ses ${n} tâche${n > 1 ? 's' : ''} seront supprimées pour vous deux.` : `« ${list.title} » sera supprimée pour vous deux.`,
      confirmLabel: 'Supprimer', danger: true,
    })
    if (!yes) return
    // Les tâches sont supprimées en cascade côté base
    const { ok } = await run(supabase.from('todo_lists').delete().eq('id', list.id), { errorMessage: 'Suppression impossible. Seul le créateur de la liste peut la supprimer.' })
    if (ok) { setActiveListId(null); fetchLists() }
  }

  const activeList = lists.find((l) => l.id === activeListId)
  const activeItems = activeListId ? items[activeListId] ?? [] : []
  const doneCount = activeItems.filter((i) => i.is_done).length
  const pct = activeItems.length > 0 ? (doneCount / activeItems.length) * 100 : 0

  /* ═══ Modale « Nouvelle liste » ═══ */
  const newListModal = showNewList && (
    <Modal title="Nouvelle liste" description="Courses, préparatifs, projets… tout ce que vous suivez à deux." onClose={() => setShowNewList(false)}>
      <form onSubmit={createList} className="space-y-4">
        <div>
          <span className={LABEL}>Emoji</span>
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Emoji">
            {EMOJIS.map((e) => (
              <button type="button" key={e} onClick={() => setNewListEmoji(e)} aria-label={`Emoji ${e}`} aria-pressed={newListEmoji === e}
                className={`size-11 grid place-items-center rounded-xl text-[20px] transition-all duration-200 ${newListEmoji === e ? 'bg-[#D4A574]/15 shadow-[inset_0_0_0_1.5px_rgba(212,165,116,0.45)]' : 'bg-white/[0.03] hover:bg-[#D4A574]/10'}`}>
                <span className="emoji" aria-hidden="true">{e}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="tl-title" className={LABEL}>Nom de la liste</label>
          <input id="tl-title" type="text" placeholder="Ex : Courses du week-end" value={newListTitle} onChange={(e) => setNewListTitle(e.target.value)} className={INPUT} maxLength={80} autoFocus />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowNewList(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
          <button type="submit" disabled={saving || !newListTitle.trim()} className={`${BTN_PRIMARY} flex-1`}>{saving ? '…' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  )

  /* ═══ Vue liste active ═══ */
  if (activeList) {
    return (
      <div className="reveal">
        <div className={CARD}>
          <div className={CARD_EDGE} aria-hidden="true" />

          <div className="flex items-center gap-2">
            <button onClick={() => setActiveListId(null)} className="p-2.5 -m-2.5 mr-1 shrink-0 rounded-full text-[#9B9287] hover:text-[#F0EAE0] hover:bg-white/[0.06] transition-colors duration-200" aria-label="Retour aux listes">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <h2 className="font-display text-[20px] leading-tight text-[#F0EAE0] flex items-center gap-2 min-w-0">
              <span className="emoji shrink-0" aria-hidden="true">{activeList.emoji}</span>
              <span className="truncate">{activeList.title}</span>
            </h2>
            <span className="num ml-auto shrink-0 text-[13px] text-[#9B9287]">{doneCount}/{activeItems.length}</span>
          </div>

          {activeItems.length > 0 && (
            <div className="mt-4 h-1.5 rounded-full bg-[#F0EAE0]/[0.07] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={activeItems.length} aria-valuenow={doneCount} aria-label={`Avancement de ${activeList.title}`}>
              <div className="h-full rounded-full bg-gradient-to-r from-[#D4A574] to-[#C2788E] transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          )}

          {activeItems.length > 0 ? (
            <ul className="mt-4 divide-y divide-[#F0EAE0]/[0.05]">
              {activeItems.map((item) => (
                <li key={item.id} className="group flex items-center gap-2 py-1.5">
                  <button
                    onClick={() => toggleItem(item)}
                    role="checkbox"
                    aria-checked={item.is_done}
                    aria-label={item.title}
                    className="size-11 -ml-1.5 shrink-0 grid place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50"
                  >
                    <span className={`grid size-[22px] place-items-center rounded-[7px] transition-all duration-200 ${
                      item.is_done ? 'bg-[#D4A574] text-[#110F0E]' : 'text-transparent shadow-[inset_0_0_0_2px_rgba(155,146,135,0.35)] group-hover:shadow-[inset_0_0_0_2px_rgba(212,165,116,0.5)]'
                    }`} aria-hidden="true">
                      <Check size={13} strokeWidth={3} />
                    </span>
                  </button>
                  <span className={`flex-1 min-w-0 text-[15px] leading-snug ${item.is_done ? 'line-through text-[#9B9287]' : 'text-[#F0EAE0]'}`}>{item.title}</span>
                  <button onClick={() => deleteItem(item)} className={DELETE_BTN} aria-label={`Supprimer ${item.title}`}>
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-[#9B9287] leading-relaxed">Cette liste est encore toute neuve — ajoutez la première tâche ci-dessous.</p>
          )}

          <div className="mt-4 flex gap-2">
            <input
              type="text"
              placeholder="Ajouter une tâche…"
              aria-label="Nouvelle tâche"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem()}
              maxLength={200}
              className={`${INPUT} flex-1`}
            />
            <button onClick={addItem} disabled={!newItemTitle.trim()} className={`${BTN_PRIMARY} px-4 shrink-0`} aria-label="Ajouter la tâche">
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>

          {activeList.created_by === profile?.id && (
            <div className="mt-5 pt-4 border-t border-[#F0EAE0]/[0.05]">
              <button onClick={() => deleteList(activeList)} className="btn-tertiary text-[#F0A5AD]/85 hover:text-[#F0A5AD]">
                <Trash2 size={13} aria-hidden="true" /> Supprimer cette liste
              </button>
            </div>
          )}
        </div>

        {newListModal}
      </div>
    )
  }

  /* ═══ Vue d'ensemble ═══ */
  return (
    <div className="space-y-4 reveal">
      {lists.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Aucune liste, pour l’instant"
          text="Créez une première liste — courses, préparatifs de voyage, petits projets — et cochez-la à deux."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {lists.map((list) => {
            const listItems = items[list.id]
            const done = listItems?.filter((i) => i.is_done).length ?? 0
            const total = listItems?.length ?? 0
            return (
              <li key={list.id}>
                <button
                  onClick={() => setActiveListId(list.id)}
                  className={`${CARD} w-full text-left flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/40`}
                >
                  <div className={CARD_EDGE} aria-hidden="true" />
                  <span className="size-11 shrink-0 rounded-full grid place-items-center text-[20px] bg-gradient-to-br from-[#D4A574]/15 to-[#C2788E]/15 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]">
                    <span className="emoji" aria-hidden="true">{list.emoji}</span>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] leading-snug text-[#F0EAE0] line-clamp-2">{list.title}</p>
                    <p className="mt-0.5 text-[13px] text-[#9B9287]">
                      {total > 0
                        ? <><span className="num">{done}/{total}</span> terminée{done > 1 ? 's' : ''}</>
                        : 'Liste vide'}
                    </p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-[#9B9287] group-hover:text-[#F0EAE0] transition-colors duration-200" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {newListModal}
    </div>
  )
}
