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
    <div
      className="min-h-dvh flex"
      style={{ fontFamily: "'Instrument Sans', 'Inter', system-ui, -apple-system, sans-serif" }}
    >
      {/* ─── Left panel — atmospheric branding (desktop only) ─── */}
      <div
        className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden"
        style={{ background: '#110F0E' }}
      >
        {/* Pulsing amber orb — top-left */}
        <div
          className="absolute"
          style={{
            top: '10%',
            left: '10%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'rgba(212, 165, 116, 0.08)',
            filter: 'blur(140px)',
            animation: 'loginOrbDrift1 12s ease-in-out infinite',
          }}
        />
        {/* Pulsing rose orb — bottom-right */}
        <div
          className="absolute"
          style={{
            bottom: '5%',
            right: '10%',
            width: '450px',
            height: '450px',
            borderRadius: '50%',
            background: 'rgba(194, 120, 142, 0.06)',
            filter: 'blur(120px)',
            animation: 'loginOrbDrift2 14s ease-in-out infinite',
          }}
        />

        {/* Content */}
        <div className="relative z-10 text-center px-12 max-w-md">
          {/* Floating heart — large, minimal, no box */}
          <div className="relative inline-block mb-12">
            {/* Ambient glow beneath heart */}
            <div
              className="absolute"
              style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -40%)',
                width: '120px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(212, 165, 116, 0.12)',
                filter: 'blur(40px)',
                animation: 'loginGlowPulse 4s ease-in-out infinite',
              }}
            />
            <Heart
              size={72}
              className="relative"
              fill="currentColor"
              style={{
                color: '#D4A574',
                opacity: 0.85,
                filter: 'drop-shadow(0 4px 24px rgba(212, 165, 116, 0.2))',
              }}
            />
          </div>

          <h1
            className="mb-5"
            style={{
              fontSize: '3rem',
              fontWeight: 300,
              letterSpacing: '0.06em',
              color: '#F0EAE0',
              lineHeight: 1.1,
            }}
          >
            Nous Deux
          </h1>
          <p
            style={{
              fontSize: '1rem',
              lineHeight: 1.65,
              color: '#9B9287',
              maxWidth: '320px',
              margin: '0 auto',
            }}
          >
            Votre espace intime pour cultiver votre amour, peu importe la distance.
          </p>
        </div>
      </div>

      {/* ─── Right panel — form ─── */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-12"
        style={{ background: '#110F0E' }}
      >
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="text-center mb-10 lg:hidden animate-fade-in">
            <div className="relative inline-block mb-6">
              {/* Ambient glow */}
              <div
                className="absolute"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -40%)',
                  width: '80px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'rgba(212, 165, 116, 0.15)',
                  filter: 'blur(30px)',
                  animation: 'loginGlowPulse 4s ease-in-out infinite',
                }}
              />
              <Heart
                size={48}
                className="relative"
                fill="currentColor"
                style={{
                  color: '#D4A574',
                  opacity: 0.85,
                  filter: 'drop-shadow(0 4px 20px rgba(212, 165, 116, 0.2))',
                }}
              />
            </div>
            <h1
              style={{
                fontSize: '1.875rem',
                fontWeight: 300,
                letterSpacing: '0.05em',
                color: '#F0EAE0',
                lineHeight: 1.2,
              }}
            >
              Nous Deux
            </h1>
            <p style={{ color: '#9B9287', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Votre espace intime, privé et chaleureux
            </p>
          </div>

          {/* Desktop form header */}
          <div className="lg:block hidden mb-8 animate-slide-up">
            <h2
              style={{
                fontSize: '1.5rem',
                fontWeight: 300,
                letterSpacing: '0.02em',
                color: '#F0EAE0',
              }}
            >
              {isSignUp ? 'Créer un compte' : 'Bon retour'}
            </h2>
            <p style={{ color: '#9B9287', fontSize: '0.875rem', marginTop: '0.375rem' }}>
              {isSignUp
                ? 'Rejoins ton/ta partenaire sur Nous Deux'
                : 'Connecte-toi pour retrouver ton/ta partenaire'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {isSignUp && (
              <div className="animate-slide-up">
                <label
                  htmlFor="login-name"
                  style={{
                    display: 'block',
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#9B9287',
                    marginBottom: '0.375rem',
                  }}
                >
                  Prénom
                </label>
                <input
                  id="login-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ton prénom"
                  required
                  autoComplete="given-name"
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: 'none',
                    borderRadius: '0.75rem',
                    padding: '0.75rem 1rem',
                    fontSize: '0.875rem',
                    color: '#F0EAE0',
                    outline: 'none',
                    transition: 'all 0.3s ease-out',
                  }}
                  onFocus={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                    e.target.style.boxShadow = '0 0 0 2px rgba(212, 165, 116, 0.15), 0 0 0 1px rgba(212, 165, 116, 0.08)'
                  }}
                  onBlur={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.03)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                style={{
                  display: 'block',
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#9B9287',
                  marginBottom: '0.375rem',
                }}
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ton@email.com"
                required
                autoFocus
                autoComplete="email"
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  color: '#F0EAE0',
                  outline: 'none',
                  transition: 'all 0.3s ease-out',
                }}
                onFocus={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.target.style.boxShadow = '0 0 0 2px rgba(212, 165, 116, 0.15), 0 0 0 1px rgba(212, 165, 116, 0.08)'
                }}
                onBlur={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.03)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                style={{
                  display: 'block',
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#9B9287',
                  marginBottom: '0.375rem',
                }}
              >
                Mot de passe
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  color: '#F0EAE0',
                  outline: 'none',
                  transition: 'all 0.3s ease-out',
                }}
                onFocus={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.05)'
                  e.target.style.boxShadow = '0 0 0 2px rgba(212, 165, 116, 0.15), 0 0 0 1px rgba(212, 165, 116, 0.08)'
                }}
                onBlur={(e) => {
                  e.target.style.background = 'rgba(255, 255, 255, 0.03)'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            <div aria-live="polite" aria-atomic="true">
              {error && (
                <div
                  role="alert"
                  className="animate-bounce-in"
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    borderRadius: '0.75rem',
                    padding: '0.75rem 1rem',
                  }}
                >
                  <p style={{ color: '#F87171', fontSize: '0.875rem', margin: 0 }}>{error}</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-label={isSignUp ? "S'inscrire" : 'Se connecter'}
              className="group"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.875rem 1.25rem',
                borderRadius: '0.75rem',
                fontSize: '0.9375rem',
                fontWeight: 500,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, #D4A574, #C2788E)',
                color: '#110F0E',
                boxShadow: '0 2px 20px rgba(212, 165, 116, 0.2)',
                transition: 'all 0.3s ease-out',
                opacity: loading ? 0.4 : 1,
                outline: 'none',
                letterSpacing: '0.01em',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = '0 4px 28px rgba(212, 165, 116, 0.35)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 20px rgba(212, 165, 116, 0.2)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
              onMouseDown={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(0) scale(0.98)'
                }
              }}
              onMouseUp={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }
              }}
            >
              {loading ? (
                <div
                  style={{
                    width: '1.25rem',
                    height: '1.25rem',
                    borderRadius: '50%',
                    border: '2px solid rgba(17, 15, 14, 0.3)',
                    borderTopColor: '#110F0E',
                    animation: 'spin 0.6s linear infinite',
                  }}
                />
              ) : (
                <>
                  {isSignUp ? "S'inscrire" : 'Se connecter'}
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <p className="text-center pt-2" style={{ fontSize: '0.875rem', color: '#9B9287' }}>
              {isSignUp ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError('') }}
                style={{
                  color: '#D4A574',
                  fontWeight: 600,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'color 0.3s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#E8C9A0' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#D4A574' }}
              >
                {isSignUp ? 'Se connecter' : "S'inscrire"}
              </button>
            </p>
          </form>
        </div>
      </div>

      {/* ─── Keyframe animations ─── */}
      <style>{`
        @keyframes loginOrbDrift1 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.7;
          }
          33% {
            transform: translate(30px, -20px) scale(1.05);
            opacity: 1;
          }
          66% {
            transform: translate(-15px, 15px) scale(0.95);
            opacity: 0.8;
          }
        }
        @keyframes loginOrbDrift2 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.6;
          }
          40% {
            transform: translate(-25px, 15px) scale(1.08);
            opacity: 0.9;
          }
          70% {
            transform: translate(20px, -10px) scale(0.92);
            opacity: 0.7;
          }
        }
        @keyframes loginGlowPulse {
          0%, 100% {
            opacity: 0.6;
            transform: translate(-50%, -40%) scale(1);
          }
          50% {
            opacity: 1;
            transform: translate(-50%, -40%) scale(1.15);
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        /* Placeholder color for login inputs */
        #login-name::placeholder,
        #login-email::placeholder,
        #login-password::placeholder {
          color: #6B6359;
        }
      `}</style>
    </div>
  )
}
