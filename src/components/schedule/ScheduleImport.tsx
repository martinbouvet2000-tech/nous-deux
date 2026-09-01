import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, FileSpreadsheet, Info, Repeat, Upload,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { ScheduleSlot } from '@/types/database'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { timezoneCity } from '@/lib/timezone'
import { resolveTimezone } from '@/lib/today'
import { colorForTitle, WEEKDAYS, weekdayLabel } from '@/lib/schedule'
import { BTN_GHOST, BTN_PRIMARY, CARD, CARD_EDGE, ICON_BTN, SELECT } from '@/lib/ui'
import {
  ISSUE_LABEL, LOCATION_MAX, TITLE_MAX, partialFailureMessage, reviewSlots, toInsertRows,
  weekdayFromDate, dateSpan, spanLabel, collapseToTypicalWeek,
  unselectRevealedDuplicates, type ReviewedSlot, type SlotDraft,
} from '@/lib/scheduleImport/parse'
import type { Confidence, ImportOutcome } from '@/lib/scheduleImport'

/** Extensions proposées au sélecteur natif */
const ACCEPT = '.xlsx,.xls,.csv,.txt,.pdf'
/** Insertion par paquets : une année d'emploi du temps peut faire quelques centaines de lignes */
const CHUNK = 200

/** Champ de saisie compact. Pas de classe de taille : `src/index.css` garantit 16 px au tactile. */
const CELL =
  'w-full min-h-11 bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] rounded-lg px-3 py-2 text-[#F0EAE0] placeholder-[#9B9287] outline-none transition-colors duration-200 focus:bg-white/[0.06] focus:shadow-[inset_0_0_0_1px_rgba(232,201,160,0.7)]'

/** Ton de la bannière de relecture, selon la confiance annoncée par le lecteur */
const CONFIDENCE_STYLE: Record<Confidence, { icon: typeof Info; color: string }> = {
  high: { icon: CheckCircle2, color: '#8FB3A9' },
  medium: { icon: Info, color: '#D4A574' },
  low: { icon: AlertTriangle, color: '#F0A5AD' },
}

interface Props {
  /** Créneaux déjà enregistrés, pour repérer les doublons */
  existing: ScheduleSlot[]
  onClose: () => void
  /** Appelé quand des créneaux ont été ajoutés (pour recharger la vue) */
  onImported: () => void
}

type Step = 'pick' | 'reading' | 'review'

/**
 * Lignes montées d'un coup dans l'écran de relecture. Une année scolaire en
 * compte facilement sept cents, à cinq champs chacune : trois mille cinq cents
 * contrôles de formulaire d'un seul tenant, l'appareil ne suit pas.
 */
const PAR_PAGE = 150

/** Message utilisateur d'une erreur d'import (la classe vient d'un module chargé à la demande) */
function readError(err: unknown): { message: string; hint: string | null } {
  const e = err as { name?: string; message?: string; hint?: string | null } | null
  if (e?.name === 'ImportError' && e.message) return { message: e.message, hint: e.hint ?? null }
  if (import.meta.env.DEV) console.error('[import edt]', err)
  return {
    message: 'Ce fichier n’a pas pu être lu.',
    hint: 'Réessaie avec un CSV ou un classeur Excel (.xlsx) — ce sont les formats les plus sûrs.',
  }
}

interface FieldsProps {
  slotKey: string
  index: number
  weekday: number | null
  /** Date lue dans le fichier, `null` pour un créneau hebdomadaire */
  date: string | null
  start: string
  end: string
  title: string
  location: string | null
  hasLocation: boolean
  onChange: (key: string, patch: Partial<SlotDraft>) => void
}

/**
 * Les champs éditables d'une ligne, à part de sa case à cocher.
 *
 * Mémorisés sur des valeurs simples : cocher ou décocher ne touche à aucun
 * d'eux, et « Tout cocher » n'a donc que 250 cases à repeindre au lieu de 250
 * formulaires — cinq contrôles chacun — à reconstruire.
 */
const Fields = memo(function Fields({
  slotKey, index, weekday, date, start, end, title, location, hasLocation, onChange,
}: FieldsProps) {
  const columns = hasLocation
    ? 'sm:grid-cols-[128px_104px_104px_minmax(0,1fr)_150px]'
    : 'sm:grid-cols-[128px_104px_104px_minmax(0,1fr)]'

  return (
    <div className={`min-w-0 flex-1 grid grid-cols-2 gap-1.5 ${columns}`}>
      {date === null ? (
        <select
          id={`slot-${slotKey}-day`}
          aria-label={`Jour du créneau ${index + 1}`}
          value={weekday ?? ''}
          onChange={(e) => onChange(slotKey, { weekday: e.target.value ? Number(e.target.value) : null })}
          className={`${CELL} ${SELECT} col-span-2 sm:col-span-1`}
        >
          <option value="">Jour…</option>
          {WEEKDAYS.map((d) => (
            <option key={d} value={d}>{weekdayLabel(d, true)}</option>
          ))}
        </select>
      ) : (
        // Ligne datée : c'est la date qui commande, le jour de semaine s'en
        // déduit. Proposer les deux séparément laisserait choisir « mardi »
        // pour un 8 septembre qui tombe un lundi.
        <input
          type="date"
          id={`slot-${slotKey}-date`}
          aria-label={`Date du créneau ${index + 1}`}
          value={date}
          onChange={(e) => {
            const iso = e.target.value
            onChange(slotKey, { date: iso || null, weekday: iso ? weekdayFromDate(iso) : weekday })
          }}
          className={`${CELL} col-span-2 sm:col-span-1`}
        />
      )}
      <input
        type="time"
        lang="fr-FR"
        aria-label={`Début du créneau ${index + 1}`}
        value={start}
        onChange={(e) => onChange(slotKey, { start: e.target.value })}
        className={CELL}
      />
      <input
        type="time"
        lang="fr-FR"
        aria-label={`Fin du créneau ${index + 1}`}
        value={end}
        onChange={(e) => onChange(slotKey, { end: e.target.value })}
        className={CELL}
      />
      <input
        type="text"
        aria-label={`Intitulé du créneau ${index + 1}`}
        value={title}
        maxLength={TITLE_MAX}
        placeholder="Intitulé"
        onChange={(e) => onChange(slotKey, { title: e.target.value })}
        className={`${CELL} col-span-2 sm:col-span-1`}
      />
      {hasLocation && (
        <input
          type="text"
          aria-label={`Lieu du créneau ${index + 1}`}
          value={location ?? ''}
          maxLength={LOCATION_MAX}
          placeholder="Lieu"
          onChange={(e) => onChange(slotKey, { location: e.target.value || null })}
          className={`${CELL} col-span-2 sm:col-span-1`}
        />
      )}
    </div>
  )
})

/**
 * Ces deux lignes de relecture se ressemblent-elles assez pour ne rien re-rendre ?
 *
 * `reviewSlots` refabrique un objet `ReviewedSlot` par ligne à chaque contrôle,
 * mais le brouillon qu'il enveloppe, lui, ne change QUE sur la ligne qu'on est
 * en train de corriger. On compare donc le brouillon par référence et les
 * défauts par contenu (jamais plus de trois) : sans ça, taper une lettre
 * re-rendait les 250 lignes de l'écran, et la frappe se voyait.
 */
function sameRow(a: RowProps, b: RowProps): boolean {
  if (a.index !== b.index || a.hasLocation !== b.hasLocation || a.onChange !== b.onChange) return false
  if (a.row.draft !== b.row.draft || a.row.blocking !== b.row.blocking) return false
  if (a.row.issues.length !== b.row.issues.length) return false
  return a.row.issues.every((code, i) => code === b.row.issues[i])
}

interface RowProps {
  row: ReviewedSlot
  index: number
  hasLocation: boolean
  onChange: (key: string, patch: Partial<SlotDraft>) => void
}

/** Une ligne de l'écran de relecture, mémorisée : un import peut en compter des centaines */
const Row = memo(function Row({
  row, index, hasLocation, onChange,
}: RowProps) {
  const { draft, issues, blocking } = row
  const name = draft.title.trim() || 'sans intitulé'

  return (
    <li
      // `content-visibility: auto` laisse le navigateur ignorer la mise en page et
      // le dessin des lignes hors de l'écran. Sur un import d'une année (250
      // lignes), « Tout cocher » ne repeint plus que ce qui est visible.
      // `contain-intrinsic-size` donne une hauteur estimée pour que la barre de
      // défilement ne saute pas.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 88px' }}
      className={`rounded-xl p-2.5 max-md:p-3 transition-colors duration-200 ${
        blocking
          ? 'bg-[#F0A5AD]/[0.05] shadow-[inset_0_0_0_1px_rgba(240,165,173,0.30)]'
          : issues.length > 0
            ? 'bg-white/[0.02] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.24)]'
            : 'bg-white/[0.02] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={draft.selected}
          aria-label={`Garder ${name}`}
          onClick={() => onChange(draft.key, { selected: !draft.selected })}
          className="tap-44 mt-1 grid size-6 shrink-0 place-items-center rounded-md transition-all duration-200"
          style={{
            backgroundColor: draft.selected ? '#D4A574' : 'transparent',
            boxShadow: draft.selected ? 'none' : 'inset 0 0 0 1.5px rgba(240,234,224,0.22)',
          }}
        >
          {/* Toujours monté, seulement masqué : cocher ou décocher 250 lignes d'un
              coup ne doit pas créer puis détruire 250 icônes. */}
          <Check
            size={14}
            className={`text-[#110F0E] ${draft.selected ? '' : 'invisible'}`}
            aria-hidden="true"
          />
        </button>

        <Fields
          slotKey={draft.key}
          index={index}
          weekday={draft.weekday}
          date={draft.date}
          start={draft.start}
          end={draft.end}
          title={draft.title}
          location={draft.location}
          hasLocation={hasLocation}
          onChange={onChange}
        />
      </div>

      {(issues.length > 0 || draft.occurrences > 1) && (
        <p className="mt-1.5 ml-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-snug">
          {issues.map((code) => (
            <span key={code} className={`inline-flex items-center gap-1 ${blocking ? 'text-[#F0A5AD]' : 'text-[#D4A574]'}`}>
              <AlertTriangle size={11} aria-hidden="true" />
              {ISSUE_LABEL[code]}
            </span>
          ))}
          {draft.occurrences > 1 && (
            <span className="inline-flex items-center gap-1 text-[#9B9287]">
              <Repeat size={11} aria-hidden="true" />
              <span className="num">{draft.occurrences}</span> occurrences dans le fichier
            </span>
          )}
        </p>
      )}
    </li>
  )
}, sameRow)

/**
 * Import d'un emploi du temps : dépôt du fichier, puis ÉCRAN DE RELECTURE.
 *
 * La relecture n'est pas une politesse : sur une année entière, un import
 * silencieux qui se trompe est pire que pas d'import du tout — personne ne
 * saurait jamais ce qui a été mal lu. Rien ne part en base sans une case cochée.
 */
export default function ScheduleImport({ existing, onClose, onImported }: Props) {
  const { profile } = useAuthStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('pick')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null)
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  /**
   * Deux listes relues séparément, jamais l'une écrasée par l'autre : les
   * lignes datées telles que lues dans le fichier, et — si on l'a demandé — la
   * semaine type qui en est tirée. Passer de l'une à l'autre et revenir ne perd
   * donc aucune correction faite à la main.
   */
  const [datedDrafts, setDatedDrafts] = useState<SlotDraft[]>([])
  const [weekDrafts, setWeekDrafts] = useState<SlotDraft[]>([])
  /** « En faire une semaine type » plutôt que garder chaque date */
  const [collapsed, setCollapsed] = useState(false)
  const [saving, setSaving] = useState(false)
  /** Combien de lignes sont réellement montées dans le DOM */
  const [limite, setLimite] = useState(PAR_PAGE)

  const drafts = collapsed ? weekDrafts : datedDrafts
  /** Écrit dans la liste réellement affichée, quelle qu'elle soit. */
  const setDrafts = useCallback(
    (next: SlotDraft[] | ((prev: SlotDraft[]) => SlotDraft[])) => {
      const appliquer = collapsed ? setWeekDrafts : setDatedDrafts
      appliquer((prev) => (typeof next === 'function' ? next(prev) : next))
    },
    [collapsed],
  )

  /**
   * Signature des lignes datées au moment du dernier repli. Sans elle, corriger
   * un intitulé puis rebasculer en semaine type affichait toujours l'ancien :
   * le repli n'avait lieu qu'une fois.
   */
  const replieDepuis = useRef('')

  const chooseCollapsed = useCallback((veut: boolean) => {
    if (veut) {
      const signature = datedDrafts.map((d) => `${d.key}:${d.date}:${d.weekday}:${d.start}:${d.end}:${d.title}:${d.location ?? ''}`).join('|')
      if (signature !== replieDepuis.current) {
        replieDepuis.current = signature
        setWeekDrafts(collapseToTypicalWeek(datedDrafts))
      }
    }
    // Les deux listes n'ont pas les mêmes clés : la mémoire des doublons déjà
    // décochés ne vaut que pour celle qu'on quitte.
    knownDuplicates.current = new Set()
    setLimite(PAR_PAGE)
    setCollapsed(veut)
  }, [datedDrafts])

  // Le fuseau de référence est celui du PROFIL, jamais celui du navigateur :
  // une heure importée est une heure murale, chez toi.
  const selfTz = resolveTimezone(profile?.timezone)

  const reviewed = useMemo(() => reviewSlots(drafts, existing), [drafts, existing])
  const ready = useMemo(() => reviewed.filter((r) => r.draft.selected && !r.blocking), [reviewed])
  /** Cochées mais impossibles à enregistrer en l'état : le compteur ne les cache pas */
  const toFix = useMemo(() => reviewed.filter((r) => r.draft.selected && r.blocking).length, [reviewed])
  const flagged = useMemo(() => reviewed.filter((r) => r.issues.length > 0).length, [reviewed])
  const hasLocation = useMemo(() => drafts.some((d) => d.location), [drafts])
  const visibles = useMemo(() => reviewed.slice(0, limite), [reviewed, limite])
  const reste = reviewed.length - visibles.length
  /** Période couverte par le fichier, si tant est qu'il porte des dates */
  const span = useMemo(() => dateSpan(datedDrafts), [datedDrafts])



  /**
   * Clés déjà décochées au titre du doublon. Une ligne n'y passe qu'une fois :
   * ensuite, sa case n'appartient plus qu'à la personne qui relit.
   */
  const knownDuplicates = useRef<Set<string>>(new Set())

  // Un doublon est décoché d'office, exactement comme une ligne douteuse — sinon
  // ré-importer le même fichier proposait de tout ajouter une deuxième fois,
  // toutes cases cochées. Le contrôle a lieu ici et pas dans `toDrafts` : le
  // doublon ne se voit qu'en connaissant l'emploi du temps déjà enregistré.
  useEffect(() => {
    setDrafts((prev) => unselectRevealedDuplicates(prev, existing, knownDuplicates.current))
  }, [drafts, existing, setDrafts])

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return
    setError(null)
    setStep('reading')
    try {
      // Chargé à la demande : les lecteurs de fichiers ne sont pas dans le
      // paquet initial de l'app, et le lecteur de PDF pas même dans celui-ci.
      const { importSchedule } = await import('@/lib/scheduleImport')
      const result = await importSchedule(file)
      setOutcome(result)
      // Nouveau fichier, nouvelles clés : la mémoire des doublons repart à zéro.
      // Le premier passage se fait ici, avant l'affichage, pour qu'aucun doublon
      // n'apparaisse coché — même le temps d'une image.
      knownDuplicates.current = new Set()
      const lues = unselectRevealedDuplicates(result.drafts, existing, knownDuplicates.current)
      setCollapsed(false)
      setWeekDrafts([])
      replieDepuis.current = ''
      setLimite(PAR_PAGE)
      setDatedDrafts(lues)
      setStep('review')
    } catch (err) {
      setError(readError(err))
      setOutcome(null)
      setDatedDrafts([])
      setWeekDrafts([])
      setStep('pick')
    }
    if (inputRef.current) inputRef.current.value = ''
  }, [existing])

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0] ?? null)
  }

  const patch = useCallback((key: string, changes: Partial<SlotDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...changes } : d)))
  }, [setDrafts])

  const selectAll = (mode: 'all' | 'none' | 'safe') => {
    const safe = new Set(reviewed.filter((r) => r.issues.length === 0).map((r) => r.draft.key))
    setDrafts((prev) => prev.map((d) => {
      const selected = mode === 'all' ? true : mode === 'none' ? false : safe.has(d.key)
      // Une ligne déjà dans le bon état garde son objet : elle ne se re-rendra pas.
      return d.selected === selected ? d : { ...d, selected }
    }))
  }

  const save = async () => {
    if (!profile || ready.length === 0 || saving) return
    setSaving(true)
    const rows = toInsertRows(reviewed, profile.id, colorForTitle)
    let inserted = 0
    let failed = false
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const res = await run(supabase.from('schedule_slots').insert(slice), {
        errorMessage: 'Les créneaux n’ont pas pu être ajoutés.',
      })
      if (!res.ok) { failed = true; break }
      inserted += slice.length
    }
    setSaving(false)

    if (inserted > 0) onImported()
    if (!failed) {
      toast.success(inserted > 1 ? `${inserted} créneaux ajoutés` : 'Créneau ajouté')
      onClose()
      return
    }
    // Échec en cours de route : on décoche ce qui est déjà parti, pour qu'un
    // second essai n'ajoute pas deux fois les mêmes créneaux.
    const done = new Set(ready.slice(0, inserted).map((r) => r.draft.key))
    setDrafts((prev) => prev.map((d) => (done.has(d.key) ? { ...d, selected: false } : d)))
    setError({
      message: partialFailureMessage(inserted, rows.length),
      hint: 'Les lignes déjà enregistrées ont été décochées : tu peux relancer sans rien doubler.',
    })
  }

  const style = outcome ? CONFIDENCE_STYLE[outcome.confidence] : CONFIDENCE_STYLE.medium
  const NoticeIcon = style.icon

  return (
    <div className="space-y-4 max-md:space-y-5">
      <div className="flex items-center gap-1">
        <button onClick={onClose} className={ICON_BTN} aria-label="Revenir à l’emploi du temps">
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h2 className="font-display text-[20px] leading-tight text-[#F0EAE0]">Importer un emploi du temps</h2>
      </div>

      {/* ─── Étape 1 : le fichier ─── */}
      {step !== 'review' && (
        <div className={CARD}>
          <div className={CARD_EDGE} aria-hidden="true" />
          <input
            ref={inputRef}
            id="schedule-file"
            type="file"
            accept={ACCEPT}
            className="sr-only"
            aria-labelledby="schedule-file-label"
            disabled={step === 'reading'}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <span className="sr-only" id="schedule-file-label">Fichier de l’emploi du temps</span>
          <label
            htmlFor="schedule-file"
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 min-h-[168px] rounded-xl cursor-pointer text-center px-4 transition-colors duration-200 [border:1px_dashed_rgba(240,234,224,0.14)] ${
              dragging ? 'bg-[#D4A574]/[0.08]' : 'bg-white/[0.03] hover:bg-white/[0.05]'
            }`}
          >
            <span
              className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-[#D4A574]/15 to-[#C2788E]/15 text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]"
              aria-hidden="true"
            >
              {step === 'reading' ? <FileSpreadsheet size={18} /> : <Upload size={18} />}
            </span>
            <span className="text-sm text-[#F0EAE0]">
              {step === 'reading' ? 'Lecture du fichier…' : 'Dépose ton fichier ici, ou choisis-le'}
            </span>
            <span className="text-xs text-[#9B9287]">Excel (.xlsx), CSV, PDF&#8239;· 12 Mo max</span>
          </label>

          <ul className="mt-4 space-y-1.5 text-[12px] leading-relaxed text-[#9B9287]">
            <li>
              <span className="text-[#F0EAE0]">Excel et CSV&#8239;:</span> lecture fiable, aussi bien en tableau
              (une ligne par créneau) qu’en grille (les jours en colonnes).
            </li>
            <li>
              <span className="text-[#F0EAE0]">PDF&#8239;:</span> lecture approximative. Un PDF ne contient pas de
              tableau, seulement du texte posé à des coordonnées&#8239;: je fais de mon mieux, et je te le dis
              quand je n’y arrive pas.
            </li>
            <li>
              <span className="text-[#F0EAE0]">Ancien .xls&#8239;:</span> ré-enregistre-le en .xlsx ou en CSV, je ne
              sais pas ouvrir le format binaire.
            </li>
          </ul>
          <p className="mt-3 text-[12px] text-[#9B9287]">
            Rien n’est enregistré avant que tu aies relu et validé, ligne par ligne.
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-xl p-3 bg-[#F0A5AD]/[0.06] shadow-[inset_0_0_0_1px_rgba(240,165,173,0.28)]">
              <p className="text-[13px] text-[#F0A5AD] flex items-start gap-2">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error.message}</span>
              </p>
              {error.hint && <p className="mt-1 ml-[21px] text-[12px] text-[#9B9287]">{error.hint}</p>}
            </div>
          )}
        </div>
      )}

      {/* ─── Étape 2 : la relecture ─── */}
      {step === 'review' && outcome && (
        <>
          <div className={CARD}>
            <div className={CARD_EDGE} aria-hidden="true" />
            <p className="flex items-start gap-2 text-[13px] leading-relaxed" style={{ color: style.color }}>
              <NoticeIcon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{outcome.notice}</span>
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-[#9B9287]">
              <span className="text-[#F0EAE0]">{outcome.fileName}</span>
              {outcome.sheetName && <> — feuille «&#8239;{outcome.sheetName}&#8239;»</>}
              {' · '}
              <span className="num">{outcome.drafts.length}</span> créneau{outcome.drafts.length > 1 ? 'x' : ''} compris
              {flagged > 0 && <>, dont <span className="num">{flagged}</span> à vérifier</>}
              {span && <> — {spanLabel(span)}</>}.
              {' '}Les heures seront enregistrées telles quelles, à l’heure de {timezoneCity(selfTz)}.
            </p>

            {span && (
              <div className="mt-3 rounded-xl p-3 bg-white/[0.02] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                <p className="text-[12px] leading-relaxed text-[#9B9287]">
                  Ce fichier contient de vraies dates. Tu peux les garder — chaque cours à sa
                  date, vacances comprises — ou n’en retenir qu’une semaine type, qui se répétera
                  ensuite indéfiniment.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={!collapsed}
                    onClick={() => chooseCollapsed(false)}
                    className={`${BTN_GHOST} px-3.5 ${!collapsed ? 'text-[#110F0E] bg-[#D4A574]' : ''}`}
                  >
                    Garder les dates
                  </button>
                  <button
                    type="button"
                    aria-pressed={collapsed}
                    onClick={() => chooseCollapsed(true)}
                    className={`${BTN_GHOST} px-3.5 ${collapsed ? 'text-[#110F0E] bg-[#D4A574]' : ''}`}
                  >
                    En faire une semaine type
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => selectAll('all')} className={`${BTN_GHOST} px-3.5`}>Tout cocher</button>
              <button type="button" onClick={() => selectAll('none')} className={`${BTN_GHOST} px-3.5`}>Tout décocher</button>
              <button type="button" onClick={() => selectAll('safe')} className={`${BTN_GHOST} px-3.5`}>Ne garder que les lignes sûres</button>
            </div>

            {error && (
              <div role="alert" className="mt-3 rounded-xl p-3 bg-[#F0A5AD]/[0.06] shadow-[inset_0_0_0_1px_rgba(240,165,173,0.28)]">
                <p className="text-[13px] text-[#F0A5AD]">{error.message}</p>
                {error.hint && <p className="mt-1 text-[12px] text-[#9B9287]">{error.hint}</p>}
              </div>
            )}
          </div>

          <ul className="space-y-1.5 max-md:space-y-2">
            {visibles.map((row, index) => (
              <Row key={row.draft.key} row={row} index={index} hasLocation={hasLocation} onChange={patch} />
            ))}
          </ul>

          {/* Une année de cours, ce sont des centaines de lignes, chacune avec
              cinq champs de formulaire : tout monter d'un coup fige l'appareil.
              On en montre un paquet, le reste à la demande — les cases cochées
              et le bouton d'enregistrement, eux, portent toujours sur TOUT. */}
          {reste > 0 && (
            <button
              type="button"
              onClick={() => setLimite((n) => n + PAR_PAGE)}
              className={`${BTN_GHOST} w-full mt-2`}
            >
              Afficher {Math.min(reste, PAR_PAGE)} ligne{Math.min(reste, PAR_PAGE) > 1 ? 's' : ''} de plus
              {' '}<span className="num opacity-70">({reste} restante{reste > 1 ? 's' : ''})</span>
            </button>
          )}

          <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0A0908] via-[#0A0908]/95 to-transparent">
            <div className="flex items-center gap-2">
              {/* « Prêtes », et non « cochées » : une ligne bloquante reste cochée mais
                  ne part pas. Le compte du bouton est le même que celui-ci, et ce qui
                  manque à l'appel est annoncé plutôt que passé sous silence. */}
              <p className="flex-1 text-[12px] text-[#9B9287]" aria-live="polite">
                <span className="num text-[#F0EAE0]">{ready.length}</span> ligne{ready.length > 1 ? 's' : ''} prête{ready.length > 1 ? 's' : ''} sur{' '}
                <span className="num">{reviewed.length}</span>
                {toFix > 0 && <> — <span className="num text-[#F0A5AD]">{toFix}</span> à corriger</>}
              </p>
              <button type="button" onClick={onClose} className={BTN_GHOST}>Annuler</button>
              <button type="button" onClick={save} disabled={saving || ready.length === 0} className={BTN_PRIMARY}>
                {saving ? 'Ajout…' : `Ajouter ${ready.length} créneau${ready.length > 1 ? 'x' : ''}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
