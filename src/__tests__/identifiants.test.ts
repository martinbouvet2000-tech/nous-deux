import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Deux garde-fous d'accessibilité, vérifiés sur le source plutôt qu'écran par écran :
 *
 *  1. un même `id` littéral ne doit pas apparaître deux fois dans un composant —
 *     c'est ce qui faisait cohabiter le titre de section « cd-title » et le champ
 *     « Quoi ? » de l'accueil (le libellé ne focalisait plus rien), et deux
 *     dégradés « hm-fur » sur la page dès qu'il y avait deux hamsters ;
 *  2. tout `htmlFor` / `aria-labelledby` / `aria-describedby` écrit en dur doit
 *     pointer sur un `id` présent dans le même fichier.
 *
 * Les identifiants calculés (`id={furId}`, `useId()`) sont hors périmètre : ils
 * sont uniques par construction.
 */

const RACINE = join(process.cwd(), 'src')

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) return fichiersTsx(chemin)
    return chemin.endsWith('.tsx') ? [chemin] : []
  })
}

function toutes(source: string, motif: RegExp): string[] {
  return [...source.matchAll(motif)].flatMap((m) => m[1].trim().split(/\s+/))
}

const FICHIERS = fichiersTsx(RACINE).map((chemin) => ({
  chemin: chemin.slice(RACINE.length + 1),
  source: readFileSync(chemin, 'utf-8'),
}))

describe('identifiants HTML', () => {
  it('trouve bien les composants à analyser', () => {
    expect(FICHIERS.length).toBeGreaterThan(20)
  })

  it('n’écrit jamais deux fois le même `id` dans un composant', () => {
    const doublons = FICHIERS.flatMap(({ chemin, source }) => {
      const vus = new Set<string>()
      return toutes(source, /\sid="([^"]+)"/g)
        .filter((id) => (vus.has(id) ? true : (vus.add(id), false)))
        .map((id) => `${chemin} : id="${id}"`)
    })
    expect(doublons).toEqual([])
  })

  it('fait pointer chaque libellé et chaque référence ARIA sur un `id` existant', () => {
    const orphelins = FICHIERS.flatMap(({ chemin, source }) => {
      const ids = new Set(toutes(source, /\sid="([^"]+)"/g))
      const references = [
        ...toutes(source, /htmlFor="([^"]+)"/g),
        ...toutes(source, /aria-labelledby="([^"]+)"/g),
        ...toutes(source, /aria-describedby="([^"]+)"/g),
      ]
      return references.filter((ref) => !ids.has(ref)).map((ref) => `${chemin} : « ${ref} » introuvable`)
    })
    expect(orphelins).toEqual([])
  })
})
