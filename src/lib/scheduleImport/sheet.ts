/**
 * Lecture des classeurs — sans dépendance.
 *
 * Un `.xlsx` est une archive ZIP contenant du XML : le navigateur sait déjà tout
 * faire (`DecompressionStream` pour le dégonflage, `DOMParser` pour le XML).
 * On évite ainsi d'embarquer une bibliothèque de plusieurs centaines de kilo-
 * octets dans une PWA dont le pré-cache est servi à chaque installation.
 *
 * Sont également reconnus les deux déguisements courants du `.xls` :
 *  - le XML « SpreadsheetML 2003 » d'Excel ;
 *  - le tableau HTML que produisent beaucoup de logiciels de scolarité.
 * Le vrai `.xls` binaire (OLE2), lui, est refusé franchement : le lire
 * demanderait une bibliothèque lourde pour un format que l'utilisateur peut
 * ré-enregistrer en deux clics.
 */

/** Erreur d'import portant un message déjà écrit pour l'utilisateur */
export class ImportError extends Error {
  /** Ce que l'utilisateur peut faire pour s'en sortir */
  hint: string | null
  constructor(message: string, hint: string | null = null) {
    super(message)
    this.name = 'ImportError'
    this.hint = hint
  }
}

export interface Sheet {
  name: string
  matrix: string[][]
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconnaissance du format réel (l'extension ment souvent)
// ─────────────────────────────────────────────────────────────────────────────

export type FileKind = 'zip' | 'ole2' | 'pdf' | 'xml' | 'html' | 'text'

export function sniffKind(bytes: Uint8Array): FileKind {
  const b = bytes
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip' // « PK » : xlsx, ods…
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole2'
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf' // « %PDF »
  const head = decodeText(bytes.slice(0, 2048)).trim().toLowerCase()
  if (head.startsWith('<?xml') && head.includes('spreadsheet')) return 'xml'
  if (head.startsWith('<?xml')) return 'xml'
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<table')) return 'html'
  return 'text'
}

/** UTF-8 d'abord, puis Windows-1252 : un CSV français exporté d'Excel est rarement en UTF-8 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(bytes)
    } catch {
      return new TextDecoder('utf-8').decode(bytes)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZIP minimal (lecture seule)
// ─────────────────────────────────────────────────────────────────────────────

interface ZipEntry { name: string; method: number; offset: number; compressedSize: number }

function u16(view: DataView, at: number): number { return view.getUint16(at, true) }
function u32(view: DataView, at: number): number { return view.getUint32(at, true) }

/** Table des matières de l'archive (répertoire central, lu depuis la fin) */
function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  const from = Math.max(0, bytes.length - 66_000)
  for (let i = bytes.length - 22; i >= from; i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new ImportError("Ce fichier ne s’ouvre pas : l’archive est incomplète ou abîmée.")

  const count = u16(view, eocd + 10)
  let at = u32(view, eocd + 16)
  if (at === 0xffffffff) throw new ImportError('Ce classeur utilise un format ZIP64 que je ne sais pas lire.', 'Ré-enregistre-le en CSV.')

  const entries = new Map<string, ZipEntry>()
  for (let i = 0; i < count && at + 46 <= bytes.length; i++) {
    if (u32(view, at) !== 0x02014b50) break
    const nameLength = u16(view, at + 28)
    const extraLength = u16(view, at + 30)
    const commentLength = u16(view, at + 32)
    const entry: ZipEntry = {
      name: new TextDecoder().decode(bytes.slice(at + 46, at + 46 + nameLength)),
      method: u16(view, at + 10),
      compressedSize: u32(view, at + 20),
      offset: u32(view, at + 42),
    }
    entries.set(entry.name, entry)
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

/** Dégonflage natif — aucune bibliothèque, `DecompressionStream` est dans le navigateur */
export async function inflate(data: Uint8Array, format: CompressionFormat = 'deflate-raw'): Promise<Uint8Array> {
  const stream = new DecompressionStream(format)
  const writer = stream.writable.getWriter()
  // Ne pas attendre l'écriture : le flux ne la résout qu'une fois lue (contre-pression).
  void writer.write(data as unknown as BufferSource).catch(() => {})
  void writer.close().catch(() => {})
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) { chunks.push(value); total += value.length }
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
  return out
}

async function readZipFile(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const nameLength = u16(view, entry.offset + 26)
  const extraLength = u16(view, entry.offset + 28)
  const start = entry.offset + 30 + nameLength + extraLength
  const raw = bytes.slice(start, start + entry.compressedSize)
  if (entry.method === 0) return raw
  if (entry.method !== 8) throw new ImportError('Ce classeur utilise une compression que je ne sais pas lire.', 'Ré-enregistre-le en CSV.')
  return inflate(raw)
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX
// ─────────────────────────────────────────────────────────────────────────────

function parseXml(text: string, kind: DOMParserSupportedType = 'application/xml'): Document {
  const doc = new DOMParser().parseFromString(text, kind)
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new ImportError('Ce fichier est illisible : son contenu XML est abîmé.')
  }
  return doc
}

function tagged(node: Document | Element, tag: string): Element[] {
  return Array.from(node.getElementsByTagName(tag))
}

/** « BC12 » → 54 (index de colonne, 0 = A) */
export function columnIndex(ref: string): number {
  let index = 0
  for (const ch of ref.toUpperCase()) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    index = index * 26 + (code - 64)
  }
  return index - 1
}

function sharedStringsOf(doc: Document): string[] {
  return tagged(doc, 'si').map((si) => tagged(si, 't').map((t) => t.textContent ?? '').join(''))
}

/** Feuille XLSX → tableau de cellules, cellules fusionnées recopiées */
export function sheetMatrix(doc: Document, shared: string[]): string[][] {
  const matrix: string[][] = []
  const put = (r: number, c: number, value: string) => {
    while (matrix.length <= r) matrix.push([])
    const row = matrix[r] as string[]
    while (row.length <= c) row.push('')
    row[c] = value
  }

  for (const rowEl of tagged(doc, 'row')) {
    const declared = Number(rowEl.getAttribute('r') ?? 0)
    // Une ligne annonce son numéro (`r="12"`) ; sinon elle suit la précédente.
    const cursor = declared > 0 ? declared - 1 : matrix.length
    let column = 0
    for (const cell of tagged(rowEl, 'c')) {
      const ref = cell.getAttribute('r')
      const c = ref ? columnIndex(ref) : column
      const type = cell.getAttribute('t')
      let value: string
      if (type === 'e') value = '' // cellule en erreur (#N/A…)
      else if (type === 'inlineStr') value = tagged(cell, 't').map((t) => t.textContent ?? '').join('')
      else {
        const v = tagged(cell, 'v')[0]?.textContent ?? ''
        value = type === 's' ? (shared[Number(v)] ?? '') : v
      }
      put(cursor, c, value.trim())
      column = c + 1
    }
    if (matrix.length <= cursor) put(cursor, 0, '')
  }

  // Cellules fusionnées : seule l'ancre porte la valeur, on la recopie sur toute
  // la zone — sinon un cours de deux heures ne durerait qu'une ligne.
  for (const merge of tagged(doc, 'mergeCell')) {
    const ref = merge.getAttribute('ref') ?? ''
    const [a, b] = ref.split(':')
    if (!a || !b) continue
    const r1 = Number(a.replace(/\D/g, '')) - 1, c1 = columnIndex(a)
    const r2 = Number(b.replace(/\D/g, '')) - 1, c2 = columnIndex(b)
    const value = matrix[r1]?.[c1] ?? ''
    if (!value) continue
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) put(r, c, value)
  }
  return matrix
}

/** `.xlsx` → toutes ses feuilles, dans l'ordre du classeur */
export async function readXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  const entries = readZipDirectory(bytes)
  const text = async (name: string) => {
    const entry = entries.get(name)
    if (!entry) return null
    return decodeText(await readZipFile(bytes, entry))
  }

  const workbookXml = await text('xl/workbook.xml')
  if (!workbookXml) {
    throw new ImportError("Ce fichier n’est pas un classeur Excel.", 'Vérifie que c’est bien un .xlsx, ou passe par un CSV.')
  }
  const sharedXml = await text('xl/sharedStrings.xml')
  const shared = sharedXml ? sharedStringsOf(parseXml(sharedXml)) : []

  const relsXml = await text('xl/_rels/workbook.xml.rels')
  const targets = new Map<string, string>()
  if (relsXml) {
    for (const rel of tagged(parseXml(relsXml), 'Relationship')) {
      const id = rel.getAttribute('Id')
      const target = rel.getAttribute('Target')
      if (id && target) targets.set(id, target.replace(/^\/?(xl\/)?/, ''))
    }
  }

  const RELS_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const sheets: Sheet[] = []
  const declared = tagged(parseXml(workbookXml), 'sheet')
  const wanted: { name: string; path: string }[] = declared.map((el, i) => {
    const id = el.getAttributeNS(RELS_NS, 'id') ?? el.getAttribute('r:id') ?? ''
    const target = targets.get(id)
    return { name: el.getAttribute('name') ?? `Feuille ${i + 1}`, path: `xl/${target ?? `worksheets/sheet${i + 1}.xml`}` }
  })
  if (wanted.length === 0) wanted.push({ name: 'Feuille 1', path: 'xl/worksheets/sheet1.xml' })

  // Un classeur de scolarité contient souvent une notice puis les vraies feuilles :
  // on les lit toutes (plafonnées) et l'appelant garde la plus fournie.
  for (const sheet of wanted.slice(0, 12)) {
    const xml = await text(sheet.path)
    if (!xml) continue
    sheets.push({ name: sheet.name, matrix: sheetMatrix(parseXml(xml), shared) })
  }
  if (sheets.length === 0) throw new ImportError('Ce classeur ne contient aucune feuille lisible.')
  return sheets
}

// ─────────────────────────────────────────────────────────────────────────────
// SpreadsheetML 2003 (« .xls » en XML)
// ─────────────────────────────────────────────────────────────────────────────

export function readSpreadsheetXml(text: string): Sheet[] {
  const doc = parseXml(text)
  const SS = 'urn:schemas-microsoft-com:office:spreadsheet'
  const attr = (el: Element, name: string) => el.getAttributeNS(SS, name) ?? el.getAttribute(`ss:${name}`)
  const sheets: Sheet[] = []

  tagged(doc, 'Worksheet').forEach((sheet, index) => {
    const matrix: string[][] = []
    for (const rowEl of tagged(sheet, 'Row')) {
      const row: string[] = []
      for (const cell of tagged(rowEl, 'Cell')) {
        const at = Number(attr(cell, 'Index') ?? 0)
        if (at > 0) while (row.length < at - 1) row.push('')
        const value = (tagged(cell, 'Data')[0]?.textContent ?? '').trim()
        row.push(value)
        const across = Number(attr(cell, 'MergeAcross') ?? 0)
        for (let i = 0; i < across; i++) row.push(value)
      }
      matrix.push(row)
    }
    if (matrix.length > 0) sheets.push({ name: attr(sheet, 'Name') ?? `Feuille ${index + 1}`, matrix })
  })
  if (sheets.length === 0) throw new ImportError('Ce fichier Excel XML ne contient aucun tableau lisible.')
  return sheets
}

// ─────────────────────────────────────────────────────────────────────────────
// Tableau HTML (export « .xls » de beaucoup de logiciels de scolarité)
// ─────────────────────────────────────────────────────────────────────────────

export function readHtmlTables(text: string): Sheet[] {
  const doc = parseXml(text, 'text/html')
  const sheets: Sheet[] = []
  tagged(doc, 'table').forEach((table, index) => {
    const matrix: string[][] = []
    // Les cellules fusionnées (rowspan/colspan) sont recopiées, comme dans un classeur.
    const pending = new Map<string, string>()
    tagged(table, 'tr').forEach((tr, r) => {
      const row: string[] = []
      let c = 0
      const place = (value: string) => {
        while (pending.has(`${r}:${c}`)) { row[c] = pending.get(`${r}:${c}`) as string; c++ }
        row[c] = value
        c++
      }
      for (const cell of Array.from(tr.children)) {
        if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue
        const value = (cell.textContent ?? '').replace(/\s+/g, ' ').trim()
        const colspan = Math.max(1, Number(cell.getAttribute('colspan') ?? 1))
        const rowspan = Math.max(1, Number(cell.getAttribute('rowspan') ?? 1))
        const at = c
        place(value)
        for (let i = 1; i < colspan; i++) place(value)
        for (let dr = 1; dr < rowspan; dr++) {
          for (let dc = 0; dc < colspan; dc++) pending.set(`${r + dr}:${at + dc}`, value)
        }
      }
      while (pending.has(`${r}:${c}`)) { row[c] = pending.get(`${r}:${c}`) as string; c++ }
      matrix.push(row.map((v) => v ?? ''))
    })
    if (matrix.length > 1) sheets.push({ name: `Tableau ${index + 1}`, matrix })
  })
  if (sheets.length === 0) throw new ImportError('Aucun tableau trouvé dans ce fichier.')
  return sheets
}
