import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, Check, MapPin, Repeat, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { ScheduleSlot } from '@/types/database'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import CurrentActivityBanner from '@/components/schedule/CurrentActivityBanner'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { shine, unshine } from '@/lib/shine'
import { timezoneCity } from '@/lib/timezone'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE } from '@/lib/ui'
import {
  SLOT_COLORS, SLOT_COLOR_NAMES, WEEKDAY_SHORT, WEEKDAY_LABELS, WEEKDAY_ABBR,
  timeToMinutes, shortTime, localClockIn,
} from '@/lib/schedule'

type Who = 'me' | 'partner'
const HOUR_PX = 44
const DEFAULT_START_H = 7
const DEFAULT_END_H = 22

interface Props {
  /** Incrémenté par l'en-tête de page pour ouvrir la modale d'ajout */
  addSignal?: number
}

export default function ScheduleView({ addSignal = 0 }: Props) {
  const { profile, partnerProfile } = useAuthStore()
  const [who, setWho] = useState<Who>('me')
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [mobileDay, setMobileDay] = useState(() => localClockIn(profile?.timezone ?? 'UTC').weekday)

  // Formulaire
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduleSlot | null>(null)
  const [title, setTitle] = useState('')
  const [days, setDays] = useState<number[]>([])
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [location, setLocation] = useState('')
  const [color, setColor] = useState<string>(SLOT_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchSlots = useCallback(async () => {
    const { data } = await run(
      supabase.from('schedule_slots').select('*').order('start_time', { ascending: true }),
      { errorMessage: "Impossible de charger l'emploi du temps." },
    )
    if (data) setSlots(data)
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!profile) return
    fetchSlots()
    let channel = supabase
      .channel(`schedule:${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots', filter: `user_id=eq.${profile.id}` }, () => fetchSlots())
    if (partnerProfile?.id) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots', filter: `user_id=eq.${partnerProfile.id}` }, () => fetchSlots())
    }
    channel.subscribe()
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => { supabase.removeChannel(channel); window.clearInterval(timer) }
  }, [fetchSlots, profile, partnerProfile?.id])

  const openCreate = useCallback((weekday?: number) => {
    setEditing(null)
    setTitle(''); setDays(weekday ? [weekday] : []); setStart('09:00'); setEnd('10:00')
    setLocation(''); setColor(SLOT_COLORS[0]); setFormError('')
    setOpen(true)
  }, [])

  useEffect(() => {
    if (addSignal > 0) openCreate()
  }, [addSignal, openCreate])

  const openEdit = (s: ScheduleSlot) => {
    setEditing(s)
    setTitle(s.title); setDays([s.weekday]); setStart(shortTime(s.start_time)); setEnd(shortTime(s.end_time))
    setLocation(s.location ?? ''); setColor(s.color); setFormError('')
    setOpen(true)
  }

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!title.trim()) return setFormError('Donne un titre à ce créneau.')
    if (days.length === 0) return setFormError('Choisis au moins un jour.')
    if (!start || !end) return setFormError('Renseigne un début et une fin.')
    if (timeToMinutes(end) <= timeToMinutes(start)) return setFormError("L'heure de fin doit être après le début.")
    setFormError('')
    setSaving(true)
    const base = {
      user_id: profile.id,
      title: title.trim(),
      start_time: `${start}:00`,
      end_time: `${end}:00`,
      location: location.trim() || null,
      color,
    }
    let ok: boolean
    if (editing) {
      // Le créneau édité garde son jour s'il est toujours coché, sinon prend le premier coché ;
      // les autres jours cochés deviennent de nouveaux créneaux.
      const keep = days.includes(editing.weekday) ? editing.weekday : days[0]
      const extra = days.filter((d) => d !== keep)
      const upd = await run(supabase.from('schedule_slots').update({ ...base, weekday: keep }).eq('id', editing.id), { errorMessage: 'Modification impossible.' })
      ok = upd.ok
      if (ok && extra.length) {
        const ins = await run(supabase.from('schedule_slots').insert(extra.map((weekday) => ({ ...base, weekday }))), { errorMessage: 'Ajout impossible.' })
        ok = ins.ok
      }
    } else {
      const ins = await run(supabase.from('schedule_slots').insert(days.map((weekday) => ({ ...base, weekday }))), { errorMessage: "Le créneau n'a pas pu être ajouté." })
      ok = ins.ok
    }
    setSaving(false)
    if (ok) {
      toast.success(editing ? 'Créneau modifié' : days.length > 1 ? 'Créneaux ajoutés' : 'Créneau ajouté')
      setOpen(false)
      fetchSlots()
    }
  }

  const remove = async () => {
    if (!editing) return
    const yes = await confirm({ title: 'Supprimer ce créneau ?', message: `« ${editing.title} » du ${WEEKDAY_LABELS[editing.weekday - 1].toLowerCase()} sera retiré.`, confirmLabel: 'Supprimer', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('schedule_slots').delete().eq('id', editing.id), { errorMessage: 'Suppression impossible.' })
    if (ok) { setOpen(false); fetchSlots() }
  }

  // ─── Données affichées ───
  const viewedProfile = who === 'me' ? profile : partnerProfile
  const viewedId = viewedProfile?.id
  const shown = useMemo(() => slots.filter((s) => s.user_id === viewedId), [slots, viewedId])
  const isMine = who === 'me'

  const [rangeStart, rangeEnd] = useMemo(() => {
    let s = DEFAULT_START_H, e = DEFAULT_END_H
    for (const sl of shown) {
      s = Math.min(s, Math.floor(timeToMinutes(sl.start_time) / 60) - 1)
      e = Math.max(e, Math.ceil(timeToMinutes(sl.end_time) / 60) + 1)
    }
    return [Math.max(0, s), Math.min(24, e)]
  }, [shown])
  const hours = useMemo(() => Array.from({ length: rangeEnd - rangeStart + 1 }, (_, i) => rangeStart + i), [rangeStart, rangeEnd])
  const gridHeight = (rangeEnd - rangeStart) * HOUR_PX
  const yFor = (min: number) => ((min - rangeStart * 60) / 60) * HOUR_PX

  const viewedTz = viewedProfile?.timezone ?? 'UTC'
  const clock = localClockIn(viewedTz, now)
  const nowVisible = clock.minutes >= rangeStart * 60 && clock.minutes <= rangeEnd * 60
  const tzDiffers = !!profile && !!partnerProfile && profile.timezone !== partnerProfile.timezone

  const daySlots = (d: number) => shown.filter((s) => s.weekday === d).sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))

  const renderSlot = (s: ScheduleSlot, compact = false) => {
    const inner = (
      <>
        <span className="absolute left-0 top-0 bottom-0 w-1 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
        <p className={`text-[#F0EAE0] leading-tight truncate ${compact ? 'text-[12px] font-medium' : 'text-[14px]'}`}>{s.title}</p>
        <p className={`num text-[#9B9287] leading-tight ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
          {shortTime(s.start_time)} – {shortTime(s.end_time)}
        </p>
        {s.location && !compact && (
          <p className="text-[12px] text-[#9B9287] leading-tight truncate flex items-center gap-1"><MapPin size={11} aria-hidden="true" />{s.location}</p>
        )}
        {s.location && compact && <p className="text-[11px] text-[#9B9287] leading-tight truncate">{s.location}</p>}
      </>
    )
    const cls = `relative overflow-hidden rounded-xl pl-3 pr-2 py-1.5 text-left w-full h-full ${isMine ? 'hover:brightness-110 transition-all duration-200' : ''}`
    const style = { backgroundColor: `${s.color}1F` }
    const label = `${s.title}, ${WEEKDAY_LABELS[s.weekday - 1]} de ${shortTime(s.start_time)} à ${shortTime(s.end_time)}${s.location ? `, ${s.location}` : ''}`
    return isMine
      ? <button type="button" onClick={() => openEdit(s)} className={cls} style={style} aria-label={`Modifier ${label}`}>{inner}</button>
      : <div className={cls} style={style} aria-label={label}>{inner}</div>
  }

  return (
    <div className="space-y-5">
      <CurrentActivityBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex w-fit gap-1 p-1 rounded-full bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.06)]" role="tablist" aria-label="Emploi du temps de">
          {([{ key: 'me', label: 'Moi' }, { key: 'partner', label: partnerProfile?.display_name ?? 'Partenaire' }] as { key: Who; label: string }[]).map(({ key, label }) => {
            const active = who === key
            const disabled = key === 'partner' && !partnerProfile
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => setWho(key)}
                className={`min-h-10 px-4 rounded-full text-[13px] font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                  active ? 'bg-white/[0.08] text-[#F0EAE0] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(212,165,116,0.25)]' : 'text-[#9B9287] hover:text-[#F0EAE0]'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <p className="inline-flex items-center gap-1.5 text-[12px] text-[#9B9287]">
          <Repeat size={12} aria-hidden="true" /> Ces créneaux se répètent chaque semaine.
          {!isMine && tzDiffers && <> Heures de {timezoneCity(viewedTz)}.</>}
        </p>
      </div>

      {loaded && shown.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={isMine ? 'Ta semaine est encore vide' : `${partnerProfile?.display_name ?? 'Ton partenaire'} n'a rien ajouté pour l'instant`}
          text={isMine
            ? `Ajoute tes cours, ton travail, ton sport : ${partnerProfile?.display_name ?? 'ton partenaire'} saura toujours où tu en es de ta journée.`
            : 'Dès que des créneaux seront ajoutés, tu les verras ici.'}
          action={isMine ? <button onClick={() => openCreate()} className={BTN_PRIMARY}>Ajouter un créneau</button> : undefined}
        />
      ) : (
        <>
          {/* ─── Desktop : grille semaine ─── */}
          <div className={`${CARD} hidden md:block`} onMouseMove={shine} onMouseLeave={unshine}>
            <div className={CARD_EDGE} aria-hidden="true" />
            <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-x-1.5">
              <div aria-hidden="true" />
              {WEEKDAY_ABBR.map((d, i) => {
                const isToday = clock.weekday === i + 1
                return (
                  <div key={d} className={`text-center text-[11px] tracking-[0.14em] uppercase py-1 mb-2 rounded-full ${isToday ? 'text-[#D4A574] bg-[#D4A574]/10' : 'text-[#9B9287]'}`}>
                    {d}
                  </div>
                )
              })}

              {/* Colonne des heures */}
              <div className="relative" style={{ height: gridHeight }} aria-hidden="true">
                {hours.map((h) => (
                  <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[11px] num text-[#9B9287]" style={{ top: (h - rangeStart) * HOUR_PX }}>
                    {String(h).padStart(2, '0')}h
                  </span>
                ))}
              </div>

              {WEEKDAY_LABELS.map((label, i) => {
                const d = i + 1
                const list = daySlots(d)
                return (
                  <div
                    key={d}
                    className={`relative rounded-xl ${d >= 6 ? 'bg-white/[0.035]' : 'bg-white/[0.02]'} ${isMine ? 'cursor-pointer' : ''}`}
                    style={{ height: gridHeight }}
                    onDoubleClick={isMine ? () => openCreate(d) : undefined}
                    role="group"
                    aria-label={`${label}, ${list.length} créneau${list.length > 1 ? 'x' : ''}`}
                  >
                    {hours.map((h) => (
                      <span key={h} className="absolute left-0 right-0 h-px bg-white/[0.05]" style={{ top: (h - rangeStart) * HOUR_PX }} aria-hidden="true" />
                    ))}
                    {list.map((s) => {
                      const top = yFor(timeToMinutes(s.start_time))
                      const height = Math.max(22, yFor(timeToMinutes(s.end_time)) - top - 2)
                      return (
                        <div key={s.id} className="absolute left-0.5 right-0.5" style={{ top: top + 1, height }}>
                          {renderSlot(s, true)}
                        </div>
                      )
                    })}
                    {clock.weekday === d && nowVisible && (
                      <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: yFor(clock.minutes) }} aria-label="Maintenant">
                        <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-[#D4A574]" aria-hidden="true" />
                        <span className="block h-px bg-[#D4A574]" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {isMine && <p className="mt-3 text-[12px] text-[#9B9287]">Double-clique sur un jour pour ajouter un créneau, clique sur un créneau pour le modifier.</p>}
          </div>

          {/* ─── Mobile : sélecteur de jour + liste ─── */}
          <div className="md:hidden space-y-3">
            <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Jour">
              {WEEKDAY_SHORT.map((l, i) => {
                const d = i + 1
                const active = mobileDay === d
                const isToday = clock.weekday === d
                const has = daySlots(d).length > 0
                return (
                  <button
                    key={d}
                    role="tab"
                    aria-selected={active}
                    aria-label={WEEKDAY_LABELS[i]}
                    onClick={() => setMobileDay(d)}
                    className={`min-h-11 rounded-full flex flex-col items-center justify-center gap-0.5 text-[13px] font-medium transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E]'
                        : isToday ? 'text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.35)]' : 'text-[#9B9287] bg-white/[0.03]'
                    }`}
                  >
                    <span>{l}</span>
                    <span className={`size-1 rounded-full ${has ? (active ? 'bg-[#110F0E]/60' : 'bg-[#C2788E]') : 'bg-transparent'}`} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
            <div className={CARD}>
              <div className={CARD_EDGE} aria-hidden="true" />
              <h2 className="font-display text-[18px] text-[#F0EAE0] mb-3">{WEEKDAY_LABELS[mobileDay - 1]}</h2>
              {daySlots(mobileDay).length === 0 ? (
                <p className="text-[13px] text-[#9B9287]">Rien ce jour-là.</p>
              ) : (
                <ul className="space-y-2">
                  {daySlots(mobileDay).map((s) => (
                    <li key={s.id} className="min-h-[52px]">{renderSlot(s)}</li>
                  ))}
                </ul>
              )}
              {isMine && (
                <button onClick={() => openCreate(mobileDay)} className={`${BTN_GHOST} w-full mt-4`}>Ajouter un créneau ce jour</button>
              )}
            </div>
          </div>
        </>
      )}

      {open && (
        <Modal title={editing ? 'Modifier le créneau' : 'Nouveau créneau'} description="Se répète chaque semaine, aux jours cochés." onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4" noValidate>
            <div>
              <label htmlFor="slot-title" className={LABEL}>Titre</label>
              <input id="slot-title" type="text" placeholder="Ex : Cours de maths, Boulot, Sport…" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} maxLength={80} required />
            </div>
            <div>
              <span className={LABEL} id="slot-days-label">Jours</span>
              <div className="flex gap-1.5" role="group" aria-labelledby="slot-days-label">
                {WEEKDAY_SHORT.map((l, i) => {
                  const d = i + 1
                  const on = days.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      aria-label={WEEKDAY_LABELS[i]}
                      onClick={() => toggleDay(d)}
                      className={`flex-1 min-h-11 rounded-full text-[13px] font-medium transition-all duration-200 ${
                        on ? 'bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E]' : 'bg-white/[0.04] text-[#9B9287] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:text-[#F0EAE0]'
                      }`}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="slot-start" className={LABEL}>Début</label>
                <input id="slot-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} className={INPUT} required />
              </div>
              <div>
                <label htmlFor="slot-end" className={LABEL}>Fin</label>
                <input id="slot-end" type="time" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={INPUT} required />
              </div>
            </div>
            <div>
              <label htmlFor="slot-location" className={LABEL}>Lieu (optionnel)</label>
              <input id="slot-location" type="text" placeholder="Ex : Campus, Bureau, Salle de sport…" value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT} maxLength={80} />
            </div>
            <div>
              <span className={LABEL}>Couleur</span>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Couleur">
                {SLOT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    role="radio"
                    aria-checked={color === c}
                    aria-label={`Couleur ${SLOT_COLOR_NAMES[c] ?? c}`}
                    className="grid size-11 place-items-center rounded-full transition-transform duration-200 hover:scale-105 active:scale-95"
                  >
                    <span className={`grid size-7 place-items-center rounded-full transition-all duration-200 ${color === c ? 'ring-2 ring-[#F0EAE0]' : 'opacity-70'}`} style={{ backgroundColor: c }} aria-hidden="true">
                      {color === c && <Check size={14} className="text-[#110F0E]" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div aria-live="polite">{formError && <p role="alert" className="text-[13px] text-[#F0A5AD]">{formError}</p>}</div>
            <div className="flex gap-2 pt-1">
              {editing && (
                <button type="button" onClick={remove} className="btn-tertiary inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-full text-sm text-[#F0A5AD]" aria-label="Supprimer ce créneau">
                  <Trash2 size={14} aria-hidden="true" /> Supprimer
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className={`${BTN_GHOST} flex-1`}>Annuler</button>
              <button type="submit" disabled={saving || !title.trim() || days.length === 0} className={`${BTN_PRIMARY} flex-1`}>
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
