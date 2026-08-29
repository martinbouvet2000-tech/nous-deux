import { useCallback, useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Satellite, Copy, Check, Trash2, ShieldOff, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { run, humanizeError } from '@/lib/db'
import { toast } from '@/lib/toast'
import { confirm } from '@/lib/confirm'
import { useAuthStore } from '@/stores/authStore'
import { BTN_PRIMARY, BTN_GHOST, INPUT, LABEL, CARD, CARD_EDGE, CARD_TITLE } from '@/lib/ui'
import { corpsJsonExemple, nettoyerEtiquette, ETIQUETTE_MAX, URL_INGESTION } from '@/lib/positionArrierePlan'
import type { LocationToken } from '@/types/database'

/**
 * Réglage « Position en arrière-plan ».
 *
 * Awy ne peut pas suivre la position quand l’app est fermée — aucune
 * application web ne le peut. Un raccourci du téléphone, lui, le peut : il lui
 * faut une clé. Cet écran la fabrique, l’affiche UNE SEULE FOIS, et permet de
 * la couper à tout moment.
 *
 * Le jeton en clair ne vit que dans l’état de ce composant, le temps de le
 * recopier. Ni la base ni ce fichier ne le gardent : la base n’en connaît que
 * l’empreinte SHA-256, et un rechargement de page l’efface pour de bon.
 */
export default function BackgroundLocationTokens() {
  const user = useAuthStore((s) => s.user)
  const [jetons, setJetons] = useState<LocationToken[] | null>(null)
  const [etiquette, setEtiquette] = useState('')
  const [busy, setBusy] = useState(false)
  /** Le jeton fraîchement créé, en clair, en mémoire seulement. */
  const [nouveau, setNouveau] = useState<string | null>(null)
  const [copie, setCopie] = useState<'jeton' | 'json' | 'url' | null>(null)

  const charger = useCallback(async () => {
    if (!user?.id) return
    const { data } = await run(
      supabase
        .from('location_tokens')
        .select('id, user_id, label, created_at, last_used_at, revoked_at')
        .order('created_at', { ascending: false }),
      { errorMessage: 'La liste des raccourcis n’a pas pu être chargée.' },
    )
    setJetons((data as LocationToken[] | null) ?? [])
  }, [user?.id])

  useEffect(() => { void charger() }, [charger])

  const copier = async (texte: string, quoi: 'jeton' | 'json' | 'url') => {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(quoi)
      setTimeout(() => setCopie(null), 2000)
    } catch {
      toast.error('Copie impossible — sélectionne le texte à la main.')
    }
  }

  const creer = async () => {
    setBusy(true)
    const { ok, data, error } = await run(
      supabase.rpc('creer_jeton_position', { etiquette: nettoyerEtiquette(etiquette) }),
      { silent: true },
    )
    setBusy(false)
    if (!ok || typeof data !== 'string') {
      // `humanizeError` relaie tel quel le message d’une exception P0001 —
      // celui de la fonction SQL, écrit pour être lu par quelqu’un.
      return toast.error(humanizeError(error, 'Le jeton n’a pas pu être créé.'))
    }
    setNouveau(data)
    setEtiquette('')
    await charger()
  }

  const revoquer = async (jeton: LocationToken) => {
    const nom = jeton.label ?? 'ce raccourci'
    const oui = await confirm({
      title: `Révoquer ${nom}\u202f?`,
      message: 'Le raccourci du téléphone cessera immédiatement d’envoyer ta position. Tu pourras toujours en créer un nouveau.',
      confirmLabel: 'Révoquer', danger: true, irreversible: true,
    })
    if (!oui) return
    setBusy(true)
    const { ok } = await run(
      supabase.rpc('revoquer_jeton_position', { jeton_id: jeton.id }),
      { errorMessage: 'La révocation a échoué.' },
    )
    setBusy(false)
    if (ok) {
      toast.info('Jeton révoqué. Ce raccourci n’envoie plus rien.')
      await charger()
    }
  }

  const supprimer = async (jeton: LocationToken) => {
    setBusy(true)
    const { ok } = await run(
      supabase.from('location_tokens').delete().eq('id', jeton.id),
      { errorMessage: 'La suppression a échoué.' },
    )
    setBusy(false)
    if (ok) await charger()
  }

  const depuis = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr })

  return (
    <section className={`${CARD} space-y-4`} aria-labelledby="bg-loc-title">
      <div className={CARD_EDGE} aria-hidden="true" />
      <h2 id="bg-loc-title" className={`${CARD_TITLE} relative`}>
        <Satellite size={16} className="text-[#D4A574]" aria-hidden="true" /> Position en arrière-plan
      </h2>

      <p className="text-xs leading-relaxed text-[#9B9287] relative">
        Awy ne peut pas suivre ta position quand l’app est fermée — aucune application web ne le peut. Un
        raccourci créé sur ton téléphone, lui, le peut&#8239;: il envoie ta position à intervalle régulier, sans
        rien ouvrir. Ça demande une petite configuration une fois pour toutes, expliquée dans
        <span className="text-[#F0EAE0]/80"> docs/position-en-arriere-plan.md</span>.
      </p>

      {/* ─── Le jeton fraîchement créé : montré une seule fois ─── */}
      {nouveau && (
        <div
          className="relative rounded-2xl p-4 space-y-3 bg-[rgba(212,165,116,0.06)] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.28)]"
          role="alert"
        >
          <p className="text-[13px] leading-relaxed text-[#E8C9A0]">
            Note-le maintenant, il ne sera plus jamais affiché. Awy n’en garde qu’une empreinte&#8239;: même
            nous ne pouvons pas te le redonner.
          </p>
          <div className="rounded-xl px-3 py-2.5 bg-[rgba(0,0,0,0.25)] font-mono text-[13px] break-all select-all text-[#F0EAE0]">
            {nouveau}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copier(nouveau, 'jeton')} className={`${BTN_PRIMARY} text-xs px-4`}>
              {copie === 'jeton' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} Copier le jeton
            </button>
            <button type="button" onClick={() => copier(URL_INGESTION, 'url')} className={`${BTN_GHOST} text-xs px-4`}>
              {copie === 'url' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} Copier l’URL
            </button>
            <button type="button" onClick={() => copier(corpsJsonExemple(nouveau), 'json')} className={`${BTN_GHOST} text-xs px-4`}>
              {copie === 'json' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} Copier le corps JSON
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNouveau(null)}
            className="tap-44 text-xs text-[#9B9287] underline underline-offset-4 hover:text-[#F0EAE0]"
          >
            J’ai noté le jeton, masquer
          </button>
        </div>
      )}

      {/* ─── Créer ─── */}
      <div className="relative">
        <label htmlFor="jeton-etiquette" className={LABEL}>Nom du raccourci (facultatif)</label>
        <div className="flex gap-2">
          <input
            id="jeton-etiquette"
            type="text"
            value={etiquette}
            onChange={(e) => setEtiquette(e.target.value)}
            className={`${INPUT} flex-1`}
            placeholder={'Ex\u202f: mon iPhone'}
            maxLength={ETIQUETTE_MAX}
            autoComplete="off"
          />
          <button type="button" onClick={creer} disabled={busy} className={`${BTN_PRIMARY} px-4 shrink-0`}>
            <Plus size={15} aria-hidden="true" /> Créer
          </button>
        </div>
      </div>

      {/* ─── Liste ─── */}
      <div className="relative" aria-live="polite">
        {jetons === null && <p className="text-xs text-[#9B9287]">Chargement…</p>}
        {jetons?.length === 0 && (
          <p className="text-xs leading-relaxed text-[#9B9287]">
            Aucun raccourci pour l’instant. Le jeton créé ici se colle dans l’app Raccourcis (iPhone) ou HTTP
            Shortcuts (Android).
          </p>
        )}
        {!!jetons?.length && (
          <ul className="divide-y divide-white/[0.06]">
            {jetons.map((j) => {
              const revoque = j.revoked_at !== null
              return (
                <li key={j.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${revoque ? 'text-[#9B9287] line-through' : 'text-[#F0EAE0]'}`}>
                      {j.label ?? 'Raccourci sans nom'}
                    </p>
                    <p className="text-[11px] text-[#9B9287] mt-0.5">
                      {revoque
                        ? `Révoqué ${depuis(j.revoked_at as string)}`
                        : j.last_used_at
                          ? `Dernier envoi ${depuis(j.last_used_at)}`
                          : `Créé ${depuis(j.created_at)} — jamais utilisé`}
                    </p>
                  </div>
                  {revoque ? (
                    <button
                      type="button"
                      onClick={() => supprimer(j)}
                      disabled={busy}
                      className="tap-44 shrink-0 text-[#9B9287] hover:text-[#F0A5AD] disabled:opacity-60 transition-colors"
                      aria-label={`Retirer ${j.label ?? 'ce raccourci'} de la liste`}
                      title="Retirer de la liste"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revoquer(j)}
                      disabled={busy}
                      className={`${BTN_GHOST} text-xs px-4 shrink-0`}
                    >
                      <ShieldOff size={14} aria-hidden="true" /> Révoquer
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-[#9B9287]/80 relative">
        Un jeton ne sait qu’une chose&#8239;: écrire ta position, pour toi. Il ne peut rien lire, ni voir où est
        ton/ta partenaire. Et si tu coupes «&#8239;Partager ma position&#8239;» plus haut, rien n’est enregistré,
        même avec un raccourci actif.
      </p>
    </section>
  )
}
