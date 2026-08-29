import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  coordonneesValides,
  decisionEnregistrement,
  statutHttp,
  corpsJsonExemple,
  nettoyerEtiquette,
  DELAI_ANTI_SPAM_MS,
  ETIQUETTE_MAX,
  PREFIXE_JETON,
  URL_INGESTION,
  type ContexteEnregistrement,
} from '../positionArrierePlan'

const MAINTENANT = new Date('2026-08-28T20:00:00Z')
const JETON = `${PREFIXE_JETON}${'a1b2c3d4'.repeat(6)}`

/** Le cas nominal : jeton valable, partage actif, Varsovie, aucun point récent. */
function contexte(sur: Partial<ContexteEnregistrement> = {}): ContexteEnregistrement {
  return {
    jeton: JETON,
    jetonConnu: true,
    revoqueLe: null,
    lat: 52.2297,
    lng: 21.0122,
    partageActif: true,
    dernierPointLe: null,
    maintenant: MAINTENANT,
    ...sur,
  }
}

describe('validation des coordonnées', () => {
  it('accepte Varsovie et Paris', () => {
    expect(coordonneesValides(52.2297, 21.0122)).toBe(true)
    expect(coordonneesValides(48.8566, 2.3522)).toBe(true)
  })

  it('accepte les bornes exactes et les refuse dès qu’on les dépasse', () => {
    expect(coordonneesValides(90, 180)).toBe(true)
    expect(coordonneesValides(-90, -180)).toBe(true)
    expect(coordonneesValides(90.0001, 0)).toBe(false)
    expect(coordonneesValides(-90.0001, 0)).toBe(false)
    expect(coordonneesValides(0, 180.0001)).toBe(false)
    expect(coordonneesValides(0, -180.0001)).toBe(false)
  })

  it('refuse NaN, les infinis et les valeurs absentes', () => {
    expect(coordonneesValides(NaN, 21)).toBe(false)
    expect(coordonneesValides(52, NaN)).toBe(false)
    expect(coordonneesValides(Infinity, 0)).toBe(false)
    expect(coordonneesValides(0, -Infinity)).toBe(false)
    expect(coordonneesValides(null, 21)).toBe(false)
    expect(coordonneesValides(52, null)).toBe(false)
  })

  it('renvoie « coordonnees_invalides » plutôt que d’écrire n’importe où', () => {
    expect(decisionEnregistrement(contexte({ lat: 1000, lng: 0 }))).toBe('coordonnees_invalides')
    expect(decisionEnregistrement(contexte({ lng: -181 }))).toBe('coordonnees_invalides')
    expect(decisionEnregistrement(contexte({ lat: NaN }))).toBe('coordonnees_invalides')
    expect(decisionEnregistrement(contexte({ lat: null }))).toBe('coordonnees_invalides')
  })
})

describe('anti-spam : un point par minute au maximum', () => {
  const ilYA = (ms: number) => new Date(MAINTENANT.getTime() - ms)

  it('laisse passer un premier point', () => {
    expect(decisionEnregistrement(contexte({ dernierPointLe: null }))).toBe('ok')
  })

  it('écarte un point qui arrive quelques secondes après le précédent', () => {
    expect(decisionEnregistrement(contexte({ dernierPointLe: ilYA(1_000) }))).toBe('trop_frequent')
    expect(decisionEnregistrement(contexte({ dernierPointLe: ilYA(30_000) }))).toBe('trop_frequent')
    expect(decisionEnregistrement(contexte({ dernierPointLe: ilYA(DELAI_ANTI_SPAM_MS - 1) }))).toBe('trop_frequent')
  })

  it('accepte dès la minute écoulée — une automatisation horaire n’y touche jamais', () => {
    expect(decisionEnregistrement(contexte({ dernierPointLe: ilYA(DELAI_ANTI_SPAM_MS) }))).toBe('ok')
    expect(decisionEnregistrement(contexte({ dernierPointLe: ilYA(3_600_000) }))).toBe('ok')
  })

  it('borne bien à une minute, ni plus ni moins', () => {
    expect(DELAI_ANTI_SPAM_MS).toBe(60_000)
  })
})

describe('jeton révoqué ou inconnu', () => {
  it('refuse un jeton révoqué', () => {
    expect(decisionEnregistrement(contexte({ revoqueLe: new Date('2026-08-27T10:00:00Z') }))).toBe('jeton_invalide')
  })

  it('refuse un jeton inconnu de la base', () => {
    expect(decisionEnregistrement(contexte({ jetonConnu: false }))).toBe('jeton_invalide')
  })

  it('refuse un jeton absent, vide ou trop court pour être crédible', () => {
    expect(decisionEnregistrement(contexte({ jeton: null }))).toBe('jeton_invalide')
    expect(decisionEnregistrement(contexte({ jeton: '' }))).toBe('jeton_invalide')
    expect(decisionEnregistrement(contexte({ jeton: 'awy_court' }))).toBe('jeton_invalide')
  })

  it('donne exactement la même réponse à un jeton révoqué et à un jeton inconnu', () => {
    const revoque = decisionEnregistrement(contexte({ revoqueLe: new Date() }))
    const inconnu = decisionEnregistrement(contexte({ jetonConnu: false }))
    expect(revoque).toBe(inconnu)
  })

  it('juge le jeton AVANT tout le reste : un appel sans jeton n’apprend rien', () => {
    // Partage coupé, coordonnées absurdes, point récent : rien de tout cela ne
    // doit transparaître quand le jeton lui-même ne vaut rien.
    const code = decisionEnregistrement(contexte({
      jetonConnu: false,
      partageActif: false,
      lat: 999,
      dernierPointLe: MAINTENANT,
    }))
    expect(code).toBe('jeton_invalide')
  })
})

describe('respect de share_location', () => {
  it('n’enregistre rien quand le partage est coupé dans les Réglages', () => {
    expect(decisionEnregistrement(contexte({ partageActif: false }))).toBe('partage_coupe')
  })

  it('le partage coupé l’emporte même sur un jeton parfaitement valable', () => {
    const code = decisionEnregistrement(contexte({ partageActif: false, dernierPointLe: null }))
    expect(code).not.toBe('ok')
  })

  it('le partage rétabli laisse repasser les points', () => {
    expect(decisionEnregistrement(contexte({ partageActif: true }))).toBe('ok')
  })
})

describe('la réponse HTTP ne révèle rien', () => {
  it('ne distingue jamais un jeton inconnu d’un jeton révoqué : un 401 sec', () => {
    expect(statutHttp('jeton_invalide')).toBe(401)
  })

  it('répond pareil qu’un point soit écrit, écarté par le partage ou trop précoce', () => {
    expect(statutHttp('ok')).toBe(200)
    expect(statutHttp('partage_coupe')).toBe(200)
    expect(statutHttp('trop_frequent')).toBe(200)
  })

  it('n’a que 400 pour des coordonnées hors bornes', () => {
    expect(statutHttp('coordonnees_invalides')).toBe(400)
  })
})

describe('ce qu’on donne à recopier dans le téléphone', () => {
  it('pointe vers la fonction Edge ingest-location', () => {
    expect(URL_INGESTION).toMatch(/\/functions\/v1\/ingest-location$/)
  })

  it('produit un corps JSON valide, avec les quatre clés attendues', () => {
    const corps = JSON.parse(corpsJsonExemple(JETON)) as Record<string, unknown>
    expect(Object.keys(corps)).toEqual(['token', 'lat', 'lng', 'accuracy'])
    expect(corps.token).toBe(JETON)
    expect(typeof corps.lat).toBe('number')
    expect(typeof corps.lng).toBe('number')
  })

  it('nettoie l’étiquette sans jamais dépasser la contrainte de la base', () => {
    expect(nettoyerEtiquette('  iPhone de Martin  ')).toBe('iPhone de Martin')
    expect(nettoyerEtiquette('   ')).toBeNull()
    expect(nettoyerEtiquette('')).toBeNull()
    expect(nettoyerEtiquette('x'.repeat(200))?.length).toBe(ETIQUETTE_MAX)
  })
})

/**
 * La décision réelle est prise par `public.enregistrer_position(...)`, en SQL.
 * Ce bloc relit la migration pour vérifier que le dépôt et la base racontent la
 * même histoire — même méthode que `pushMessages.test.ts`.
 */
describe('la migration SQL dit la même chose', () => {
  const dossier = resolve(process.cwd(), 'supabase/migrations')
  const fichier = readdirSync(dossier).find((f) => f.endsWith('_jetons_position.sql'))
  const sql = fichier ? readFileSync(join(dossier, fichier), 'utf-8') : ''

  /** Extrait le corps d’une fonction, entre `as $fn$` et `$fn$;`. */
  function corps(nom: string): string {
    const debutFn = sql.indexOf(`create or replace function public.${nom}(`)
    if (debutFn < 0) return ''
    const debut = sql.indexOf('as $fn$', debutFn)
    const fin = sql.indexOf('$fn$;', debut)
    return debut < 0 || fin < 0 ? '' : sql.slice(debut, fin)
  }

  it('la migration existe', () => {
    expect(fichier).toBeTruthy()
    expect(sql.length).toBeGreaterThan(2000)
  })

  it('ne stocke jamais le jeton en clair — seulement son empreinte SHA-256', () => {
    expect(sql).toMatch(/token_hash\s+text not null unique/)
    const creation = corps('creer_jeton_position')
    expect(creation).toMatch(/insert into public\.location_tokens \(user_id, token_hash, label\)/)
    expect(creation).toMatch(/encode\(extensions\.digest\(jeton, 'sha256'\), 'hex'\)/)
    // Dans la clause VALUES, `jeton` n’apparaît QUE dans l’appel à digest :
    // aucune colonne ne reçoit la chaîne en clair.
    const debutValeurs = creation.indexOf('values (')
    const valeurs = creation.slice(debutValeurs, creation.indexOf(');', debutValeurs))
    expect(valeurs).toContain('jeton')
    expect(valeurs.replace(/extensions\.digest\(jeton,/g, '')).not.toContain('jeton')
    expect(creation).toMatch(/return jeton;/)
  })

  it('borne les coordonnées exactement comme ce module', () => {
    const fn = corps('enregistrer_position')
    expect(fn).toMatch(/lat < -90/)
    expect(fn).toMatch(/lat > 90/)
    expect(fn).toMatch(/lng < -180/)
    expect(fn).toMatch(/lng > 180/)
    expect(fn).toContain("return 'coordonnees_invalides';")
  })

  it('applique le même anti-spam d’une minute', () => {
    const fn = corps('enregistrer_position')
    expect(fn).toMatch(/interval '1 minute'/)
    expect(fn).toContain("return 'trop_frequent';")
    expect(DELAI_ANTI_SPAM_MS).toBe(60_000)
  })

  it('refuse un jeton révoqué, sans le distinguer d’un jeton inconnu', () => {
    const fn = corps('enregistrer_position')
    expect(fn).toMatch(/if proprietaire is null or revoque is not null then/)
    // Une seule et même issue pour les deux cas.
    expect(fn.match(/return 'jeton_invalide';/g)?.length).toBe(2)
  })

  it('respecte profiles.share_location', () => {
    const fn = corps('enregistrer_position')
    expect(fn).toMatch(/from public\.profiles p\s*\n?\s*where p\.id = proprietaire and p\.share_location/)
    expect(fn).toContain("return 'partage_coupe';")
  })

  it('n’écrit QUE pour le propriétaire du jeton, jamais pour le/la partenaire', () => {
    const fn = corps('enregistrer_position')
    expect(fn).toMatch(/insert into public\.locations \(user_id, lat, lng, accuracy\)\s*\n\s*values \(\s*\n\s*proprietaire,/)
    // `proprietaire` vient de la ligne du jeton ; aucun paramètre ne le désigne.
    expect(fn).toMatch(/into jeton_uuid, proprietaire, revoque/)
    expect(fn).not.toMatch(/partner|get_partner_id/)
    // Une fonction appelée par le service_role n’a pas d’utilisateur connecté.
    expect(fn).not.toMatch(/auth\.uid\(\)/)
  })

  it('réserve enregistrer_position au service_role', () => {
    const signature = 'public\\.enregistrer_position\\(text, double precision, double precision, int\\)'
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(sql).toMatch(new RegExp(`revoke execute on function ${signature} from ${role};`))
    }
    expect(sql).toMatch(new RegExp(`grant\\s+execute on function ${signature} to service_role;`))
    expect(sql).not.toMatch(new RegExp(`grant\\s+execute on function ${signature} to (anon|authenticated)`))
  })

  it('borne la création et la révocation à ses propres jetons', () => {
    expect(corps('creer_jeton_position')).toMatch(/moi\s+uuid := \(select auth\.uid\(\)\)/)
    const revocation = corps('revoquer_jeton_position')
    expect(revocation).toMatch(/and user_id = moi/)
    expect(revocation).toMatch(/moi\s+uuid := \(select auth\.uid\(\)\)/)
  })

  it('ferme la table aux anonymes et la borne à ses propres lignes', () => {
    expect(sql).toMatch(/alter table public\.location_tokens enable row level security;/)
    expect(sql).toMatch(/revoke all on table public\.location_tokens from anon;/)
    expect(sql).toMatch(/create policy "location_tokens select own"[\s\S]*?using \(user_id = \(select auth\.uid\(\)\)\);/)
    expect(sql).toMatch(/create policy "location_tokens delete own"[\s\S]*?using \(user_id = \(select auth\.uid\(\)\)\);/)
    // Ni INSERT ni UPDATE en direct : les deux fonctions sont le seul chemin.
    expect(sql).not.toMatch(/create policy "location_tokens (insert|update)/)
  })

  it('n’applique aucune migration au passage — elle est seulement écrite', () => {
    // Le fichier doit rester rejouable : pas de `drop table` sec en tête.
    expect(sql).toMatch(/create table if not exists public\.location_tokens/)
    expect(sql).not.toMatch(/^drop table public\.location_tokens/m)
  })
})

/** Le mode d’emploi est le livrable que suivra l’utilisateur : il doit exister et coller. */
describe('le mode d’emploi', () => {
  const chemin = resolve(process.cwd(), 'docs/position-en-arriere-plan.md')

  it('existe', () => {
    expect(existsSync(chemin)).toBe(true)
  })

  it('donne l’URL exacte et le corps JSON exact', () => {
    const doc = readFileSync(chemin, 'utf-8')
    expect(doc).toContain('/functions/v1/ingest-location')
    for (const cle of ['token', 'lat', 'lng', 'accuracy']) {
      expect(doc).toContain(`"${cle}"`)
    }
  })

  it('couvre iOS, Android, la batterie et la révocation', () => {
    const doc = readFileSync(chemin, 'utf-8')
    for (const sujet of ['Raccourcis', 'HTTP Shortcuts', 'Tasker', 'batterie', 'Révoquer']) {
      expect(doc).toContain(sujet)
    }
  })
})
