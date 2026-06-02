import { useEffect, useState } from 'react'
import { ListTodo, Plus, Check, X, ChevronRight, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { TodoList, TodoItem } from '@/types/database'

export default function Todos() {
  const { profile } = useAuthStore()
  const [lists, setLists] = useState<TodoList[]>([])
  const [items, setItems] = useState<Record<string, TodoItem[]>>({})
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [showNewList, setShowNewList] = useState(false)
  const [newListTitle, setNewListTitle] = useState('')
  const [newListEmoji, setNewListEmoji] = useState('📋')
  const [newItemTitle, setNewItemTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const EMOJIS = ['📋', '🏠', '✈️', '🎁', '💰', '📦', '🍳', '💪', '📚', '🎯']

  const fetchLists = async () => {
    const { data } = await supabase
      .from('todo_lists')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setLists(data)
  }

  const fetchItems = async (listId: string) => {
    const { data } = await supabase
      .from('todo_items')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: true })

    if (data) setItems((prev) => ({ ...prev, [listId]: data }))
  }

  useEffect(() => {
    fetchLists()

    const channel = supabase
      .channel('todos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_lists' }, () => fetchLists())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todo_items' }, () => {
        if (activeListId) fetchItems(activeListId)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeListId])

  useEffect(() => {
    if (activeListId) fetchItems(activeListId)
  }, [activeListId])

  const createList = async () => {
    if (!profile || !newListTitle.trim()) return
    setSaving(true)

    await supabase.from('todo_lists').insert({
      title: newListTitle.trim(),
      emoji: newListEmoji,
      created_by: profile.id,
    })

    setNewListTitle('')
    setNewListEmoji('📋')
    setShowNewList(false)
    setSaving(false)
    fetchLists()
  }

  const addItem = async () => {
    if (!activeListId || !newItemTitle.trim()) return

    await supabase.from('todo_items').insert({
      list_id: activeListId,
      title: newItemTitle.trim(),
    })

    setNewItemTitle('')
    fetchItems(activeListId)
  }

  const toggleItem = async (item: TodoItem) => {
    await supabase
      .from('todo_items')
      .update({ is_done: !item.is_done })
      .eq('id', item.id)

    fetchItems(item.list_id)
  }

  const deleteItem = async (item: TodoItem) => {
    await supabase.from('todo_items').delete().eq('id', item.id)
    fetchItems(item.list_id)
  }

  const deleteList = async (listId: string) => {
    await supabase.from('todo_items').delete().eq('list_id', listId)
    await supabase.from('todo_lists').delete().eq('id', listId)
    setActiveListId(null)
    fetchLists()
  }

  const activeList = lists.find((l) => l.id === activeListId)
  const activeItems = activeListId ? items[activeListId] ?? [] : []
  const doneCount = activeItems.filter((i) => i.is_done).length

  /* ═══════════════ ACTIVE LIST VIEW ═══════════════ */
  if (activeList) {
    return (
      <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
        {/* Header with back */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveListId(null)}
            className="text-[#6B6359] hover:text-[#F0EAE0] transition-colors duration-300"
          >
            <ChevronRight size={18} className="rotate-180" />
          </button>
          <h2 className="text-lg font-light tracking-tight flex items-center gap-2 text-[#F0EAE0]">
            <span>{activeList.emoji}</span>
            {activeList.title}
          </h2>
          <span className="text-[11px] tracking-wide text-[#6B6359] ml-auto">{doneCount}/{activeItems.length}</span>
        </div>

        {/* Progress bar */}
        {activeItems.length > 0 && (
          <div className="w-full bg-[rgba(255,255,255,0.03)] rounded-full h-1.5">
            <div
              className="h-full bg-gradient-to-r from-[#D4A574] to-[#C2788E] rounded-full transition-all duration-500"
              style={{ width: `${activeItems.length > 0 ? (doneCount / activeItems.length) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* Items */}
        <div className="space-y-1.5">
          {activeItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${
                item.is_done ? 'bg-[rgba(255,255,255,0.015)]' : 'bg-[#1E1B17]'
              }`}
            >
              <button
                onClick={() => toggleItem(item)}
                className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all duration-300 ${
                  item.is_done
                    ? 'bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                    : 'shadow-[0_0_0_2px_rgba(155,146,135,0.3)] hover:shadow-[0_0_0_2px_rgba(212,165,116,0.4)]'
                }`}
              >
                {item.is_done && <Check size={12} className="text-white" />}
              </button>
              <span className={`flex-1 text-sm leading-relaxed ${item.is_done ? 'line-through text-[#6B6359]' : 'text-[#F0EAE0]'}`}>
                {item.title}
              </span>
              <button
                onClick={() => deleteItem(item)}
                className="text-[#6B6359]/30 hover:text-red-400 transition-colors duration-300"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Add item input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ajouter une tache..."
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            className="flex-1 bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
          />
          <button
            onClick={addItem}
            disabled={!newItemTitle.trim()}
            className="inline-flex items-center justify-center px-3 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={16} />
          </button>
        </div>

        {/* Delete list */}
        <button
          onClick={() => deleteList(activeList.id)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[11px] tracking-wide font-medium text-red-400/70 bg-transparent hover:text-red-400 hover:bg-[rgba(239,68,68,0.06)] transition-all duration-300 ease-out mt-4"
        >
          <Trash2 size={14} /> Supprimer cette liste
        </button>
      </div>
    )
  }

  /* ═══════════════ LISTS OVERVIEW ═══════════════ */
  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
          <div className="w-8 h-8 rounded-xl bg-[rgba(212,165,116,0.12)] flex items-center justify-center">
            <ListTodo size={16} className="text-[#D4A574]" />
          </div>
          Projets communs
        </h2>
        <button
          onClick={() => setShowNewList(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out"
        >
          <Plus size={14} /> Nouvelle liste
        </button>
      </div>

      {/* Empty state */}
      {lists.length === 0 && !showNewList && (
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] text-center py-12">
          <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />
          <div className="w-14 h-14 rounded-2xl bg-[rgba(212,165,116,0.1)] flex items-center justify-center mx-auto mb-4">
            <ListTodo size={24} className="text-[#D4A574]/60" />
          </div>
          <p className="text-[#9B9287] text-sm leading-relaxed">Aucune liste pour l'instant</p>
          <p className="text-[#6B6359] text-[11px] tracking-wide mt-1.5">Cree une liste pour organiser vos projets a deux</p>
        </div>
      )}

      {/* New list inline form */}
      {showNewList && (
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] space-y-3">
          <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

          <div className="flex gap-2 flex-wrap">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setNewListEmoji(e)}
                className={`text-xl p-1.5 rounded-lg transition-all duration-300 ${
                  newListEmoji === e
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
            placeholder="Nom de la liste"
            value={newListTitle}
            onChange={(e) => setNewListTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createList()}
            className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewList(false)}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[#9B9287] bg-transparent hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] active:scale-[0.98] transition-all duration-300 ease-out"
            >
              Annuler
            </button>
            <button
              onClick={createList}
              disabled={saving || !newListTitle.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? '...' : 'Creer'}
            </button>
          </div>
        </div>
      )}

      {/* Lists */}
      <div className="space-y-2">
        {lists.map((list) => {
          const listItems = items[list.id]
          const done = listItems?.filter((i) => i.is_done).length ?? 0
          const total = listItems?.length ?? 0

          return (
            <button
              key={list.id}
              onClick={() => setActiveListId(list.id)}
              onMouseEnter={() => { if (!items[list.id]) fetchItems(list.id) }}
              className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] hover:bg-[#252118] transition-all duration-500 ease-out w-full text-left flex items-center gap-3 group"
            >
              <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500" />

              <span className="text-2xl">{list.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[#F0EAE0]">{list.title}</p>
                {total > 0 && (
                  <p className="text-[11px] tracking-wide text-[#6B6359]">{done}/{total} termine{done > 1 ? 's' : ''}</p>
                )}
              </div>
              <ChevronRight size={16} className="text-[#6B6359] group-hover:text-[#9B9287] transition-colors duration-300" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
