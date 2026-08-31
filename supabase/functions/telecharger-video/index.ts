/**
 * Awy — fonction Edge « telecharger-video ».
 *
 * Coller un lien de vidéo — de n'importe où — et récupérer le fichier sur son
 * téléphone, dans la galerie photo ou dans Fichiers. Deux portes :
 *
 *   POST /telecharger-video          → « résoudre » : rend les fichiers réels
 *                                       derrière une page (session obligatoire).
 *   GET  /telecharger-video/flux?... → « flux » : rapatrie le fichier en le
 *                                       marquant en pièce jointe (signature).
 *
 * POURQUOI UN SERVEUR. Un navigateur ne peut pas aller chercher la vidéo d'une
 * page tierce : le fichier réel est caché derrière du JavaScript, et le CORS
 * interdit de toute façon de le lire. La résolution passe donc par une
 * instance Cobalt (COBALT_API_URL), et le fichier revient par notre flux, qui
 * ajoute l'en-tête `Content-Disposition: attachment` — c'est lui qui fait
 * apparaître « Enregistrer » sur un téléphone au lieu d'une lecture en ligne.
 *
 * OUVERTE, MAIS PAS PROXY OUVERT. Le flux n'accepte que des adresses que cette
 * fonction a elle-même rendues, scellées par une signature HMAC de cinq
 * minutes. Personne ne peut donc lui faire relayer l'adresse de son choix — ni
 * le réseau interne du serveur (SSRF), ni un fichier arbitraire. La clé de
 * scellage est dérivée de la clé de service : rien de neuf à configurer.
 *
 * LES REDIRECTIONS SONT SUIVIES À LA MAIN. C'était l'angle mort de la première
 * version : `redirect: 'follow'` ne contrôlait que l'adresse de départ, si bien
 * qu'un hébergeur pouvait rediriger vers une adresse interne — 169.254.169.254
 * et ses semblables — sans que personne ne revérifie. Chaque saut est désormais
 * résolu puis repassé par `urlPublique`, et la chaîne est bornée.
 *
 * SESSION SUR LA RÉSOLUTION, SIGNATURE SUR LE FLUX. La résolution exige une
 * session Awy valable, vérifiée ici même (`verify_jwt` reste à false pour cette
 * fonction : le flux, lui, doit rester ouvrable par le gestionnaire de
 * téléchargement du téléphone, qui n'envoie aucun en-tête).
 *
 * JOURNALISATION. Aucune adresse demandée n'est journalisée : ce que quelqu'un
 * regarde ne regarde personne d'autre.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

/** Au-delà, ce n'est plus un lien : on refuse sans lire. */
const TAILLE_MAX_CORPS = 4096

/** Durée de vie d'un lien de flux signé. Le temps d'appuyer sur « Enregistrer ». */
const VALIDITE_SIGNATURE_S = 300

/** Au-delà, c'est une boucle ou un piège : on arrête de suivre. */
const SAUTS_MAX = 5

/** Instance Cobalt qui sait extraire le fichier réel d'une page. À configurer. */
const COBALT_API_URL = (Deno.env.get('COBALT_API_URL') ?? '').replace(/\/+$/, '')
const COBALT_API_KEY = Deno.env.get('COBALT_API_KEY') ?? ''

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (corps: unknown, status = 200): Response =>
  new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })

/** Erreur lisible : elle est affichée telle quelle dans l'app, en français. */
const erreur = (message: string, status = 400): Response => json({ erreur: message }, status)

/* ─────────────────────────── Scellage des liens ─────────────────────────── */

let cleHmac: CryptoKey | null = null

/**
 * Clé de signature dérivée de la clé de service. Elle ne quitte jamais la
 * fonction et ne permettrait, si elle fuyait, que de fabriquer un lien de
 * flux — jamais d'accéder à la base.
 */
async function cle(): Promise<CryptoKey> {
  if (cleHmac) return cleHmac
  const graine = new TextEncoder().encode(`awy:telecharger-video:${SERVICE_ROLE}`)
  const empreinte = await crypto.subtle.digest('SHA-256', graine)
  cleHmac = await crypto.subtle.importKey('raw', empreinte, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return cleHmac
}

const enHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((o) => o.toString(16).padStart(2, '0'))
    .join('')

async function signer(url: string, expire: number): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await cle(), new TextEncoder().encode(`${url}\n${expire}`))
  return enHex(sig)
}

async function signatureValable(url: string, expire: number, signature: string): Promise<boolean> {
  if (!Number.isFinite(expire) || expire * 1000 < Date.now()) return false
  const attendue = await signer(url, expire)
  // Comparaison à temps constant : une signature ne se devine pas octet par octet.
  if (attendue.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < attendue.length; i++) diff |= attendue.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

/* ────────────────────────────── Petits outils ───────────────────────────── */

/** Seules ces adresses ont un sens ici — et jamais une adresse du réseau local. */
function urlPublique(brut: string): URL | null {
  let u: URL
  try {
    u = new URL(brut.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const h = u.hostname.toLowerCase()
  const interdit =
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '[::1]' ||
    h === '::1' ||
    h === '0.0.0.0' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    h.endsWith('.internal') ||
    h.endsWith('.local')
  return interdit ? null : u
}

/** Extensions qu'on sait rapatrier sans passer par une extraction. */
const MEDIA_DIRECT = /\.(mp4|m4v|mov|webm|mkv|avi|m4a|mp3|aac|opus|ogg|wav|gif|jpg|jpeg|png|heic|webp)(\?|$)/i

/** Un nom de fichier ne doit désigner qu'un fichier : ni chemin, ni en-tête. */
function nomSur(propose: string, secours: string): string {
  const nom = propose
    .replace(/[\r\n"\\/]+/g, ' ')
    // Les caractères de contrôle sont retirés exprès : c'est ce qui empêche un nom
    // de fichier de fabriquer un en-tête HTTP à lui tout seul.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return nom || secours
}

/** Nom de secours tiré de l'adresse, pour que le fichier ne s'appelle pas « download ». */
function nomDepuisUrl(u: URL): string {
  const brut = u.pathname.split('/').filter(Boolean).pop() ?? ''
  let dernier: string
  try {
    dernier = decodeURIComponent(brut)
  } catch {
    // Séquence `%` bancale dans le chemin : le nom brut fera l'affaire.
    dernier = brut
  }
  return nomSur(dernier, `video-${Date.now()}.mp4`)
}

/** Lien de flux prêt à être ouvert par le téléphone. */
async function lienFlux(origine: string, url: string, nom: string): Promise<string> {
  const expire = Math.floor(Date.now() / 1000) + VALIDITE_SIGNATURE_S
  const signature = await signer(url, expire)
  const p = new URLSearchParams({ u: url, n: nom, e: String(expire), s: signature })
  return `${origine}/telecharger-video/flux?${p.toString()}`
}

function typeFichier(nom: string): 'video' | 'audio' | 'photo' {
  if (/\.(mp3|m4a|aac|opus|ogg|wav)$/i.test(nom)) return 'audio'
  if (/\.(jpg|jpeg|png|heic|webp|gif)$/i.test(nom)) return 'photo'
  return 'video'
}

/* ───────────────────────────── Résolution ───────────────────────────────── */

type Qualite = 'max' | 'compatible' | 'audio'

interface Demande {
  url?: unknown
  qualite?: unknown
}

interface Fichier {
  url: string
  nom: string
  type: 'video' | 'audio' | 'photo'
}

/**
 * Réglages Cobalt par qualité.
 *
 * « max » vise la meilleure définition disponible, jusqu'à la 4K — sur YouTube
 * elle n'existe qu'en VP9/AV1, donc en `.webm` : parfait dans Fichiers et sur
 * Android, mais la galerie d'un iPhone n'en veut pas. « compatible » descend à
 * 1080p en H.264/MP4, que tous les téléphones acceptent dans leurs photos.
 */
function reglagesCobalt(url: string, qualite: Qualite): Record<string, unknown> {
  const base: Record<string, unknown> = { url, filenameStyle: 'basic' }
  if (qualite === 'audio') return { ...base, downloadMode: 'audio', audioFormat: 'mp3', audioBitrate: '320' }
  if (qualite === 'compatible') return { ...base, videoQuality: '1080', youtubeVideoCodec: 'h264' }
  return { ...base, videoQuality: 'max', youtubeVideoCodec: 'vp9' }
}

/** Messages d'erreur Cobalt traduits — l'app ne parle qu'en français. */
function traduireCobalt(code: string): string {
  if (code.includes('link.unsupported')) return "Ce site n'est pas reconnu. Essaie le lien direct du fichier vidéo."
  if (code.includes('link.invalid')) return "Ce lien n'a pas l'air d'être une adresse valable."
  if (code.includes('content.video.unavailable') || code.includes('content.video.private'))
    return 'Cette vidéo est privée ou indisponible.'
  if (code.includes('content.video.age') || code.includes('content.video.region'))
    return 'Cette vidéo est restreinte (âge ou pays) : impossible de la récupérer.'
  if (code.includes('content.too_long')) return 'Cette vidéo est trop longue pour être préparée.'
  if (code.includes('youtube')) return 'YouTube a refusé la demande. Réessaie dans un instant.'
  if (code.includes('rate_exceeded') || code.includes('capacity'))
    return 'Le service est saturé pour le moment. Réessaie dans une minute.'
  return "La vidéo n'a pas pu être préparée. Réessaie, ou avec un autre lien."
}

async function resoudre(req: Request, origine: string): Promise<Response> {
  let brut: string
  try {
    brut = await req.text()
  } catch {
    return erreur('Demande illisible.')
  }
  if (brut.length > TAILLE_MAX_CORPS) return erreur('Demande trop longue.')

  let demande: Demande
  try {
    demande = JSON.parse(brut) as Demande
  } catch {
    return erreur('Demande illisible.')
  }

  const u = typeof demande.url === 'string' ? urlPublique(demande.url) : null
  if (!u) return erreur("Ce lien n'est pas une adresse web valable.")

  const qualite: Qualite = demande.qualite === 'compatible' || demande.qualite === 'audio' ? demande.qualite : 'max'

  // Lien qui pointe déjà sur un fichier : rien à extraire, on le sert tel quel.
  // C'est ce qui fait marcher l'app même sans instance Cobalt configurée.
  if (qualite !== 'audio' && MEDIA_DIRECT.test(u.href)) {
    const nom = nomDepuisUrl(u)
    return json({ fichiers: [{ url: await lienFlux(origine, u.href, nom), nom, type: typeFichier(nom) }] })
  }

  if (!COBALT_API_URL) {
    return erreur(
      "Les liens de pages (YouTube, Instagram, TikTok…) demandent un service d'extraction : " +
        'renseigne COBALT_API_URL sur la fonction. En attendant, un lien direct vers un fichier ' +
        '(.mp4, .webm, .mov…) fonctionne déjà.',
      503,
    )
  }

  let reponse: Response
  try {
    reponse = await fetch(COBALT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(COBALT_API_KEY ? { Authorization: `Api-Key ${COBALT_API_KEY}` } : {}),
      },
      body: JSON.stringify(reglagesCobalt(u.href, qualite)),
    })
  } catch {
    return erreur("Le service d'extraction est injoignable.", 502)
  }

  let data: Record<string, unknown>
  try {
    data = (await reponse.json()) as Record<string, unknown>
  } catch {
    return erreur("Le service d'extraction a répondu de travers.", 502)
  }

  const statut = String(data.status ?? '')

  if (statut === 'error') {
    const code = String((data.error as { code?: unknown } | undefined)?.code ?? '')
    return erreur(traduireCobalt(code), 422)
  }

  if (statut === 'picker') {
    const choix = Array.isArray(data.picker) ? (data.picker as Record<string, unknown>[]) : []
    const fichiers: Fichier[] = []
    for (const [i, item] of choix.entries()) {
      const lien = typeof item.url === 'string' ? urlPublique(item.url) : null
      if (!lien) continue
      const type: Fichier['type'] = item.type === 'photo' ? 'photo' : 'video'
      const nom = nomSur(nomDepuisUrl(lien), `media-${i + 1}.${type === 'photo' ? 'jpg' : 'mp4'}`)
      fichiers.push({ url: await lienFlux(origine, lien.href, nom), nom, type })
    }
    if (!fichiers.length) return erreur('Rien à récupérer sur cette page.', 422)
    return json({ fichiers })
  }

  if (statut === 'redirect' || statut === 'tunnel' || statut === 'stream' || statut === 'local-processing') {
    const tunnel = (data as { tunnel?: unknown }).tunnel
    const brutUrl =
      typeof data.url === 'string' ? data.url : Array.isArray(tunnel) ? String(tunnel[0] ?? '') : ''
    const lien = urlPublique(brutUrl)
    if (!lien) return erreur("Le service d'extraction n'a rendu aucun fichier.", 502)
    const nom = nomSur(typeof data.filename === 'string' ? data.filename : '', nomDepuisUrl(lien))
    return json({
      fichiers: [{ url: await lienFlux(origine, lien.href, nom), nom, type: typeFichier(nom) }],
      // Cobalt v11 peut renvoyer les pistes séparées à assembler côté client :
      // on le signale, l'app préviendra que le son peut manquer.
      assemblageLocal: statut === 'local-processing',
    })
  }

  return erreur("La vidéo n'a pas pu être préparée.", 502)
}

/* ───────────────────────────────── Flux ─────────────────────────────────── */

const TYPES_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  opus: 'audio/opus',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
}

/** `filename*` en UTF-8 : sans lui, « Été à Rome.mp4 » arrive en charabia. */
function dispositionPieceJointe(nom: string): string {
  const ascii = nom.replace(/[^ -~]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`
}

/** Une réponse HTTP de redirection, et rien d'autre. */
const REDIRECTIONS = new Set([301, 302, 303, 307, 308])

/**
 * Récupère l'amont en suivant les redirections nous-mêmes.
 *
 * `redirect: 'follow'` ne vérifiait que l'adresse de départ : un hébergeur
 * pouvait renvoyer un `Location:` vers le réseau interne et le runtime l'aurait
 * suivi sans rien demander à personne. Ici chaque saut est résolu par rapport à
 * l'adresse courante, repassé par `urlPublique`, et la chaîne s'arrête après
 * SAUTS_MAX. Un 303 — ou un 301/302 sur autre chose qu'un GET/HEAD — repasse en
 * GET, comme le fait n'importe quel navigateur.
 */
async function recupererAmont(depart: URL, methode: 'GET' | 'HEAD', enTetes: Headers): Promise<Response | null> {
  let courante = depart
  let verbe = methode

  for (let saut = 0; saut <= SAUTS_MAX; saut++) {
    let reponse: Response
    try {
      reponse = await fetch(courante.href, { method: verbe, headers: enTetes, redirect: 'manual' })
    } catch {
      return null
    }

    if (!REDIRECTIONS.has(reponse.status)) return reponse

    // On ne garde pas le corps de la redirection : seul le `Location` compte.
    await reponse.body?.cancel()

    const destination = reponse.headers.get('location')
    if (!destination) return null

    let suivante: URL
    try {
      suivante = new URL(destination, courante) // relatif ou absolu, les deux existent.
    } catch {
      return null
    }

    // LE contrôle qui manquait : la cible d'une redirection est une adresse
    // comme une autre, elle repasse par le même filtre que l'adresse d'origine.
    const sure = urlPublique(suivante.href)
    if (!sure) return null

    if (reponse.status === 303 || (verbe !== 'HEAD' && (reponse.status === 301 || reponse.status === 302))) {
      verbe = 'GET'
    }
    courante = sure
  }

  return null // trop de sauts : boucle, ou quelqu'un qui insiste.
}

async function flux(req: Request, params: URLSearchParams): Promise<Response> {
  const brutUrl = params.get('u') ?? ''
  const nom = nomSur(params.get('n') ?? '', 'video.mp4')
  const expire = Number(params.get('e') ?? '0')
  const signature = params.get('s') ?? ''

  const u = urlPublique(brutUrl)
  if (!u) return new Response(null, { status: 400, headers: CORS })
  // Signature absente, fausse ou périmée : même refus sec, sans explication.
  if (!(await signatureValable(u.href, expire, signature))) return new Response(null, { status: 403, headers: CORS })

  const enTetes = new Headers()
  // Le Range est transmis : c'est ce qui permet au téléphone de reprendre un
  // téléchargement coupé au lieu de tout refaire.
  const range = req.headers.get('range')
  if (range) enTetes.set('Range', range)

  const amont = await recupererAmont(u, req.method === 'HEAD' ? 'HEAD' : 'GET', enTetes)
  if (!amont) return new Response(null, { status: 502, headers: CORS })

  if (!amont.ok && amont.status !== 206) {
    await amont.body?.cancel()
    return new Response(null, { status: 502, headers: CORS })
  }

  const ext = (nom.split('.').pop() ?? '').toLowerCase()
  const sortie = new Headers(CORS)
  sortie.set('Content-Type', TYPES_MIME[ext] ?? amont.headers.get('content-type') ?? 'application/octet-stream')
  sortie.set('Content-Disposition', dispositionPieceJointe(nom))
  sortie.set('Cache-Control', 'private, no-store')
  sortie.set('Accept-Ranges', 'bytes')
  sortie.set('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition, Content-Range, Accept-Ranges')
  for (const nomEnTete of ['content-length', 'content-range'] as const) {
    const v = amont.headers.get(nomEnTete)
    if (v) sortie.set(nomEnTete, v)
  }

  if (req.method === 'HEAD') {
    await amont.body?.cancel()
    return new Response(null, { status: amont.status, headers: sortie })
  }

  return new Response(amont.body, { status: amont.status, headers: sortie })
}

/* ──────────────────────────────── Entrée ────────────────────────────────── */

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** La résolution est réservée aux comptes Awy : cette porte n'est pas publique. */
async function sessionValable(req: Request): Promise<boolean> {
  const entete = req.headers.get('Authorization') ?? ''
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : ''
  if (!jeton) return false
  try {
    const { data, error } = await admin.auth.getUser(jeton)
    return !error && !!data.user
  } catch {
    return false
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const url = new URL(req.url)
  const origine = `${url.origin}/functions/v1`

  if (url.pathname.endsWith('/flux')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: CORS })
    return flux(req, url.searchParams)
  }

  if (req.method !== 'POST') return new Response(null, { status: 405, headers: CORS })
  if (!(await sessionValable(req))) return erreur('Session expirée : reconnecte-toi.', 401)

  return resoudre(req, origine)
})
