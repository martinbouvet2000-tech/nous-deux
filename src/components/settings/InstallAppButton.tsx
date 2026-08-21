import { useState } from 'react'
import { Download, Shield, Lock, Zap, X } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { toast } from '@/lib/toast'
import { BTN_PRIMARY, BTN_GHOST } from '@/lib/ui'

export default function InstallAppButton() {
  const { canInstall, isInstalled, install } = useInstallPrompt()
  const [showModal, setShowModal] = useState(false)

  if (isInstalled || !canInstall) return null

  const handleInstall = async () => {
    const success = await install()
    if (success) {
      toast.success("Awy est installee ! Ouvrez-la depuis votre ecran d'accueil.")
      setShowModal(false)
    } else {
      toast.error("Installation annulee.")
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`${BTN_PRIMARY} w-full py-3 flex items-center justify-center gap-2`}
        aria-label="Installer l'application Awy"
      >
        <Download size={18} aria-hidden="true" />
        Installer l'app
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-[#1E1B17] rounded-3xl md:rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-white/[0.08] animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-busy="false"
            aria-labelledby="install-modal-title"
          >
            {/* Header */}
            <div className="relative px-6 pt-6 pb-4 border-b border-white/[0.06]">
              <button
                onClick={() => setShowModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-white/[0.05] rounded-xl transition-colors"
                aria-label="Fermer"
              >
                <X size={20} className="text-[#B8A793]" aria-hidden="true" />
              </button>
              <h2 id="install-modal-title" className="font-display text-xl text-[#F0EAE0] flex items-center gap-2">
                <Download size={22} className="text-[#D4A574]" aria-hidden="true" />
                Installer Awy
              </h2>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-5">
              <p className="text-sm text-[#F0EAE0]/90 leading-relaxed">
                Installez Awy directement sur votre ecran d'accueil pour un acces instantane, sans passer par le navigateur.
              </p>

              {/* Benefits */}
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Zap size={18} className="text-[#D4A574] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#F0EAE0]">Acces rapide</p>
                    <p className="text-xs text-[#B8A793] leading-relaxed">Icone sur l'ecran d'accueil, plein ecran, aucun navigateur.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Lock size={18} className="text-[#D4A574] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#F0EAE0]">Chiffre de bout en bout</p>
                    <p className="text-xs text-[#B8A793] leading-relaxed">Vos donnees privees, vos cles — personne d'autre ne peut lire.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Shield size={18} className="text-[#D4A574] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#F0EAE0]">Certificat HTTPS verifie</p>
                    <p className="text-xs text-[#B8A793] leading-relaxed">Connexion securisee. Aucun tiers ne peut intercepter.</p>
                  </div>
                </div>
              </div>

              {/* Security badges */}
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { icon: '🔒', label: 'HTTPS', sublabel: 'Securise' },
                  { icon: '✓', label: 'PWA', sublabel: 'Signe' },
                  { icon: '🔐', label: 'E2E', sublabel: 'Chiffre' },
                ].map(({ icon, label, sublabel }) => (
                  <div key={label} className="rounded-xl p-3 bg-white/[0.03] border border-white/[0.06] text-center">
                    <div className="text-lg">{icon}</div>
                    <p className="text-xs font-medium text-[#F0EAE0] mt-1">{label}</p>
                    <p className="text-[11px] text-[#B8A793] leading-tight">{sublabel}</p>
                  </div>
                ))}
              </div>

              {/* Note */}
              <p className="text-xs text-[#B8A793] leading-relaxed bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                Awy fonctionne completement dans votre telephone. Aucune donnee n'est envoyee a des serveurs externes, sauf pour la synchronisation entre vous deux via Supabase (chiffre).
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3">
              <button onClick={() => setShowModal(false)} className={`${BTN_GHOST} flex-1 py-3`}>
                Plus tard
              </button>
              <button onClick={handleInstall} className={`${BTN_PRIMARY} flex-1 py-3 flex items-center justify-center gap-2`}>
                <Download size={18} aria-hidden="true" />
                Installer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
