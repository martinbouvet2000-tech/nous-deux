import { useState, useCallback } from 'react'
import { Heart, Plus, X, Sparkles, PenLine } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useLiveData } from '@/hooks/useLiveData'
import { run } from '@/lib/db'
import { INPUT, BTN_GHOST, BTN_PRIMARY, CARD, CARD_EDGE, EYEBROW } from '@/lib/ui'
import { zonedCivilDate } from '@/lib/timezone'
import { formatDayMonthFR } from '@/lib/dates'
import { resolveTimezone, dayKey } from '@/lib/today'

/**
 * « 1er mars » : quantième à la française + mois, sans le jour de la semaine.
 * `formatDayMonthFR` rend « dimanche 1er mars » ; l'en-tête de la carte est étroit,
 * on ne garde donc que les deux derniers mots (un jour français s'écrit en un seul mot).
 * Le « 1er » vient bien de `@/lib/dates`, jamais d'un formatage local.
 */
function dayAndMonthFR(date: Date): string {
  return formatDayMonthFR(date).split(' ').slice(1).join(' ')
}

export default function GratitudeWidget() {
  const { profile, partnerProfile } = useAuthStore()
  const [myItems, setMyItems] = useState<string[]>([])
  const [partnerItems, setPartnerItems] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [inputs, setInputs] = useState(['', '', ''])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // « Aujourd'hui » = la journée civile DANS TON FUSEAU (colonne `gratitudes.date`).
  // Avec l'heure du navigateur, une gratitude écrite à 00 h 30 à Varsovie atterrissait
  // la veille — et celle de la/du partenaire semblait manquante. Cf. `src/lib/today.ts`.
  const selfTz = resolveTimezone(profile?.timezone)
  const today = dayKey(selfTz)

  const loadGratitude = useCallback(async () => {
    if (!profile) return
    const { data: mine } = await supabase.from('gratitudes').select('items')
      .eq('user_id', profile.id).eq('date', today).maybeSingle()
    setMyItems(mine?.items ?? [])

    if (partnerProfile) {
      const { data: theirs } = await supabase.from('gratitudes').select('items')
        .eq('user_id', partnerProfile.id).eq('date', today).maybeSingle()
      setPartnerItems(theirs?.items ?? [])
    }
  }, [profile, partnerProfile, today])

  useLiveData({
    enabled: !!profile,
    channel: profile && partnerProfile ? `gratitudes:${profile.id}` : null,
    load: loadGratitude,
    bind: (ch) => ch.on('postgres_changes', { event: '*', schema: 'public', table: 'gratitudes', filter: `user_id=eq.${partnerProfile?.id}` }, () => loadGratitude()),
  })

  const saveGratitude = async () => {
    if (!profile) return
    const filtered = inputs.map(i => i.trim()).filter(Boolean)
    if (filtered.length === 0) return
    setSaving(true)
    const { ok } = await run(
      supabase.from('gratitudes').upsert({ user_id: profile.id, items: filtered, date: today }, { onConflict: 'user_id,date' }),
      { errorMessage: "Ta gratitude n'a pas pu être enregistrée." },
    )
    setSaving(false)
    if (ok) {
      setMyItems(filtered)
      setShowForm(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  const updateInput = (index: number, value: string) => {
    const next = [...inputs]
    next[index] = value
    setInputs(next)
  }

  const openForm = () => {
    setInputs([myItems[0] ?? '', myItems[1] ?? '', myItems[2] ?? ''])
    setShowForm(true)
  }

  if (!partnerProfile) return null

  const header = (title: string) => (
    <div className="flex items-center justify-between gap-2 mb-4">
      <h2 className={`${EYEBROW} inline-flex min-w-0 items-center gap-1.5`}>
        <Heart size={11} className="text-[#C2788E] shrink-0" fill="currentColor" aria-hidden="true" />
        {title}
      </h2>
      {/* « Aujourd'hui » vu de TON fuseau, écrit à la française (« 1er mars ») */}
      <span className="shrink-0 text-[11px] tracking-wide text-[#9B9287] num">
        {dayAndMonthFR(zonedCivilDate(selfTz, new Date()))}
      </span>
    </div>
  )

  // Déjà rempli aujourd'hui → résumé
  if (myItems.length > 0 && !showForm) {
    return (
      <div className={`${CARD} hover:bg-[#252118] group`}>
        <div className={CARD_EDGE} aria-hidden="true" />
        {header('Gratitude')}
        <ul className="space-y-2 max-md:space-y-2.5 mb-3">
          {myItems.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <Sparkles size={12} className="text-[#E8B86D] mt-0.5 shrink-0 opacity-70" aria-hidden="true" />
              <span className="text-[#F0EAE0]/80 leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
        <button onClick={openForm} className="btn-tertiary mb-3">
          <PenLine size={11} aria-hidden="true" /> Modifier
        </button>
        <div className="pt-3 border-t border-white/[0.04]">
          {partnerItems.length > 0 ? (
            <>
              <p className="text-[11px] text-[#D99AAD] font-medium uppercase tracking-[0.18em] mb-2">{partnerProfile.display_name}</p>
              <ul className="space-y-2 max-md:space-y-2.5">
                {partnerItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm">
                    <Sparkles size={12} className="text-[#C2788E] mt-0.5 shrink-0 opacity-70" aria-hidden="true" />
                    <span className="text-[#F0EAE0]/80 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs leading-relaxed tracking-wide text-[#9B9287] text-center">{partnerProfile.display_name} n'a pas encore rempli aujourd'hui</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`${CARD} hover:bg-[#252118] group`}>
      <div className={CARD_EDGE} aria-hidden="true" />
      {header('Gratitude du jour')}

      {saved ? (
        <div className="text-center py-4 animate-bounce-in" role="status">
          <p className="text-[#C2788E] text-sm font-medium leading-relaxed">Merci pour ta gratitude</p>
        </div>
      ) : showForm ? (
        <div className="space-y-2.5 max-md:space-y-3 animate-slide-up">
          <p className="text-xs leading-relaxed tracking-wide text-[#9B9287] mb-2">3 choses que tu apprécies aujourd'hui</p>
          {inputs.map((val, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="text-[#E8B86D] text-xs shrink-0 font-medium" aria-hidden="true">{i + 1}.</span>
              <input
                type="text"
                value={val}
                onChange={(e) => updateInput(i, e.target.value)}
                aria-label={`Gratitude ${i + 1}`}
                placeholder={i === 0 ? 'Ex : Son sourire ce matin…' : i === 1 ? 'Ex : Notre appel hier soir…' : 'Ex : Sa patience infinie…'}
                className={`${INPUT} py-2.5`}
                autoFocus={i === 0}
                maxLength={120}
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setShowForm(false); setInputs(['', '', '']) }} className={`${BTN_GHOST} flex-1`}>
              <X size={14} aria-hidden="true" /> Annuler
            </button>
            <button onClick={saveGratitude} disabled={saving || inputs.every(i => !i.trim())} className={`${BTN_PRIMARY} flex-1 py-2.5`}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={openForm}
          className="w-full flex items-center justify-center gap-2.5 min-h-14 rounded-xl bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.06)] hover:bg-[rgba(212,165,116,0.08)] transition-all duration-200 text-[#F0EAE0]/90 font-display text-[16px]"
        >
          <Plus size={16} className="text-[#C2788E]" aria-hidden="true" />
          <span>Qu'apprécies-tu aujourd'hui ?</span>
        </button>
      )}
      {!showForm && !saved && partnerItems.length > 0 && (
        <p className="text-xs leading-relaxed text-[#9B9287] text-center mt-3">{partnerProfile.display_name} a déjà rempli la sienne — remplis la tienne pour la découvrir.</p>
      )}
    </div>
  )
}
