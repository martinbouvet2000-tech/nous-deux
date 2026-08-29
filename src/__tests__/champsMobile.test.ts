import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as UI from '@/lib/ui'

/**
 * Garde-fou « pas de zoom iOS ».
 *
 * Safari iOS zoome sur un champ dès que sa taille de police calculée est
 * inférieure à 16 px — et ne dézoome jamais au blur : l'utilisateur doit pincer
 * à la main après chaque saisie. `src/index.css` fixe donc 16 px sur tout
 * `input`/`textarea`/`select` par défaut (14 px seulement sous `pointer: fine`,
 * c'est-à-dire au bureau, où ce zoom n'existe pas).
 *
 * Mais cette règle vit dans la couche `base` : n'importe quelle classe utilitaire
 * Tailwind posée sur un champ l'emporterait. Ce test relit donc le source et
 * refuse toute classe de taille de texte inférieure à 16 px appliquée sans
 * condition sur un champ — les variantes (`md:`, `focus:`…) sont ignorées, elles
 * ne s'appliquent pas au tactile.
 *
 * Il vérifie aussi que la balise viewport n'a jamais recours à
 * `maximum-scale=1` / `user-scalable=no` : ça masquerait le symptôme en
 * interdisant à l'utilisateur de zoomer lui-même.
 */

const RACINE = process.cwd()
const SRC = join(RACINE, 'src')

/** Taille en px des classes Tailwind de taille de texte utilisées dans le projet */
const ECHELLE: Record<string, number> = {
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
  'text-lg': 18,
  'text-xl': 20,
  'text-2xl': 24,
  'text-3xl': 30,
  'text-4xl': 36,
  'text-5xl': 48,
}

/** Constantes de `src/lib/ui.ts` interpolées dans les `className` (`${INPUT}`…) */
const CONSTANTES = UI as unknown as Record<string, unknown>

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) return fichiersTsx(chemin)
    return chemin.endsWith('.tsx') ? [chemin] : []
  })
}

/** Texte de la balise ouvrante commençant à `debut` (gère guillemets et accolades imbriquées) */
function baliseOuvrante(source: string, debut: number): string {
  let profondeur = 0
  let guillemet: string | null = null
  for (let i = debut; i < source.length; i++) {
    const c = source[i]
    if (guillemet) {
      if (c === '\\') i++
      else if (c === guillemet) guillemet = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') guillemet = c
    else if (c === '{') profondeur++
    else if (c === '}') profondeur--
    else if (c === '>' && profondeur === 0) return source.slice(debut, i + 1)
  }
  return source.slice(debut)
}

/** Valeur brute de l'attribut `className` d'une balise, constantes de `ui.ts` résolues */
function classes(balise: string): string {
  const depart = balise.indexOf('className=')
  if (depart === -1) return ''
  let brut = ''
  const apres = depart + 'className='.length
  if (balise[apres] === '"') {
    brut = balise.slice(apres + 1, balise.indexOf('"', apres + 1))
  } else if (balise[apres] === '{') {
    let profondeur = 0
    for (let i = apres; i < balise.length; i++) {
      if (balise[i] === '{') profondeur++
      else if (balise[i] === '}' && --profondeur === 0) {
        brut = balise.slice(apres + 1, i)
        break
      }
    }
  }
  // `${INPUT}` et `{INPUT}` → contenu réel de la constante. Les noms exportés sont
  // en capitales, jamais présents dans une classe Tailwind : la substitution est sûre.
  let resolu = brut
  for (const [nom, valeur] of Object.entries(CONSTANTES)) {
    if (typeof valeur !== 'string') continue
    resolu = resolu.split(`\${${nom}}`).join(` ${valeur} `)
    resolu = resolu.replace(new RegExp(`\\b${nom}\\b`, 'g'), ` ${valeur} `)
  }
  return resolu
}

/** Taille en px d'une classe de taille de texte, ou null si ce n'en est pas une */
function taillePx(classe: string): number | null {
  if (classe in ECHELLE) return ECHELLE[classe]
  const arbitraire = /^text-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(classe)
  if (!arbitraire) return null // couleurs `text-[#…]`, `text-center`, `text-balance`…
  const valeur = Number(arbitraire[1])
  return arbitraire[2] === 'rem' ? valeur * 16 : valeur
}

/** Tailles appliquées sans condition (les variantes `md:`, `focus:`… sont ignorées) */
function taillesInconditionnelles(className: string): number[] {
  return className
    .split(/[\s{}`"'()]+/)
    .filter((jeton) => jeton.startsWith('text-')) // un jeton à variante contient `:` avant `text-`
    .map(taillePx)
    .filter((px): px is number => px !== null)
}

const CHAMPS = fichiersTsx(SRC).flatMap((chemin) => {
  const source = readFileSync(chemin, 'utf-8')
  return [...source.matchAll(/<(input|textarea|select)[\s/>]/g)].map((m) => {
    const balise = baliseOuvrante(source, m.index)
    return {
      chemin: chemin.slice(RACINE.length + 1),
      ligne: source.slice(0, m.index).split('\n').length,
      element: m[1],
      className: classes(balise),
    }
  })
})

const INDEX_CSS = readFileSync(join(SRC, 'index.css'), 'utf-8')
const INDEX_HTML = readFileSync(join(RACINE, 'index.html'), 'utf-8')

describe('champs de saisie sur mobile — pas de zoom iOS', () => {
  it('trouve bien tous les champs de l’application', () => {
    expect(CHAMPS.length).toBeGreaterThanOrEqual(30)
    expect(CHAMPS.some((c) => c.element === 'textarea')).toBe(true)
    expect(CHAMPS.some((c) => c.element === 'select')).toBe(true)
  })

  it('pose la règle des 16 px sur tout contrôle de saisie', () => {
    // 16 px par défaut…
    expect(INDEX_CSS).toMatch(/input,\s*textarea,\s*select\s*\{\s*font-size:\s*1rem;/)
    // …et 14 px seulement là où un pointeur fin existe (bureau)
    expect(INDEX_CSS).toMatch(/@media \(pointer: fine\)/)
  })

  it('laisse l’utilisateur zoomer lui-même (pas de maximum-scale ni user-scalable)', () => {
    const viewport = /<meta name="viewport" content="([^"]*)"/.exec(INDEX_HTML)?.[1] ?? ''
    expect(viewport).not.toBe('')
    expect(viewport).not.toMatch(/maximum-scale/)
    expect(viewport).not.toMatch(/user-scalable/)
  })

  it('n’applique jamais une taille de texte sous 16 px à un champ', () => {
    const fautifs = CHAMPS.flatMap(({ chemin, ligne, element, className }) =>
      taillesInconditionnelles(className)
        .filter((px) => px < 16)
        .map((px) => `${chemin}:${ligne} <${element}> → ${px}px`),
    )
    expect(fautifs).toEqual([])
  })

  it('n’écrit aucune taille sous 16 px dans la classe partagée des champs', () => {
    expect(taillesInconditionnelles(UI.INPUT).filter((px) => px < 16)).toEqual([])
    expect(taillesInconditionnelles(UI.SELECT).filter((px) => px < 16)).toEqual([])
  })
})
