import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { ListTodo, Plus, Check, X, ChevronRight, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { TodoList, TodoItem } from '@/types/database'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { BTN_PRIMARY, BTN_GHOST, INPUT, CARD, CARD_EDGE } from '@/lib/ui'

const EMOJIS = ['📋', '🏠', '✈️', '🎁', '💰', '📦', '🍳', '💪', '📚', '🎯']

/** Section "Projets communs" — listes de tâches partagées. Rendue dans l'onglet "À deux". */
export default function TodosSection() {
  const { profile } = useAuthStore()
  const [lists, setLists] = useState<TodoList[]>([])
  const [items, setItems] = useState<Record<string, TodoItem[]>>({})
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [showNewList, setShowNewList] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [newListEmoji, setNewListEmoji] = useState('📋')
  const [newItemTitle, setNewItemTitle] = useState('')
  const [saving, setSaving] = useState(false)

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

  /* ═══ Vue liste active ═══ */
  if (activeList) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveListId(null)} className="text-[#8A8177] hover:text-[#F0EAE0] transition-colors duration-300 p-1 -m-1" aria-label="Retour aux listes">
            <ChevronRight size={18} className="rotate-180" aria-hidden="true" />
          </button>
          <h3 className="text-base font-light tracking-tight flex items-center gap-2 text-[#F0EAE0]">
            <span aria-hidden="true">{activeList.emoji}</span>
            {activeList.title}
          </h3>
          <span className="text-xs tracking-wide text-[#8A8177] ml-auto tabular-nums">{doneCount}/{activeItems.length}</span>
        </div>

        {activeItems.length > 0 && (
          <div className="w-full bg-[rgba(255,255,255,0.03)] rounded-full h-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={activeItems.length} aria-valuenow={doneCount}>
            <div className="h-full bg-gradient-to-r from-[#D4A574] to-[#C2788E] rounded-full transition-all duration-500" style={{ width: `${(doneCount / activeItems.length) * 100}%` }} />
          </div>
        )}

        <ul className="space-y-1.5">
          {activeItems.map((item) => (
            <li key={item.id} className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${item.is_done ? 'bg-[rgba(255,255,255,0.015)]' : 'bg-[#1E1B17]'}`}>
              <button
                onClick={() => toggleItem(item)}
                role="checkbox"
                aria-checked={item.is_done}
                aria-label={item.title}
                className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50 ${
                  item.is_done ? 'bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'shadow-[0_0_0_2px_rgba(155,146,135,0.3)] hover:shadow-[0_0_0_2px_rgba(212,165,116,0.4)]'
                }`}
              >
                {item.is_done && <Check size={12} className="text-white" aria-hidden="true" />}
              </button>
              <span className={`flex-1 text-sm leading-relaxed ${item.is_done ? 'line-through text-[#8A8177]' : 'text-[#F0EAE0]'}`}>{item.title}</span>
              <button onClick={() => deleteItem(item)} className="text-[#8A8177]/40 hover:text-red-400 transition-colors duration-300 p-1" aria-label={`Supprimer ${item.title}`}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
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
          <button onClick={addItem} disabled={!newItemTitle.trim()} className={`${BTN_PRIMARY} px-3`} aria-label="Ajouter la tâche">
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>

        {activeList.created_by === profile?.id && (
          <button onClick={() => deleteList(activeList)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs tracking-wide font-medium text-red-400/70 bg-transparent hover:text-red-400 hover:bg-[rgba(239,68,68,0.06)] transition-all duration-300 mt-4">
            <Trash2 size={14} aria-hidden="true" /> Supprimer cette liste
          </button>
        )}
      </div>
    )
  }

  /* ═══ Vue d'ensemble ═══ */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#8A8177]">Vos listes partagées : courses, préparatifs, projets…</p>
        <button onClick={() => setShowNewList(true)} className={`${BTN_PRIMARY} shrink-0 whitespace-nowrap`}>
          <Plus size={14} aria-hidden="true" /> Nouvelle liste
        </button>
      </div>

      {lists.length === 0 && !showNewList && (
        <div className={`${CARD} text-center py-12`}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="w-14 h-14 rounded-2xl bg-[rgba(212,165,116,0.1)] flex items-center justify-center mx-auto mb-4">
            <ListTodo size={24} className="text-[#D4A574]/60" aria-hidden="true" />
          </div>
          <p className="text-[#9B9287] text-sm leading-relaxed">Aucune liste pour l'instant</p>
          <p className="text-[#8A8177] text-xs tracking-wide mt-1.5">Crée une liste pour organiser vos projets à deux</p>
        </div>
      )}

      {showNewList && (
        <form onSubmit={createList} className={`${CARD} space-y-3`}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Emoji">
            {EMOJIS.map((e) => (
              <button type="button" key={e} onClick={() => setNewListEmoji(e)} aria-label={`Emoji ${e}`} aria-pressed={newListEmoji === e}
                className={`text-xl p-1.5 rounded-lg transition-all duration-300 ${newListEmoji === e ? 'bg-[rgba(212,165,116,0.15)] shadow-[0_0_12px_rgba(212,165,116,0.1)]' : 'hover:bg-[rgba(212,165,116,0.06)]'}`}>
                {e}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Nom de la liste" aria-label="Nom de la liste" value={newListTitle} onChange={(e) => setNewListTitle(e.target.value)} className={INPUT} maxLength={80} autoFocus />
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowNewList(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
            <button type="submit" disabled={saving || !newListTitle.trim()} className={`${BTN_PRIMARY} flex-1 py-2.5`}>{saving ? '…' : 'Créer'}</button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {lists.map((list) => {
          const listItems = items[list.id]
          const done = listItems?.filter((i) => i.is_done).length ?? 0
          const total = listItems?.length ?? 0
          return (
            <li key={list.id}>
              <button
                onClick={() => setActiveListId(list.id)}
                className={`${CARD} hover:bg-[#252118] w-full text-left flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/40`}
              >
                <div className={CARD_EDGE} aria-hidden="true" />
                <span className="text-2xl" aria-hidden="true">{list.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-[#F0EAE0]">{list.title}</p>
                  {total > 0 && <p className="text-xs tracking-wide text-[#8A8177] tabular-nums">{done}/{total} terminée{done > 1 ? 's' : ''}</p>}
                </div>
                <ChevronRight size={16} className="text-[#8A8177] group-hover:text-[#B5ACA1] transition-colors duration-300" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
