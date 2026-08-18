import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { Calendar, Plus, ChevronLeft, ChevronRight, X, Clock, Globe } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { CalendarEvent } from '@/types/database'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths, parseISO, isBefore,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { formatTimeIn, timezoneCity } from '@/lib/timezone'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE, ICON_BTN } from '@/lib/ui'

const COLORS = ['#D4A574', '#C2788E', '#E8B86D', '#10B981', '#3B82F6', '#EF4444']

export default function CalendarPage() {
  const { profile, partnerProfile } = useAuthStore()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchEvents = useCallback(async () => {
    // On charge une fenêtre glissante : mois affiché ± 2 mois (pas toute la table)
    const from = subMonths(startOfMonth(currentMonth), 2).toISOString()
    const to = addMonths(endOfMonth(currentMonth), 2).toISOString()
    const { data } = await run(
      supabase.from('calendar_events').select('*').gte('start_at', from).lte('start_at', to).order('start_at', { ascending: true }),
      { errorMessage: "Impossible de charger l'agenda." },
    )
    if (data) setEvents(data)
  }, [currentMonth])

  useEffect(() => {
    fetchEvents()
    const channel = supabase
      .channel(`calendar:${profile?.id ?? 'anon'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => fetchEvents())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchEvents, profile?.id])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const eventsForDay = (day: Date) => events.filter((e) => isSameDay(parseISO(e.start_at), day))
  const selectedDayEvents = selectedDate ? eventsForDay(selectedDate) : []

  const openForm = (date?: Date) => {
    const d = date ?? selectedDate ?? new Date()
    const dateStr = format(d, 'yyyy-MM-dd')
    setStartAt(`${dateStr}T20:00`)
    setEndAt(`${dateStr}T21:00`)
    setTitle(''); setDescription(''); setColor(COLORS[0]); setFormError('')
    setShowForm(true)
  }

  const saveEvent = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile || !title.trim() || !startAt || !endAt) return
    const start = new Date(startAt)
    const end = new Date(endAt)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return setFormError('Date invalide.')
    if (!isBefore(start, end)) return setFormError("L'heure de fin doit être après le début.")
    setFormError('')
    setSaving(true)
    const { ok } = await run(
      supabase.from('calendar_events').insert({
        created_by: profile.id,
        title: title.trim(),
        description: description.trim() || null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        color,
      }),
      { errorMessage: "L'événement n'a pas pu être créé." },
    )
    setSaving(false)
    if (ok) {
      toast.success('Événement ajouté à votre agenda')
      setShowForm(false)
      setSelectedDate(start)
      setCurrentMonth(start)
      fetchEvents()
    }
  }

  const deleteEvent = async (event: CalendarEvent) => {
    const yes = await confirm({ title: 'Supprimer cet événement ?', message: `« ${event.title} » sera retiré de votre agenda à tous les deux.`, confirmLabel: 'Supprimer', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('calendar_events').delete().eq('id', event.id), { errorMessage: 'Suppression impossible.' })
    if (ok) fetchEvents()
  }

  const partnerTz = partnerProfile?.timezone
  const showPartnerTime = !!partnerTz && !!profile && partnerTz !== profile.timezone

  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-light tracking-tight flex items-center gap-2.5 text-[#F0EAE0]">
          <div className="w-8 h-8 rounded-xl bg-[rgba(212,165,116,0.12)] flex items-center justify-center">
            <Calendar size={16} className="text-[#D4A574]" aria-hidden="true" />
          </div>
          Agenda partagé
        </h2>
        <button onClick={() => openForm()} className={BTN_PRIMARY}>
          <Plus size={14} aria-hidden="true" /> Ajouter
        </button>
      </div>

      {showPartnerTime && (
        <p className="text-xs text-[#8A8177] flex items-center gap-1.5">
          <Globe size={12} aria-hidden="true" />
          Les heures sont affichées dans ton fuseau ({timezoneCity(profile!.timezone)}) et celui de {partnerProfile!.display_name} ({timezoneCity(partnerTz!)}).
        </p>
      )}

      {/* Calendar card */}
      <div className={CARD}>
        <div className={CARD_EDGE} aria-hidden="true" />
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className={ICON_BTN} aria-label="Mois précédent">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <h3 className="text-sm font-medium tracking-wide text-[#F0EAE0] first-letter:uppercase" aria-live="polite">
            {format(currentMonth, 'MMMM yyyy', { locale: fr })}
          </h3>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className={ICON_BTN} aria-label="Mois suivant">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
          {['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map((d) => (
            <div key={d} className="text-center text-xs tracking-wide text-[#8A8177] font-medium py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" role="grid">
          {days.map((day) => {
            const isCurrentMonth = isSameMonth(day, currentMonth)
            const isToday = isSameDay(day, new Date())
            const isSelected = selectedDate && isSameDay(day, selectedDate)
            const dayEvents = eventsForDay(day)
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                onDoubleClick={() => openForm(day)}
                aria-label={`${format(day, 'EEEE d MMMM', { locale: fr })}${dayEvents.length ? `, ${dayEvents.length} événement${dayEvents.length > 1 ? 's' : ''}` : ''}`}
                aria-pressed={!!isSelected}
                className={`relative p-1.5 min-h-[40px] rounded-xl text-sm transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/50 ${
                  !isCurrentMonth ? 'text-[#8A8177]/40' : 'text-[#F0EAE0]'
                } ${isToday ? 'shadow-[0_0_0_1px_rgba(212,165,116,0.3)]' : ''} ${
                  isSelected ? 'bg-[rgba(212,165,116,0.15)] text-[#D4A574]' : 'hover:bg-[rgba(212,165,116,0.06)]'
                }`}
              >
                {format(day, 'd')}
                {dayEvents.length > 0 && (
                  <div className="flex justify-center gap-0.5 mt-0.5" aria-hidden="true">
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

      {/* Selected day */}
      {selectedDate && (
        <div className={`${CARD} space-y-3`}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[#F0EAE0] first-letter:uppercase">{format(selectedDate, 'EEEE d MMMM', { locale: fr })}</h3>
            <button onClick={() => openForm(selectedDate)} className="text-[#D4A574] text-xs tracking-wide flex items-center gap-1 hover:text-[#E8C9A0] transition-colors">
              <Plus size={12} aria-hidden="true" /> Ajouter
            </button>
          </div>

          {selectedDayEvents.length === 0 ? (
            <p className="text-[#8A8177] text-xs tracking-wide py-4 text-center">Rien de prévu ce jour-là</p>
          ) : (
            <ul className="space-y-2">
              {selectedDayEvents.map((event) => {
                const start = parseISO(event.start_at)
                const end = parseISO(event.end_at)
                return (
                  <li key={event.id} className="flex items-start gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.03)]">
                    <div className="w-1 self-stretch min-h-[2.5rem] rounded-full shrink-0" style={{ backgroundColor: event.color }} aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#F0EAE0]">{event.title}</p>
                      <p className="text-xs text-[#8A8177] flex items-center gap-1 mt-0.5">
                        <Clock size={10} aria-hidden="true" />
                        {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
                        {showPartnerTime && (
                          <span className="text-[#C2788E]/80 ml-1">
                            · {formatTimeIn(partnerTz!, start)} – {formatTimeIn(partnerTz!, end)} pour {partnerProfile!.display_name}
                          </span>
                        )}
                      </p>
                      {event.description && <p className="text-xs text-[#9B9287] mt-1 whitespace-pre-wrap">{event.description}</p>}
                    </div>
                    <button onClick={() => deleteEvent(event)} className="text-[#8A8177] hover:text-red-400 shrink-0 transition-colors duration-300 p-1" aria-label={`Supprimer ${event.title}`}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {showForm && (
        <Modal title="Nouvel événement" description={showPartnerTime ? `Saisis l'heure dans ton fuseau (${timezoneCity(profile!.timezone)}) ; ${partnerProfile!.display_name} la verra convertie.` : undefined} onClose={() => setShowForm(false)}>
          <form onSubmit={saveEvent} className="space-y-4" noValidate>
            <div>
              <label htmlFor="ev-title" className={LABEL}>Titre</label>
              <input id="ev-title" type="text" placeholder="Ex : Appel du soir, Ciné en ligne…" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} maxLength={120} required />
            </div>
            <div>
              <label htmlFor="ev-desc" className={LABEL}>Description (optionnel)</label>
              <textarea id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${INPUT} resize-none`} maxLength={1000} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-start" className={LABEL}>Début</label>
                <input id="ev-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={INPUT} required />
              </div>
              <div>
                <label htmlFor="ev-end" className={LABEL}>Fin</label>
                <input id="ev-end" type="datetime-local" value={endAt} min={startAt} onChange={(e) => setEndAt(e.target.value)} className={INPUT} required />
              </div>
            </div>
            {showPartnerTime && startAt && !Number.isNaN(new Date(startAt).getTime()) && (
              <p className="text-xs text-[#C2788E]/80">
                Soit {formatTimeIn(partnerTz!, new Date(startAt))} chez {partnerProfile!.display_name}.
              </p>
            )}
            <div>
              <span className={LABEL}>Couleur</span>
              <div className="flex gap-2" role="radiogroup" aria-label="Couleur">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Couleur ${c}`}
                    className={`w-7 h-7 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${color === c ? 'scale-110 shadow-[0_0_12px_rgba(212,165,116,0.3)]' : 'opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div aria-live="polite">{formError && <p role="alert" className="text-red-300 text-xs">{formError}</p>}</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={saving || !title.trim()} className={`${BTN_PRIMARY} flex-1 py-2.5`}>
                {saving ? 'Enregistrement…' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
