/**
 * ═══ Lecture d'un PDF : approximative, et annoncée comme telle ═══
 *
 * Un PDF ne contient pas de tableau : il contient des morceaux de texte posés à
 * des coordonnées. Reconstituer une grille d'emploi du temps à partir de ça,
 * c'est deviner. Ce module fait de son mieux — regroupement par position, puis
 * détection de colonnes — et surtout il RENVOIE SA CONFIANCE, pour que l'écran
 * de relecture puisse dire honnêtement « je n'ai pas su lire ce PDF ».
 *
 * Aucune bibliothèque : le dégonflage (`DecompressionStream`) suffit à ouvrir
 * les flux de contenu, et les opérateurs de texte se lisent à la main. Embarquer
 * un moteur PDF complet aurait ajouté près de deux méga-octets au pré-cache de
 * la PWA, téléchargés par tout le monde, y compris ceux qui n'importent jamais
 * de PDF.
 */

import { ImportError, inflate } from '@/lib/scheduleImport/sheet'

export interface PdfItem {
  text: string
  x: number
  y: number
  size: number
  /** Le texte vient-il d'un chemin de décodage sûr ? */
  reliable: boolean
}

export interface PdfExtract {
  pages: PdfItem[][]
  /** Part de caractères décodés de façon sûre, entre 0 et 1 */
  reliability: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Octets → texte latin-1 (1 octet = 1 unité de code, les offsets restent justes)
// ─────────────────────────────────────────────────────────────────────────────

function latin1(bytes: Uint8Array): string {
  let out = ''
  const step = 8192
  for (let i = 0; i < bytes.length; i += step) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)))
  }
  return out
}

/**
 * Les seuls écarts entre le latin-1 et l'encodage WinAnsi des PDF : la plage
 * 0x80–0x9F, où WinAnsi loge la typographie (guillemets courbes, tirets, œ…).
 */
const CP1252_HIGH: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
}

function fromWinAnsi(code: number): string {
  if (code >= 0x80 && code <= 0x9f) return CP1252_HIGH[code] ?? ' '
  return String.fromCharCode(code)
}

// ─────────────────────────────────────────────────────────────────────────────
// Objets indirects
// ─────────────────────────────────────────────────────────────────────────────

interface PdfObject { num: number; dict: string; streamStart: number; streamEnd: number }

const OBJ_RE = /(\d+)\s+(\d+)\s+obj\b/g

function scanObjects(raw: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>()
  OBJ_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = OBJ_RE.exec(raw)) !== null) {
    const num = Number(match[1])
    const bodyStart = match.index + match[0].length
    const end = raw.indexOf('endobj', bodyStart)
    const streamAt = raw.indexOf('stream', bodyStart)
    const hasStream = streamAt !== -1 && (end === -1 || streamAt < end)
    let streamStart = -1
    let streamEnd = -1
    if (hasStream) {
      streamStart = streamAt + 'stream'.length
      if (raw[streamStart] === '\r') streamStart++
      if (raw[streamStart] === '\n') streamStart++
      streamEnd = raw.indexOf('endstream', streamStart)
    }
    const dictEnd = hasStream ? streamAt : end === -1 ? Math.min(raw.length, bodyStart + 4000) : end
    objects.set(num, { num, dict: raw.slice(bodyStart, dictEnd), streamStart, streamEnd })
  }
  return objects
}

async function streamOf(bytes: Uint8Array, obj: PdfObject): Promise<string | null> {
  if (obj.streamStart < 0 || obj.streamEnd < 0) return null
  const data = bytes.slice(obj.streamStart, obj.streamEnd)
  if (!/\/Filter/.test(obj.dict)) return latin1(data)
  if (!/FlateDecode/.test(obj.dict)) return null
  // Un flux filtré deux fois (Flate + ASCII85…) n'est pas géré : on l'ignore.
  if (/\/Filter\s*\[[^\]]*\/[A-Za-z]+[^\]]*\/[A-Za-z]+/.test(obj.dict)) return null
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      return latin1(await inflate(data, format))
    } catch {
      /* on tente l'autre variante */
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Polices : table ToUnicode (indispensable aux polices incorporées)
// ─────────────────────────────────────────────────────────────────────────────

interface FontInfo { twoByte: boolean; toUnicode: Map<number, string> | null }

function hexToText(hex: string): string {
  let out = ''
  for (let i = 0; i + 1 < hex.length; i += 4) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4).padEnd(4, '0'), 16))
  }
  return out
}

/** Table ToUnicode d'une police incorporée : code interne → texte lisible */
export function parseCMap(text: string): Map<number, string> {
  const map = new Map<number, string>()

  for (const block of text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    const pair = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g
    let m: RegExpExecArray | null
    while ((m = pair.exec(block)) !== null) map.set(parseInt(m[1] as string, 16), hexToText(m[2] as string))
  }

  for (const block of text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    const arrayed = /<([0-9a-fA-F]+)>\s*<[0-9a-fA-F]+>\s*\[([\s\S]*?)\]/g
    let m: RegExpExecArray | null
    const consumed: string[] = []
    while ((m = arrayed.exec(block)) !== null) {
      consumed.push(m[0])
      const lo = parseInt(m[1] as string, 16)
      const items = (m[2] as string).match(/<([0-9a-fA-F]*)>/g) ?? []
      items.forEach((item, i) => map.set(lo + i, hexToText(item.slice(1, -1))))
    }
    let rest = block
    for (const done of consumed) rest = rest.replace(done, ' ')
    const simple = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g
    while ((m = simple.exec(rest)) !== null) {
      const lo = parseInt(m[1] as string, 16)
      const hi = parseInt(m[2] as string, 16)
      const base = hexToText(m[3] as string)
      if (!base) continue
      const last = base.charCodeAt(base.length - 1)
      for (let c = lo; c <= hi && c - lo < 1024; c++) {
        map.set(c, base.slice(0, -1) + String.fromCharCode(last + (c - lo)))
      }
    }
  }
  return map
}

async function readFonts(bytes: Uint8Array, objects: Map<number, PdfObject>): Promise<Map<string, FontInfo>> {
  // 1. Chaque objet police → sa table ToUnicode.
  const byNumber = new Map<number, FontInfo>()
  for (const obj of objects.values()) {
    if (!/\/Type\s*\/Font/.test(obj.dict)) continue
    const twoByte = /\/Subtype\s*\/Type0/.test(obj.dict) || /Identity-H/.test(obj.dict)
    const ref = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(obj.dict)
    let toUnicode: Map<number, string> | null = null
    if (ref) {
      const target = objects.get(Number(ref[1]))
      if (target) {
        const cmap = await streamOf(bytes, target)
        if (cmap) toUnicode = parseCMap(cmap)
      }
    }
    byNumber.set(obj.num, { twoByte, toUnicode })
  }

  // 2. Nom de ressource (« /F1 ») → police. Ce nom est local à une page ; faute
  //    de dérouler l'arbre des pages, on retient la première association
  //    rencontrée. C'est une approximation, assumée et signalée à l'écran.
  const byName = new Map<string, FontInfo>()
  for (const obj of objects.values()) {
    const fontDict = /\/Font\s*<<([\s\S]*?)>>/.exec(obj.dict)
    if (!fontDict) continue
    const pairs = /\/([A-Za-z0-9#+.\-_]+)\s+(\d+)\s+\d+\s+R/g
    let m: RegExpExecArray | null
    while ((m = pairs.exec(fontDict[1] as string)) !== null) {
      const info = byNumber.get(Number(m[2]))
      if (info && !byName.has(m[1] as string)) byName.set(m[1] as string, info)
    }
  }
  return byName
}

// ─────────────────────────────────────────────────────────────────────────────
// Flux de contenu → morceaux de texte positionnés
// ─────────────────────────────────────────────────────────────────────────────

type Matrix = [number, number, number, number, number, number]

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ]
}

/** Lit une chaîne PDF `(…)` ou `<…>` à partir de `at`, et renvoie ses octets */
function readString(content: string, at: number): { codes: number[]; next: number } | null {
  if (content[at] === '(') {
    const codes: number[] = []
    let depth = 1
    let i = at + 1
    while (i < content.length) {
      const ch = content[i] as string
      if (ch === '\\') {
        const octal = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4))
        if (octal) { codes.push(parseInt(octal[0], 8)); i += 1 + octal[0].length; continue }
        const next = content[i + 1] as string
        const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 }
        if (next in escapes) codes.push(escapes[next] as number)
        else if (next !== '\n' && next !== '\r') codes.push(next.charCodeAt(0))
        i += 2
        continue
      }
      if (ch === '(') depth++
      if (ch === ')') { depth--; if (depth === 0) return { codes, next: i + 1 } }
      codes.push(ch.charCodeAt(0))
      i++
    }
    return null
  }
  if (content[at] === '<') {
    const close = content.indexOf('>', at)
    if (close === -1) return null
    const hex = content.slice(at + 1, close).replace(/\s/g, '')
    const codes: number[] = []
    for (let i = 0; i < hex.length; i += 2) codes.push(parseInt(hex.slice(i, i + 2).padEnd(2, '0'), 16))
    return { codes, next: close + 1 }
  }
  return null
}

function decodeCodes(codes: number[], font: FontInfo | undefined): { text: string; reliable: boolean } {
  if (font?.twoByte) {
    // Police incorporée à deux octets : sans table ToUnicode, les octets sont
    // des numéros de glyphes — illisibles. On préfère ne rien rendre.
    if (!font.toUnicode) return { text: '', reliable: false }
    let text = ''
    for (let i = 0; i + 1 < codes.length; i += 2) {
      text += font.toUnicode.get(((codes[i] as number) << 8) | (codes[i + 1] as number)) ?? ''
    }
    return { text, reliable: text.trim().length > 0 }
  }
  let text = ''
  for (const code of codes) {
    const mapped = font?.toUnicode?.get(code)
    text += mapped !== undefined && mapped !== '' ? mapped : fromWinAnsi(code)
  }
  return { text, reliable: true }
}

const TOKEN_RE = /(-?\d*\.?\d+)|\/([A-Za-z0-9#+.\-_]+)|([A-Za-z'"*]+)|(\[|\]|\(|<)/g
/** Marqueur interne : une chaîne lue devient « code,code,… » dans la pile */
const STRING_MARK = '\u0001'

function itemsFromContent(content: string, fonts: Map<string, FontInfo>): { items: PdfItem[]; total: number; sure: number } {
  const items: PdfItem[] = []
  let total = 0
  let sure = 0

  let ctm: Matrix = [...IDENTITY] as Matrix
  const stack: Matrix[] = []
  let tm: Matrix = [...IDENTITY] as Matrix
  let tlm: Matrix = [...IDENTITY] as Matrix
  let leading = 0
  let font: FontInfo | undefined
  let fontSize = 10
  let operands: (number | string)[] = []

  const emit = (codes: number[]) => {
    if (codes.length === 0) return
    const { text, reliable } = decodeCodes(codes, font)
    total += codes.length
    if (reliable) sure += codes.length
    const flat = text.replace(/\s+/g, ' ')
    if (flat.trim()) {
      const placed = multiply(tm, ctm)
      const scale = Math.abs(placed[3]) || Math.abs(placed[1]) || 1
      items.push({ text: flat, x: placed[4], y: placed[5], size: Math.max(1, scale * fontSize), reliable })
    }
    // Avance approximative : sans la largeur des glyphes, une demi-cadratin par caractère.
    tm = multiply([1, 0, 0, 1, text.length * fontSize * 0.5, 0], tm)
  }

  const codesOf = (value: unknown): number[] => {
    const s = typeof value === 'string' ? value : ''
    return s.startsWith(STRING_MARK) ? s.slice(1).split(',').filter(Boolean).map(Number) : []
  }

  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(content)) !== null) {
    if (match[1] !== undefined) { operands.push(Number(match[1])); continue }
    if (match[2] !== undefined) { operands.push(`/${match[2]}`); continue }
    if (match[4] === '(' || match[4] === '<') {
      const read = readString(content, match.index)
      if (!read) continue
      operands.push(STRING_MARK + read.codes.join(','))
      TOKEN_RE.lastIndex = read.next
      continue
    }
    if (match[4] !== undefined) continue

    const op = match[3] as string
    const num = (fromEnd: number) => Number(operands[operands.length - fromEnd] ?? 0)
    switch (op) {
      case 'q': stack.push([...ctm] as Matrix); break
      case 'Q': ctm = stack.pop() ?? ([...IDENTITY] as Matrix); break
      case 'cm': ctm = multiply([num(6), num(5), num(4), num(3), num(2), num(1)], ctm); break
      case 'BT': tm = [...IDENTITY] as Matrix; tlm = [...IDENTITY] as Matrix; break
      case 'Tf': {
        fontSize = num(1) || 10
        font = fonts.get(String(operands[operands.length - 2] ?? '').replace(/^\//, ''))
        break
      }
      case 'TL': leading = num(1); break
      case 'Td': tlm = multiply([1, 0, 0, 1, num(2), num(1)], tlm); tm = [...tlm] as Matrix; break
      case 'TD': leading = -num(1); tlm = multiply([1, 0, 0, 1, num(2), num(1)], tlm); tm = [...tlm] as Matrix; break
      case 'Tm': tlm = [num(6), num(5), num(4), num(3), num(2), num(1)]; tm = [...tlm] as Matrix; break
      case 'T*': tlm = multiply([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm] as Matrix; break
      case 'Tj':
      case "'":
      case '"': {
        if (op !== 'Tj') { tlm = multiply([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm] as Matrix }
        emit(codesOf(operands[operands.length - 1]))
        break
      }
      case 'TJ': {
        const codes: number[] = []
        for (const item of operands) {
          if (typeof item === 'string') codes.push(...codesOf(item))
          // Un grand écart de crénage tient lieu d'espace entre deux mots.
          else if (typeof item === 'number' && item < -120) codes.push(32)
        }
        emit(codes)
        break
      }
      default: break
    }
    operands = []
  }
  return { items, total, sure }
}

/** PDF → morceaux de texte positionnés, page par page, avec la confiance obtenue */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfExtract> {
  const raw = latin1(bytes)
  if (!raw.startsWith('%PDF')) throw new ImportError('Ce fichier n’est pas un PDF.')
  const objects = scanObjects(raw)
  if (objects.size === 0) {
    throw new ImportError('Je n’ai rien pu ouvrir dans ce PDF.', 'Exporte plutôt ton emploi du temps en Excel ou en CSV.')
  }
  const fonts = await readFonts(bytes, objects)

  const pages: PdfItem[][] = []
  let total = 0
  let sure = 0
  for (const obj of objects.values()) {
    if (obj.streamStart < 0) continue
    if (/\/Type\s*\/(?:Font|Metadata|ObjStm|XRef)\b/.test(obj.dict)) continue
    const content = await streamOf(bytes, obj)
    if (!content || !/(?:Tj|TJ)[\s\]]/.test(content)) continue
    const page = itemsFromContent(content, fonts)
    total += page.total
    sure += page.sure
    if (page.items.length > 0) pages.push(page.items)
  }
  return { pages, reliability: total === 0 ? 0 : sure / total }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconstitution d'une mise en page (fonctions pures, testables sans PDF)
// ─────────────────────────────────────────────────────────────────────────────

/** Morceaux de texte → lignes, regroupées par ordonnée */
export function itemsToLines(items: PdfItem[]): { y: number; items: PdfItem[] }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { y: number; items: PdfItem[] }[] = []
  for (const item of sorted) {
    const tolerance = Math.max(2, item.size * 0.5)
    const line = lines[lines.length - 1]
    if (line && Math.abs(line.y - item.y) <= tolerance) line.items.push(item)
    else lines.push({ y: item.y, items: [item] })
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x)
  return lines
}

/** Lignes de texte lisibles, pour la lecture « une phrase par créneau » */
export function pdfLines(items: PdfItem[]): string[] {
  return itemsToLines(items).map((line) => line.items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim())
}

/**
 * Colonnes déduites des abscisses : les x proches sont regroupés, chaque groupe
 * devient une colonne. C'est ce qui permet de retrouver une grille jour/heure
 * dans un PDF — approximativement, encore une fois.
 */
export function columnEdges(items: PdfItem[], gap = 14): number[] {
  const xs = [...new Set(items.map((i) => Math.round(i.x)))].sort((a, b) => a - b)
  if (xs.length === 0) return []
  const edges: number[] = [xs[0] as number]
  let previous = xs[0] as number
  for (const x of xs) {
    if (x - previous > gap) edges.push(x)
    previous = x
  }
  return edges
}

/** Morceaux de texte → tableau de cellules, prêt pour la détection de disposition */
export function pdfMatrix(items: PdfItem[]): string[][] {
  if (items.length === 0) return []
  const edges = columnEdges(items)
  const columnOf = (x: number) => {
    let best = 0
    for (let i = 0; i < edges.length; i++) if (x >= (edges[i] as number) - 6) best = i
    return best
  }
  return itemsToLines(items).map((line) => {
    const row: string[] = new Array(edges.length).fill('')
    for (const item of line.items) {
      const c = columnOf(item.x)
      row[c] = row[c] ? `${row[c]} ${item.text}`.trim() : item.text
    }
    return row
  })
}
