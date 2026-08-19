import { useCallback, useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, Moon, Smile, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { shine, unshine } from '@/lib/shine'
import { EYEBROW } from '@/lib/ui'
import { MOODS, moodFromRow, type MoodDef } from '@/lib/moods'
import type { Mood } from '@/types/database'
import Hamster from '@/components/Hamster'

/**
 * Widget « Humeur & énergie » : la mascotte hamster de chacun, 7 états.
 * Autonome : charge les humeurs du jour, écoute le temps réel, gère le sélecteur.
 */
export default function HamsterMoodWidget({ className = '' }: { className?: string }) {
  const { profile, partnerProfile } = useAuthStore()
  const [mine, setMine] = useState<Mood | null>(null)
  const [theirs, setTheirs] = useState<Mood | null>(null)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [preview, setPreview] = useState<MoodDef | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data: mm } = await supabase.from('moods').select('*').eq('user_id', profile.id).gte('created_at', today).order('created_at', { ascending: false }).limit(1)
    setMine(mm?.[0] ?? null)
    if (partnerProfile) {
      const { data: pm } = await supabase.from('moods').select('*').eq('user_id', partnerProfile.id).gte('created_at', today).order('created_at', { ascending: false }).limit(1)
      setTheirs(pm?.[0] ?? null)
    } else setTheirs(null)
  }, [profile, partnerProfile])

  useEffect(() => {
    if (!profile) return
    load()
    const ch = supabase.channel(`hamster:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods', filter: `user_id=eq.${profile.id}` }, () => load())
    if (partnerProfile) {
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods', filter: `user_id=eq.${partnerProfile.id}` }, (p) => {
        load()
        const d = moodFromRow(p.new as Mood)
        if (d) toast.info(`${partnerProfile.display_name} se sent ${d.label.toLowerCase()}`)
      })
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile, partnerProfile, load])

  if (!profile) return null
  const myDef = moodFromRow(mine)
  const theirDef = moodFromRow(theirs)

  const choose = async (d: MoodDef) => {
    if (saving) return
    setSaving(d.key)
    const { ok } = await run(supabase.from('moods').insert({ user_id: profile.id, emoji: d.emoji, label: d.label, state: d.key }))
    setSaving(null)
    if (ok) { setPicking(false); setPreview(null); load() }
  }

  const person = (name: string, def: MoodDef | null, row: Mood | null, isMe: boolean) => (
    <div className={`flex flex-col items-center text-center rounded-2xl px-3 pt-4 pb-3 ${def ? 'bg-white/[0.035]' : 'bg-white/[0.02]'} shadow-[inset_0_0_0_1px_rgba(240,234,224,0.07)]`}>
      <div className="relative">
        <Hamster state={def?.key ?? null} dim={!def} size={96} className={def && !isMe ? 'animate-hamster-pop' : ''} />
        {def && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-10 rounded-full blur-[3px]" style={{ background: def.tint, opacity: 0.45 }} aria-hidden="true" />}
      </div>
      <span className="mt-3 text-[12px] text-[#9B9287] truncate max-w-full">{name}</span>
      <span className="text-[14px] leading-snug text-[#F0EAE0] font-medium">{def ? def.label : isMe ? 'Comment tu te sens ?' : 'En attente…'}</span>
      {def && row && <span className="mt-0.5 text-[11px] text-[#9B9287]">{formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: fr })}</span>}
      {isMe && (
        <button onClick={() => setPicking(true)} className="btn-tertiary mt-2" aria-label={def ? 'Changer mon humeur' : 'Choisir mon humeur'}>
          {def ? <>Changer</> : <><Plus size={12} aria-hidden="true" /> Choisir</>}
        </button>
      )}
      {!isMe && !def && <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#9B9287]"><Moon size={11} aria-hidden="true" /> rien aujourd'hui</span>}
    </div>
  )

  return (
    <section className={`lux-card relative overflow-hidden rounded-[20px] p-5 md:p-6 ${className}`} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="hamster-title">
      <h2 id="hamster-title" className={`${EYEBROW} mb-4 inline-flex items-center gap-1.5`}><Smile size={11} aria-hidden="true" className="text-[#D4A574]" /> Humeur &amp; énergie</h2>

      {picking ? (
        <div className="animate-fade-in">
          <div className="flex items-center gap-4 mb-4">
            <Hamster state={preview?.key ?? myDef?.key ?? null} dim={!preview && !myDef} size={72} />
            <div className="min-w-0">
              <p className="text-[15px] text-[#F0EAE0] font-medium" id="hamster-pick-label">Comment tu te sens, là ?</p>
              <p className="text-[12px] text-[#9B9287] leading-relaxed min-h-[2.2em]">{preview ? preview.hint : 'Choisis l’état qui te ressemble le plus — ' + (partnerProfile?.display_name ?? 'l’autre') + ' le verra tout de suite.'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="group" aria-labelledby="hamster-pick-label">
            {MOODS.map((d) => {
              const active = myDef?.key === d.key
              return (
                <button key={d.key} onClick={() => choose(d)} onMouseEnter={() => setPreview(d)} onFocus={() => setPreview(d)} onMouseLeave={() => setPreview(null)} onBlur={() => setPreview(null)}
                  disabled={!!saving} aria-pressed={active}
                  className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2 min-h-11 text-left transition-all duration-200 ${active ? 'bg-[#D4A574]/12 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.4)]' : 'bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.06)] hover:bg-white/[0.06] hover:-translate-y-px'} disabled:opacity-60`}>
                  <Hamster state={d.key} size={34} className="shrink-0" />
                  <span className="text-[13px] text-[#F0EAE0] leading-tight">{d.label}</span>
                  {active && <Check size={13} className="ml-auto text-[#D4A574] shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          <div className="mt-3 text-center">
            <button onClick={() => { setPicking(false); setPreview(null) }} className="btn-tertiary">Annuler</button>
          </div>
        </div>
      ) : (
        <div className={`grid gap-3 ${partnerProfile ? 'grid-cols-2' : 'grid-cols-1 max-w-[240px] mx-auto'}`}>
          {person(profile.display_name, myDef, mine, true)}
          {partnerProfile && person(partnerProfile.display_name, theirDef, theirs, false)}
        </div>
      )}
    </section>
  )
}
