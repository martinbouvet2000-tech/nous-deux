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

const COLORS = ['#D4A574', '#C2788E', '#E8B86D', '#10B981', '#3B82F6', '#EF4444']

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
    <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
          <div className="w-8 h-8 rounded-xl bg-[rgba(212,165,116,0.12)] flex items-center justify-center">
            <Calendar size={16} className="text-[#D4A574]" />
          </div>
          Agenda partage
        </h2>
        <button
          onClick={() => openForm()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out"
        >
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {/* Calendar card */}
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out">
        <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1.5 rounded-lg text-[#9B9287] hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] transition-all duration-300"
          >
            <ChevronLeft size={18} />
          </button>
          <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0] capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: fr })}
          </h3>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1.5 rounded-lg text-[#9B9287] hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] transition-all duration-300"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((d) => (
            <div key={d} className="text-center text-[11px] tracking-wide text-[#6B6359] font-medium py-1">{d}</div>
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
                className={`relative p-1.5 rounded-xl text-sm transition-all duration-300 ${
                  !isCurrentMonth ? 'text-[#6B6359]/40' : 'text-[#F0EAE0]'
                } ${isToday ? 'shadow-[0_0_0_1px_rgba(212,165,116,0.3)]' : ''} ${
                  isSelected
                    ? 'bg-[rgba(212,165,116,0.15)] text-[#D4A574]'
                    : 'hover:bg-[rgba(212,165,116,0.06)]'
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

      {/* Selected day events */}
      {selectedDate && (
        <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out space-y-3">
          <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#F0EAE0] capitalize">
              {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
            </h3>
            <button
              onClick={() => openForm(selectedDate)}
              className="text-[#D4A574] text-[11px] tracking-wide flex items-center gap-1 hover:text-[#E8C9A0] transition-colors duration-300"
            >
              <Plus size={12} /> Ajouter
            </button>
          </div>

          {selectedDayEvents.length === 0 ? (
            <p className="text-[#6B6359] text-[11px] tracking-wide py-4 text-center">Aucun evenement</p>
          ) : (
            <div className="space-y-2">
              {selectedDayEvents.map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.03)]">
                  <div className="w-1 h-full min-h-[2.5rem] rounded-full shrink-0" style={{ backgroundColor: event.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#F0EAE0]">{event.title}</p>
                    <p className="text-[11px] text-[#6B6359] flex items-center gap-1 mt-0.5">
                      <Clock size={10} />
                      {format(parseISO(event.start_at), 'HH:mm')} - {format(parseISO(event.end_at), 'HH:mm')}
                    </p>
                    {event.description && (
                      <p className="text-[11px] text-[#9B9287] mt-1">{event.description}</p>
                    )}
                  </div>
                  {event.created_by === profile?.id && (
                    <button
                      onClick={() => deleteEvent(event.id)}
                      className="text-[#6B6359] hover:text-red-400 shrink-0 transition-colors duration-300"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New event modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] w-full max-w-md space-y-4"
            style={{ animation: 'fadeIn 400ms ease-out' }}
          >
            <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60" />

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0]">Nouvel evenement</h3>
              <button onClick={() => setShowForm(false)} className="text-[#6B6359] hover:text-[#F0EAE0] transition-colors duration-300">
                <X size={18} />
              </button>
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
              placeholder="Description (optionnel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)] resize-none"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] tracking-wide text-[#6B6359] mb-1.5">Debut</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
                />
              </div>
              <div>
                <label className="block text-[11px] tracking-wide text-[#6B6359] mb-1.5">Fin</label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] tracking-wide text-[#6B6359] mb-1.5">Couleur</label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-all duration-300 ${color === c ? 'scale-110 shadow-[0_0_12px_rgba(212,165,116,0.3)]' : 'opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={saveEvent}
              disabled={saving || !title.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Enregistrement...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
