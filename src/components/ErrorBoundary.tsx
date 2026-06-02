import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Heart, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

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
        <div className="min-h-dvh flex items-center justify-center bg-bg px-6">
          <div className="text-center max-w-sm">
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 rounded-2xl bg-secondary/20 blur-xl scale-150 animate-pulse-soft" />
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-secondary/25 to-primary/15 border border-secondary/20 flex items-center justify-center">
                <Heart size={36} className="text-secondary" />
              </div>
            </div>

            <h2 className="text-xl font-bold gradient-text mb-2">
              Oups, petit souci...
            </h2>
            <p className="text-text-muted text-sm mb-6 leading-relaxed">
              Quelque chose s'est mal passe. Pas de panique, tes donnees sont en securite.
            </p>

            <button
              onClick={this.handleReload}
              className="btn btn-primary px-6 py-3 text-sm"
            >
              <RefreshCw size={16} />
              Recharger
            </button>

            {this.state.error && (
              <details className="mt-6 text-left">
                <summary className="text-[10px] text-text-dim cursor-pointer hover:text-text-muted">
                  Details techniques
                </summary>
                <pre className="mt-2 p-3 bg-surface rounded-lg text-[10px] text-text-dim overflow-x-auto">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
