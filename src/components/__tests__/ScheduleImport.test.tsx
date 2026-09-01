import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Profile } from '@/types/database'

/**
 * L'écran de relecture n'est pas négociable : sur un emploi du temps d'une
 * année, un import silencieux qui se trompe est pire que pas d'import du tout.
 * Ces tests vérifient le contrat : rien ne part en base avant validation, seules
 * les lignes cochées partent, et un PDF est annoncé pour ce qu'il est.
 */

const { inserted, mockFrom, etat } = vi.hoisted(() => {
  const inserted: Record<string, unknown>[][] = []
  /** Bascule d’un échec d’insertion, pour éprouver le message d’échec partiel */
  const etat = { echecInsertion: false }
  const mockFrom = vi.fn(() => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'eq', 'delete', 'single']) builder[method] = vi.fn(() => builder)
    builder.insert = vi.fn((rows: Record<string, unknown>[]) => { inserted.push(rows); return builder })
    builder.then = (resolve: (r: unknown) => unknown) =>
      Promise.resolve(
        etat.echecInsertion ? { data: null, error: { message: 'insertion refusée' } } : { data: null, error: null },
      ).then(resolve)
    return builder
  })
  return { inserted, mockFrom, etat }
})

vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }))

import ScheduleImport from '@/components/schedule/ScheduleImport'
import { useAuthStore } from '@/stores/authStore'

const profil = { id: 'moi', display_name: 'Martin', timezone: 'Europe/Warsaw' } as unknown as Profile

const CSV = ['Jour;Début;Fin;Intitulé', 'Lundi;8h30;10h00;Maths', 'Mardi;14h00;15h30;Anglais'].join('\n')

/** PDF minimal, non compressé : trois jours en en-tête, deux cours */
const PDF = [
  '%PDF-1.4',
  '4 0 obj << /Length 320 >>',
  'stream',
  'BT',
  '/F1 10 Tf',
  '1 0 0 1 50 700 Tm (Horaire) Tj',
  '1 0 0 1 150 700 Tm (Lundi) Tj',
  '1 0 0 1 250 700 Tm (Mardi) Tj',
  '1 0 0 1 350 700 Tm (Mercredi) Tj',
  '1 0 0 1 50 680 Tm (8h00-9h00) Tj',
  '1 0 0 1 150 680 Tm (Maths) Tj',
  '1 0 0 1 50 660 Tm (9h00-10h00) Tj',
  '1 0 0 1 250 660 Tm (Anglais) Tj',
  'ET',
  'endstream',
  'endobj',
  '%%EOF',
].join('\n')

function deposer(contenu: string, nom: string) {
  const input = screen.getByLabelText('Fichier de l’emploi du temps')
  fireEvent.change(input, { target: { files: [new File([contenu], nom)] } })
}

describe('Import d’un emploi du temps — l’écran de relecture', () => {
  const onClose = vi.fn()
  const onImported = vi.fn()

  beforeEach(() => {
    inserted.length = 0
    etat.echecInsertion = false
    onClose.mockClear()
    onImported.mockClear()
    useAuthStore.setState({ profile: profil, partnerProfile: null })
  })

  const afficher = () => render(<ScheduleImport existing={[]} onClose={onClose} onImported={onImported} />)

  it('annonce les formats et promet de ne rien enregistrer sans relecture', () => {
    afficher()
    expect(screen.getByText(/Dépose ton fichier ici/)).toBeInTheDocument()
    expect(screen.getByText(/Rien n’est enregistré avant que tu aies relu et validé/)).toBeInTheDocument()
    expect(screen.getByText(/lecture approximative/)).toBeInTheDocument()
  })

  it('montre ce qui a été compris, sans rien écrire en base', async () => {
    afficher()
    deposer(CSV, 'edt.csv')

    expect(await screen.findByDisplayValue('Maths')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Anglais')).toBeInTheDocument()
    expect(screen.getByDisplayValue('08:30')).toBeInTheDocument()
    // Le fuseau affiché est celui du profil (Varsovie), jamais celui du navigateur.
    expect(screen.getByText(/à l’heure de Varsovie/)).toBeInTheDocument()
    expect(inserted).toHaveLength(0)
  })

  it('n’enregistre que les lignes cochées', async () => {
    afficher()
    deposer(CSV, 'edt.csv')
    await screen.findByDisplayValue('Maths')

    expect(screen.getByRole('button', { name: 'Ajouter 2 créneaux' })).toBeEnabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garder Maths' }))

    const ajouter = await screen.findByRole('button', { name: 'Ajouter 1 créneau' })
    fireEvent.click(ajouter)

    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0]).toHaveLength(1)
    expect(inserted[0]?.[0]).toMatchObject({
      user_id: 'moi', weekday: 2, start_time: '14:00:00', end_time: '15:30:00', title: 'Anglais',
    })
    expect(onImported).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('laisse corriger une ligne avant de l’enregistrer', async () => {
    afficher()
    deposer(CSV, 'edt.csv')
    const titre = await screen.findByDisplayValue('Maths')

    fireEvent.change(titre, { target: { value: 'Cours de maths' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garder Anglais' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter 1 créneau' }))

    await waitFor(() => expect(inserted).toHaveLength(1))
    expect(inserted[0]?.[0]).toMatchObject({ title: 'Cours de maths', weekday: 1 })
  })

  it('dit franchement ce que vaut la lecture d’un PDF et ne coche rien', async () => {
    afficher()
    deposer(PDF, 'edt.pdf')

    expect(await screen.findByDisplayValue('Maths')).toBeInTheDocument()
    expect(screen.getByText(/un PDF ne contient pas de tableau/)).toBeInTheDocument()
    expect(screen.getAllByText('Lecture incertaine, à vérifier').length).toBeGreaterThan(0)
    // Rien n'est coché d'office : c'est à l'utilisateur de valider ligne par ligne.
    expect(screen.getByRole('button', { name: /^Ajouter 0 créneau/ })).toBeDisabled()
  })

  it('explique l’échec plutôt que de faire semblant', async () => {
    afficher()
    deposer('Facture;2026-114\nTotal;1240,50', 'facture.csv')

    expect(await screen.findByText(/Je n’ai trouvé aucun créneau/)).toBeInTheDocument()
    expect(inserted).toHaveLength(0)
  })

  it('signale un créneau déjà présent dans l’emploi du temps, et l’arrive décoché', async () => {
    render(
      <ScheduleImport
        existing={[{ weekday: 1, start_time: '08:30:00', end_time: '10:00:00', title: 'Maths' } as never]}
        onClose={onClose}
        onImported={onImported}
      />,
    )
    deposer(CSV, 'edt.csv')
    expect(await screen.findByText('Déjà dans ton emploi du temps')).toBeInTheDocument()

    // Le ré-import du même fichier ne doit JAMAIS proposer de tout dupliquer :
    // un doublon est décoché d’office, comme une ligne douteuse.
    expect(screen.getByRole('checkbox', { name: 'Garder Maths' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('checkbox', { name: 'Garder Anglais' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Ajouter 1 créneau' })).toBeEnabled()
  })

  it('ne re-décoche jamais un doublon coché exprès, même après une correction ailleurs', async () => {
    render(
      <ScheduleImport
        existing={[{ weekday: 1, start_time: '08:30:00', end_time: '10:00:00', title: 'Maths' } as never]}
        onClose={onClose}
        onImported={onImported}
      />,
    )
    deposer(CSV, 'edt.csv')
    const doublon = await screen.findByRole('checkbox', { name: 'Garder Maths' })
    expect(doublon).toHaveAttribute('aria-checked', 'false')

    // On coche sciemment le doublon : on veut vraiment ce créneau deux fois.
    fireEvent.click(doublon)
    expect(doublon).toHaveAttribute('aria-checked', 'true')

    // Puis on corrige un intitulé sur une AUTRE ligne : la relecture est rejouée,
    // et ce choix explicite doit survivre.
    fireEvent.change(screen.getByDisplayValue('Anglais'), { target: { value: 'Anglais renforcé' } })
    await screen.findByDisplayValue('Anglais renforcé')
    expect(screen.getByRole('checkbox', { name: 'Garder Maths' })).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByRole('button', { name: 'Ajouter 2 créneaux' })).toBeEnabled()
  })

  it('compte les lignes prêtes, pas les cases cochées, et annonce ce qui reste à corriger', async () => {
    afficher()
    // Trois lignes cochées, dont une dont la fin précède le début : elle ne peut
    // pas partir. Le compteur le dit au lieu de la faire disparaître du total.
    deposer(
      ['Jour;Début;Fin;Intitulé', 'Lundi;8h30;10h00;Maths', 'Mardi;14h00;15h30;Anglais', 'Jeudi;11h00;10h00;Sport'].join('\n'),
      'edt.csv',
    )
    await screen.findByDisplayValue('Maths')

    expect(screen.getByRole('checkbox', { name: 'Garder Sport' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/lignes prêtes sur/)).toHaveTextContent('2 lignes prêtes sur 3 — 1 à corriger')
    expect(screen.getByRole('button', { name: 'Ajouter 2 créneaux' })).toBeEnabled()
  })

  it('accorde sa phrase quand l’enregistrement échoue en cours de route', async () => {
    // La base refuse l’insertion : le message doit s’accorder proprement —
    // « ajoutés », jamais « ajoutéx ».
    etat.echecInsertion = true
    afficher()
    deposer(CSV, 'edt.csv')
    await screen.findByDisplayValue('Maths')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter 2 créneaux' }))

    const message = await screen.findByText(/avant l’échec/)
    expect(message).toHaveTextContent('0 créneau sur 2 a été ajouté avant l’échec.')
    expect(message.textContent).not.toContain('ajoutéx')
  })
})
