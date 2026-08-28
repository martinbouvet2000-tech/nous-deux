import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Heart, RefreshCw, WifiOff } from 'lucide-react'
import { BTN_PRIMARY } from '@/lib/ui'
import { useConnectivityStore } from '@/stores/connectivityStore'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null; offline: boolean }

/**
 * Signatures d'un morceau de code (chunk) que le navigateur n'a pas pu aller
 * chercher : c'est le cas typique d'une page jamais ouverte avant la coupure.
 */
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|failed to fetch/i

/** Le navigateur ou l'app savent-ils déjà qu'on est hors réseau ? */
function currentlyOffline(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  return useConnectivityStore.getState().status === 'offline'
}

export default class ErrorBoundary extends Component<Props, State> {
  private retryOnline: (() => void) | null = null

  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, offline: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Hors ligne + chunk manquant : ce n'est pas un plantage de l'app, c'est le réseau.
    const offline = currentlyOffline() && CHUNK_ERROR.test(error?.message ?? '')
    return { hasError: true, error, offline }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
    if (!this.state.offline || this.retryOnline) return
    // Au retour du réseau, on retente tout seul : le chunk manquant se chargera.
    this.retryOnline = () => {
      this.detach()
      this.setState({ hasError: false, error: null, offline: false })
    }
    window.addEventListener('online', this.retryOnline)
  }

  componentWillUnmount() {
    this.detach()
  }

  private detach() {
    if (!this.retryOnline) return
    window.removeEventListener('online', this.retryOnline)
    this.retryOnline = null
  }

  handleReload = () => {
    this.detach()
    this.setState({ hasError: false, error: null, offline: false })
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const { offline } = this.state
      return (
        <div className="min-h-dvh flex items-center justify-center bg-[#110F0E] px-6">
          <div className="text-center max-w-sm">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 rounded-full bg-[#C2788E]/20 blur-xl scale-150" aria-hidden="true" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[#C2788E]/25 to-[#D4A574]/15 flex items-center justify-center">
                {offline
                  ? <WifiOff size={34} className="text-[#D4A574]" aria-hidden="true" />
                  : <Heart size={36} className="text-[#C2788E]" aria-hidden="true" />}
              </div>
            </div>
            <h1 className="font-display text-2xl gradient-text mb-2">
              {offline ? 'Tu es hors ligne' : 'Oups, petit souci…'}
            </h1>
            <p className="text-[#9B9287] text-sm mb-6 leading-relaxed">
              {offline
                ? "Cette partie d'Awy n'a pas encore été enregistrée sur ton téléphone. Reviens quand le réseau revient — rien n'est perdu, tout t'attend."
                : "Quelque chose s'est mal passé. Pas de panique, tes données sont en sécurité."}
            </p>
            <button onClick={this.handleReload} className={`${BTN_PRIMARY} px-6 py-3`}>
              <RefreshCw size={16} aria-hidden="true" />
              {offline ? 'Réessayer' : 'Recharger'}
            </button>
            {!offline && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-xs text-[#9B9287] cursor-pointer hover:text-[#F0EAE0]">Détails techniques</summary>
                <pre className="mt-2 p-3 bg-[#1E1B17] rounded-lg text-[11px] text-[#9B9287] overflow-x-auto">{this.state.error.message}</pre>
              </details>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
