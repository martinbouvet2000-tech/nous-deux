#!/usr/bin/env node
/**
 * Awy — sauvegarde complète, à lancer depuis un ordinateur.
 *
 *     SUPABASE_SERVICE_ROLE_KEY="..." node scripts/sauvegarde.mjs
 *
 * POURQUOI CE SCRIPT EXISTE. Le projet est sur le plan gratuit de Supabase :
 * pas de sauvegarde quotidienne, pas de restauration à un instant donné, pas de
 * sauvegarde téléchargeable. Tant que rien n'est copié ailleurs, les vlogs, les
 * petits mots, les gratitudes et l'emploi du temps n'existent qu'à un seul
 * endroit au monde. Ce script est cet ailleurs.
 *
 * CE QU'IL PRODUIT. Un dossier `sauvegardes/awy-AAAA-MM-JJ/` contenant :
 *   • `donnees.json`  — toutes les lignes de toutes les tables ;
 *   • `medias/`       — les fichiers du bucket `vlogs`, sous leur vrai nom ;
 *   • `inventaire.json` — ce qui a été copié, avec les tailles, pour vérifier.
 *
 * LA CLÉ. `SUPABASE_SERVICE_ROLE_KEY` se trouve dans le tableau de bord
 * Supabase → Project Settings → API → `service_role`. Elle contourne les RLS,
 * ce qui est indispensable pour tout copier — y compris ce qui appartient à
 * l'autre. Elle ne doit JAMAIS être écrite dans le dépôt ni partagée : on la
 * passe en variable d'environnement, le temps d'une commande. Sans elle, le
 * script refuse de tourner plutôt que de produire une sauvegarde à trous.
 *
 * À QUELLE FRÉQUENCE. Une fois par mois suffit tant que le rythme reste
 * celui d'aujourd'hui (une vingtaine de vlogs par mois). Après un week-end
 * ensemble, ça vaut le coup de la relancer.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Toutes les tables du schéma public, dans l'ordre où on aimerait les relire. */
const TABLES = [
  'profiles',
  'availability',
  'love_notes',
  'gratitudes',
  'moods',
  'taps',
  'capsules',
  'countdowns',
  'calendar_events',
  'schedule_slots',
  'vlogs',
  'bucket_items',
  'watch_items',
  'todo_lists',
  'todo_items',
  'daily_questions',
  'question_answers',
  'question_bank',
  'locations',
  'push_subscriptions',
  'location_tokens',
]

/** Le bucket où vivent les photos et vidéos des vlogs. */
const BUCKET = 'vlogs'

/** PostgREST plafonne les réponses : on pagine plutôt que de perdre des lignes. */
const PAR_PAGE = 1000

function lireEnvProduction(texte) {
  const valeurs = {}
  for (const ligne of texte.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(ligne.trim())
    if (m) valeurs[m[1]] = m[2].trim()
  }
  return valeurs
}

function abandonner(message) {
  console.error(`\n  ✗ ${message}\n`)
  process.exit(1)
}

/** Récupère une table entière, page par page. */
async function lireTable(supabase, table) {
  const lignes = []
  for (let debut = 0; ; debut += PAR_PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(debut, debut + PAR_PAGE - 1)
    if (error) throw new Error(`${table} : ${error.message}`)
    lignes.push(...data)
    if (data.length < PAR_PAGE) return lignes
  }
}

/** Liste récursive du bucket : les fichiers sont rangés par dossier utilisateur. */
async function listerMedias(supabase) {
  const fichiers = []
  const { data: dossiers, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (error) throw new Error(`stockage : ${error.message}`)

  for (const dossier of dossiers ?? []) {
    // Un vrai fichier a des métadonnées ; un dossier n'en a pas.
    if (dossier.metadata) {
      fichiers.push({ chemin: dossier.name, taille: dossier.metadata.size ?? 0 })
      continue
    }
    const { data: dedans, error: err } = await supabase.storage
      .from(BUCKET)
      .list(dossier.name, { limit: 1000 })
    if (err) throw new Error(`stockage/${dossier.name} : ${err.message}`)
    for (const f of dedans ?? []) {
      if (f.metadata) fichiers.push({ chemin: `${dossier.name}/${f.name}`, taille: f.metadata.size ?? 0 })
    }
  }
  return fichiers
}

async function main() {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!cle) {
    abandonner(
      'SUPABASE_SERVICE_ROLE_KEY manquante.\n' +
        "    Tableau de bord Supabase → Project Settings → API → clé « service_role ».\n" +
        '    Puis :  SUPABASE_SERVICE_ROLE_KEY="..." node scripts/sauvegarde.mjs\n' +
        "    Sans elle la sauvegarde serait incomplète : mieux vaut ne rien produire\n" +
        "    qu'une copie à trous dans laquelle on aurait confiance.",
    )
  }

  let url = process.env.SUPABASE_URL
  if (!url) {
    const env = lireEnvProduction(await readFile(join(RACINE, '.env.production'), 'utf8'))
    url = env.VITE_SUPABASE_URL
  }
  if (!url) abandonner('Adresse du projet introuvable (.env.production ou SUPABASE_URL).')

  const supabase = createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } })

  const jour = new Date().toISOString().slice(0, 10)
  const dossier = join(RACINE, 'sauvegardes', `awy-${jour}`)
  await mkdir(join(dossier, 'medias'), { recursive: true })

  console.log(`\n  Sauvegarde Awy — ${jour}`)
  console.log(`  Destination : ${dossier}\n`)

  /* ── Les lignes ────────────────────────────────────────────────────────── */
  const donnees = {}
  const comptes = {}
  for (const table of TABLES) {
    const lignes = await lireTable(supabase, table)
    donnees[table] = lignes
    comptes[table] = lignes.length
    console.log(`  ${String(lignes.length).padStart(5)}  ${table}`)
  }
  await writeFile(join(dossier, 'donnees.json'), JSON.stringify(donnees, null, 2), 'utf8')

  /* ── Les fichiers ──────────────────────────────────────────────────────── */
  const medias = await listerMedias(supabase)
  console.log(`\n  ${medias.length} fichier(s) à rapatrier…`)

  let copies = 0
  let octets = 0
  const echecs = []
  for (const media of medias) {
    const { data, error } = await supabase.storage.from(BUCKET).download(media.chemin)
    if (error || !data) {
      echecs.push({ chemin: media.chemin, raison: error?.message ?? 'réponse vide' })
      continue
    }
    const cible = join(dossier, 'medias', media.chemin)
    await mkdir(dirname(cible), { recursive: true })
    const contenu = Buffer.from(await data.arrayBuffer())
    await writeFile(cible, contenu)
    copies++
    octets += contenu.length
    process.stdout.write(`\r  ${copies}/${medias.length} copiés`)
  }
  process.stdout.write('\n')

  /* ── Le reçu ───────────────────────────────────────────────────────────── */
  const inventaire = {
    date: new Date().toISOString(),
    projet: url,
    lignes: comptes,
    total_lignes: Object.values(comptes).reduce((a, b) => a + b, 0),
    medias_attendus: medias.length,
    medias_copies: copies,
    medias_octets: octets,
    echecs,
  }
  await writeFile(join(dossier, 'inventaire.json'), JSON.stringify(inventaire, null, 2), 'utf8')

  const mo = (octets / 1024 / 1024).toFixed(1)
  console.log(`\n  ${inventaire.total_lignes} lignes, ${copies} fichiers (${mo} Mo).`)

  if (echecs.length) {
    console.error(`\n  ✗ ${echecs.length} fichier(s) non rapatrié(s) — voir inventaire.json`)
    process.exit(1)
  }
  console.log('  ✓ Sauvegarde complète.\n')
  console.log('  Copie ce dossier ailleurs que sur cet ordinateur : un disque externe,')
  console.log('  un cloud, peu importe — mais pas au même endroit que le reste.\n')
}

main().catch((e) => abandonner(e.message))
