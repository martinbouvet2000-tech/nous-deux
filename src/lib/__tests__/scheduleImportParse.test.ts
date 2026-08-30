import { describe, it, expect } from 'vitest'
import { parseCsv, detectDelimiter } from '@/lib/scheduleImport/csv'
import {
  parseTime, parseTimeRange, parseWeekdayCell, findWeekday, weekdayHeader, weekdayFromDate,
  parseMatrix, slotsFromLines, toDrafts, reviewSlots, toInsertRows, trimMatrix, normalize,
  unselectRevealedDuplicates, partialFailureMessage,
} from '@/lib/scheduleImport/parse'
import { colorForTitle } from '@/lib/schedule'

/** Petit raccourci : un CSV → des créneaux candidats */
function fromCsv(text: string) {
  return parseMatrix(parseCsv(text))
}

describe('normalisation', () => {
  it('retire les accents, les majuscules et les espaces insécables', () => {
    expect(normalize('  Éducation Physique  ')).toBe('education physique')
    expect(normalize('LUNDI')).toBe('lundi')
  })
})

describe('formats d’heure', () => {
  it('lit les écritures courantes', () => {
    expect(parseTime('8h30')).toBe('08:30')
    expect(parseTime('08:30')).toBe('08:30')
    expect(parseTime('8.30')).toBe('08:30')
    expect(parseTime('8 h 30')).toBe('08:30')
    expect(parseTime('08:30:00')).toBe('08:30')
    expect(parseTime('8h')).toBe('08:00')
    expect(parseTime('20h15')).toBe('20:15')
  })

  it('lit les heures anglo-saxonnes', () => {
    expect(parseTime('8:30 AM')).toBe('08:30')
    expect(parseTime('8:30 PM')).toBe('20:30')
    expect(parseTime('12:00 AM')).toBe('00:00')
    expect(parseTime('12:15 PM')).toBe('12:15')
    expect(parseTime('9 pm')).toBe('21:00')
  })

  it('lit les fractions de journée qu’Excel écrit à la place des heures', () => {
    expect(parseTime('0.3541666666666667')).toBe('08:30')
    expect(parseTime('0,5')).toBe('12:00')
  })

  it('refuse ce qui n’est pas une heure', () => {
    expect(parseTime('')).toBeNull()
    expect(parseTime('Maths')).toBeNull()
    expect(parseTime('25h30')).toBeNull()
    expect(parseTime('8h75')).toBeNull()
    expect(parseTime('12')).toBeNull()
    expect(parseTime('12', true)).toBe('12:00')
  })

  it('lit une plage dans une seule cellule', () => {
    expect(parseTimeRange('8h30-10h00')).toEqual({ start: '08:30', end: '10:00' })
    expect(parseTimeRange('08:30 – 10:00')).toEqual({ start: '08:30', end: '10:00' })
    expect(parseTimeRange('de 8h30 à 10h')).toEqual({ start: '08:30', end: '10:00' })
    expect(parseTimeRange('8h30 / 10')).toEqual({ start: '08:30', end: '10:00' })
    expect(parseTimeRange('Maths')).toBeNull()
  })
})

describe('jours en français', () => {
  it('accepte les jours entiers, abrégés, en majuscules', () => {
    expect(parseWeekdayCell('Lundi')).toBe(1)
    expect(parseWeekdayCell('LUNDI')).toBe(1)
    expect(parseWeekdayCell('lun')).toBe(1)
    expect(parseWeekdayCell('lun.')).toBe(1)
    expect(parseWeekdayCell('Lu')).toBe(1)
    expect(parseWeekdayCell('mer')).toBe(3)
    expect(parseWeekdayCell('Dimanche')).toBe(7)
    expect(parseWeekdayCell('Lundi 14/09')).toBe(1)
  })

  it('ne prend pas n’importe quel mot pour un jour', () => {
    expect(parseWeekdayCell('Maths')).toBeNull()
    expect(parseWeekdayCell('ma journée')).toBeNull()
    expect(parseWeekdayCell('')).toBeNull()
    expect(findWeekday('TD de physique — mardi matin')).toBe(2)
  })

  it('lève l’ambiguïté du « M » dans un en-tête d’initiales', () => {
    const header = weekdayHeader(['Heure', 'L', 'M', 'M', 'J', 'V'])
    expect([...header.entries()]).toEqual([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]])
  })

  it('déduit le jour d’une date', () => {
    expect(weekdayFromDate('14/09/2026')).toBe(1)
    expect(weekdayFromDate('2026-09-14')).toBe(1)
    expect(weekdayFromDate('Maths')).toBeNull()
  })
})

describe('CSV', () => {
  it('devine le séparateur et respecte les guillemets', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';')
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(parseCsv('a;"b;c";d')).toEqual([['a', 'b;c', 'd']])
    expect(parseCsv('a;"il a dit ""ok""";d')).toEqual([['a', 'il a dit "ok"', 'd']])
  })

  it('ne renvoie rien pour un fichier vide', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('   \n  \n')).toEqual([])
    expect(trimMatrix([['', ''], ['', '']])).toEqual([])
  })
})

describe('disposition « une ligne par créneau »', () => {
  const csv = [
    'Jour;Début;Fin;Intitulé;Salle',
    'Lundi;8h30;10h00;Cours de maths;B12',
    'mardi;14:00;15:30;Anglais;A03',
    'MER.;9h;12h;TP Physique;',
    ';;;;',
  ].join('\n')

  it('reconnaît les colonnes et lit chaque ligne', () => {
    const { slots, layout } = fromCsv(csv)
    expect(layout).toBe('rows')
    expect(slots).toHaveLength(3)
    expect(slots[0]).toMatchObject({ weekday: 1, start: '08:30', end: '10:00', title: 'Cours de maths', location: 'B12' })
    expect(slots[2]).toMatchObject({ weekday: 3, start: '09:00', end: '12:00', title: 'TP Physique' })
  })

  it('lit aussi une plage dans une seule colonne', () => {
    const { slots, layout } = fromCsv('Jour,Horaire,Matière\nJeudi,"8h30-10h00",Histoire')
    expect(layout).toBe('rows')
    expect(slots[0]).toMatchObject({ weekday: 4, start: '08:30', end: '10:00', title: 'Histoire' })
  })

  it('se passe d’en-tête en devinant le rôle des colonnes', () => {
    const { slots, layout } = fromCsv(['Lundi;8h00;9h00;Sport', 'Mardi;10h00;11h00;Danse', 'Jeudi;14h00;15h00;Piano'].join('\n'))
    expect(layout).toBe('rows')
    expect(slots).toHaveLength(3)
    expect(slots[1]).toMatchObject({ weekday: 2, start: '10:00', end: '11:00', title: 'Danse' })
  })

  it('replie une année entière sur une semaine type', () => {
    const csv = [
      'Date;Horaire;Matière',
      '14/09/2026;8h30-10h00;Maths',
      '21/09/2026;8h30-10h00;Maths',
      '28/09/2026;8h30-10h00;Maths',
    ].join('\n')
    const drafts = toDrafts(fromCsv(csv).slots)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ weekday: 1, start: '08:30', end: '10:00', title: 'Maths', occurrences: 3 })
  })
})

describe('disposition « grille »', () => {
  const grille = [
    'Horaire;Lundi;Mardi;Mercredi;Jeudi;Vendredi',
    '8h00-9h00;Maths;;Anglais;;Sport',
    '9h00-10h00;Maths;Physique;;;',
    '10h00-11h00;;Physique;;;',
  ].join('\n')

  it('lit les jours en colonnes et les heures en lignes', () => {
    const { slots, layout } = fromCsv(grille)
    expect(layout).toBe('grid')
    const lundi = slots.filter((s) => s.weekday === 1)
    expect(lundi).toHaveLength(1)
    // Deux lignes voisines portant le même intitulé = un seul cours de deux heures.
    expect(lundi[0]).toMatchObject({ start: '08:00', end: '10:00', title: 'Maths' })
    expect(slots.find((s) => s.weekday === 2)).toMatchObject({ start: '09:00', end: '11:00', title: 'Physique' })
    expect(slots.find((s) => s.weekday === 3)).toMatchObject({ start: '08:00', end: '09:00', title: 'Anglais' })
    expect(slots.find((s) => s.weekday === 5)).toMatchObject({ start: '08:00', end: '09:00', title: 'Sport' })
  })

  it('accepte deux colonnes d’heures et des initiales en en-tête', () => {
    const { slots, layout } = fromCsv(['Début;Fin;L;M;M;J;V', '08:00;09:00;Maths;;;;', '09:00;10:00;;Anglais;;;'].join('\n'))
    expect(layout).toBe('grid')
    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({ weekday: 1, start: '08:00', end: '09:00', title: 'Maths' })
    expect(slots[1]).toMatchObject({ weekday: 2, start: '09:00', end: '10:00', title: 'Anglais' })
  })

  it('déduit la fin d’un créneau de la ligne suivante', () => {
    const { slots } = fromCsv(['Heure;Lundi;Mardi;Mercredi', '8h;Maths;;', '9h;;Anglais;'].join('\n'))
    expect(slots[0]).toMatchObject({ weekday: 1, start: '08:00', end: '09:00' })
    expect(slots[1]).toMatchObject({ weekday: 2, start: '09:00', end: '10:00' })
  })

  it('lit aussi la grille transposée (jours en lignes)', () => {
    const { slots, layout } = fromCsv([
      'Jour;8h00-9h00;9h00-10h00',
      'Lundi;Maths;Anglais',
      'Mardi;;Physique',
      'Mercredi;Sport;',
    ].join('\n'))
    expect(layout).toBe('grid')
    expect(slots).toHaveLength(4)
    expect(slots.find((s) => s.weekday === 2)).toMatchObject({ start: '09:00', end: '10:00', title: 'Physique' })
  })

  it('dit que la grille était transposée, pour ne pas annoncer l’inverse de ce qui a été lu', () => {
    const droite = fromCsv(grille)
    expect(droite.layout).toBe('grid')
    expect(droite.transposed).toBeUndefined()

    const couchee = fromCsv(['Jour;8h00-9h00;9h00-10h00', 'Lundi;Maths;Anglais', 'Mardi;;Physique', 'Mercredi;Sport;'].join('\n'))
    expect(couchee.layout).toBe('grid')
    expect(couchee.transposed).toBe(true)
  })
})

describe('fichiers illisibles', () => {
  it('ne renvoie aucun créneau pour un fichier vide', () => {
    expect(parseMatrix([])).toEqual({ slots: [], layout: 'none' })
    expect(fromCsv('')).toEqual({ slots: [], layout: 'none' })
  })

  it('ne renvoie aucun créneau pour un contenu sans structure', () => {
    const { slots, layout } = fromCsv(['Facture n°2026-114', 'Total TTC;1240,50', 'Merci de votre confiance'].join('\n'))
    expect(layout).toBe('none')
    expect(slots).toHaveLength(0)
  })

  it('n’invente rien à partir de binaire', () => {
    expect(fromCsv('  ??? ÿþ').slots).toHaveLength(0)
  })
})

describe('lignes de texte (secours pour les PDF)', () => {
  it('lit une phrase par créneau et se souvient du jour en cours', () => {
    const slots = slotsFromLines(['Lundi', 'Maths 8h30-10h00 salle B12', 'Anglais 10h15 - 12h00', 'Mardi 14h00-16h00 Sport'])
    expect(slots).toHaveLength(3)
    expect(slots[0]).toMatchObject({ weekday: 1, start: '08:30', end: '10:00', uncertain: true })
    expect(slots[0]?.title).toContain('Maths')
    expect(slots[2]).toMatchObject({ weekday: 2, start: '14:00', end: '16:00' })
  })
})

describe('relecture : ce qui cloche est signalé', () => {
  const draft = (over: Partial<ReturnType<typeof toDrafts>[number]>) => ({
    key: 'k', weekday: 1, start: '08:00', end: '09:00', title: 'Maths',
    location: null, occurrences: 1, uncertain: false, selected: true, ...over,
  })

  it('signale un créneau qui finit avant de commencer', () => {
    const [row] = reviewSlots([draft({ start: '10:00', end: '09:00' })])
    expect(row?.issues).toContain('end-before-start')
    expect(row?.blocking).toBe(true)
  })

  it('signale un chevauchement entre deux lignes cochées', () => {
    const rows = reviewSlots([
      draft({ key: 'a', start: '08:00', end: '10:00' }),
      draft({ key: 'b', start: '09:00', end: '11:00', title: 'Anglais' }),
    ])
    expect(rows[0]?.issues).toContain('overlap')
    expect(rows[1]?.issues).toContain('overlap')
    // Un chevauchement se corrige, il n’empêche pas d’enregistrer.
    expect(rows[0]?.blocking).toBe(false)
  })

  it('ne signale pas un chevauchement avec une ligne décochée', () => {
    const rows = reviewSlots([
      draft({ key: 'a', start: '08:00', end: '10:00' }),
      draft({ key: 'b', start: '09:00', end: '11:00', selected: false }),
    ])
    expect(rows[0]?.issues).not.toContain('overlap')
  })

  it('laisse passer deux créneaux voisins qui se touchent', () => {
    const rows = reviewSlots([
      draft({ key: 'a', start: '08:00', end: '09:00' }),
      draft({ key: 'b', start: '09:00', end: '10:00' }),
    ])
    expect(rows[0]?.issues).not.toContain('overlap')
  })

  it('signale un jour, une heure ou un intitulé manquant', () => {
    expect(reviewSlots([draft({ weekday: null })])[0]?.issues).toContain('weekday-missing')
    expect(reviewSlots([draft({ start: '' })])[0]?.issues).toContain('start-missing')
    expect(reviewSlots([draft({ title: '  ' })])[0]?.issues).toContain('title-missing')
  })

  it('signale un créneau déjà présent dans l’emploi du temps', () => {
    const rows = reviewSlots([draft({})], [{ weekday: 1, start_time: '08:00:00', end_time: '09:00:00', title: 'Maths' }])
    expect(rows[0]?.issues).toContain('duplicate')
    expect(rows[0]?.blocking).toBe(false)
  })

  it('n’enregistre que les lignes cochées et valides', () => {
    const rows = reviewSlots([
      draft({ key: 'a' }),
      draft({ key: 'b', selected: false, title: 'Anglais' }),
      draft({ key: 'c', start: '11:00', end: '10:00', title: 'Sport' }),
    ])
    const inserted = toInsertRows(rows, 'user-1', colorForTitle)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      user_id: 'user-1', weekday: 1, start_time: '08:00:00', end_time: '09:00:00', title: 'Maths',
    })
    expect(inserted[0]?.color).toBe(colorForTitle('Maths'))
  })

  it('ne coche pas d’office les lignes incertaines ou incomplètes', () => {
    const drafts = toDrafts([
      { weekday: 1, start: '08:00', end: '09:00', title: 'Maths' },
      { weekday: null, start: '08:00', end: '09:00', title: 'Inconnu' },
      { weekday: 2, start: '08:00', end: '09:00', title: 'Flou', uncertain: true },
    ])
    expect(drafts.find((d) => d.title === 'Maths')?.selected).toBe(true)
    expect(drafts.find((d) => d.title === 'Inconnu')?.selected).toBe(false)
    expect(drafts.find((d) => d.title === 'Flou')?.selected).toBe(false)
  })

  it('raccourcit un intitulé trop long pour la base et le signale', () => {
    const long = 'Travaux pratiques de physique appliquée aux systèmes embarqués du second semestre'
    const [row] = reviewSlots(toDrafts([{ weekday: 1, start: '08:00', end: '09:00', title: long }]))
    expect(row?.draft.title).toHaveLength(60)
    expect(row?.issues).toContain('title-truncated')
  })
})

describe('relecture : un doublon arrive décoché', () => {
  const draft = (over: Partial<ReturnType<typeof toDrafts>[number]>) => ({
    key: 'k', weekday: 1, start: '08:00', end: '09:00', title: 'Maths',
    location: null, occurrences: 1, uncertain: false, selected: true, ...over,
  })
  const enBase = [{ weekday: 1, start_time: '08:00:00', end_time: '09:00:00', title: 'Maths' }]

  it('décoche d’office une ligne déjà présente dans l’emploi du temps', () => {
    // Le cas du ré-import : sans ça, redéposer le même fichier proposait de
    // tout ajouter une deuxième fois, toutes cases cochées.
    const drafts = [draft({ key: 'a' }), draft({ key: 'b', title: 'Anglais', start: '10:00', end: '11:00' })]
    const apres = unselectRevealedDuplicates(drafts, enBase, new Set())
    expect(apres.find((d) => d.key === 'a')?.selected).toBe(false)
    expect(apres.find((d) => d.key === 'b')?.selected).toBe(true)
    // Le doublon reste signalé : on peut toujours le cocher exprès.
    expect(reviewSlots(apres, enBase)[0]?.issues).toContain('duplicate')
    expect(reviewSlots(apres, enBase)[0]?.blocking).toBe(false)
  })

  it('n’écrase jamais un choix explicite lors d’une relecture suivante', () => {
    const traites = new Set<string>()
    const [decoche] = unselectRevealedDuplicates([draft({ key: 'a' })], enBase, traites)
    expect(decoche?.selected).toBe(false)

    // La personne coche sciemment ce doublon, puis corrige un intitulé ailleurs :
    // sa case ne doit pas se re-décocher toute seule.
    const recoche = [{ ...(decoche as ReturnType<typeof draft>), selected: true }]
    const apres = unselectRevealedDuplicates(recoche, enBase, traites)
    expect(apres[0]?.selected).toBe(true)
    expect(apres).toBe(recoche)
  })

  it('rend le tableau reçu quand il n’y a rien à décocher', () => {
    const drafts = [draft({ key: 'a' })]
    expect(unselectRevealedDuplicates(drafts, [], new Set())).toBe(drafts)
  })
})

describe('chevauchements : indexés par jour', () => {
  const draft = (over: Partial<ReturnType<typeof toDrafts>[number]>) => ({
    key: 'k', weekday: 1, start: '08:00', end: '09:00', title: 'Maths',
    location: null, occurrences: 1, uncertain: false, selected: true, ...over,
  })

  it('ne confond pas deux jours différents aux mêmes heures', () => {
    const rows = reviewSlots(
      [1, 2, 3, 4, 5, 6, 7].map((weekday) => draft({ key: `j${weekday}`, weekday })),
    )
    expect(rows.every((r) => !r.issues.includes('overlap'))).toBe(true)
  })

  it('signale les trois lignes d’un même empilement', () => {
    const rows = reviewSlots([
      draft({ key: 'a', start: '08:00', end: '12:00' }),
      draft({ key: 'b', start: '09:00', end: '10:00', title: 'Anglais' }),
      draft({ key: 'c', start: '11:00', end: '13:00', title: 'Sport' }),
    ])
    expect(rows.every((r) => r.issues.includes('overlap'))).toBe(true)
  })

  it('laisse tranquille une journée entièrement consécutive', () => {
    const suite = Array.from({ length: 30 }, (_, i) =>
      draft({ key: `s${i}`, start: `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, end: `${String(7 + Math.floor((i + 1) / 2)).padStart(2, '0')}:${(i + 1) % 2 ? '30' : '00'}`, title: `Cours ${i}` }),
    )
    expect(reviewSlots(suite).some((r) => r.issues.includes('overlap'))).toBe(false)
  })
})

describe('phrase d’un enregistrement interrompu', () => {
  it('accorde « créneaux » et « ajoutés » séparément', () => {
    // « créneau**x** » prend un x, « ajouté**s** » prend un s : la confusion
    // des deux donnait « ont été ajoutéx » à l’écran.
    expect(partialFailureMessage(200, 250)).toBe('200 créneaux sur 250 ont été ajoutés avant l’échec.')
    expect(partialFailureMessage(1, 250)).toBe('1 créneau sur 250 a été ajouté avant l’échec.')
    expect(partialFailureMessage(0, 3)).toBe('0 créneau sur 3 a été ajouté avant l’échec.')
    expect(partialFailureMessage(2, 2)).toBe('2 créneaux sur 2 ont été ajoutés avant l’échec.')
  })

  it('n’écrit jamais « ajoutéx »', () => {
    for (const n of [0, 1, 2, 7, 200]) expect(partialFailureMessage(n, 250)).not.toContain('ajoutéx')
  })
})
