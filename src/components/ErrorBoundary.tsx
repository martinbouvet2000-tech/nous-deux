import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Heart, RefreshCw } from 'lucide-react'
import { BTN_PRIMARY } from '@/lib/ui'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }
  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-dvh flex items-center justify-center bg-[#110F0E] px-6">
          <div className="text-center max-w-sm">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 rounded-full bg-[#C2788E]/20 blur-xl scale-150" aria-hidden="true" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[#C2788E]/25 to-[#D4A574]/15 flex items-center justify-center">
                <Heart size={36} className="text-[#C2788E]" aria-hidden="true" />
              </div>
            </div>
            <h1 className="font-display text-2xl gradient-text mb-2">Oups, petit souci…</h1>
            <p className="text-[#9B9287] text-sm mb-6 leading-relaxed">
              Quelque chose s'est mal passé. Pas de panique, tes données sont en sécurité.
            </p>
            <button onClick={this.handleReload} className={`${BTN_PRIMARY} px-6 py-3`}>
              <RefreshCw size={16} aria-hidden="true" />
              Recharger
            </button>
            {this.state.error && (
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
