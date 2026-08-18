import { useState, type FormEvent } from 'react'
import { Heart, ArrowRight, ArrowLeft, MailCheck } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { INPUT } from '@/lib/ui'

type Mode = 'signin' | 'signup' | 'forgot' | 'check-email' | 'reset-sent'

const LABEL = 'block text-xs font-medium tracking-[0.08em] uppercase text-[#9B9287] mb-1.5'

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, requestPasswordReset } = useAuthStore()

  const switchMode = (m: Mode) => { setMode(m); setError('') }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('8 caractères minimum pour le mot de passe.')
        const { needsEmailConfirmation } = await signUp(email, password, displayName)
        if (needsEmailConfirmation) setMode('check-email')
      } else if (mode === 'forgot') {
        await requestPasswordReset(email)
        setMode('reset-sent')
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  const heading =
    mode === 'signup' ? 'Créer un compte'
    : mode === 'forgot' ? 'Mot de passe oublié'
    : mode === 'check-email' ? 'Vérifie ta boîte mail'
    : mode === 'reset-sent' ? 'Email envoyé'
    : 'Bon retour'

  const subheading =
    mode === 'signup' ? 'Rejoins ton/ta partenaire sur Nous Deux'
    : mode === 'forgot' ? 'On t’envoie un lien pour choisir un nouveau mot de passe'
    : mode === 'check-email' ? `Un lien de confirmation a été envoyé à ${email}. Clique dessus pour activer ton compte (pense aux spams).`
    : mode === 'reset-sent' ? `Si un compte existe pour ${email}, un lien de réinitialisation vient d’être envoyé. Il est valable une heure.`
    : 'Connecte-toi pour retrouver ton/ta partenaire'

  return (
    <div className="min-h-dvh flex" style={{ fontFamily: "'Instrument Sans', 'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* ─── Left panel — branding (desktop) ─── */}
      <div className="hidden lg:flex flex-1 items-center justify-center relative overflow-hidden bg-[#110F0E]">
        <div className="absolute rounded-full" style={{ top: '10%', left: '10%', width: 500, height: 500, background: 'rgba(212,165,116,0.08)', filter: 'blur(140px)', animation: 'loginOrbDrift1 12s ease-in-out infinite' }} aria-hidden="true" />
        <div className="absolute rounded-full" style={{ bottom: '5%', right: '10%', width: 450, height: 450, background: 'rgba(194,120,142,0.06)', filter: 'blur(120px)', animation: 'loginOrbDrift2 14s ease-in-out infinite' }} aria-hidden="true" />
        <div className="relative z-10 text-center px-12 max-w-md">
          <div className="relative inline-block mb-12">
            <div className="absolute rounded-full" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-40%)', width: 120, height: 80, background: 'rgba(212,165,116,0.12)', filter: 'blur(40px)', animation: 'loginGlowPulse 4s ease-in-out infinite' }} aria-hidden="true" />
            <Heart size={72} className="relative" fill="currentColor" style={{ color: '#D4A574', opacity: 0.85, filter: 'drop-shadow(0 4px 24px rgba(212,165,116,0.2))' }} aria-hidden="true" />
          </div>
          <h1 className="mb-5 text-[3rem] font-light leading-[1.1] tracking-[0.06em] text-[#F0EAE0]">Nous Deux</h1>
          <p className="text-base leading-relaxed text-[#9B9287] max-w-[320px] mx-auto">
            Votre espace intime pour cultiver votre amour, peu importe la distance.
          </p>
        </div>
      </div>

      {/* ─── Right panel — form ─── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-[#110F0E]">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="text-center mb-10 lg:hidden animate-fade-in">
            <div className="relative inline-block mb-6">
              <div className="absolute rounded-full" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-40%)', width: 80, height: 60, background: 'rgba(212,165,116,0.15)', filter: 'blur(30px)', animation: 'loginGlowPulse 4s ease-in-out infinite' }} aria-hidden="true" />
              <Heart size={48} className="relative" fill="currentColor" style={{ color: '#D4A574', opacity: 0.85, filter: 'drop-shadow(0 4px 20px rgba(212,165,116,0.2))' }} aria-hidden="true" />
            </div>
            <h1 className="text-[1.875rem] font-light leading-[1.2] tracking-[0.05em] text-[#F0EAE0]">Nous Deux</h1>
            <p className="text-[#9B9287] text-sm mt-2">Votre espace intime, privé et chaleureux</p>
          </div>

          <div className="mb-8 animate-slide-up">
            <h2 className="text-2xl font-light tracking-[0.02em] text-[#F0EAE0]">{heading}</h2>
            <p className="text-[#9B9287] text-sm mt-1.5 leading-relaxed">{subheading}</p>
          </div>

          {(mode === 'check-email' || mode === 'reset-sent') ? (
            <div className="space-y-5 animate-slide-up">
              <div className="w-14 h-14 rounded-2xl bg-[rgba(212,165,116,0.12)] flex items-center justify-center">
                <MailCheck size={26} className="text-[#D4A574]" aria-hidden="true" />
              </div>
              <button type="button" onClick={() => switchMode('signin')} className="inline-flex items-center gap-2 text-sm text-[#D4A574] hover:text-[#E8C9A0] transition-colors">
                <ArrowLeft size={16} aria-hidden="true" /> Retour à la connexion
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 animate-slide-up" style={{ animationDelay: '0.1s' }} noValidate>
              {mode === 'signup' && (
                <div className="animate-slide-up">
                  <label htmlFor="login-name" className={LABEL}>Prénom</label>
                  <input id="login-name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ton prénom" required maxLength={40} autoComplete="given-name" className={INPUT} />
                </div>
              )}

              <div>
                <label htmlFor="login-email" className={LABEL}>Email</label>
                <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="ton@email.com" required autoFocus autoComplete="email" inputMode="email" className={INPUT} />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="login-password" className={LABEL}>Mot de passe</label>
                    {mode === 'signin' && (
                      <button type="button" onClick={() => switchMode('forgot')} className="text-xs text-[#9B9287] hover:text-[#D4A574] transition-colors mb-1.5">
                        Oublié ?
                      </button>
                    )}
                  </div>
                  <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" required minLength={mode === 'signup' ? 8 : 6}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className={INPUT} />
                  {mode === 'signup' && <p className="text-xs text-[#8A8177] mt-1.5">8 caractères minimum.</p>}
                </div>
              )}

              <div aria-live="polite" aria-atomic="true">
                {error && (
                  <div role="alert" className="animate-bounce-in rounded-xl px-4 py-3 bg-[rgba(239,68,68,0.08)]">
                    <p className="text-[#F87171] text-sm m-0">{error}</p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-[0.9375rem] font-medium bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/60"
              >
                {loading ? (
                  <span className="w-5 h-5 rounded-full border-2 border-[#110F0E]/30 border-t-[#110F0E] animate-spin" aria-label="Chargement" />
                ) : (
                  <>
                    {mode === 'signup' ? "S'inscrire" : mode === 'forgot' ? 'Envoyer le lien' : 'Se connecter'}
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" aria-hidden="true" />
                  </>
                )}
              </button>

              <p className="text-center pt-2 text-sm text-[#9B9287]">
                {mode === 'forgot' ? (
                  <button type="button" onClick={() => switchMode('signin')} className="text-[#D4A574] font-semibold hover:text-[#E8C9A0] transition-colors">
                    Retour à la connexion
                  </button>
                ) : (
                  <>
                    {mode === 'signup' ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
                    <button type="button" onClick={() => switchMode(mode === 'signup' ? 'signin' : 'signup')} className="text-[#D4A574] font-semibold hover:text-[#E8C9A0] transition-colors">
                      {mode === 'signup' ? 'Se connecter' : "S'inscrire"}
                    </button>
                  </>
                )}
              </p>
            </form>
          )}
        </div>
      </div>

      <style>{`
        @keyframes loginOrbDrift1 { 0%,100%{transform:translate(0,0) scale(1);opacity:.7} 33%{transform:translate(30px,-20px) scale(1.05);opacity:1} 66%{transform:translate(-15px,15px) scale(.95);opacity:.8} }
        @keyframes loginOrbDrift2 { 0%,100%{transform:translate(0,0) scale(1);opacity:.6} 40%{transform:translate(-25px,15px) scale(1.08);opacity:.9} 70%{transform:translate(20px,-10px) scale(.92);opacity:.7} }
        @keyframes loginGlowPulse { 0%,100%{opacity:.6;transform:translate(-50%,-40%) scale(1)} 50%{opacity:1;transform:translate(-50%,-40%) scale(1.15)} }
      `}</style>
    </div>
  )
}
