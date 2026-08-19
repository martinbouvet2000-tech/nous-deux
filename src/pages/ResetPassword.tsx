import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, KeyRound } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/lib/toast'
import { INPUT, BTN_PRIMARY } from '@/lib/ui'
import Backdrop from '@/components/Backdrop'

/**
 * Page atteinte via le lien "mot de passe oublié". Supabase ouvre une session
 * de récupération (event PASSWORD_RECOVERY) ; on demande simplement le nouveau mot de passe.
 */
export default function ResetPassword() {
  const { user, updatePassword } = useAuthStore()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [waited, setWaited] = useState(false)

  // Laisse 2 s à Supabase pour établir la session de récupération avant d'afficher l'erreur
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2000)
    return () => clearTimeout(t)
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('8 caractères minimum.')
    if (password !== confirmPwd) return setError('Les deux mots de passe ne correspondent pas.')
    setLoading(true)
    try {
      await updatePassword(password)
      toast.success('Mot de passe mis à jour. Bon retour !')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de mettre à jour le mot de passe.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-5 py-12 bg-[#110F0E] grain relative">
      <Backdrop />
      <div className="w-full max-w-[420px] lux-card rounded-[24px] p-6 md:p-8 relative z-10">
        <div className="text-center mb-8">
          <Heart size={40} fill="currentColor" className="mx-auto mb-4 text-[#D4A574]/85" aria-hidden="true" />
          <h1 className="font-display text-[1.75rem] tracking-tight text-[#F0EAE0]">Nouveau mot de passe</h1>
          <p className="text-sm text-[#9B9287] mt-1.5">Choisis-en un que tu n'utilises nulle part ailleurs.</p>
        </div>

        {!user ? (
          <div className="rounded-2xl p-5 bg-[#1E1B17] text-sm text-[#9B9287] leading-relaxed" role="status" aria-live="polite">
            {waited ? (
              <>
                Ce lien est invalide ou a expiré. Retourne à la{' '}
                <button onClick={() => navigate('/', { replace: true })} className="text-[#D4A574] hover:text-[#E8C9A0]">connexion</button>{' '}
                et redemande un lien.
              </>
            ) : 'Vérification du lien…'}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="new-pwd" className="block text-xs font-medium tracking-[0.08em] uppercase text-[#9B9287] mb-1.5">Nouveau mot de passe</label>
              <input id="new-pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                minLength={8} required autoFocus autoComplete="new-password" className={INPUT} placeholder="••••••••" />
            </div>
            <div>
              <label htmlFor="new-pwd-2" className="block text-xs font-medium tracking-[0.08em] uppercase text-[#9B9287] mb-1.5">Confirmer</label>
              <input id="new-pwd-2" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                minLength={8} required autoComplete="new-password" className={INPUT} placeholder="••••••••" />
            </div>
            <div aria-live="polite">
              {error && <p role="alert" className="text-[#F87171] text-sm rounded-xl px-4 py-3 bg-[rgba(239,68,68,0.08)]">{error}</p>}
            </div>
            <button type="submit" disabled={loading} className={`${BTN_PRIMARY} w-full py-3`}>
              <KeyRound size={16} aria-hidden="true" /> {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
