import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarClock, Check, ChevronLeft, ChevronRight, ListChecks, MapPin, Repeat, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useLiveData } from '@/hooks/useLiveData'
import type { ScheduleSlot } from '@/types/database'
import Modal from '@/components/ui/Modal'
import EmptyState from '@/components/ui/EmptyState'
import CurrentActivityBanner from '@/components/schedule/CurrentActivityBanner'
import { confirm } from '@/lib/confirm'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { shine, unshine } from '@/lib/shine'
import { timezoneCity } from '@/lib/timezone'
import { BTN_PRIMARY, BTN_GHOST, BTN_DANGER, INPUT, LABEL, CARD, CARD_EDGE } from '@/lib/ui'
import { capitalizeFirst, describeTimeRangeInput } from '@/lib/dates'
import {
  SLOT_COLORS, SLOT_COLOR_NAMES, WEEKDAY_SHORT, WEEKDAY_ABBR, WEEKDAYS,
  timeToMinutes, shortTime, localClockIn, weekdayLabel,
  deletableIds, indexByWeekday, partialDeleteMessage, slotCount,
  mondayOf, addDays, fromIsoDate, weekLabel,
  slotsForWeek, dateOfWeekday, slotWhen,
} from '@/lib/schedule'

/** Chargé seulement quand on ouvre l'import : lecteurs de fichiers hors du paquet initial */
const ScheduleImport = lazy(() => import('@/components/schedule/ScheduleImport'))

type Who = 'me' | 'partner'
const HOUR_PX = 44
const DEFAULT_START_H = 7
const DEFAULT_END_H = 22

/**
 * Suppression par paquets : le filtre `id=in.(…)` voyage dans l’URL, et
 * cinquante identifiants pèsent déjà près de deux kilo-octets. Au-delà, une
 * passerelle un peu stricte coupe la requête — et personne ne comprendrait
 * pourquoi effacer trois cents créneaux échoue quand en effacer dix marche.
 */
const DELETE_CHUNK = 50

/** Références figées : une sélection vide ou un jour sans créneau ne re-rendent rien */
const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>()
const EMPTY_SLOTS: ScheduleSlot[] = []

/** Comment un créneau se comporte au clic : édition, case à cocher, ou rien */
type SlotMode = 'edit' | 'select' | 'read'

interface SlotCardProps {
  slot: ScheduleSlot
  compact: boolean
  mode: SlotMode
  selected: boolean
  onOpen: (slot: ScheduleSlot) => void
  onToggle: (id: string) => void
}

/**
 * Un créneau à l’écran.
 *
 * Mémorisé sur des props stables — l’objet créneau ne change que quand la base
 * change, les deux rappels sont figés par `useCallback` : cocher une case ne
 * re-rend que la sienne, pas les trois cents autres de la semaine. Un emploi du
 * temps importé en compte facilement autant.
 */
const SlotCard = memo(function SlotCard({ slot, compact, mode, selected, onOpen, onToggle }: SlotCardProps) {
  // « le mardi 8 septembre » pour un créneau daté, « chaque mardi » pour une
  // habitude : lu à voix haute, les deux ne veulent pas dire la même chose.
  const label = `${slot.title}, ${slotWhen(slot)} de ${shortTime(slot.start_time)} à ${shortTime(slot.end_time)}${slot.location ? `, ${slot.location}` : ''}`
  const selecting = mode === 'select'
  const cls = `relative overflow-hidden rounded-xl ${selecting ? 'pl-8' : 'pl-3'} pr-2 py-1.5 text-left w-full h-full ${
    mode === 'read' ? '' : 'hover:brightness-110 transition-all duration-200'
  } ${selected ? 'shadow-[inset_0_0_0_1.5px_#D4A574]' : ''}`
  const style = { backgroundColor: `${slot.color}1F` }

  const inner = (
    <>
      <span className="absolute left-0 top-0 bottom-0 w-1 rounded-full" style={{ backgroundColor: slot.color }} aria-hidden="true" />
      {selecting && (
        <span
          className="absolute left-2 top-1/2 -translate-y-1/2 grid size-5 place-items-center rounded-md transition-colors duration-200"
          style={{
            backgroundColor: selected ? '#D4A574' : 'transparent',
            boxShadow: selected ? 'none' : 'inset 0 0 0 1.5px rgba(240,234,224,0.28)',
          }}
          aria-hidden="true"
        >
          {/* Toujours montée, seulement masquée : cocher un jour entier ne doit pas
              créer puis détruire cinquante icônes. */}
          <Check size={13} className={`text-[#110F0E] ${selected ? '' : 'invisible'}`} />
        </span>
      )}
      <p className={`text-[#F0EAE0] leading-tight truncate ${compact ? 'text-[12px] font-medium' : 'text-[14px]'}`}>{slot.title}</p>
      <p className={`num text-[#9B9287] leading-tight ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
        {shortTime(slot.start_time)} – {shortTime(slot.end_time)}
      </p>
      {slot.location && !compact && (
        <p className="text-[12px] text-[#9B9287] leading-tight truncate flex items-center gap-1"><MapPin size={11} aria-hidden="true" />{slot.location}</p>
      )}
      {slot.location && compact && <p className="text-[11px] text-[#9B9287] leading-tight truncate">{slot.location}</p>}
    </>
  )

  if (selecting) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Sélectionner ${label}`}
        onClick={() => onToggle(slot.id)}
        className={cls}
        style={style}
      >
        {inner}
      </button>
    )
  }
  if (mode === 'edit') {
    return (
      <button type="button" onClick={() => onOpen(slot)} className={cls} style={style} aria-label={`Modifier ${label}`}>
        {inner}
      </button>
    )
  }
  return <div className={cls} style={style} aria-label={label}>{inner}</div>
})

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
  /**
   * L'emploi du temps n'est plus une semaine unique qui se répète : les
   * créneaux datés n'existent que leur semaine, il faut donc pouvoir se
   * déplacer. On garde un ÉCART en semaines plutôt qu'une date figée : la
   * semaine 0 reste toujours celle d'aujourd'hui, même après minuit, et elle
   * suit le fuseau du PROFIL — pas celui de l'appareil. Sans ça, se connecter
   * depuis un autre continent affichait la semaine d'à côté et masquait les
   * cours du jour.
   */
  const [weekOffset, setWeekOffset] = useState(0)
  /**
   * Lundi de la semaine affichée. L'ancre est « aujourd'hui chez moi », au sens
   * du fuseau du profil : c'est ma semaine que je parcours, y compris quand je
   * regarde l'emploi du temps de l'autre.
   */
  const weekStart = useMemo(
    () => addDays(mondayOf(fromIsoDate(localClockIn(profile?.timezone ?? 'UTC', now).date)), weekOffset * 7),
    [profile?.timezone, now, weekOffset],
  )
  /** La semaine 0 est toujours celle d'aujourd'hui : pas besoin de recalculer. */
  const thisWeek = weekOffset === 0
  const [mobileDay, setMobileDay] = useState(() => localClockIn(profile?.timezone ?? 'UTC').weekday)
  const [importing, setImporting] = useState(false)

  // Mode sélection : on n'y entre que sur demande, et on en ressort les mains vides.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(EMPTY_SELECTION)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Formulaire
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduleSlot | null>(null)
  const [title, setTitle] = useState('')
  const [days, setDays] = useState<number[]>([])
  /** « chaque semaine » ou « une date précise » */
  const [dateMode, setDateMode] = useState<'weekly' | 'date'>('weekly')
  const [slotDate, setSlotDate] = useState('')
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

  // Les écoutes dépendent de l'identifiant du partenaire, absent du nom du canal :
  // `rebindKey` le porte pour que le ré-abonnement suive.
  useLiveData({
    enabled: !!profile,
    channel: profile ? `schedule:${profile.id}` : null,
    rebindKey: partnerProfile?.id ?? null,
    load: fetchSlots,
    bind: (ch) => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots', filter: `user_id=eq.${profile?.id}` }, () => fetchSlots())
      if (partnerProfile?.id) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_slots', filter: `user_id=eq.${partnerProfile.id}` }, () => fetchSlots())
      }
    },
  })

  // L'heure avance : la colonne « maintenant » se recale chaque minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const openCreate = useCallback((weekday?: number) => {
    setEditing(null)
    setTitle(''); setDays(weekday ? [weekday] : []); setStart('09:00'); setEnd('10:00')
    setLocation(''); setColor(SLOT_COLORS[0]); setFormError('')
    setDateMode('weekly')
    // La date proposée est celle de la colonne cliquée, dans la semaine
    // affichée : passer en « une date précise » ne demande alors plus rien.
    setSlotDate(dateOfWeekday(weekStart, weekday ?? 1))
    setOpen(true)
  }, [weekStart])

  useEffect(() => {
    if (addSignal > 0) openCreate()
  }, [addSignal, openCreate])

  // Identité figée : passée telle quelle à chaque créneau mémorisé, elle ne doit
  // pas changer d'un rendu à l'autre, sinon la mémorisation ne sert plus à rien.
  const openEdit = useCallback((s: ScheduleSlot) => {
    setEditing(s)
    setTitle(s.title); setDays([s.weekday]); setStart(shortTime(s.start_time)); setEnd(shortTime(s.end_time))
    setLocation(s.location ?? ''); setColor(s.color); setFormError('')
    setDateMode(s.slot_date ? 'date' : 'weekly')
    setSlotDate(s.slot_date ?? dateOfWeekday(weekStart, s.weekday))
    setOpen(true)
  }, [weekStart])

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (!title.trim()) return setFormError('Donne un titre à ce créneau.')
    const surUneDate = dateMode === 'date'
    if (surUneDate && !slotDate) return setFormError('Choisis une date.')
    if (!surUneDate && days.length === 0) return setFormError('Choisis au moins un jour.')
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
    // Une date précise ne concerne qu'un jour : le jour de semaine s'en déduit
    // (la base le recalcule de toute façon), et la liste de jours n'a plus cours.
    const jours = surUneDate ? [fromIsoDate(slotDate).getDay() === 0 ? 7 : fromIsoDate(slotDate).getDay()] : days
    const dateCol = surUneDate ? slotDate : null
    let ok: boolean
    if (editing) {
      // Le créneau édité garde son jour s'il est toujours coché, sinon prend le premier coché ;
      // les autres jours cochés deviennent de nouveaux créneaux.
      const keep = jours.includes(editing.weekday) ? editing.weekday : jours[0]
      const extra = jours.filter((d) => d !== keep)
      const upd = await run(supabase.from('schedule_slots').update({ ...base, weekday: keep, slot_date: dateCol }).eq('id', editing.id), { errorMessage: 'Modification impossible.' })
      ok = upd.ok
      if (ok && extra.length) {
        const ins = await run(supabase.from('schedule_slots').insert(extra.map((weekday) => ({ ...base, weekday, slot_date: dateCol }))), { errorMessage: 'Ajout impossible.' })
        ok = ins.ok
      }
    } else {
      const ins = await run(supabase.from('schedule_slots').insert(jours.map((weekday) => ({ ...base, weekday, slot_date: dateCol }))), { errorMessage: "Le créneau n'a pas pu être ajouté." })
      ok = ins.ok
    }
    setSaving(false)
    if (ok) {
      toast.success(editing ? 'Créneau modifié' : jours.length > 1 ? 'Créneaux ajoutés' : 'Créneau ajouté')
      setOpen(false)
      fetchSlots()
    }
  }

  const remove = async () => {
    if (!editing) return
    const yes = await confirm({ title: 'Supprimer ce créneau ?', message: `« ${editing.title} » ${slotWhen(editing)} sera retiré.`, confirmLabel: 'Supprimer', danger: true })
    if (!yes) return
    const { ok } = await run(supabase.from('schedule_slots').delete().eq('id', editing.id), { errorMessage: 'Suppression impossible.' })
    if (ok) { setOpen(false); fetchSlots() }
  }

  // ─── Données affichées ───
  // Mes créneaux, référence stable : l'écran d'import s'en sert pour repérer les
  // doublons, et un nouveau tableau à chaque minute (l'horloge) lui ferait
  // recalculer toute la relecture pour rien.
  const mine = useMemo(() => slots.filter((s) => s.user_id === profile?.id), [slots, profile?.id])

  const viewedProfile = who === 'me' ? profile : partnerProfile
  const viewedId = viewedProfile?.id
  const shown = useMemo(
    () => slotsForWeek(slots.filter((s) => s.user_id === viewedId), weekStart),
    [slots, viewedId, weekStart],
  )
  /** La personne regardée a-t-elle des créneaux, ne serait-ce qu'une autre semaine ? */
  const hasAnySlot = useMemo(() => slots.some((s) => s.user_id === viewedId), [slots, viewedId])
  /** Les sept dates de la semaine affichée, pour les en-têtes et le formulaire */
  const isMine = who === 'me'

  // ─── Mode sélection ───
  /**
   * Ce qui partira vraiment : la sélection recoupée avec MES créneaux. Le
   * compteur affiché sort d'ici, pas de la taille du `Set` : une case cochée
   * puis un créneau disparu (suppression sur l'autre téléphone, temps réel) ne
   * doivent pas gonfler le nombre annoncé.
   */
  const selectedIds = useMemo(
    // Sur `shown`, pas sur `mine` : changer de semaine fait disparaître des
    // créneaux de l'écran, et rien ne doit pouvoir partir sans être visible —
    // ni décochable. La sélection est vidée au changement de semaine (effet
    // ci-dessous) ; ce filtre est la ceinture par-dessus les bretelles.
    () => deletableIds(shown, selected, profile?.id),
    [shown, selected, profile?.id],
  )
  const selectedCount = selectedIds.length

  const exitSelection = useCallback(() => {
    setSelecting(false)
    setSelected((prev) => (prev.size === 0 ? prev : EMPTY_SELECTION))
    setDeleteError('')
  }, [])

  const toggleSlot = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  // Deux raisons de quitter le mode sans y penser : regarder l'emploi du temps de
  // l'autre (rien n'y est supprimable) et n'avoir plus aucun créneau à cocher.
  useEffect(() => {
    if (!isMine || (selecting && loaded && mine.length === 0)) exitSelection()
  }, [isMine, selecting, loaded, mine.length, exitSelection])

  // Changer de semaine remet la sélection à zéro : cocher ici puis supprimer
  // là-bas, sans jamais revoir ce qui part, serait le pire des pièges.
  useEffect(() => {
    setSelected((prev) => (prev.size === 0 ? prev : EMPTY_SELECTION))
  }, [weekOffset])

  /**
   * Supprime la sélection, par paquets, après confirmation — et seulement après.
   * Rien ne part en base tant que `confirm` n'a pas répondu oui.
   */
  const removeSelected = async () => {
    if (!profile || deleting) return
    const ids = selectedIds
    if (ids.length === 0) return
    const many = ids.length > 1
    const yes = await confirm({
      title: many ? `Supprimer ${ids.length} créneaux\u202f?` : 'Supprimer ce créneau\u202f?',
      message: `${slotCount(ids.length)} de ton emploi du temps ${many ? 'seront retirés' : 'sera retiré'} définitivement.${
        partnerProfile ? ` L’emploi du temps de ${partnerProfile.display_name} n’est pas touché.` : ''
      }`,
      confirmLabel: `Supprimer ${slotCount(ids.length)}`,
      danger: true,
    })
    if (!yes) return

    setDeleting(true)
    setDeleteError('')
    let done = 0
    let failed = false
    for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
      const slice = ids.slice(i, i + DELETE_CHUNK)
      // `user_id` en plus de la liste d'identifiants : la règle d'accès dit déjà
      // non pour un créneau du partenaire, on ne le lui demande pas deux fois.
      const res = await run(
        supabase.from('schedule_slots').delete().eq('user_id', profile.id).in('id', slice),
        { errorMessage: 'La suppression n’a pas abouti.' },
      )
      if (!res.ok) { failed = true; break }
      done += slice.length
    }
    setDeleting(false)

    if (done > 0) {
      // Retrait immédiat : après un échec au milieu, la liste ne doit pas
      // continuer à proposer des créneaux qui n'existent plus.
      const gone = new Set(ids.slice(0, done))
      setSlots((prev) => prev.filter((sl) => !gone.has(sl.id)))
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of gone) next.delete(id)
        return next
      })
      fetchSlots()
    }
    if (failed) {
      setDeleteError(partialDeleteMessage(done, ids.length))
      return
    }
    toast.success(done > 1 ? `${done} créneaux supprimés` : 'Créneau supprimé')
    exitSelection()
  }

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

  /**
   * Créneaux affichés, rangés par jour une seule fois par changement de liste.
   * Le filtre-tri d'origine repartait de la liste entière sept fois par rendu —
   * et il y a un rendu par minute, l'horloge avance.
   */
  const byDay = useMemo(() => indexByWeekday(shown), [shown])
  const daySlots = useCallback((d: number) => byDay.get(d) ?? EMPTY_SLOTS, [byDay])

  /** Tout cocher sur un jour — ou tout y décocher si c'est déjà fait */
  const toggleDaySelection = useCallback((d: number) => {
    const list = byDay.get(d) ?? EMPTY_SLOTS
    if (list.length === 0) return
    setSelected((prev) => {
      const next = new Set(prev)
      const all = list.every((sl) => prev.has(sl.id))
      for (const sl of list) {
        if (all) next.delete(sl.id)
        else next.add(sl.id)
      }
      return next
    })
  }, [byDay])

  /** Tout coché sur ce jour ? (jour vide = non, il n'y a rien à décocher) */
  const dayFullySelected = useCallback((d: number) => {
    const list = byDay.get(d) ?? EMPTY_SLOTS
    return list.length > 0 && list.every((sl) => selected.has(sl.id))
  }, [byDay, selected])

  // Écho de la saisie du formulaire, en français et sur 24 h
  const timeEcho = describeTimeRangeInput(start, end)
  const daysEcho = days.length === 7 ? 'tous les jours' : days.map((d) => weekdayLabel(d)).join(', ')
  const slotEcho = timeEcho ? capitalizeFirst(daysEcho ? `${daysEcho} · ${timeEcho}` : timeEcho) : ''

  // L'import prend toute la place : relire une année de créneaux dans une modale
  // étroite serait intenable, et la relecture n'est pas une étape secondaire.
  if (importing) {
    return (
      <Suspense fallback={<p className="text-[13px] text-[#9B9287]">Ouverture de l’import…</p>}>
        <ScheduleImport
          existing={mine}
          onClose={() => setImporting(false)}
          onImported={fetchSlots}
        />
      </Suspense>
    )
  }

  return (
    <div className="space-y-5 max-md:space-y-6">
      <CurrentActivityBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
                  className={`min-h-11 px-4 rounded-full text-[13px] font-medium whitespace-nowrap transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                    active ? 'bg-white/[0.08] text-[#F0EAE0] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(212,165,116,0.25)]' : 'text-[#9B9287] hover:text-[#F0EAE0]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {isMine && !selecting && (
            <>
              <button onClick={() => setImporting(true)} className={`${BTN_GHOST} px-4`}>
                <Upload size={14} aria-hidden="true" /> Importer un fichier
              </button>
              {shown.length > 0 && (
                <button onClick={() => setSelecting(true)} className={`${BTN_GHOST} px-4`}>
                  <ListChecks size={14} aria-hidden="true" /> Sélectionner
                </button>
              )}
            </>
          )}
          {/* Une sortie franche : hors de ce bouton (et du « Terminer » d'en bas),
              l'écran reste l'emploi du temps ordinaire, sans case à cocher nulle part. */}
          {isMine && selecting && (
            <button onClick={exitSelection} className={`${BTN_GHOST} px-4`}>
              <X size={14} aria-hidden="true" /> Terminer la sélection
            </button>
          )}
        </div>
        <p className="inline-flex items-center gap-1.5 text-[12px] text-[#9B9287]">
          <Repeat size={12} aria-hidden="true" /> Les créneaux sans date se répètent chaque semaine.
          {!isMine && tzDiffers && <> Heures de {timezoneCity(viewedTz)}.</>}
        </p>
      </div>

      {/* ─── Navigation de semaine ───
          Un emploi du temps daté n'est plus une semaine unique : il faut pouvoir
          aller voir la semaine prochaine, ou celle de la rentrée. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setWeekOffset((n) => n - 1)}
          aria-label="Semaine précédente"
          className={`${BTN_GHOST} tap-44 px-3`}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        <div className="min-w-0 text-center">
          <p className="font-display text-[16px] text-[#F0EAE0] truncate">{weekLabel(weekStart)}</p>
          {!thisWeek && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-[12px] text-[#D4A574] hover:underline tap-44"
            >
              Revenir à cette semaine
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setWeekOffset((n) => n + 1)}
          aria-label="Semaine suivante"
          className={`${BTN_GHOST} tap-44 px-3`}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      {selecting && (
        <p className="text-[13px] leading-relaxed text-[#9B9287]">
          Coche les créneaux à supprimer, ou sélectionne un jour entier.
          {partnerProfile
            ? ` L’emploi du temps de ${partnerProfile.display_name} n’est jamais concerné.`
            : ' Seuls tes créneaux sont concernés.'}
        </p>
      )}

      {loaded && shown.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={
            // Une semaine vide au milieu d'une année remplie, ce sont des
            // vacances — pas un emploi du temps à créer.
            hasAnySlot
              ? 'Rien cette semaine'
              : isMine ? 'Ta semaine est encore vide' : `${partnerProfile?.display_name ?? 'Ton partenaire'} n'a rien ajouté pour l'instant`
          }
          text={hasAnySlot
            ? `Aucun créneau du ${weekLabel(weekStart)}. Les autres semaines sont juste à côté.`
            : isMine
              ? `Ajoute tes cours, ton travail, ton sport : ${partnerProfile?.display_name ?? 'ton partenaire'} saura toujours où tu en es de ta journée.`
              : 'Dès que des créneaux seront ajoutés, tu les verras ici.'}
          action={isMine ? (
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => openCreate()} className={BTN_PRIMARY}>Ajouter un créneau</button>
              <button onClick={() => setImporting(true)} className={BTN_GHOST}>
                <Upload size={14} aria-hidden="true" /> Importer un fichier
              </button>
            </div>
          ) : undefined}
        />
      ) : (
        <>
          {/* ─── Desktop : grille semaine ─── */}
          <div className={`${CARD} hidden md:block`} onMouseMove={shine} onMouseLeave={unshine}>
            <div className={CARD_EDGE} aria-hidden="true" />
            <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] gap-x-1.5">
              <div aria-hidden="true" />
              {WEEKDAY_ABBR.map((d, i) => {
                const weekday = i + 1
                const isToday = thisWeek && clock.weekday === weekday
                if (!selecting) {
                  return (
                    <div key={d} className={`text-center text-[11px] tracking-[0.14em] uppercase py-1 mb-2 rounded-full ${isToday ? 'text-[#D4A574] bg-[#D4A574]/10' : 'text-[#9B9287]'}`}>
                      {d}{' '}
                      {/* Le quantième : sans lui, impossible de savoir quelle
                          semaine on regarde une fois qu'on s'est déplacé. */}
                      <span className="num opacity-70">{addDays(weekStart, i).getDate()}</span>
                    </div>
                  )
                }
                // En mode sélection, l'en-tête devient le geste utile après un import
                // raté : cocher toute une journée d'un coup.
                const count = daySlots(weekday).length
                const all = dayFullySelected(weekday)
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={count === 0}
                    onClick={() => toggleDaySelection(weekday)}
                    aria-label={`${all ? 'Tout désélectionner' : 'Tout sélectionner'} sur ${weekdayLabel(weekday)}`}
                    className={`min-h-11 mb-2 flex flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] tracking-[0.14em] uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                      all
                        ? 'bg-[#D4A574]/15 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.45)]'
                        : `bg-white/[0.03] hover:bg-white/[0.06] ${isToday ? 'text-[#D4A574]' : 'text-[#9B9287]'}`
                    }`}
                  >
                    <span>{d}</span>
                    <span className="num text-[10px] tracking-normal opacity-80">{count}</span>
                  </button>
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

              {WEEKDAYS.map((d) => {
                const label = weekdayLabel(d, true)
                const list = daySlots(d)
                return (
                  <div
                    key={d}
                    className={`relative rounded-xl ${d >= 6 ? 'bg-white/[0.035]' : 'bg-white/[0.02]'} ${isMine && !selecting ? 'cursor-pointer' : ''}`}
                    style={{ height: gridHeight }}
                    // En sélection, un double-clic est deux clics : il ne doit pas
                    // ouvrir par-dessus une modale « nouveau créneau ».
                    onDoubleClick={isMine && !selecting ? () => openCreate(d) : undefined}
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
                          <SlotCard
                            slot={s}
                            compact
                            mode={isMine ? (selecting ? 'select' : 'edit') : 'read'}
                            selected={selected.has(s.id)}
                            onOpen={openEdit}
                            onToggle={toggleSlot}
                          />
                        </div>
                      )
                    })}
                    {thisWeek && clock.weekday === d && nowVisible && (
                      <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: yFor(clock.minutes) }} aria-label="Maintenant">
                        <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-[#D4A574]" aria-hidden="true" />
                        <span className="block h-px bg-[#D4A574]" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {isMine && (
              <p className="mt-3 text-[12px] text-[#9B9287]">
                {selecting
                  ? 'Clique sur un créneau pour le cocher, ou sur un jour pour le prendre en entier.'
                  : 'Double-clique sur un jour pour ajouter un créneau, clique sur un créneau pour le modifier.'}
              </p>
            )}
          </div>

          {/* ─── Mobile : sélecteur de jour + liste ─── */}
          <div className="md:hidden space-y-3 max-md:space-y-4">
            {/* Sept colonnes contraintes par la largeur d'écran : gouttière réduite à 2 px
                pour que chaque jour reste au moins carré 44 x 44 px dès 360 px de large. */}
            <div className="grid grid-cols-7 gap-0.5" role="tablist" aria-label="Jour">
              {WEEKDAY_SHORT.map((l, i) => {
                const d = i + 1
                const active = mobileDay === d
                const isToday = thisWeek && clock.weekday === d
                const has = daySlots(d).length > 0
                return (
                  <button
                    key={d}
                    role="tab"
                    aria-selected={active}
                    aria-label={weekdayLabel(i + 1, true)}
                    onClick={() => setMobileDay(d)}
                    className={`min-h-11 rounded-full flex flex-col items-center justify-center gap-0.5 text-[13px] font-medium transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E]'
                        : isToday ? 'text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.35)]' : 'text-[#9B9287] bg-white/[0.03]'
                    }`}
                  >
                    <span>{l}</span>
                    <span className="num text-[10px] leading-none opacity-70">{addDays(weekStart, i).getDate()}</span>
                    <span className={`size-1 rounded-full ${has ? (active ? 'bg-[#110F0E]/60' : 'bg-[#C2788E]') : 'bg-transparent'}`} aria-hidden="true" />
                  </button>
                )
              })}
            </div>
            <div className={CARD}>
              <div className={CARD_EDGE} aria-hidden="true" />
              <h2 className="font-display text-[18px] text-[#F0EAE0] mb-3">
                {capitalizeFirst(fromIsoDate(dateOfWeekday(weekStart, mobileDay))
                  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }))}
              </h2>
              {daySlots(mobileDay).length === 0 ? (
                <p className="text-[13px] text-[#9B9287]">Rien ce jour-là.</p>
              ) : (
                <>
                  {selecting && (
                    <button
                      type="button"
                      onClick={() => toggleDaySelection(mobileDay)}
                      className={`${BTN_GHOST} w-full mb-3`}
                    >
                      <ListChecks size={14} aria-hidden="true" />
                      {dayFullySelected(mobileDay) ? 'Tout désélectionner' : 'Tout sélectionner'} sur {weekdayLabel(mobileDay)}
                    </button>
                  )}
                  <ul className="space-y-2 max-md:space-y-2.5">
                    {daySlots(mobileDay).map((s) => (
                      <li key={s.id} className="min-h-[52px]">
                        <SlotCard
                          slot={s}
                          compact={false}
                          mode={isMine ? (selecting ? 'select' : 'edit') : 'read'}
                          selected={selected.has(s.id)}
                          onOpen={openEdit}
                          onToggle={toggleSlot}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {isMine && !selecting && (
                <button onClick={() => openCreate(mobileDay)} className={`${BTN_GHOST} w-full mt-4`}>Ajouter un créneau ce jour</button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Barre du mode sélection ─── */}
      {selecting && (
        <div className="sticky bottom-0 z-20 -mx-1 px-1 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0A0908] via-[#0A0908]/95 to-transparent">
          {deleteError && (
            <div role="alert" className="mb-2 rounded-xl p-3 bg-[#F0A5AD]/[0.06] shadow-[inset_0_0_0_1px_rgba(240,165,173,0.28)]">
              <p className="text-[13px] text-[#F0A5AD]">{deleteError}</p>
              <p className="mt-1 text-[12px] text-[#9B9287]">
                Ceux qui sont partis ont quitté la liste&#8239;: ce qui reste coché est ce qui reste à supprimer.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {/* Le compteur ne compte que ce qui partira vraiment, et le bouton dit le
                même chiffre. Une seule phrase, d'un bloc : une zone vivante hachée en
                trois morceaux se fait relire en trois morceaux. */}
            <p
              className={`flex-1 min-w-[9rem] num text-[12px] ${selectedCount > 0 ? 'text-[#F0EAE0]' : 'text-[#9B9287]'}`}
              aria-live="polite"
            >
              {selectedCount === 0
                ? 'Aucun créneau sélectionné'
                : `${slotCount(selectedCount)} sélectionné${selectedCount > 1 ? 's' : ''} sur ${shown.length}`}
            </p>
            {selectedCount > 0 && (
              <button type="button" onClick={() => setSelected(EMPTY_SELECTION)} className={`${BTN_GHOST} px-3.5`}>
                Tout décocher
              </button>
            )}
            <button type="button" onClick={exitSelection} className={`${BTN_GHOST} px-3.5`}>Terminer</button>
            <button
              type="button"
              onClick={removeSelected}
              disabled={selectedCount === 0 || deleting}
              className={BTN_DANGER}
            >
              <Trash2 size={14} aria-hidden="true" />
              {deleting ? 'Suppression…' : `Supprimer ${slotCount(selectedCount)}`}
            </button>
          </div>
        </div>
      )}

      {open && (
        <Modal title={editing ? 'Modifier le créneau' : 'Nouveau créneau'} description={dateMode === 'date'
          ? 'Ce jour-là seulement.'
          : 'Se répète chaque semaine, aux jours cochés.'} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4 max-md:space-y-5" noValidate>
            <div>
              <label htmlFor="slot-title" className={LABEL}>Titre</label>
              <input id="slot-title" type="text" placeholder="Ex : Cours de maths, Boulot, Sport…" value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} maxLength={60} required />
            </div>
            {/* Chaque semaine, ou une seule fois : le choix commande la suite du
                formulaire — sept jours cochables d'un côté, une date de l'autre. */}
            <div>
              <span className={LABEL} id="slot-repeat-label">Quand</span>
              <div className="flex gap-1" role="group" aria-labelledby="slot-repeat-label">
                {([['weekly', 'Chaque semaine'], ['date', 'Une date précise']] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={dateMode === mode}
                    onClick={() => setDateMode(mode)}
                    className={`flex-1 min-h-11 rounded-full text-[13px] font-medium transition-all duration-200 ${
                      dateMode === mode
                        ? 'bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E]'
                        : 'bg-white/[0.04] text-[#9B9287] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:text-[#F0EAE0]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {dateMode === 'date' ? (
              <div>
                <label htmlFor="slot-date" className={LABEL}>Date</label>
                <input
                  id="slot-date"
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className={INPUT}
                  required
                />
                {slotDate && (
                  <p className="mt-1.5 text-[12px] text-[#9B9287]">
                    {capitalizeFirst(fromIsoDate(slotDate)
                      .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
                    {' '}— ce jour-là seulement.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <span className={LABEL} id="slot-days-label">Jours</span>
                {/* Gouttière réduite : sept boutons dans la largeur d'une modale, 41 x 44 px chacun. */}
                <div className="flex gap-1" role="group" aria-labelledby="slot-days-label">
                  {WEEKDAY_SHORT.map((l, i) => {
                    const d = i + 1
                    const on = days.includes(d)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        aria-label={weekdayLabel(i + 1, true)}
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
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="slot-start" className={LABEL}>Début</label>
                <input id="slot-start" type="time" lang="fr-FR" value={start} onChange={(e) => setStart(e.target.value)} className={INPUT} aria-describedby="slot-when" required />
              </div>
              <div>
                <label htmlFor="slot-end" className={LABEL}>Fin</label>
                <input id="slot-end" type="time" lang="fr-FR" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={INPUT} aria-describedby="slot-when" required />
              </div>
            </div>
            {/* Le sélecteur natif peut afficher AM/PM selon le système : on relit l'heure sur 24 h. */}
            <p id="slot-when" className="-mt-2 text-[12px] text-[#F0EAE0]/70 num min-h-[16px]" aria-live="polite">
              {slotEcho}
            </p>
            <div>
              <label htmlFor="slot-location" className={LABEL}>Lieu (optionnel)</label>
              <input id="slot-location" type="text" placeholder="Ex : Campus, Bureau, Salle de sport…" value={location} onChange={(e) => setLocation(e.target.value)} className={INPUT} maxLength={60} />
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
