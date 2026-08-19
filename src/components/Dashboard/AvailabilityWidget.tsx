import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Phone, Check, Flag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { shine, unshine } from '@/lib/shine'
import { EYEBROW } from '@/lib/ui'
import { STATUSES, STATUS_BY_KEY, STALE_AFTER_MS } from '@/lib/availability'
import type { Availability, AvailabilityStatus } from '@/types/database'
import CallFlag from '@/components/CallFlag'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * « Dispo pour un appel ? » — un drapeau chacun. Le mien se change d'un tap,
 * celui de l'autre se met à jour en temps réel. Autonome.
 */
export default function AvailabilityWidget({ className = '' }: { className?: string }) {
  const { profile, partnerProfile } = useAuthStore()
  const [mine, setMine] = useState<Availability | null>(null)
  const [theirs, setTheirs] = useState<Availability | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<AvailabilityStatus | null>(null)
  const [, tick] = useState(0)
  const wave = useMemo(() => !reduced(), [])

  const load = useCallback(async () => {
    if (!profile) return
    const ids = [profile.id, partnerProfile?.id].filter(Boolean) as string[]
    const { data } = await supabase.from('availability').select('*').in('user_id', ids)
    const rows = (data ?? []) as Availability[]
    setMine(rows.find((r) => r.user_id === profile.id) ?? null)
    setTheirs(partnerProfile ? rows.find((r) => r.user_id === partnerProfile.id) ?? null : null)
  }, [profile, partnerProfile])

  useEffect(() => {
    if (!profile) return
    load()
    const ch = supabase.channel(`availability:${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availability', filter: `user_id=eq.${profile.id}` }, () => load())
    if (partnerProfile) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'availability', filter: `user_id=eq.${partnerProfile.id}` }, (p) => {
        load()
        const row = p.new as Partial<Availability>
        if (row?.status && row.status === 'free') toast.info(`${partnerProfile.display_name} est dispo pour un appel`)
      })
    }
    ch.subscribe()
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [profile, partnerProfile, load])

  if (!profile) return null

  const setStatus = async (status: AvailabilityStatus) => {
    if (saving) return
    setSaving(status)
    const { ok } = await run(supabase.from('availability').upsert({ user_id: profile.id, status, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }))
    setSaving(null)
    if (ok) { setOpen(false); load() }
  }

  const isStale = (a: Availability | null) => !a || Date.now() - new Date(a.updated_at).getTime() > STALE_AFTER_MS
  const ago = (a: Availability) => formatDistanceToNow(new Date(a.updated_at), { addSuffix: true, locale: fr })

  const flagCard = (name: string, a: Availability | null, isMe: boolean) => {
    const def = a ? STATUS_BY_KEY[a.status] : null
    const stale = isStale(a)
    return (
      <div className={`flex flex-col items-center text-center rounded-2xl px-3 pt-3 pb-3 shadow-[inset_0_0_0_1px_rgba(240,234,224,0.07)] ${def && !stale ? 'bg-white/[0.035]' : 'bg-white/[0.02]'}`}>
        <CallFlag status={def ? def.key : null} size={64} wave={wave && !!def && !stale} dim={!def || stale} />
        <span className="mt-1 text-[12px] text-[#9B9287] truncate max-w-full">{name}</span>
        <span className="text-[14px] leading-snug font-medium text-[#F0EAE0] inline-flex items-center gap-1.5">
          {def && <span className="size-2 rounded-full shrink-0" style={{ background: def.color, boxShadow: stale ? 'none' : `0 0 8px ${def.color}` }} aria-hidden="true" />}
          {def ? def.label : isMe ? 'Indique ta dispo' : 'Pas encore indiqué'}
        </span>
        {a && <span className="mt-0.5 text-[11px] text-[#9B9287]">{stale ? 'il y a longtemps' : ago(a)}</span>}
        {isMe && <button onClick={() => setOpen(true)} className="btn-tertiary mt-2"><Flag size={12} aria-hidden="true" /> {def ? 'Changer' : 'Choisir'}</button>}
      </div>
    )
  }

  return (
    <section className={`lux-card relative overflow-hidden rounded-[20px] p-5 md:p-6 ${className}`} onMouseMove={shine} onMouseLeave={unshine} aria-labelledby="avail-title">
      <h2 id="avail-title" className={`${EYEBROW} mb-4 inline-flex items-center gap-1.5`}><Phone size={11} aria-hidden="true" className="text-[#D4A574]" /> Dispo pour un appel ?</h2>

      {open ? (
        <div className="animate-fade-in">
          <p className="text-[15px] text-[#F0EAE0] font-medium mb-3" id="avail-pick-label">Là, maintenant, tu es…</p>
          <div className="grid gap-1.5" role="group" aria-labelledby="avail-pick-label">
            {STATUSES.map((s) => {
              const active = mine?.status === s.key
              return (
                <button key={s.key} onClick={() => setStatus(s.key)} disabled={!!saving} aria-pressed={active}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 min-h-11 text-left transition-all duration-200 ${active ? 'bg-[#D4A574]/12 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.4)]' : 'bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.06)] hover:bg-white/[0.06]'} disabled:opacity-60`}>
                  <span className="size-3 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 10px ${s.color}88` }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-[#F0EAE0] leading-tight">{s.label}</span>
                    <span className="block text-[11px] text-[#9B9287] leading-tight">{s.hint}</span>
                  </span>
                  {active && <Check size={13} className="text-[#D4A574] shrink-0" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          <div className="mt-3 text-center"><button onClick={() => setOpen(false)} className="btn-tertiary">Annuler</button></div>
        </div>
      ) : (
        <div className={`grid gap-3 ${partnerProfile ? 'grid-cols-2' : 'grid-cols-1 max-w-[240px] mx-auto'}`}>
          {flagCard(profile.display_name, mine, true)}
          {partnerProfile && flagCard(partnerProfile.display_name, theirs, false)}
        </div>
      )}
    </section>
  )
}
