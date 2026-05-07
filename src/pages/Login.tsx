import { useState } from 'react'
import { Heart } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isSignUp) {
        await signUp(email, password, displayName)
      } else {
        await signIn(email, password)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex">
      {/* Left panel - branding (desktop only) */}
      <div className="hidden lg:flex flex-1 items-center justify-center bg-gradient-to-br from-primary/20 via-bg to-secondary/10 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary blur-[100px]" />
          <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full bg-secondary blur-[80px]" />
        </div>
        <div className="relative text-center px-12 max-w-md">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-primary/20 mb-8 animate-pulse-soft">
            <Heart size={48} className="text-primary" fill="currentColor" />
          </div>
          <h1 className="text-4xl font-bold gradient-text mb-4">Nous Deux</h1>
          <p className="text-text-muted text-lg leading-relaxed">
            Votre espace privé pour cultiver votre relation, peu importe la distance.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 mb-4">
              <Heart size={32} className="text-primary" fill="currentColor" />
            </div>
            <h1 className="text-2xl font-bold gradient-text">Nous Deux</h1>
            <p className="text-text-muted text-sm mt-1">Votre espace à deux, privé et sécurisé</p>
          </div>

          <div className="lg:block hidden mb-8">
            <h2 className="text-2xl font-bold">
              {isSignUp ? 'Créer un compte' : 'Bon retour'} 💕
            </h2>
            <p className="text-text-muted text-sm mt-1">
              {isSignUp
                ? 'Rejoins ton/ta partenaire sur Nous Deux'
                : 'Connecte-toi pour retrouver ton/ta partenaire'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="animate-slide-up">
                <label htmlFor="login-name" className="block text-sm text-text-muted mb-1.5">Prénom</label>
                <input
                  id="login-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input"
                  placeholder="Ton prénom"
                  required
                  autoComplete="given-name"
                />
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-sm text-text-muted mb-1.5">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="ton@email.com"
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm text-text-muted mb-1.5">Mot de passe</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            </div>

            <div aria-live="polite" aria-atomic="true">
              {error && (
                <div role="alert" className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 animate-bounce-in">
                  <p className="text-danger text-sm">{error}</p>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} aria-label={isSignUp ? "S'inscrire" : 'Se connecter'} className="btn btn-primary w-full py-3 text-base">
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : isSignUp ? (
                "S'inscrire"
              ) : (
                'Se connecter'
              )}
            </button>

            <p className="text-center text-sm text-text-muted pt-2">
              {isSignUp ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError('') }}
                className="text-primary hover:underline font-medium"
              >
                {isSignUp ? 'Se connecter' : "S'inscrire"}
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
