/**
 * ═══ Import d'un emploi du temps : chef d'orchestre ═══
 *
 * Un fichier entre, des créneaux candidats sortent — avec une confiance et un
 * message honnête. Rien n'est écrit en base ici : l'écran de relecture reste le
 * seul chemin vers `schedule_slots`.
 *
 * Le lecteur de PDF est chargé en `import()` dynamique, uniquement si le fichier
 * déposé est un PDF : les autres formats ne paient rien pour lui.
 */

import { parseCsv } from '@/lib/scheduleImport/csv'
import {
  ImportError, decodeText, readHtmlTables, readSpreadsheetXml, readXlsx, sniffKind,
  type Sheet,
} from '@/lib/scheduleImport/sheet'
import {
  parseMatrix, slotsFromLines, toDrafts,
  type Layout, type RawSlot, type SlotDraft,
} from '@/lib/scheduleImport/parse'

export { ImportError } from '@/lib/scheduleImport/sheet'

/** Au-delà, on refuse plutôt que de figer l'appareil */
export const MAX_BYTES = 12 * 1024 * 1024

export type SourceKind = 'csv' | 'xlsx' | 'xml' | 'html' | 'pdf'

/** Fiabilité annoncée à l'utilisateur — jamais un faux « tout va bien » */
export type Confidence = 'high' | 'medium' | 'low'

export interface ImportOutcome {
  drafts: SlotDraft[]
  layout: Layout
  source: SourceKind
  confidence: Confidence
  /** Phrase affichée en tête de l'écran de relecture */
  notice: string
  /** Nom de la feuille retenue, quand le classeur en compte plusieurs */
  sheetName: string | null
  fileName: string
}

const SOURCE_LABEL: Record<SourceKind, string> = {
  csv: 'CSV', xlsx: 'Excel', xml: 'Excel XML', html: 'tableau HTML', pdf: 'PDF',
}

/** Feuille la plus fournie d'un classeur : la notice d'accueil n'est pas l'emploi du temps */
function bestSheet(sheets: Sheet[]): { sheet: Sheet; slots: RawSlot[]; layout: Layout } | null {
  let best: { sheet: Sheet; slots: RawSlot[]; layout: Layout } | null = null
  for (const sheet of sheets) {
    const { slots, layout } = parseMatrix(sheet.matrix)
    if (!best || slots.length > best.slots.length) best = { sheet, slots, layout }
  }
  return best && best.slots.length > 0 ? best : null
}

/**
 * PDF : on tente d'abord de reconstituer une grille à partir des positions,
 * puis, si ça ne donne rien, on relit chaque ligne comme une phrase.
 */
async function fromPdf(bytes: Uint8Array): Promise<{ slots: RawSlot[]; layout: Layout; reliability: number }> {
  // Chargé à la demande : le lecteur de PDF ne pèse rien tant qu'on n'ouvre pas de PDF.
  const { extractPdfText, pdfLines, pdfMatrix } = await import('@/lib/scheduleImport/pdf')
  const { pages, reliability } = await extractPdfText(bytes)

  const gridded: RawSlot[] = []
  const lined: RawSlot[] = []
  for (const items of pages) {
    const { slots } = parseMatrix(pdfMatrix(items))
    gridded.push(...slots)
    lined.push(...slotsFromLines(pdfLines(items)))
  }
  // Tout ce qui vient d'un PDF part « incertain » : c'est le contrat de ce module.
  const chosen = gridded.length >= lined.length ? gridded : lined
  const layout: Layout = chosen.length === 0 ? 'none' : gridded.length >= lined.length ? 'grid' : 'lines'
  return { slots: chosen.map((s) => ({ ...s, uncertain: true })), layout, reliability }
}

function noticeFor(source: SourceKind, layout: Layout, drafts: SlotDraft[], reliability: number): { confidence: Confidence; notice: string } {
  const complete = drafts.filter((d) => d.weekday !== null && d.start && d.end && d.title.trim()).length
  const ratio = drafts.length === 0 ? 0 : complete / drafts.length

  if (source === 'pdf') {
    if (reliability < 0.7 || ratio < 0.5) {
      return {
        confidence: 'low',
        notice:
          'Je n’ai pas su lire ce PDF de façon fiable. Ce que tu vois ci-dessous est une tentative, pas un résultat sûr : relis chaque ligne, ou repars d’un export Excel ou CSV.',
      }
    }
    return {
      confidence: 'low',
      notice:
        'Lecture d’un PDF : un PDF ne contient pas de tableau, seulement du texte posé à des coordonnées. J’ai fait de mon mieux, mais rien n’est garanti — vérifie ligne par ligne avant de valider.',
    }
  }

  if (layout === 'grid') {
    return {
      confidence: ratio > 0.9 ? 'high' : 'medium',
      notice: `Grille reconnue (les jours en colonnes, les heures en lignes), lue depuis ton fichier ${SOURCE_LABEL[source]}. Vérifie surtout les cours à cheval sur plusieurs lignes.`,
    }
  }
  return {
    confidence: ratio > 0.9 ? 'high' : 'medium',
    notice: `Tableau reconnu (une ligne par créneau), lu depuis ton fichier ${SOURCE_LABEL[source]}. Un coup d’œil sur les intitulés et c’est bon.`,
  }
}

/**
 * Octets d'un fichier. `Blob.arrayBuffer()` n'existe pas partout (Safari
 * ancien, environnements de test) : on retombe alors sur `FileReader`.
 */
async function readBytes(file: Blob): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(new ImportError('Ce fichier n’a pas pu être lu.'))
    reader.readAsArrayBuffer(file)
  })
}

/** Un fichier déposé → des créneaux candidats prêts pour l'écran de relecture */
export async function importSchedule(file: File): Promise<ImportOutcome> {
  if (file.size === 0) throw new ImportError('Ce fichier est vide.')
  if (file.size > MAX_BYTES) {
    throw new ImportError(
      `Ce fichier fait ${(file.size / 1024 / 1024).toFixed(0)} Mo — la limite est de 12 Mo.`,
      'Garde seulement la feuille de ton emploi du temps, ou exporte-la en CSV.',
    )
  }

  const bytes = await readBytes(file)
  const kind = sniffKind(bytes)
  if (kind === 'ole2') {
    throw new ImportError(
      'Ce fichier est un ancien Excel (.xls binaire), que je ne sais pas ouvrir.',
      'Ouvre-le dans Excel ou LibreOffice, puis « Enregistrer sous » en .xlsx ou en CSV.',
    )
  }

  let source: SourceKind
  let slots: RawSlot[] = []
  let layout: Layout = 'none'
  let sheetName: string | null = null
  let reliability = 1

  if (kind === 'pdf') {
    source = 'pdf'
    const result = await fromPdf(bytes)
    slots = result.slots
    layout = result.layout
    reliability = result.reliability
  } else if (kind === 'zip') {
    source = 'xlsx'
    const sheets = await readXlsx(bytes)
    const best = bestSheet(sheets)
    if (best) {
      slots = best.slots
      layout = best.layout
      sheetName = sheets.length > 1 ? best.sheet.name : null
    }
  } else if (kind === 'xml' || kind === 'html') {
    source = kind
    const text = decodeText(bytes)
    const sheets = kind === 'xml' ? readSpreadsheetXml(text) : readHtmlTables(text)
    const best = bestSheet(sheets)
    if (best) {
      slots = best.slots
      layout = best.layout
      sheetName = sheets.length > 1 ? best.sheet.name : null
    }
  } else {
    source = 'csv'
    const matrix = parseCsv(decodeText(bytes))
    const result = parseMatrix(matrix)
    slots = result.slots
    layout = result.layout
  }

  const drafts = toDrafts(slots)
  if (drafts.length === 0) {
    throw new ImportError(
      'Je n’ai trouvé aucun créneau dans ce fichier.',
      source === 'pdf'
        ? 'Les PDF sont les plus durs à lire. Si tu peux, exporte ton emploi du temps en Excel ou en CSV.'
        : 'Il faut au minimum un jour, une heure de début et un intitulé — en colonnes, ou en grille avec les jours en tête.',
    )
  }

  return { drafts, layout, source, sheetName, fileName: file.name, ...noticeFor(source, layout, drafts, reliability) }
}
