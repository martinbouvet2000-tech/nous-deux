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
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
              <Heart size={15} className="text-secondary" fill="currentColor" />
            </div>
            <h3 className="text-sm font-semibold">Gratitude</h3>
          </div>
          <span className="text-[10px] text-text-dim">
            {format(new Date(), 'd MMM', { locale: fr })}
          </span>
        </div>

        {/* My items */}
        <div className="space-y-1.5 mb-3">
          {myItems.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Sparkles size={12} className="text-accent mt-0.5 shrink-0" />
              <span className="text-text/80">{item}</span>
            </div>
          ))}
        </div>

        {/* Partner items */}
        {partnerItems.length > 0 ? (
          <div className="pt-2.5 border-t border-white/[0.04]">
            <p className="text-[10px] text-secondary-light font-semibold uppercase tracking-wider mb-1.5">
              {partnerProfile.display_name}
            </p>
            <div className="space-y-1.5">
              {partnerItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Sparkles size={12} className="text-secondary mt-0.5 shrink-0" />
                  <span className="text-text/80">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="pt-2.5 border-t border-white/[0.04]">
            <p className="text-[10px] text-text-dim text-center">
              {partnerProfile.display_name} n'a pas encore rempli aujourd'hui
            </p>
          </div>
        )}
      </div>
    )
  }

  // Form or prompt
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-secondary/15 flex items-center justify-center">
          <Heart size={15} className="text-secondary" fill="currentColor" />
        </div>
        <h3 className="text-sm font-semibold">Gratitude du jour</h3>
      </div>

      {saved ? (
        <div className="text-center py-4 animate-bounce-in">
          <p className="text-secondary text-sm font-medium">Merci pour ta gratitude ! 💜</p>
        </div>
      ) : showForm ? (
        <div className="space-y-2 animate-slide-up">
          <p className="text-xs text-text-muted mb-2">
            3 choses que tu apprécies aujourd'hui
          </p>
          {inputs.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-accent text-xs shrink-0">{i + 1}.</span>
              <input
                type="text"
                value={val}
                onChange={(e) => updateInput(i, e.target.value)}
                placeholder={
                  i === 0 ? 'Ex: Son sourire ce matin...'
                  : i === 1 ? 'Ex: Notre appel hier soir...'
                  : 'Ex: Sa patience infinie...'
                }
                className="input text-sm py-2"
                autoFocus={i === 0}
                maxLength={120}
              />
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setInputs(['', '', '']) }}
              className="btn btn-ghost flex-1 text-xs py-2"
            >
              <X size={14} /> Annuler
            </button>
            <button
              onClick={saveGratitude}
              disabled={saving || inputs.every(i => !i.trim())}
              className="btn btn-secondary flex-1 text-xs py-2"
            >
              {saving ? '...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.03] transition-all text-text-muted hover:text-text text-sm"
        >
          <Plus size={16} className="text-secondary" />
          <span>Qu'apprécies-tu aujourd'hui ?</span>
        </button>
      )}
    </div>
  )
}
