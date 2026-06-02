import { useState, useEffect } from 'react'
import { Heart, Plus, X, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export default function GratitudeWidget() {
  const { profile, partnerProfile } = useAuthStore()
  const [myItems, setMyItems] = useState<string[]>([])
  const [partnerItems, setPartnerItems] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [inputs, setInputs] = useState(['', '', ''])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    if (!profile) return
    loadGratitude()
  }, [profile, partnerProfile])

  const loadGratitude = async () => {
    if (!profile) return

    const { data: mine } = await supabase
      .from('gratitudes')
      .select('*')
      .eq('user_id', profile.id)
      .eq('date', today)
      .limit(1)
      .single()

    if (mine) setMyItems(mine.items)

    if (partnerProfile) {
      const { data: theirs } = await supabase
        .from('gratitudes')
        .select('*')
        .eq('user_id', partnerProfile.id)
        .eq('date', today)
        .limit(1)
        .single()

      if (theirs) setPartnerItems(theirs.items)
    }
  }

  const saveGratitude = async () => {
    if (!profile) return
    const filtered = inputs.filter(i => i.trim())
    if (filtered.length === 0) return

    setSaving(true)

    // Upsert: delete existing for today, insert new
    await supabase
      .from('gratitudes')
      .delete()
      .eq('user_id', profile.id)
      .eq('date', today)

    await supabase.from('gratitudes').insert({
      user_id: profile.id,
      items: filtered,
      date: today,
    })

    setMyItems(filtered)
    setShowForm(false)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const updateInput = (index: number, value: string) => {
    const next = [...inputs]
    next[index] = value
    setInputs(next)
  }

  if (!partnerProfile) return null

  // Already filled today — show summary
  if (myItems.length > 0 && !showForm) {
    return (
      <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118] hover:shadow-[0_8px_48px_rgba(0,0,0,0.3),0_0_0_1px_rgba(212,165,116,0.04)] group">
        {/* Top edge glow */}
        <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500 ease-out" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
              <Heart size={15} className="text-[#C2788E]" fill="currentColor" />
            </div>
            <h3 className="text-sm font-medium tracking-wide uppercase text-[#9B9287]">Gratitude</h3>
          </div>
          <span className="text-[11px] tracking-wide text-[#6B6359]">
            {format(new Date(), 'd MMM', { locale: fr })}
          </span>
        </div>

        {/* My items */}
        <div className="space-y-2 mb-3">
          {myItems.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm">
              <Sparkles size={12} className="text-[#E8B86D] mt-0.5 shrink-0 opacity-70" />
              <span className="text-[#F0EAE0]/80 leading-relaxed">{item}</span>
            </div>
          ))}
        </div>

        {/* Partner items */}
        {partnerItems.length > 0 ? (
          <div className="pt-3 border-t border-white/[0.04]">
            <p className="text-[11px] text-[#D99AAD] font-medium uppercase tracking-wider mb-2">
              {partnerProfile.display_name}
            </p>
            <div className="space-y-2">
              {partnerItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm">
                  <Sparkles size={12} className="text-[#C2788E] mt-0.5 shrink-0 opacity-70" />
                  <span className="text-[#F0EAE0]/80 leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-white/[0.04]">
            <p className="text-[11px] tracking-wide text-[#6B6359] text-center">
              {partnerProfile.display_name} n'a pas encore rempli aujourd'hui
            </p>
          </div>
        )}
      </div>
    )
  }

  // Form or prompt
  return (
    <div className="relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out hover:bg-[#252118] hover:shadow-[0_8px_48px_rgba(0,0,0,0.3),0_0_0_1px_rgba(212,165,116,0.04)] group">
      {/* Top edge glow */}
      <div className="absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60 group-hover:opacity-100 group-hover:via-[rgba(212,165,116,0.2)] transition-opacity duration-500 ease-out" />

      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-[rgba(194,120,142,0.12)] flex items-center justify-center">
          <Heart size={15} className="text-[#C2788E]" fill="currentColor" />
        </div>
        <h3 className="text-sm font-medium tracking-wide uppercase text-[#9B9287]">Gratitude du jour</h3>
      </div>

      {saved ? (
        <div className="text-center py-4 animate-bounce-in">
          <p className="text-[#C2788E] text-sm font-medium leading-relaxed">Merci pour ta gratitude</p>
        </div>
      ) : showForm ? (
        <div className="space-y-2.5 animate-slide-up">
          <p className="text-[11px] tracking-wide text-[#9B9287] mb-2">
            3 choses que tu apprecies aujourd'hui
          </p>
          {inputs.map((val, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="text-[#E8B86D] text-[11px] shrink-0 font-medium">{i + 1}.</span>
              <input
                type="text"
                value={val}
                onChange={(e) => updateInput(i, e.target.value)}
                placeholder={
                  i === 0 ? 'Ex: Son sourire ce matin...'
                  : i === 1 ? 'Ex: Notre appel hier soir...'
                  : 'Ex: Sa patience infinie...'
                }
                className="w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-2.5 text-sm text-[#F0EAE0] placeholder-[#6B6359] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]"
                autoFocus={i === 0}
                maxLength={120}
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setInputs(['', '', '']) }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[#9B9287] bg-transparent hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] active:scale-[0.98] transition-all duration-300 ease-out flex-1"
            >
              <X size={14} /> Annuler
            </button>
            <button
              onClick={saveGratitude}
              disabled={saving || inputs.every(i => !i.trim())}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed flex-1"
            >
              {saving ? '...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2.5 py-5 rounded-xl bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(212,165,116,0.06)] transition-all duration-300 ease-out text-[#9B9287] hover:text-[#F0EAE0] text-sm leading-relaxed"
        >
          <Plus size={16} className="text-[#C2788E]" />
          <span>Qu'apprecies-tu aujourd'hui ?</span>
        </button>
      )}
    </div>
  )
}
