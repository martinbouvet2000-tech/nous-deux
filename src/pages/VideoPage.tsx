import { useCallback, useRef, useState, type FormEvent } from 'react'
import { ClipboardPaste, Download, Film, ImageDown, Loader2, Music4, Sparkles, X } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import Tabs from '@/components/ui/Tabs'
import { toast } from '@/lib/toast'
import { BTN_GHOST, BTN_PRIMARY, CARD, CARD_EDGE, CARD_TITLE, INPUT, LABEL } from '@/lib/ui'
import {
  compatibleGalerie,
  enregistrerDansFichiers,
  formaterOctets,
  normaliserLien,
  ouvrirDansFichiers,
  partageFichiersDisponible,
  partagerVersGalerie,
  rapatrier,
  resoudreVideo,
  type FichierVideo,
  type Qualite,
} from '@/lib/video'

const QUALITES: { key: Qualite; label: string; icon: typeof Film; aide: string }[] = [
  {
    key: 'max',
    label: 'Maximale',
    icon: Sparkles,
    aide: 'La meilleure définition disponible, jusqu’à la 4K. Souvent en .webm : impeccable dans Fichiers et sur Android, refusé par les photos d’un iPhone.',
  },
  {
    key: 'compatible',
    label: 'Galerie',
    icon: Film,
    aide: 'Jusqu’à 1080p en MP4 H.264 : le format que toutes les galeries acceptent, iPhone compris.',
  },
  {
    key: 'audio',
    label: 'Son seul',
    icon: Music4,
    aide: 'Juste la bande son, en MP3 320 kb/s.',
  },
]

/** Au-delà, passer par la mémoire de la page ferait planter le téléphone : on
 *  laisse le gestionnaire de téléchargement s’en charger. */
const TAILLE_MAX_MEMOIRE = 600 * 1024 * 1024

type Etat = 'repos' | 'preparation' | 'rapatriement'

export default function VideoPage() {
  const [lien, setLien] = useState('')
  const [qualite, setQualite] = useState<Qualite>('max')
  const [etat, setEtat] = useState<Etat>('repos')
  const [fichiers, setFichiers] = useState<FichierVideo[]>([])
  const [assemblageLocal, setAssemblageLocal] = useState(false)
  const [avancement, setAvancement] = useState<{ recus: number; total: number } | null>(null)
  const abandon = useRef<AbortController | null>(null)

  const aide = QUALITES.find((q) => q.key === qualite)?.aide ?? ''

  const coller = useCallback(async () => {
    try {
      const texte = await navigator.clipboard.readText()
      if (texte.trim()) setLien(texte.trim())
    } catch {
      toast.info('Ton navigateur ne laisse pas lire le presse-papiers : colle le lien à la main.')
    }
  }, [])

  const preparer = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const propre = normaliserLien(lien)
      if (!propre) {
        toast.error('Ce lien n’a pas l’air d’être une adresse valable.')
        return
      }
      setLien(propre)
      setFichiers([])
      setAssemblageLocal(false)
      setEtat('preparation')
      abandon.current?.abort()
      const controleur = new AbortController()
      abandon.current = controleur
      try {
        const { fichiers: trouves, assemblageLocal: separe } = await resoudreVideo(propre, qualite, controleur.signal)
        setFichiers(trouves)
        setAssemblageLocal(!!separe)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        toast.error(err instanceof Error ? err.message : 'La vidéo n’a pas pu être préparée.')
      } finally {
        setEtat('repos')
      }
    },
    [lien, qualite],
  )

  /** Galerie : le fichier doit passer en mémoire, la feuille de partage n’accepte rien d’autre. */
  const versGalerie = useCallback(async (fichier: FichierVideo) => {
    setEtat('rapatriement')
    setAvancement({ recus: 0, total: 0 })
    const controleur = new AbortController()
    abandon.current = controleur
    try {
      const total = Number(
        (await fetch(fichier.url, { method: 'HEAD', signal: controleur.signal })).headers.get('content-length') ?? '0',
      )
      if (total > TAILLE_MAX_MEMOIRE) {
        toast.info(`Fichier trop lourd (${formaterOctets(total)}) pour la galerie : je l’envoie dans Fichiers.`)
        ouvrirDansFichiers(fichier)
        return
      }
      const local = await rapatrier(fichier, (recus, t) => setAvancement({ recus, total: t }), controleur.signal)
      const partage = await partagerVersGalerie(local)
      if (partage) {
        toast.success('À toi de choisir « Enregistrer la vidéo » dans le menu.')
      } else {
        enregistrerDansFichiers(local)
        toast.info('Ton appareil ne sait pas viser la galerie : le fichier part dans Fichiers.')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error(err instanceof Error ? err.message : 'Le fichier n’a pas pu être récupéré.')
    } finally {
      setEtat('repos')
      setAvancement(null)
    }
  }, [])

  const versFichiers = useCallback((fichier: FichierVideo) => {
    ouvrirDansFichiers(fichier)
    toast.success('Téléchargement lancé — il finira dans Fichiers.')
  }, [])

  const annuler = useCallback(() => {
    abandon.current?.abort()
    setEtat('repos')
    setAvancement(null)
  }, [])

  const occupe = etat !== 'repos'
  const pourcent =
    avancement && avancement.total > 0 ? Math.min(100, Math.round((avancement.recus / avancement.total) * 100)) : null

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-10 md:px-8">
      <PageHeader
        eyebrow="Depuis n’importe où"
        title="Garder une"
        accent="vidéo"
        subtitle="Colle un lien — une page, un partage, un fichier. Il revient dans ta galerie ou dans Fichiers, à la meilleure définition disponible."
      />

      <form onSubmit={preparer} className={`${CARD} mt-4 space-y-4`}>
        <span className={CARD_EDGE} aria-hidden="true" />

        <div>
          <label htmlFor="lien-video" className={LABEL}>
            Lien de la vidéo
          </label>
          <div className="flex gap-2">
            <input
              id="lien-video"
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={lien}
              onChange={(e) => setLien(e.target.value)}
              placeholder="https://…"
              className={INPUT}
            />
            <button type="button" onClick={coller} className={`${BTN_GHOST} shrink-0 px-4`} aria-label="Coller le lien">
              <ClipboardPaste size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div>
          <span className={LABEL}>Qualité</span>
          <Tabs tabs={QUALITES} value={qualite} onChange={setQualite} label="Qualité de la vidéo" />
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-[#9B9287]">{aide}</p>
        </div>

        <div className="flex gap-2">
          <button type="submit" disabled={occupe || !lien.trim()} className={`${BTN_PRIMARY} w-full md:w-auto`}>
            {etat === 'preparation' ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Préparation…
              </>
            ) : (
              <>
                <Download size={16} aria-hidden="true" /> Préparer
              </>
            )}
          </button>
          {occupe && (
            <button type="button" onClick={annuler} className={`${BTN_GHOST} shrink-0 px-4`} aria-label="Annuler">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {pourcent !== null && (
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#D4A574] to-[#C2788E] transition-[width] duration-200"
                style={{ width: `${pourcent}%` }}
              />
            </div>
            <p className="mt-2 text-[12px] text-[#9B9287]" role="status" aria-live="polite">
              {formaterOctets(avancement?.recus ?? 0)} sur {formaterOctets(avancement?.total ?? 0)} — {pourcent}%
            </p>
          </div>
        )}
      </form>

      {assemblageLocal && (
        <p className="mt-4 rounded-2xl bg-[rgba(212,165,116,0.06)] px-4 py-3 text-[12.5px] leading-relaxed text-[#D4A574] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]">
          Cette source rend l’image et le son séparés : le fichier peut arriver muet. Choisis « Galerie » si tu veux la
          vidéo sonore à coup sûr.
        </p>
      )}

      {fichiers.length > 0 ? (
        <section className="mt-5 space-y-3" aria-label="Fichiers prêts">
          {fichiers.map((fichier) => {
            const galerieOk = compatibleGalerie(fichier.nom)
            return (
              <article key={fichier.url} className={`${CARD} space-y-4`}>
                <span className={CARD_EDGE} aria-hidden="true" />
                <h2 className={CARD_TITLE}>
                  {fichier.type === 'audio' ? (
                    <Music4 size={16} className="shrink-0 text-[#D4A574]" aria-hidden="true" />
                  ) : fichier.type === 'photo' ? (
                    <ImageDown size={16} className="shrink-0 text-[#D4A574]" aria-hidden="true" />
                  ) : (
                    <Film size={16} className="shrink-0 text-[#D4A574]" aria-hidden="true" />
                  )}
                  <span className="min-w-0 truncate">{fichier.nom}</span>
                </h2>

                <div className="flex flex-col gap-2 md:flex-row">
                  <button
                    type="button"
                    onClick={() => versGalerie(fichier)}
                    disabled={occupe}
                    className={`${BTN_PRIMARY} md:w-auto`}
                  >
                    <ImageDown size={16} aria-hidden="true" /> Galerie photo
                  </button>
                  <button type="button" onClick={() => versFichiers(fichier)} className={`${BTN_GHOST} md:w-auto`}>
                    <Download size={16} aria-hidden="true" /> Fichiers
                  </button>
                </div>

                <p className="text-[12.5px] leading-relaxed text-[#9B9287]">
                  {!galerieOk
                    ? 'Ce format ne rentre pas dans les photos d’un iPhone — prends « Fichiers », ou repasse en qualité « Galerie ».'
                    : partageFichiersDisponible()
                      ? 'Le menu de partage s’ouvrira : choisis « Enregistrer la vidéo ».'
                      : 'Sur ordinateur, les deux boutons enregistrent au même endroit : tes téléchargements.'}
                </p>
              </article>
            )
          })}
        </section>
      ) : (
        etat === 'repos' && (
          <div className="mt-5">
            <EmptyState
              icon={Film}
              title="Rien pour l’instant"
              text="Colle le lien d’une page ou d’un fichier vidéo, puis appuie sur Préparer. Le lien préparé reste valable cinq minutes."
            />
          </div>
        )
      )}
    </div>
  )
}
