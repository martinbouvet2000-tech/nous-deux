import { useCallback, useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/lib/toast'
import { LABEL } from '@/lib/ui'
import {
  activerNotifications,
  desactiverNotifications,
  etatActionnable,
  etatActuel,
  MESSAGE_ETAT,
  type EtatPush,
} from '@/lib/push'

/**
 * Réglage « Notifications ».
 *
 * L'état affiché est honnête : non supporté, à activer, actives, ou refusées au
 * niveau du navigateur — et sur iPhone, le cas « pas encore sur l'écran
 * d'accueil », qui explique le geste au lieu de laisser croire à une panne.
 *
 * La demande de permission part du clic sur l'interrupteur, jamais d'un effet :
 * les navigateurs l'exigent, et iOS ne transige pas là-dessus.
 */
export default function NotificationsToggle() {
  const user = useAuthStore((s) => s.user)
  const [etat, setEtat] = useState<EtatPush | null>(null)
  const [busy, setBusy] = useState(false)

  // Lecture de l'état au montage — et rien d'autre. Le rafraîchissement de la
  // ligne `push_subscriptions` appartient au démarrage de l'app (`App.tsx`) :
  // le faire aussi ici réécrivait la même ligne à chaque venue sur Réglages.
  useEffect(() => {
    let annule = false
    etatActuel()
      .then((e) => { if (!annule) setEtat(e) })
      .catch(() => { if (!annule) setEtat('non-supporte') })
    return () => { annule = true }
  }, [user?.id])

  const basculer = useCallback(async () => {
    if (!user?.id || busy || !etat || !etatActionnable(etat)) return
    setBusy(true)
    try {
      const res = etat === 'active' ? await desactiverNotifications() : await activerNotifications(user.id)
      setEtat(res.etat)
      if (res.ok) toast.success(res.message)
      else toast.info(res.message)
    } finally {
      setBusy(false)
    }
  }, [busy, etat, user?.id])

  const actif = etat === 'active'
  const manipulable = !!etat && etatActionnable(etat) && !!user?.id
  const libelle = etat === null ? 'Vérification…' : actif ? 'Notifications actives' : 'M’envoyer des notifications'

  return (
    <div>
      <span className={`${LABEL} flex items-center gap-1`}>
        <BellRing size={12} aria-hidden="true" /> Notifications
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        aria-busy={busy || undefined}
        aria-describedby="push-aide"
        disabled={!manipulable || busy}
        onClick={basculer}
        className="group w-full min-h-11 flex items-center justify-between gap-4 rounded-xl px-4 py-2.5 text-left bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:bg-white/[0.06] transition-all duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="text-sm text-[#F0EAE0]">{libelle}</span>
        <span
          aria-hidden="true"
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ease-out ${
            actif ? 'bg-gradient-to-r from-[#D4A574] to-[#C2788E]' : 'bg-white/[0.10] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.14)]'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-200 ease-out ${
              actif ? 'translate-x-5 bg-[#110F0E]' : 'translate-x-0 bg-[#9B9287]'
            }`}
          />
        </span>
      </button>
      <p id="push-aide" className="text-xs text-[#9B9287] mt-1.5 leading-relaxed" aria-live="polite">
        {etat === null ? 'Vérification de cet appareil…' : MESSAGE_ETAT[etat]}
      </p>
      {etat !== 'non-supporte' && etat !== null && (
        <p className="text-xs text-[#9B9287]/80 mt-1 leading-relaxed">
          Une notification dit toujours qui a fait le geste, jamais ce qu’il contient : ni l’humeur posée, ni le texte d’une capsule.
        </p>
      )}
    </div>
  )
}
