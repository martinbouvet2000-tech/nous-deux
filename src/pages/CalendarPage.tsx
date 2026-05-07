import { useEffect, useState } from 'react'
import { Calendar, Plus, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { CalendarEvent } from '@/types/database'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
} from 'date-fns'
import { fr } from 'date-fns/locale'

const COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444']

export default function CalendarPage() {
  const { profile } = useAuthStore()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('calendar_events')
      .select('*')
      .order('start_at', { ascending: true })

    if (data) setEvents(data)
  }

  useEffect(() => {
    fetchEvents()

    const channel = supabase
      .channel('calendar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        fetchEvents()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const eventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(parseISO(e.start_at), day))

  const selectedDayEvents = selectedDate
    ? events.filter((e) => isSameDay(parseISO(e.start_at), selectedDate))
    : []

  const openForm = (date?: Date) => {
    const d = date ?? selectedDate ?? new Date()
    const dateStr = format(d, 'yyyy-MM-dd')
    setStartAt(`${dateStr}T10:00`)
    setEndAt(`${dateStr}T11:00`)
    setTitle('')
    setDescription('')
    setColor(COLORS[0])
    setShowForm(true)
  }

  const saveEvent = async () => {
    if (!profile || !title.trim() || !startAt || !endAt) return
    setSaving(true)

    await supabase.from('calendar_events').insert({
      created_by: profile.id,
      title: title.trim(),
      description: description.trim() || null,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      color,
      is_shared: true,
    })

    setShowForm(false)
    setSaving(false)
    fetchEvents()
  }

  const deleteEvent = async (id: string) => {
    await supabase.from('calendar_events').delete().eq('id', id)
    fetchEvents()
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calendar size={18} className="text-primary" />
          Agenda partagé
        </h2>
        <button onClick={() => openForm()} className="btn btn-primary text-xs px-3 py-1.5">
          <Plus size={14} /> Ajouter
        </button>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-surface-lighter">
            <ChevronLeft size={18} />
          </button>
          <h3 className="font-semibold capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: fr })}
          </h3>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 rounded-lg hover:bg-surface-lighter">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((d) => (
            <div key={d} className="text-center text-xs text-text-muted font-medium py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isToday = isSameDay(day, new Date())
            const isSelected = selectedDate && isSameDay(day, selectedDate)
            const dayEvents = eventsForDay(day)

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`relative p-1.5 rounded-lg text-sm transition-colors ${
                  !isCurrentMonth ? 'text-text-muted/40' : ''
                } ${isToday ? 'ring-1 ring-primary' : ''} ${
                  isSelected ? 'bg-primary/20 text-primary' : 'hover:bg-surface-lighter'
                }`}
              >
                {format(day, 'd')}
                {dayEvents.length > 0 && (
                  <div className="flex justify-center gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <div key={e.id} className="w-1 h-1 rounded-full" style={{ backgroundColor: e.color }} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold capitalize">
              {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
            </h3>
            <button onClick={() => openForm(selectedDate)} className="text-primary text-xs flex items-center gap-1">
              <Plus size={12} /> Ajouter
            </button>
          </div>

          {selectedDayEvents.length === 0 ? (
            <p className="text-text-muted text-xs py-4 text-center">Aucun événement</p>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-surface-lighter">
                  <div className="w-1 h-full min-h-[2.5rem] rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                      <Clock size={10} />
                      {format(parseISO(event.start_at), 'HH:mm')} – {format(parseISO(event.end_at), 'HH:mm')}
                    </p>
                    {event.description && (
                      <p className="text-xs text-text-muted mt-1">{event.description}</p>
                    )}
                  </div>
                  {event.created_by === profile?.id && (
                    <button onClick={() => deleteEvent(event.id)} className="text-text-muted hover:text-danger shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Nouvel événement</h3>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text">
                <X size={18} />
              </button>
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
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="input"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Début</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Fin</label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1.5">Couleur</label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-white/40' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <button onClick={saveEvent} disabled={saving || !title.trim()} className="btn btn-primary w-full">
              {saving ? 'Enregistrement...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
