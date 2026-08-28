import { memo, useCallback, useMemo, useRef, useState, type DragEvent } from 'react'
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
  ISSUE_LABEL, LOCATION_MAX, TITLE_MAX, reviewSlots, toInsertRows,
  type ReviewedSlot, type SlotDraft,
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

/** Une ligne de l'écran de relecture, mémorisée : un import peut en compter des centaines */
const Row = memo(function Row({
  row, index, hasLocation, onChange,
}: {
  row: ReviewedSlot
  index: number
  hasLocation: boolean
  onChange: (key: string, patch: Partial<SlotDraft>) => void
}) {
  const { draft, issues, blocking } = row
  const id = `slot-${draft.key}`
  const name = draft.title.trim() || 'sans intitulé'
  const columns = hasLocation
    ? 'sm:grid-cols-[128px_104px_104px_minmax(0,1fr)_150px]'
    : 'sm:grid-cols-[128px_104px_104px_minmax(0,1fr)]'

  return (
    <li
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
          {draft.selected && <Check size={14} className="text-[#110F0E]" aria-hidden="true" />}
        </button>

        <div className={`min-w-0 flex-1 grid grid-cols-2 gap-1.5 ${columns}`}>
          <select
            id={`${id}-day`}
            aria-label={`Jour du créneau ${index + 1}`}
            value={draft.weekday ?? ''}
            onChange={(e) => onChange(draft.key, { weekday: e.target.value ? Number(e.target.value) : null })}
            className={`${CELL} ${SELECT} col-span-2 sm:col-span-1`}
          >
            <option value="">Jour…</option>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>{weekdayLabel(d, true)}</option>
            ))}
          </select>
          <input
            type="time"
            lang="fr-FR"
            aria-label={`Début du créneau ${index + 1}`}
            value={draft.start}
            onChange={(e) => onChange(draft.key, { start: e.target.value })}
            className={CELL}
          />
          <input
            type="time"
            lang="fr-FR"
            aria-label={`Fin du créneau ${index + 1}`}
            value={draft.end}
            onChange={(e) => onChange(draft.key, { end: e.target.value })}
            className={CELL}
          />
          <input
            type="text"
            aria-label={`Intitulé du créneau ${index + 1}`}
            value={draft.title}
            maxLength={TITLE_MAX}
            placeholder="Intitulé"
            onChange={(e) => onChange(draft.key, { title: e.target.value })}
            className={`${CELL} col-span-2 sm:col-span-1`}
          />
          {hasLocation && (
            <input
              type="text"
              aria-label={`Lieu du créneau ${index + 1}`}
              value={draft.location ?? ''}
              maxLength={LOCATION_MAX}
              placeholder="Lieu"
              onChange={(e) => onChange(draft.key, { location: e.target.value || null })}
              className={`${CELL} col-span-2 sm:col-span-1`}
            />
          )}
        </div>
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
})

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
  const [drafts, setDrafts] = useState<SlotDraft[]>([])
  const [saving, setSaving] = useState(false)

  // Le fuseau de référence est celui du PROFIL, jamais celui du navigateur :
  // une heure importée est une heure murale, chez toi.
  const selfTz = resolveTimezone(profile?.timezone)

  const reviewed = useMemo(() => reviewSlots(drafts, existing), [drafts, existing])
  const ready = useMemo(() => reviewed.filter((r) => r.draft.selected && !r.blocking), [reviewed])
  const flagged = useMemo(() => reviewed.filter((r) => r.issues.length > 0).length, [reviewed])
  const hasLocation = useMemo(() => drafts.some((d) => d.location), [drafts])

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
      setDrafts(result.drafts)
      setStep('review')
    } catch (err) {
      setError(readError(err))
      setOutcome(null)
      setDrafts([])
      setStep('pick')
    }
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0] ?? null)
  }

  const patch = useCallback((key: string, changes: Partial<SlotDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...changes } : d)))
  }, [])

  const selectAll = (mode: 'all' | 'none' | 'safe') => {
    const safe = new Set(reviewed.filter((r) => r.issues.length === 0).map((r) => r.draft.key))
    setDrafts((prev) => prev.map((d) => ({
      ...d,
      selected: mode === 'all' ? true : mode === 'none' ? false : safe.has(d.key),
    })))
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
    const plural = inserted > 1 ? 'x' : ''
    setDrafts((prev) => prev.map((d) => (done.has(d.key) ? { ...d, selected: false } : d)))
    setError({
      message: `${inserted} créneau${plural} sur ${rows.length} ${inserted > 1 ? 'ont' : 'a'} été ajouté${plural} avant l’échec.`,
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
              {flagged > 0 && <>, dont <span className="num">{flagged}</span> à vérifier</>}.
              {' '}Les heures seront enregistrées telles quelles, à l’heure de {timezoneCity(selfTz)}.
            </p>

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
            {reviewed.map((row, index) => (
              <Row key={row.draft.key} row={row} index={index} hasLocation={hasLocation} onChange={patch} />
            ))}
          </ul>

          <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0A0908] via-[#0A0908]/95 to-transparent">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[12px] text-[#9B9287]" aria-live="polite">
                <span className="num text-[#F0EAE0]">{ready.length}</span> ligne{ready.length > 1 ? 's' : ''} cochée{ready.length > 1 ? 's' : ''} sur{' '}
                <span className="num">{reviewed.length}</span>
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
