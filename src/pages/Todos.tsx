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

  if (activeList) {
    return (
      <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveListId(null)} className="text-text-muted hover:text-text">
            <ChevronRight size={18} className="rotate-180" />
          </button>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>{activeList.emoji}</span>
            {activeList.title}
          </h2>
          <span className="text-xs text-text-muted ml-auto">{doneCount}/{activeItems.length}</span>
        </div>

        {activeItems.length > 0 && (
          <div className="w-full bg-surface-lighter rounded-full h-1.5">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all"
              style={{ width: `${activeItems.length > 0 ? (doneCount / activeItems.length) * 100 : 0}%` }}
            />
          </div>
        )}

        <div className="space-y-1.5">
          {activeItems.map((item) => (
            <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg ${item.is_done ? 'bg-surface/50' : 'bg-surface-lighter'}`}>
              <button onClick={() => toggleItem(item)} className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${item.is_done ? 'bg-success border-success' : 'border-text-muted hover:border-primary'}`}>
                {item.is_done && <Check size={12} className="text-white" />}
              </button>
              <span className={`flex-1 text-sm ${item.is_done ? 'line-through text-text-muted' : ''}`}>
                {item.title}
              </span>
              <button onClick={() => deleteItem(item)} className="text-text-muted/50 hover:text-danger">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Ajouter une tâche..."
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            className="input flex-1"
          />
          <button onClick={addItem} disabled={!newItemTitle.trim()} className="btn btn-primary px-3">
            <Plus size={16} />
          </button>
        </div>

        <button onClick={() => deleteList(activeList.id)} className="btn btn-ghost w-full text-danger text-xs mt-4">
          <Trash2 size={14} /> Supprimer cette liste
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ListTodo size={18} className="text-primary" />
          Projets communs
        </h2>
        <button onClick={() => setShowNewList(true)} className="btn btn-primary text-xs px-3 py-1.5">
          <Plus size={14} /> Nouvelle liste
        </button>
      </div>

      {lists.length === 0 && !showNewList && (
        <div className="card text-center py-10">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-text-muted text-sm">Aucune liste pour l'instant</p>
          <p className="text-xs text-text-muted mt-1">Crée une liste pour organiser vos projets à deux</p>
        </div>
      )}

      {showNewList && (
        <div className="card space-y-3">
          <div className="flex gap-2 flex-wrap">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setNewListEmoji(e)}
                className={`text-xl p-1.5 rounded-lg transition-colors ${newListEmoji === e ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-surface-lighter'}`}
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
            className="input"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={() => setShowNewList(false)} className="btn btn-ghost flex-1">Annuler</button>
            <button onClick={createList} disabled={saving || !newListTitle.trim()} className="btn btn-primary flex-1">
              {saving ? '...' : 'Créer'}
            </button>
          </div>
        </div>
      )}

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
              className="card w-full text-left flex items-center gap-3"
            >
              <span className="text-2xl">{list.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{list.title}</p>
                {total > 0 && (
                  <p className="text-xs text-text-muted">{done}/{total} terminé{done > 1 ? 's' : ''}</p>
                )}
              </div>
              <ChevronRight size={16} className="text-text-muted" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
