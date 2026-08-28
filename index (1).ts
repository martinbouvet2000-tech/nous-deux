/**
 * Awy — fonction Edge « send-push ».
 *
 * Elle est le seul point du système qui parle aux services de push (Apple,
 * Google, Mozilla). Elle est appelée exclusivement par la base, depuis
 * `public.envoyer_push(...)`, via `pg_net`.
 *
 * AUTHENTIFICATION. Pas de JWT (`verify_jwt: false`) : la fonction n'est
 * jamais appelée au nom d'un utilisateur, mais au nom de la base. Elle
 * s'authentifie donc avec son propre secret partagé, `push_hook_secret`,
 * présenté dans l'en-tête `x-awy-secret` et lu dans Supabase Vault. Tout ce
 * qui ne correspond pas repart avec un 401 sans un mot d'explication.
 *
 * CHIFFREMENT. `web-push` (npm), l'implémentation de référence du protocole :
 * chiffrement `aes128gcm` (RFC 8291) et signature VAPID `vapid t=…, k=…`
 * (RFC 8292) — les deux seules formes qu'Apple accepte, donc les seules qui
 * permettent d'atteindre un iPhone. On n'utilise que `generateRequestDetails`,
 * qui prépare la requête sans l'émettre : l'envoi passe par `fetch`, ce qui
 * nous laisse lire le code de retour et faire le ménage.
 *
 * DISCRÉTION. Ni les journaux ni les réponses ne contiennent le texte des
 * notifications, les secrets ou les adresses d'abonnement : seulement des
 * compteurs et des codes HTTP.
 */
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

/** Clé publique VAPID — publique par nature, elle voyage dans chaque abonnement. */
const CLE_PUBLIQUE_VAPID =
  Deno.env.get('VAPID_PUBLIC_KEY') ??
  'BLPUolQ6fYI14JwalQk3erFyiwU-hqcIkqhBg5DwPEWhsHXh-aFnzk4sd9BXH5IuQfIh4wiKZ6C_yaN_RnniTCQ'

/** Contact exigé par VAPID (`sub`) : une URL jointe, jamais une donnée intime. */
const SUJET_VAPID = Deno.env.get('VAPID_SUBJECT') ?? 'https://martinbouvet2000-tech.github.io/nous-deux/'

/**
 * Une envie d'appel qui arrive quarante minutes trop tard ne sert à rien : on la
 * laisse expirer plutôt que de la délivrer à contretemps. Le reste peut attendre
 * le retour du réseau. Miroir de `src/lib/pushMessages.ts`.
 */
const URGENT = 'awy-appel'
const TTL_URGENT_S = 900
const TTL_NORMAL_S = 86_400

/** Les secrets changent rarement : on évite un aller-retour base par notification. */
const DUREE_CACHE_MS = 5 * 60 * 1000
let cacheSecrets: { hook: string; vapid: string; expire: number } | null = null

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

/** Refus sec : même réponse pour un en-tête absent, vide ou faux. */
function refus(): Response {
  return new Response(null, { status: 401 })
}

/** Comparaison à temps constant : ne pas laisser deviner le secret octet par octet. */
function egalConstant(a: string, b: string): boolean {
  const encodeur = new TextEncoder()
  const ea = encodeur.encode(a)
  const eb = encodeur.encode(b)
  if (ea.length !== eb.length) return false
  let ecart = 0
  for (let i = 0; i < ea.length; i += 1) ecart |= ea[i] ^ eb[i]
  return ecart === 0
}

/** Lecture des deux secrets du Vault, par une fonction SQL réservée au service_role. */
async function secrets(): Promise<{ hook: string; vapid: string } | null> {
  if (cacheSecrets && cacheSecrets.expire > Date.now()) return cacheSecrets

  const [hook, vapid] = await Promise.all([
    admin.rpc('lire_secret_push', { nom: 'push_hook_secret' }),
    admin.rpc('lire_secret_push', { nom: 'vapid_private_key' }),
  ])

  if (hook.error || vapid.error || !hook.data || !vapid.data) {
    console.error('[send-push] secrets illisibles')
    return null
  }
  cacheSecrets = { hook: hook.data as string, vapid: vapid.data as string, expire: Date.now() + DUREE_CACHE_MS }
  return cacheSecrets
}

interface Abonnement {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

interface Demande {
  destinataire?: unknown
  titre?: unknown
  corps?: unknown
  lien?: unknown
  etiquette?: unknown
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return refus()

  // En-tête absent : on refuse tout de suite, sans même déranger la base.
  const presente = req.headers.get('x-awy-secret')
  if (!presente) return refus()

  const cles = await secrets()
  if (!cles) return new Response(null, { status: 503 })
  if (!egalConstant(presente, cles.hook)) return refus()

  let demande: Demande
  try {
    demande = (await req.json()) as Demande
  } catch {
    return new Response(null, { status: 400 })
  }

  const destinataire = typeof demande.destinataire === 'string' ? demande.destinataire : ''
  const titre = typeof demande.titre === 'string' ? demande.titre : 'Awy'
  const corps = typeof demande.corps === 'string' ? demande.corps : ''
  const lien = typeof demande.lien === 'string' && demande.lien ? demande.lien : '/'
  const etiquette = typeof demande.etiquette === 'string' && demande.etiquette ? demande.etiquette : 'awy'
  if (!destinataire) return new Response(null, { status: 400 })

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', destinataire)

  if (error) {
    console.error('[send-push] lecture des abonnements impossible')
    return new Response(null, { status: 500 })
  }

  const abonnements = (data ?? []) as Abonnement[]
  if (abonnements.length === 0) return Response.json({ envoyees: 0, supprimees: 0, echecs: 0 })

  // La charge utile est chiffrée de bout en bout : le service de push ne la lit
  // pas. Elle ne contient de toute façon que le geste, jamais son contenu.
  const charge = JSON.stringify({ titre, corps, lien, etiquette })
  const urgent = etiquette === URGENT
  const options = {
    TTL: urgent ? TTL_URGENT_S : TTL_NORMAL_S,
    urgency: urgent ? 'high' : 'normal',
    contentEncoding: 'aes128gcm',
    vapidDetails: { subject: SUJET_VAPID, publicKey: CLE_PUBLIQUE_VAPID, privateKey: cles.vapid },
  }

  let envoyees = 0
  let echecs = 0
  const perimes: string[] = []

  await Promise.all(
    abonnements.map(async (abo) => {
      try {
        const details = webpush.generateRequestDetails(
          { endpoint: abo.endpoint, keys: { p256dh: abo.p256dh, auth: abo.auth } },
          charge,
          options,
        )

        // `fetch` calcule lui-même Content-Length ; les autres en-têtes doivent
        // être des chaînes (TTL arrive en nombre).
        const entetes: Record<string, string> = {}
        for (const [cle, valeur] of Object.entries(details.headers)) {
          if (cle.toLowerCase() === 'content-length') continue
          entetes[cle] = String(valeur)
        }

        const reponse = await fetch(details.endpoint, { method: 'POST', headers: entetes, body: details.body })

        if (reponse.ok) {
          envoyees += 1
          return
        }
        // 404 / 410 : le téléphone a été réinitialisé, l'app désinstallée, ou
        // l'abonnement révoqué. Sans ce ménage, ces fantômes resteraient pour
        // toujours et on rejouerait un envoi voué à l'échec à chaque geste.
        if (reponse.status === 404 || reponse.status === 410) {
          perimes.push(abo.id)
          return
        }
        echecs += 1
        console.error('[send-push] refus du service de push', reponse.status)
      } catch (err) {
        echecs += 1
        console.error('[send-push] envoi impossible', err instanceof Error ? err.name : 'erreur')
      }
    }),
  )

  if (perimes.length > 0) {
    const { error: erreurMenage } = await admin.from('push_subscriptions').delete().in('id', perimes)
    if (erreurMenage) console.error('[send-push] purge des abonnements morts impossible')
  }

  // Réponse volontairement pauvre : des compteurs, rien d'autre.
  return Response.json({ envoyees, supprimees: perimes.length, echecs })
})
