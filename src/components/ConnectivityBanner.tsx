import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useConnectivityStore } from '@/stores/connectivityStore'
import { formatAge } from '@/lib/offlineCache'

/**
 * Bannière globale, discrète, cohérente avec le thème sombre.
 * - Hors ligne : « Hors ligne — dernières infos il y a 5 min » (elle reste, et
 *   apparaît dès l'ouverture de l'app quand le téléphone n'a pas de réseau).
 * - Reconnexion : « Reconnexion… » (transitoire, le temps du rattrapage), puis disparaît.
 * En ligne : rien.
 *
 * Fixée en haut, sous la safe-area, au-dessus de la navigation. L'animation du
 * spinner est neutralisée par le reset global `prefers-reduced-motion`.
 */
export default function ConnectivityBanner() {
  const status = useConnectivityStore((s) => s.status)
  const lastSyncAt = useConnectivityStore((s) => s.lastSyncAt)
  const offline = status === 'offline'

  // Hors ligne, l'âge des données affichées vieillit sous les yeux : on le rafraîchit.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!offline || !lastSyncAt) return
    const id = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [offline, lastSyncAt])

  if (status === 'online') return null

  const offlineLabel = lastSyncAt
    ? `Hors ligne — dernières infos ${formatAge(lastSyncAt)}`
    : 'Hors ligne — les infos peuvent être périmées'

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto inline-flex max-w-[calc(100%-1rem)] items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] leading-none shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md motion-safe:animate-fade-in ${
          offline
            ? 'bg-[#1E1B17]/92 text-[#E8C9A0] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]'
            : 'bg-[#1E1B17]/92 text-[#9B9287] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.08)]'
        }`}
      >
        {offline ? (
          <>
            <WifiOff size={13} aria-hidden="true" className="shrink-0 text-[#D4A574]" />
            <span className="truncate">{offlineLabel}</span>
          </>
        ) : (
          <>
            <RefreshCw size={13} aria-hidden="true" className="shrink-0 text-[#D4A574] motion-safe:animate-spin" />
            <span className="truncate">Reconnexion…</span>
          </>
        )}
      </div>
    </div>
  )
}
