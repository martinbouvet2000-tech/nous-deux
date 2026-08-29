/**
 * Lecture d'un CSV — sans dépendance.
 *
 * Un CSV d'emploi du temps vient d'Excel, de Google Sheets ou d'un logiciel de
 * scolarité : le séparateur peut être `;` (Excel français), `,`, une tabulation
 * ou `|`. On le devine en comptant les séparateurs hors guillemets sur les
 * premières lignes, plutôt que d'imposer un format à l'utilisateur.
 */

const DELIMITERS = [';', ',', '\t', '|'] as const

/** Séparateur le plus régulier sur les premières lignes du fichier */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 20)
  let best = ';'
  let bestScore = -1
  for (const delim of DELIMITERS) {
    const counts = sample.map((line) => countOutsideQuotes(line, delim))
    const total = counts.reduce((a, b) => a + b, 0)
    if (total === 0) continue
    // On préfère le séparateur qui découpe le MÊME nombre de colonnes partout.
    const mean = total / counts.length
    const variance = counts.reduce((a, c) => a + (c - mean) ** 2, 0) / counts.length
    const score = mean - variance
    if (score > bestScore) { bestScore = score; best = delim }
  }
  return best
}

function countOutsideQuotes(line: string, delim: string): number {
  let count = 0
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { quoted = !quoted; continue }
    if (!quoted && ch === delim) count++
  }
  return count
}

/**
 * CSV → tableau de cellules. Gère les guillemets, les `""` échappés, les
 * retours à la ligne dans une cellule, le CRLF et le BOM d'Excel.
 */
export function parseCsv(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^\ufeff/, '')
  if (!text.trim()) return []
  const delim = delimiter ?? detectDelimiter(text)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === delim) { row.push(field); field = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  row.push(field)
  rows.push(row)
  return rows.map((r) => r.map((c) => c.trim()))
}
