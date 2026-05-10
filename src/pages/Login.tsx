import { useState } from 'react'
import { Heart, ArrowRight } from 'lucide-react'
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
      <div className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden bg-bg">
        {/* Animated background orbs */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-primary/15 blur-[120px] animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-secondary/12 blur-[100px] animate-float" style={{ animationDelay: '3s' }} />
          <div className="absolute top-1/2 right-1/3 w-48 h-48 rounded-full bg-accent/8 blur-[80px] animate-float" style={{ animationDelay: '1.5s' }} />
        </div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />

        <div className="relative text-center px-12 max-w-md z-10">
          {/* Logo with glow */}
          <div className="relative inline-block mb-10">
            <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl scale-150 animate-pulse-soft" />
            <div className="relative w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/25 to-secondary/15 border border-primary/20 flex items-center justify-center backdrop-blur-sm">
              <Heart size={52} className="text-primary" fill="currentColor" />
            </div>
          </div>

          <h1 className="text-5xl font-extrabold gradient-text mb-5 tracking-tight">Nous Deux</h1>
          <p className="text-text-muted text-lg leading-relaxed max-w-sm mx-auto">
            Votre espace privé pour cultiver votre amour, peu importe la distance.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-8">
            {['💌 Pensées', '⏳ Compte à rebours', '📸 Souvenirs', '❓ Questions'].map((f) => (
              <span key={f} className="badge text-xs">{f}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-bg">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="text-center mb-10 lg:hidden animate-fade-in">
            <div className="relative inline-block mb-5">
              <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl scale-150 animate-pulse-soft" />
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/25 to-secondary/15 border border-primary/20 flex items-center justify-center">
                <Heart size={36} className="text-primary" fill="currentColor" />
              </div>
            </div>
            <h1 className="text-3xl font-extrabold gradient-text tracking-tight">Nous Deux</h1>
            <p className="text-text-muted text-sm mt-2">Votre espace à deux, privé et sécurisé</p>
          </div>

          {/* Desktop form header */}
          <div className="lg:block hidden mb-8 animate-slide-up">
            <h2 className="text-2xl font-bold">
              {isSignUp ? 'Créer un compte' : 'Bon retour'} 💕
            </h2>
            <p className="text-text-muted text-sm mt-1.5">
              {isSignUp
                ? 'Rejoins ton/ta partenaire sur Nous Deux'
                : 'Connecte-toi pour retrouver ton/ta partenaire'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {isSignUp && (
              <div className="animate-slide-up">
                <label htmlFor="login-name" className="block text-xs text-text-muted mb-1.5 font-medium uppercase tracking-wider">Prénom</label>
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
              <label htmlFor="login-email" className="block text-xs text-text-muted mb-1.5 font-medium uppercase tracking-wider">Email</label>
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
              <label htmlFor="login-password" className="block text-xs text-text-muted mb-1.5 font-medium uppercase tracking-wider">Mot de passe</label>
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
                <div role="alert" className="bg-danger/8 border border-danger/15 rounded-xl px-4 py-3 animate-bounce-in">
                  <p className="text-danger-light text-sm">{error}</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-label={isSignUp ? "S'inscrire" : 'Se connecter'}
              className="btn btn-primary w-full py-3.5 text-base group"
            >
              {loading ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <>
                  {isSignUp ? "S'inscrire" : 'Se connecter'}
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-text-muted pt-2">
              {isSignUp ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError('') }}
                className="text-primary hover:text-primary-light font-semibold transition-colors"
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
