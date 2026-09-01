/**
 * Awy — récupération de vidéos.
 *
 * On colle un lien, l'app rend un fichier posé sur le téléphone : dans la
 * galerie photo quand le format s'y prête, dans Fichiers sinon.
 *
 * Le travail se partage en deux. Ici, côté navigateur : mettre le lien au
 * propre, suivre l'avancement, et surtout choisir la bonne porte de sortie —
 * feuille de partage (galerie) ou téléchargement (Fichiers). Là-bas, dans la
 * fonction Edge `telecharger-video` : trouver le fichier réel derrière la page
 * et le rapatrier en pièce jointe, ce qu'un navigateur ne peut pas faire seul.
 */
import { supabase } from '@/lib/supabase'

export type Qualite = 'max' | 'compatible' | 'audio'

export interface FichierVideo {
  /** Lien signé, valable cinq minutes, vers notre flux. */
  url: string
  nom: string
  type: 'video' | 'audio' | 'photo'
}

export interface Resolution {
  fichiers: FichierVideo[]
  /** Pistes séparées à assembler : le son peut manquer, on prévient. */
  assemblageLocal?: boolean
}

/** Formats que la galerie d'un téléphone accepte sans broncher (iOS compris). */
const FORMATS_GALERIE = /\.(mp4|m4v|mov|jpg|jpeg|png|heic|gif)$/i

/**
 * Met un lien collé au propre. On accepte ce qu'un humain colle vraiment :
 * des espaces autour, un `www.` tout nu, un partage iOS qui traîne du texte
 * autour de l'adresse.
 */
export function normaliserLien(brut: string): string | null {
  const texte = (brut ?? '').trim()
  if (!texte) return null

  // Lien noyé dans un texte de partage (« Regarde ça ! https://… »).
  const trouve = texte.match(/https?:\/\/\S+/i)
  const candidat = trouve ? trouve[0] : texte.split(/\s+/)[0]
  const avecSchema = /^https?:\/\//i.test(candidat) ? candidat : `https://${candidat}`

  let u: URL
  try {
    u = new URL(avecSchema)
  } catch {
    return null
  }
  // Un hôte sans point n'est pas un site : c'est une faute de frappe.
  if (!u.hostname.includes('.')) return null
  return u.href
}

/** « 1,4 Go » plutôt que « 1503238553 ». */
export function formaterOctets(octets: number): string {
  if (!Number.isFinite(octets) || octets <= 0) return '—'
  const unites = ['o', 'ko', 'Mo', 'Go']
  let n = octets
  let i = 0
  while (n >= 1024 && i < unites.length - 1) {
    n /= 1024
    i++
  }
  const arrondi = n >= 100 || i === 0 ? Math.round(n) : Math.round(n * 10) / 10
  return `${String(arrondi).replace('.', ',')} ${unites[i]}`
}

/** Un `.webm` ne rentrera jamais dans les photos d'un iPhone : autant le dire avant. */
export function compatibleGalerie(nom: string): boolean {
  return FORMATS_GALERIE.test(nom)
}

/** La feuille de partage — donc « Enregistrer la vidéo » — existe-t-elle ici ? */
export function partageFichiersDisponible(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && !!navigator.share
}

/**
 * Demande à la fonction Edge les fichiers réels derrière un lien.
 * Les erreurs remontent déjà rédigées en français : elles s'affichent telles quelles.
 */
export async function resoudreVideo(lien: string, qualite: Qualite, signal?: AbortSignal): Promise<Resolution> {
  const base = import.meta.env.VITE_SUPABASE_URL as string
  const { data } = await supabase.auth.getSession()
  const jeton = data.session?.access_token
  if (!jeton) throw new Error('Session expirée : reconnecte-toi.')

  const reponse = await fetch(`${base}/functions/v1/telecharger-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ url: lien, qualite }),
    signal,
  })

  let corps: { fichiers?: FichierVideo[]; assemblageLocal?: boolean; erreur?: string }
  try {
    corps = await reponse.json()
  } catch {
    throw new Error('Le serveur a répondu de travers.')
  }
  if (!reponse.ok) throw new Error(corps.erreur || "La vidéo n'a pas pu être préparée.")
  if (!corps.fichiers?.length) throw new Error('Rien à récupérer derrière ce lien.')
  return { fichiers: corps.fichiers, assemblageLocal: corps.assemblageLocal }
}

/**
 * Rapatrie le fichier en tenant l'avancement à jour.
 *
 * Le fichier passe entièrement par la mémoire : c'est le prix à payer pour
 * pouvoir le remettre à la galerie, qui n'accepte qu'un fichier en main, jamais
 * une adresse. Pour les très gros fichiers, la page propose l'autre porte —
 * `ouvrirDansFichiers`, qui laisse le téléphone télécharger tout seul.
 */
export async function rapatrier(
  fichier: FichierVideo,
  surAvancement: (recus: number, total: number) => void,
  signal?: AbortSignal,
): Promise<File> {
  const reponse = await fetch(fichier.url, { signal })
  if (!reponse.ok) throw new Error('Le fichier n’a pas pu être récupéré (lien périmé ?).')

  const total = Number(reponse.headers.get('content-length') ?? '0')
  const morceaux: BlobPart[] = []
  let recus = 0

  const lecteur = reponse.body?.getReader()
  if (!lecteur) {
    const blob = await reponse.blob()
    surAvancement(blob.size, blob.size)
    return new File([blob], fichier.nom, { type: blob.type || 'application/octet-stream' })
  }

  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    if (value) {
      morceaux.push(value as unknown as BlobPart)
      recus += value.byteLength
      surAvancement(recus, total)
    }
  }

  const type = reponse.headers.get('content-type') ?? 'application/octet-stream'
  return new File(morceaux, fichier.nom, { type })
}

/**
 * Remet le fichier au téléphone par la feuille de partage : c'est de là que
 * partent « Enregistrer la vidéo » (iOS) et « Enregistrer dans la Galerie »
 * (Android). Rend `false` si l'appareil ne sait pas partager ce fichier —
 * la page bascule alors sur le téléchargement.
 */
export async function partagerVersGalerie(fichier: File): Promise<boolean> {
  if (!partageFichiersDisponible()) return false
  const donnees = { files: [fichier] }
  if (!navigator.canShare(donnees)) return false
  try {
    await navigator.share(donnees)
    return true
  } catch (err) {
    // Feuille de partage refermée à la main : ce n'est pas un échec à signaler.
    if (err instanceof DOMException && err.name === 'AbortError') return true
    return false
  }
}

/** Enregistre le fichier déjà en mémoire dans Fichiers / Téléchargements. */
export function enregistrerDansFichiers(fichier: File): void {
  const url = URL.createObjectURL(fichier)
  declencherTelechargement(url, fichier.name)
  // Laisser au navigateur le temps d'ouvrir le flux avant de rendre la mémoire.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Laisse le téléphone télécharger lui-même depuis le lien signé : rien ne passe
 * par la mémoire de la page, donc aucune limite de taille. C'est la voie des
 * fichiers 4K, qui se comptent en gigaoctets.
 */
export function ouvrirDansFichiers(fichier: FichierVideo): void {
  declencherTelechargement(fichier.url, fichier.nom)
}

function declencherTelechargement(url: string, nom: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
