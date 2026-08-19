import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { Plus, ChevronLeft, ChevronRight, X, Check, CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { CalendarEvent } from '@/types/database'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths, parseISO, isBefore,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { formatTimeIn, timezoneCity } from '@/lib/timezone'
import { shine, unshine } from '@/lib/shine'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE, ICON_BTN, EYEBROW } from '@/lib/ui'

const COLORS = ['#D4A574', '#C2788E', '#E8B86D', '#8FA3C4', '#9CB8A0', '#A66B7E']
const COLOR_NAMES: Record<string, string> = {
  '#D4A574': 'Or', '#C2788E': 'Rose', '#E8B86D': 'Ambre',
  '#8FA3C4': 'Bleu', '#9CB8A0': 'Vert', '#A66B7E': 'Prune',
}

/** Icône native des champs date/heure : éclaircie pour rester lisible sur le thème sombre */
const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

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
  const upcoming = (() => {
    const now = new Date(); const horizon = new Date(now.getTime() + 7 * 86400000)
    return [...events].filter((e) => { const d = parseISO(e.start_at); return d >= now && d <= horizon && !(selectedDate && isSameDay(d, selectedDate)) })
      .sort((a, b) => a.start_at.localeCompare(b.start_at)).slice(0, 6)
  })()

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

  const subtitle = showPartnerTime
    ? `Vos rendez-vous, affichés dans vos deux fuseaux : ${timezoneCity(profile!.timezone)} pour toi, ${timezoneCity(partnerTz!)} pour ${partnerProfile!.display_name}.`
    : 'Vos rendez-vous, réunis au même endroit.'

  return (
    <div className="px-5 md:px-8 py-6 max-w-3xl lg:max-w-[1080px] mx-auto space-y-5 reveal">
      <PageHeader
        eyebrow="Votre temps"
        title="Agenda"
        accent="partagé"
        subtitle={subtitle}
        action={
          <button onClick={() => openForm()} className={BTN_PRIMARY}>
            <Plus size={14} aria-hidden="true" /> Ajouter
          </button>
        }
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6 lg:items-start space-y-5 lg:space-y-0">
        {/* ─── Grille du mois ─── */}
        <div className={CARD} onMouseMove={shine} onMouseLeave={unshine}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className={ICON_BTN} aria-label="Mois précédent">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <h2 className="font-display text-[17px] tracking-tight text-[#F0EAE0] first-letter:uppercase" aria-live="polite">
              {format(currentMonth, 'MMMM yyyy', { locale: fr })}
            </h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className={ICON_BTN} aria-label="Mois suivant">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1.5" aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[11px] tracking-[0.14em] uppercase text-[#9B9287] py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isCurrentMonth = isSameMonth(day, currentMonth)
              const isToday = isSameDay(day, new Date())
              const isSelected = !!selectedDate && isSameDay(day, selectedDate)
              const dow = day.getDay()
              const isWeekend = dow === 0 || dow === 6
              const dayEvents = eventsForDay(day)
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  onDoubleClick={() => openForm(day)}
                  aria-label={`${format(day, 'EEEE d MMMM', { locale: fr })}${dayEvents.length ? `, ${dayEvents.length} événement${dayEvents.length > 1 ? 's' : ''}` : ''}`}
                  aria-pressed={isSelected}
                  className={[
                    'aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-[15px] num transition-all duration-200 focus-visible:outline-offset-[-2px]',
                    isWeekend ? 'bg-white/[0.035]' : 'bg-white/[0.02]',
                    isSelected
                      ? 'bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E] font-semibold shadow-[0_8px_20px_-10px_rgba(212,165,116,0.6)]'
                      : isToday
                        ? 'text-[#D4A574] font-medium shadow-[inset_0_0_0_1px_rgba(212,165,116,0.35)] hover:bg-white/[0.04]'
                        : `${isCurrentMonth ? 'text-[#F0EAE0]/85' : 'text-[#9B9287]/50'} hover:bg-white/[0.04]`,
                  ].join(' ')}
                >
                  <span className="leading-none">{format(day, 'd')}</span>
                  <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span key={e.id} className={`size-1.5 rounded-full ${isSelected ? 'bg-[#110F0E]/60' : 'bg-[#C2788E]'}`} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── Panneau du jour ─── */}
        {selectedDate && (
          <div className={`${CARD} lg:sticky lg:top-6 space-y-4`} onMouseMove={shine} onMouseLeave={unshine}>
            <div className={CARD_EDGE} aria-hidden="true" />
            <h2 className="font-display text-[20px] text-[#F0EAE0] first-letter:uppercase">
              {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
            </h2>

            {selectedDayEvents.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Journée libre"
                text="Rien de prévu — l'occasion rêvée d'inventer quelque chose à deux."
              />
            ) : (
              <ul className="space-y-2">
                {selectedDayEvents.map((event) => {
                  const start = parseISO(event.start_at)
                  const end = parseISO(event.end_at)
                  return (
                    <li key={event.id} className="group flex items-start gap-3 rounded-xl bg-white/[0.035] p-3">
                      <span className="w-1 self-stretch min-h-10 rounded-full shrink-0" style={{ backgroundColor: event.color }} aria-hidden="true" />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-[14px] text-[#F0EAE0] leading-snug">{event.title}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[13px] text-[#F0EAE0]/75 num">{format(start, 'HH:mm')} – {format(end, 'HH:mm')}</span>
                          {showPartnerTime && (
                            <span className="px-2 py-0.5 rounded-full bg-[#C2788E]/12 text-[#D99AAD] text-[11px] num">
                              {formatTimeIn(partnerTz!, start)} – {formatTimeIn(partnerTz!, end)} · {partnerProfile!.display_name}
                            </span>
                          )}
                        </div>
                        {event.description && <p className="text-[13px] text-[#9B9287] leading-relaxed whitespace-pre-wrap">{event.description}</p>}
                      </div>
                      <button
                        onClick={() => deleteEvent(event)}
                        className="shrink-0 -mr-1.5 -mt-1.5 grid size-11 place-items-center rounded-full text-[#9B9287] hover:text-[#F0A5AD] hover:bg-white/[0.06] transition-all duration-200 opacity-100 md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Supprimer ${event.title}`}
                      >
                        <X size={15} aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {upcoming.length > 0 && (
              <div className="pt-4 border-t border-white/[0.06]">
                <h3 className={`${EYEBROW} mb-3`}>Les 7 prochains jours</h3>
                <ul className="space-y-1.5">
                  {upcoming.map((event) => {
                    const start = parseISO(event.start_at)
                    return (
                      <li key={event.id}>
                        <button onClick={() => { setSelectedDate(start); setCurrentMonth(start) }} className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.04] transition-colors">
                          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: event.color }} aria-hidden="true" />
                          <span className="flex-1 min-w-0 truncate text-[13px] text-[#F0EAE0]/90">{event.title}</span>
                          <span className="text-[12px] text-[#9B9287] num first-letter:uppercase shrink-0">{format(start, 'EEE d · HH:mm', { locale: fr })}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-start" className={LABEL}>Début</label>
                <input id="ev-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={`${INPUT}`} required />
              </div>
              <div>
                <label htmlFor="ev-end" className={LABEL}>Fin</label>
                <input id="ev-end" type="datetime-local" value={endAt} min={startAt} onChange={(e) => setEndAt(e.target.value)} className={`${INPUT}`} required />
              </div>
            </div>
            {showPartnerTime && startAt && !Number.isNaN(new Date(startAt).getTime()) && (
              <p className="text-[13px] text-[#D99AAD]">
                Soit <span className="num">{formatTimeIn(partnerTz!, new Date(startAt))}</span> chez {partnerProfile!.display_name}.
              </p>
            )}
            <div>
              <span className={LABEL}>Couleur</span>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Couleur">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Couleur ${COLOR_NAMES[c] ?? c}`}
                    className="grid size-11 place-items-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
                  >
                    <span
                      className={`grid size-7 place-items-center rounded-full transition-all duration-200 ${color === c ? 'ring-2 ring-[#F0EAE0]' : 'opacity-70'}`}
                      style={{ backgroundColor: c }}
                      aria-hidden="true"
                    >
                      {color === c && <Check size={14} className="text-[#110F0E]" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div aria-live="polite">{formError && <p role="alert" className="text-[13px] text-[#F0A5AD]">{formError}</p>}</div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={saving || !title.trim()} className={`${BTN_PRIMARY} flex-1`}>
                {saving ? 'Enregistrement…' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
