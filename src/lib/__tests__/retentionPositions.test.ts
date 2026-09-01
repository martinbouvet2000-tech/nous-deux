import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * L'app affiche « Parcours conservé 48 h, puis effacé » à deux endroits. Pendant
 * dix jours, c'était faux : la purge était un déclencheur `for each row` limité à
 * `new.user_id`, donc les vieux points de quelqu'un n'étaient effacés que si cette
 * même personne enregistrait un nouveau point — jamais si elle coupait le partage.
 *
 * Ces tests lisent le SQL réellement versionné. Ils échouent si la purge redevient
 * dépendante de l'auteur de l'insertion, ou si le filet horaire disparaît.
 */

const MIGRATIONS = resolve(__dirname, '../../../supabase/migrations')

function sqlDeLaRetention(): string {
  const fichier = readdirSync(MIGRATIONS).find((f) => f.includes('retention_48h_positions'))
  expect(fichier, 'la migration de rétention doit être versionnée').toBeTruthy()
  return readFileSync(join(MIGRATIONS, fichier as string), 'utf8')
}

describe('rétention 48 h des positions', () => {
  const sql = sqlDeLaRetention()

  it('purge tout ce qui a plus de 48 h, sans filtrer sur un utilisateur', () => {
    expect(sql).toMatch(/delete\s+from\s+public\.locations\s+where\s+recorded_at\s*<\s*now\(\)\s*-\s*interval\s*'48 hours'/i)
    // Le défaut d'origine, mot pour mot : plus jamais de filtre par auteur ici.
    expect(sql).not.toMatch(/delete\s+from\s+public\.locations[\s\S]{0,120}user_id\s*=\s*new\.user_id/i)
  })

  it('déclenche une fois par instruction, pas une fois par ligne', () => {
    expect(sql).toMatch(/create trigger locations_prune[\s\S]*for each statement/i)
    expect(sql).not.toMatch(/create trigger locations_prune[\s\S]*for each row/i)
  })

  it('garde un filet horaire pour le cas où plus personne n’enregistre de position', () => {
    expect(sql).toMatch(/cron\.schedule\(\s*'awy_purge_positions'\s*,\s*'\d+ \* \* \* \*'/)
    expect(sql).toMatch(/purger_positions_perimees/)
  })

  it('réserve la purge au propriétaire de la base', () => {
    expect(sql).toMatch(
      /revoke execute on function public\.purger_positions_perimees\(\) from public, anon, authenticated;/,
    )
  })
})

describe('hygiène du schéma', () => {
  it('la dernière définition de chaque fonction fixe son search_path', () => {
    // On rejoue les migrations dans l'ordre des versions : seule compte la
    // définition qui a le dernier mot, pas celles qu'elle a remplacées.
    const dernierEtat = new Map<string, boolean>()

    for (const fichier of readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = readFileSync(join(MIGRATIONS, fichier), 'utf8')
      for (const bloc of sql.split(/create or replace function/i).slice(1)) {
        const nom = /^\s*public\.([a-z_]+)/i.exec(bloc)?.[1]
        if (!nom) continue
        const entete = bloc.slice(0, bloc.search(/\bas\s+\$/i))
        dernierEtat.set(nom, /set\s+search_path\s*=/i.test(entete))
      }
    }

    const sansChemin = [...dernierEtat].filter(([, ok]) => !ok).map(([nom]) => nom)
    // `jour_du_creneau` était la seule à manquer à l'appel ; corrigée le 31 août.
    expect(sansChemin).toEqual([])
    expect(dernierEtat.size).toBeGreaterThan(15)
  })
})
