import { useCallback, useRef, useState } from 'react'
import { startOfDay, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Plus, Moon, Smile, Check, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useLiveData } from '@/hooks/useLiveData'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { shine, unshine } from '@/lib/shine'
import { EYEBROW } from '@/lib/ui'
import { MOODS, moodFromRow, type MoodDef } from '@/lib/moods'
import type { Mood } from '@/types/database'
import Hamster from '@/components/Hamster'

/**
 * Widget « Humeur & énergie » : la mascotte hamster de chacun, 12 états.
 * Autonome : charge les humeurs du jour, écoute le temps réel, gère le sélecteur.
 * Révélation aveugle (comme les gratitudes) : l’humeur du partenaire reste voilée
 * tant que l’on n’a pas enregistré la sienne pour aujourd’hui.
 */
export default function HamsterMoodWidget({ className = '' }: { className?: string }) {
  const { profile, partnerProfile } = useAuthStore()
  const [mine, setMine] = useState<Mood | null>(null)
  const [theirs, setTheirs] = useState<Mood | null>(null)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [preview, setPreview] = useState<MoodDef | null>(null)
  // Ref sur l’humeur du jour de l’utilisateur : lue dans le handler temps réel
  // (closure stable) pour ne divulguer l’humeur du partenaire que si la sienne est mise.
  const mineRef = useRef<Mood | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const today = startOfDay(new Date()).toISOString()
    const { data: mm } = await supabase.from('moods').select('*').eq('user_id', profile.id).gte('created_at', today).order('created_at', { ascending: false }).limit(1)
    const mineRow = mm?.[0] ?? null
    setMine(mineRow)
    mineRef.current = mineRow
    if (partnerProfile) {
      const { data: pm } = await supabase.from('moods').select('*').eq('user_id', partnerProfile.id).gte('created_at', today).order('created_at', { ascending: false }).limit(1)
      setTheirs(pm?.[0] ?? null)
    } else setTheirs(null)
  }, [profile, partnerProfile])

  // Charge l’humeur du jour, écoute le temps réel et rattrape au retour du réseau.
  useLiveData({
    enabled: !!profile,
    channel: profile ? `hamster:${profile.id}` : null,
    load,
    bind: (ch) => {
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods', filter: `user_id=eq.${profile?.id}` }, () => load())
      if (partnerProfile) {
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'moods', filter: `user_id=eq.${partnerProfile.id}` }, (p) => {
          load()
          // Ne divulgue l’humeur du partenaire que si la nôtre est déjà posée (révélation aveugle).
          const d = moodFromRow(p.new as Mood)
          if (d && mineRef.current) toast.info(`Humeur de ${partnerProfile.display_name}\u202f: ${d.label.toLowerCase()}`)
          else if (!mineRef.current) toast.info(`${partnerProfile.display_name} a partagé son humeur · mets la tienne pour la découvrir`)
        })
      }
    },
  })

  if (!profile) return null
  const myDef = moodFromRow(mine)
  const theirDef = moodFromRow(theirs)

  // Humeur montrée en en-tête du sélecteur : l’aperçu survolé, sinon la mienne.
  const headDef = preview ?? myDef

  const choose = async (d: MoodDef) => {
    if (saving) return
    setSaving(d.key)
    const { ok } = await run(supabase.from('moods').insert({ user_id: profile.id, emoji: d.emoji, label: d.label, state: d.key }))
    setSaving(null)
    if (ok) { setPicking(false); setPreview(null); load() }
  }

  const person = (name: string, def: MoodDef | null, row: Mood | null, isMe: boolean) => {
    // Révélation aveugle : le partenaire a posé son humeur mais pas moi → on la voile.
    const veiled = !isMe && !mine && !!row
    const shown = veiled ? null : def
    return (
      <div className={`flex flex-col items-center justify-center text-center rounded-2xl px-3 pt-4 pb-3 ${shown ? 'bg-white/[0.035]' : 'bg-white/[0.02]'} shadow-[inset_0_0_0_1px_rgba(240,234,224,0.07)]`}>
        <div className="relative">
          <Hamster state={shown?.key ?? null} dim={!shown} size={96} className={shown && !isMe ? 'animate-hamster-pop' : ''} />
          {veiled && (
            <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#1c1814]/70 shadow-[inset_0_0_0_1px_rgba(240,234,224,0.12)]">
                <EyeOff size={16} className="text-[#C6BDB0]" />
              </span>
            </span>
          )}
        </div>
        <span className="mt-3 text-[12px] text-[#9B9287] truncate max-w-full">{name}</span>
        <span className="text-[13px] leading-snug text-[#F0EAE0] font-medium">{shown ? shown.label : isMe ? 'Comment tu te sens\u202f?' : veiled ? 'Humeur cachée' : 'En attente…'}</span>
        {shown && row && <span className="mt-0.5 text-[11px] text-[#9B9287]">{formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: fr })}</span>}
        {isMe && (
          <button onClick={() => setPicking(true)} className="btn-tertiary mt-2" aria-label={def ? 'Changer mon humeur' : 'Choisir mon humeur'}>
            {def ? <>Changer</> : <><Plus size={12} aria-hidden="true" /> Choisir</>}
          </button>
        )}
        {veiled && <span className="mt-2 text-[11px] text-[#C6BDB0] leading-snug px-1">Mets ton humeur pour découvrir celle de {name}</span>}
        {!isMe && !veiled && !def && <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#9B9287]"><Moon size={11} aria-hidden="true" /> rien aujourd’hui</span>}
      </div>
    )
  }

  return (
    <section className={`lux-card relative overflow-hidden rounded-[20px] p-5 md:p-6 ${className}`} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="hamster-title">
      <h2 id="hamster-title" className={`${EYEBROW} mb-4 inline-flex items-center gap-1.5`}><Smile size={11} aria-hidden="true" className="text-[#D4A574]" /> Humeur &amp; énergie</h2>

      {picking ? (
        <div className="animate-fade-in">
          {/* L’en-tête montre toujours la même humeur que l’illustration : celle que l’on
              survole le cas échéant, sinon celle qui est réellement sélectionnée. */}
          <div className="flex items-center gap-4 mb-4">
            <Hamster state={headDef?.key ?? null} dim={!headDef} size={72} />
            <div className="min-w-0" aria-live="polite">
              <p className="text-[15px] text-[#F0EAE0] font-medium">
                {headDef ? headDef.label : 'Comment tu te sens, là\u202f?'}
              </p>
              <p className="text-[12px] text-[#9B9287] leading-relaxed min-h-[2.2em]">
                {headDef
                  ? headDef.hint
                  : `Choisis l’état qui te ressemble le plus — ${partnerProfile?.display_name ?? 'l’autre'} le verra tout de suite.`}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Choisir mon humeur">
            {MOODS.map((d) => {
              const active = myDef?.key === d.key
              return (
                <button key={d.key} onClick={() => choose(d)} onMouseEnter={() => setPreview(d)} onFocus={() => setPreview(d)} onMouseLeave={() => setPreview(null)} onBlur={() => setPreview(null)}
                  disabled={!!saving} aria-pressed={active}
                  className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2 min-h-11 text-left transition-all duration-200 ${active ? 'bg-[#D4A574]/12 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.4)]' : 'bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.06)] hover:bg-white/[0.06] hover:-translate-y-px'} disabled:opacity-60`}>
                  <Hamster state={d.key} size={40} className="shrink-0 -my-1" />
                  <span className="text-[13px] text-[#F0EAE0] leading-tight whitespace-nowrap">{d.label}</span>
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
