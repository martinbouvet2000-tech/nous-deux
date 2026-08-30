import { describe, it, expect } from 'vitest'
import { importSchedule, ImportError } from '@/lib/scheduleImport'
import { columnIndex, readHtmlTables, readSpreadsheetXml, sniffKind } from '@/lib/scheduleImport/sheet'
import { columnEdges, itemsToLines, parseCMap, pdfLines, pdfMatrix, type PdfItem } from '@/lib/scheduleImport/pdf'

// ─────────────────────────────────────────────────────────────────────────────
// Fabrique de fichiers : un vrai .xlsx (archive ZIP) construit à la main, pour
// éprouver le lecteur sans dépendance ni fichier binaire versionné.
// ─────────────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder()

function put(view: DataView, at: number, values: [number, number][]) {
  for (const [offset, value] of values) {
    if (value > 0xffff) view.setUint32(at + offset, value, true)
    else view.setUint16(at + offset, value, true)
  }
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  void writer.write(data as unknown as BufferSource)
  void writer.close()
  const chunks: Uint8Array[] = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
  return out
}

/** Archive ZIP minimale : moitié « stocké », moitié « dégonflé » */
async function makeZip(files: Record<string, string>): Promise<Uint8Array> {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  let index = 0

  for (const [name, content] of Object.entries(files)) {
    const raw = encoder.encode(content)
    const compress = index % 2 === 1
    const data = compress ? await deflate(raw) : raw
    const nameBytes = encoder.encode(name)

    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    put(localView, 0, [[8, compress ? 8 : 0]])
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, raw.length, true)
    put(localView, 0, [[26, nameBytes.length]])
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    put(centralView, 0, [[10, compress ? 8 : 0], [28, nameBytes.length]])
    centralView.setUint32(20, data.length, true)
    centralView.setUint32(24, raw.length, true)
    centralView.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
    index++
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, 0x06054b50, true)
  put(eocdView, 0, [[8, centrals.length], [10, centrals.length]])
  eocdView.setUint32(12, centralSize, true)
  eocdView.setUint32(16, offset, true)

  const total = offset + centralSize + eocd.length
  const zip = new Uint8Array(total)
  let at = 0
  for (const part of [...locals, ...centrals, eocd]) { zip.set(part, at); at += part.length }
  return zip
}

const SHEET_XML = `<?xml version="1.0"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Horaire</t></is></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>8h00-9h00</t></is></c><c r="B2" t="s"><v>3</v></c><c r="D2" t="s"><v>5</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>9h00-10h00</t></is></c><c r="C3" t="s"><v>4</v></c></row>
</sheetData><mergeCells count="1"><mergeCell ref="B2:B3"/></mergeCells></worksheet>`

const SHARED_XML = `<?xml version="1.0"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="6">
<si><t>Lundi</t></si><si><t>Mardi</t></si><si><t>Mercredi</t></si>
<si><t>Maths</t></si><si><t>Anglais</t></si><si><t>Sport</t></si></sst>`

const WORKBOOK_XML = `<?xml version="1.0"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Semaine" sheetId="1" r:id="rId1"/></sheets></workbook>`

const RELS_XML = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`

function file(name: string, content: string | Uint8Array): File {
  return new File([content as BlobPart], name)
}

// ─────────────────────────────────────────────────────────────────────────────

describe('reconnaissance du format réel', () => {
  it('ne se fie pas à l’extension', () => {
    expect(sniffKind(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('zip')
    expect(sniffKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe('ole2')
    expect(sniffKind(encoder.encode('%PDF-1.7'))).toBe('pdf')
    expect(sniffKind(encoder.encode('Jour;Début\nLundi;8h'))).toBe('text')
  })

  it('convertit une référence de colonne', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('AA1')).toBe(26)
  })
})

describe('classeur .xlsx', () => {
  it('lit une grille, cellules fusionnées comprises', async () => {
    const zip = await makeZip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': RELS_XML,
      'xl/sharedStrings.xml': SHARED_XML,
      'xl/worksheets/sheet1.xml': SHEET_XML,
    })
    const outcome = await importSchedule(file('edt.xlsx', zip))
    expect(outcome.source).toBe('xlsx')
    expect(outcome.layout).toBe('grid')
    expect(outcome.confidence).toBe('high')
    expect(outcome.drafts).toHaveLength(3)
    // La fusion B2:B3 doit produire un seul cours de deux heures.
    expect(outcome.drafts[0]).toMatchObject({ weekday: 1, start: '08:00', end: '10:00', title: 'Maths' })
    expect(outcome.drafts[1]).toMatchObject({ weekday: 2, start: '09:00', end: '10:00', title: 'Anglais' })
    expect(outcome.drafts[2]).toMatchObject({ weekday: 3, start: '08:00', end: '09:00', title: 'Sport' })
  })

  it('refuse une archive qui n’est pas un classeur', async () => {
    const zip = await makeZip({ 'notes.txt': 'rien à voir' })
    await expect(importSchedule(file('edt.xlsx', zip))).rejects.toBeInstanceOf(ImportError)
  })
})

describe('les deux déguisements du .xls', () => {
  it('lit un tableau HTML exporté par un logiciel de scolarité', () => {
    const [sheet] = readHtmlTables(`<html><body><table>
      <tr><th>Horaire</th><th>Lundi</th><th>Mardi</th></tr>
      <tr><td>8h00-9h00</td><td rowspan="2">Maths</td><td></td></tr>
      <tr><td>9h00-10h00</td><td>Anglais</td></tr>
      </table></body></html>`)
    expect(sheet?.matrix[0]).toEqual(['Horaire', 'Lundi', 'Mardi'])
    // Le rowspan est recopié, comme une cellule fusionnée.
    expect(sheet?.matrix[2]?.[1]).toBe('Maths')
  })

  it('lit un Excel XML 2003', () => {
    const [sheet] = readSpreadsheetXml(`<?xml version="1.0"?>
      <Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Worksheet ss:Name="Semaine"><Table>
      <Row><Cell><Data>Jour</Data></Cell><Cell><Data>Horaire</Data></Cell><Cell><Data>Matière</Data></Cell></Row>
      <Row><Cell><Data>Lundi</Data></Cell><Cell><Data>8h30-10h00</Data></Cell><Cell><Data>Maths</Data></Cell></Row>
      </Table></Worksheet></Workbook>`)
    expect(sheet?.name).toBe('Semaine')
    expect(sheet?.matrix[1]).toEqual(['Lundi', '8h30-10h00', 'Maths'])
  })

  it('refuse franchement un vieux .xls binaire, avec la marche à suivre', async () => {
    const ole2 = new Uint8Array(600)
    ole2.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    await expect(importSchedule(file('edt.xls', ole2))).rejects.toMatchObject({
      name: 'ImportError',
      hint: expect.stringContaining('.xlsx'),
    })
  })
})

describe('import de bout en bout', () => {
  it('lit un CSV et propose des créneaux à relire', async () => {
    const csv = ['Jour;Début;Fin;Intitulé', 'Lundi;8h30;10h00;Maths', 'Mardi;14h00;15h30;Anglais'].join('\n')
    const outcome = await importSchedule(file('edt.csv', csv))
    expect(outcome.source).toBe('csv')
    expect(outcome.layout).toBe('rows')
    expect(outcome.drafts).toHaveLength(2)
    expect(outcome.drafts.every((d) => d.selected)).toBe(true)
    expect(outcome.notice).toContain('CSV')
  })

  it('annonce le sens réel d’une grille, colonnes comme lignes', async () => {
    const colonnes = [
      'Horaire;Lundi;Mardi;Mercredi',
      '8h00-9h00;Maths;;Anglais',
      '9h00-10h00;;Physique;',
    ].join('\n')
    const droite = await importSchedule(file('edt.csv', colonnes))
    expect(droite.layout).toBe('grid')
    expect(droite.notice).toContain('les jours en colonnes, les heures en lignes')

    // Le même emploi du temps couché : le message doit suivre, sinon il fait
    // douter de tout ce qui est affiché en dessous.
    const lignes = [
      'Jour;8h00-9h00;9h00-10h00',
      'Lundi;Maths;',
      'Mardi;;Physique',
      'Mercredi;Anglais;',
    ].join('\n')
    const couchee = await importSchedule(file('edt.csv', lignes))
    expect(couchee.layout).toBe('grid')
    expect(couchee.notice).toContain('les jours en lignes, les heures en colonnes')
    expect(couchee.notice).not.toContain('les jours en colonnes')
  })

  it('refuse un fichier vide', async () => {
    await expect(importSchedule(file('edt.csv', ''))).rejects.toMatchObject({ message: 'Ce fichier est vide.' })
  })

  it('le dit franchement quand il n’y a aucun créneau à trouver', async () => {
    await expect(importSchedule(file('facture.csv', 'Facture;2026-114\nTotal;1240,50'))).rejects.toMatchObject({
      message: expect.stringContaining('aucun créneau'),
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────

/** PDF minimal, non compressé : un flux de contenu et rien d'autre */
function makePdf(content: string): string {
  return [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${content.length} >>`,
    'stream',
    content,
    'endstream',
    'endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n')
}

const PDF_GRID = makePdf([
  'BT',
  '/F1 10 Tf',
  '1 0 0 1 50 700 Tm (Horaire) Tj',
  '1 0 0 1 150 700 Tm (Lundi) Tj',
  '1 0 0 1 250 700 Tm (Mardi) Tj',
  '1 0 0 1 350 700 Tm (Mercredi) Tj',
  '1 0 0 1 50 680 Tm (8h00-9h00) Tj',
  '1 0 0 1 150 680 Tm (Maths) Tj',
  '1 0 0 1 350 680 Tm (Sport) Tj',
  '1 0 0 1 50 660 Tm (9h00-10h00) Tj',
  '1 0 0 1 250 660 Tm (Anglais) Tj',
  'ET',
].join('\n'))

describe('PDF', () => {
  it('retrouve une grille à partir des coordonnées du texte', async () => {
    const outcome = await importSchedule(file('edt.pdf', PDF_GRID))
    expect(outcome.source).toBe('pdf')
    expect(outcome.drafts).toHaveLength(3)
    expect(outcome.drafts.find((d) => d.title === 'Maths')).toMatchObject({ weekday: 1, start: '08:00', end: '09:00' })
    expect(outcome.drafts.find((d) => d.title === 'Sport')).toMatchObject({ weekday: 3, start: '08:00', end: '09:00' })
    expect(outcome.drafts.find((d) => d.title === 'Anglais')).toMatchObject({ weekday: 2, start: '09:00', end: '10:00' })
  })

  it('annonce sa faible confiance et ne coche rien d’office', async () => {
    const outcome = await importSchedule(file('edt.pdf', PDF_GRID))
    expect(outcome.confidence).toBe('low')
    expect(outcome.notice).toMatch(/PDF/)
    expect(outcome.drafts.every((d) => d.uncertain)).toBe(true)
    expect(outcome.drafts.some((d) => d.selected)).toBe(false)
  })

  it('le dit plutôt que d’inventer quand le PDF ne donne rien', async () => {
    await expect(importSchedule(file('scan.pdf', makePdf('BT /F1 10 Tf ET')))).rejects.toMatchObject({
      hint: expect.stringContaining('CSV'),
    })
  })

  it('refuse un fichier qui se prétend PDF', async () => {
    await expect(importSchedule(file('faux.pdf', '%PDF-1.4 puis plus rien du tout'))).rejects.toBeInstanceOf(ImportError)
  })

  it('regroupe les morceaux de texte en lignes puis en colonnes', () => {
    const items: PdfItem[] = [
      { text: 'Lundi', x: 150, y: 700, size: 10, reliable: true },
      { text: 'Horaire', x: 50, y: 701, size: 10, reliable: true },
      { text: 'Maths', x: 152, y: 680, size: 10, reliable: true },
    ]
    expect(pdfLines(items)).toEqual(['Horaire Lundi', 'Maths'])
    expect(columnEdges(items)).toEqual([50, 150])
    expect(pdfMatrix(items)).toEqual([['Horaire', 'Lundi'], ['', 'Maths']])
    expect(itemsToLines(items)).toHaveLength(2)
  })

  it('lit une table ToUnicode de police incorporée', () => {
    const cmap = [
      'begincmap',
      '2 beginbfchar',
      '<0003> <0020>',
      '<0024> <0041>',
      'endbfchar',
      '1 beginbfrange',
      '<0044> <0046> <0061>',
      'endbfrange',
      'endcmap',
    ].join('\n')
    const map = parseCMap(cmap)
    expect(map.get(0x24)).toBe('A')
    expect(map.get(0x44)).toBe('a')
    expect(map.get(0x46)).toBe('c')
  })
})
