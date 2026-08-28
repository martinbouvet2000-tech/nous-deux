import { useState } from 'react'
import { Download, Shield, Lock, Zap, X, Share2 } from 'lucide-react'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'
import { toast } from '@/lib/toast'
import { BTN_PRIMARY, BTN_GHOST } from '@/lib/ui'

/**
 * Proposition d’installation de la PWA. Sur iOS, aucune API d’installation
 * n’existe : on explique le geste (menu Partager) au lieu de le promettre.
 */
export default function InstallAppButton() {
  const { canInstall, isInstalled, install, isIOS } = useInstallPrompt()
  const [showModal, setShowModal] = useState(false)

  if (isInstalled || !canInstall) return null

  const handleInstall = async () => {
    if (isIOS) {
      toast.info('Ouvre le menu Partager, puis choisis «\u202fSur l’écran d’accueil\u202f».')
      setShowModal(false)
      if (navigator.share) {
        navigator.share({
          title: 'Awy',
          text: 'Ajoute Awy à ton écran d’accueil : tu la retrouveras en un geste.',
        }).catch(() => {})
      }
      return
    }

    const success = await install()
    if (success) {
      toast.success('Awy est installée. Ouvre-la depuis ton écran d’accueil.')
      setShowModal(false)
    } else {
      toast.error('Installation annulée.')
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`${BTN_PRIMARY} w-full py-3 flex items-center justify-center gap-2`}
        aria-label="Installer Awy sur ton appareil"
      >
        <Download size={18} aria-hidden="true" />
        Installer Awy
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div
            className="bg-[#1E1B17] rounded-3xl md:rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden border border-white/[0.08] animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-modal-title"
          >
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

            <div className="px-6 py-5 space-y-5">
              <p className="text-sm text-[#F0EAE0]/90 leading-relaxed">
                {isIOS
                  ? 'Ajoute Awy à ton écran d’accueil : tu la retrouveras en un geste, en plein écran.'
                  : 'Installe Awy sur ton écran d’accueil : tu l’ouvres en un geste, en plein écran, sans passer par le navigateur.'}
              </p>

              {isIOS && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-[#F0EAE0] flex items-center gap-2">
                    <Share2 size={16} className="text-[#D4A574]" aria-hidden="true" />
                    Sur iPhone ou iPad
                  </p>
                  <ol className="space-y-2 text-xs text-[#B8A793] leading-relaxed">
                    <li><span className="text-[#F0EAE0] font-medium">1.</span> Appuie sur le bouton Partager (le carré avec une flèche).</li>
                    <li><span className="text-[#F0EAE0] font-medium">2.</span> Fais défiler, puis choisis «&#8239;Sur l’écran d’accueil&#8239;».</li>
                    <li><span className="text-[#F0EAE0] font-medium">3.</span> Confirme le nom, puis appuie sur «&#8239;Ajouter&#8239;».</li>
                  </ol>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex gap-3">
                  <Zap size={18} className="text-[#D4A574] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#F0EAE0]">Ouverture immédiate</p>
                    <p className="text-xs text-[#B8A793] leading-relaxed">Une icône sur ton écran d’accueil, en plein écran, sans navigateur.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Lock size={18} className="text-[#D4A574] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#F0EAE0]">Connexion chiffrée</p>
                    <p className="text-xs text-[#B8A793] leading-relaxed">Tout ce qui circule entre ton appareil et Awy passe par HTTPS.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Shield size={18} className="text-[#D4A574] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium text-[#F0EAE0]">Rien qu’à vous deux</p>
                    <p className="text-xs text-[#B8A793] leading-relaxed">Seuls toi et ton/ta partenaire avez accès à ce qui est déposé ici.</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#B8A793] leading-relaxed bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                Installer ne copie rien de plus sur ton téléphone : c’est le même Awy, simplement plus rapide à ouvrir.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3">
              <button onClick={() => setShowModal(false)} className={`${BTN_GHOST} flex-1 py-3`}>
                Plus tard
              </button>
              <button onClick={handleInstall} className={`${BTN_PRIMARY} flex-1 py-3 flex items-center justify-center gap-2`}>
                {isIOS ? (
                  <>
                    <Share2 size={18} aria-hidden="true" />
                    Ouvrir le partage
                  </>
                ) : (
                  <>
                    <Download size={18} aria-hidden="true" />
                    Installer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
