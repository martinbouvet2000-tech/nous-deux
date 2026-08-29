import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { run } from '@/lib/db'
import { toast } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import { LABEL } from '@/lib/ui'

/**
 * Interrupteur « Partager ma position avec {partenaire} ».
 * Met à jour `profiles.share_location` puis rafraîchit le store.
 */
export default function ShareLocationToggle({ compact = false }: { compact?: boolean }) {
  const { profile, partnerProfile, fetchProfile } = useAuthStore()
  const [busy, setBusy] = useState(false)
  const on = !!profile?.share_location
  const partnerName = partnerProfile?.display_name ?? 'ton/ta partenaire'

  const toggle = async () => {
    if (!profile || busy) return
    setBusy(true)
    const next = !on
    const { ok } = await run(
      supabase.from('profiles').update({ share_location: next }).eq('id', profile.id),
      { errorMessage: "Le réglage n'a pas pu être enregistré." },
    )
    if (ok) {
      await fetchProfile()
      toast.success(next ? `Ta position est partagée avec ${partnerName}.` : 'Ta position n’est plus partagée.')
    }
    setBusy(false)
  }

  return (
    <div>
      {!compact && (
        <span className={`${LABEL} flex items-center gap-1`}>
          <MapPin size={12} aria-hidden="true" /> Position
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-busy={busy || undefined}
        disabled={!profile || busy}
        onClick={toggle}
        className="group w-full min-h-11 flex items-center justify-between gap-4 rounded-xl px-4 py-2.5 text-left bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:bg-white/[0.06] transition-all duration-200 ease-out disabled:cursor-not-allowed"
      >
        <span className="text-sm text-[#F0EAE0]">Partager ma position avec {partnerName}</span>
        <span
          aria-hidden="true"
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ease-out ${
            on ? 'bg-gradient-to-r from-[#D4A574] to-[#C2788E]' : 'bg-white/[0.10] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.14)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-200 ease-out ${
              on ? 'translate-x-5 bg-[#110F0E]' : 'translate-x-0 bg-[#9B9287]'
            }`}
          />
        </span>
      </button>
      <p className="text-xs text-[#9B9287] mt-1.5 leading-relaxed">
        Seul·e {partnerName} la voit. Parcours conservé 48 h, puis effacé.
        {on ? ' Ta position n’est relevée que lorsque l’app est ouverte.' : ''}
      </p>
    </div>
  )
}
