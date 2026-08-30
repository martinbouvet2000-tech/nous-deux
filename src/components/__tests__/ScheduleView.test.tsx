import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { Profile, ScheduleSlot } from '@/types/database'

/**
 * Le mode sélection de l'emploi du temps.
 *
 * Un import raté peut poser deux cent cinquante créneaux d'un coup ; les
 * reprendre un par un n'est pas une option. Mais supprimer en masse est le geste
 * le plus dangereux de l'app : ces tests tiennent le contrat — rien ne part sans
 * confirmation, seul ce qui est coché part, un jour se coche d'un geste, sortir
 * du mode oublie tout, un échec au milieu dit la vérité, et l'emploi du temps du
 * partenaire n'est jamais proposé à la suppression.
 */

const { etat, suppressions, mockFrom } = vi.hoisted(() => {
  const etat = {
    /** Ce que « la base » contient à cet instant */
    rows: [] as Record<string, unknown>[],
    /** Numéro de la requête de suppression qui échouera (1 = la première, 0 = aucune) */
    echecSur: 0,
  }
  const suppressions: { ids: string[]; userId: unknown }[] = []

  const mockFrom = vi.fn(() => {
    const op = { suppression: false, userId: undefined as unknown, ids: [] as string[] }
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'insert', 'update', 'single']) builder[method] = vi.fn(() => builder)
    builder.delete = vi.fn(() => { op.suppression = true; return builder })
    builder.eq = vi.fn((colonne: string, valeur: unknown) => {
      if (colonne === 'user_id') op.userId = valeur
      return builder
    })
    builder.in = vi.fn((_colonne: string, valeurs: string[]) => { op.ids = valeurs; return builder })
    builder.then = (resolve: (r: unknown) => unknown) => {
      if (!op.suppression) return Promise.resolve({ data: etat.rows, error: null }).then(resolve)
      suppressions.push({ ids: op.ids, userId: op.userId })
      if (etat.echecSur === suppressions.length) {
        return Promise.resolve({ data: null, error: { message: 'suppression refusée' } }).then(resolve)
      }
      const partis = new Set(op.ids)
      etat.rows = etat.rows.filter((r) => !partis.has(r.id as string))
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }
    return builder
  })

  return { etat, suppressions, mockFrom }
})

vi.mock('@/lib/supabase', () => {
  const channel = vi.fn(() => {
    const ch: Record<string, unknown> = {}
    ch.on = vi.fn(() => ch)
    ch.subscribe = vi.fn(() => ch)
    return ch
  })
  return { supabase: { from: mockFrom, channel, removeChannel: vi.fn() } }
})

import ScheduleView from '@/components/schedule/ScheduleView'
import ConfirmDialogHost from '@/components/ui/ConfirmDialog'
import { useAuthStore } from '@/stores/authStore'

const moi = { id: 'moi', display_name: 'Martin', timezone: 'Europe/Warsaw' } as unknown as Profile
const elle = { id: 'elle', display_name: 'Clarisse', timezone: 'Europe/Paris' } as unknown as Profile

function creneau(id: string, weekday: number, start: string, end: string, title: string, userId = 'moi'): ScheduleSlot {
  return {
    id, user_id: userId, weekday, start_time: start, end_time: end,
    title, location: null, color: '#D4A574', created_at: '',
  }
}

/**
 * La semaine est rendue deux fois (grille de bureau et liste mobile ; jsdom
 * n'applique pas les points de rupture CSS). Un même créneau peut donc porter
 * deux fois le même nom accessible : on agit sur le premier, l'état est partagé.
 */
const premier = (role: string, name: string | RegExp): HTMLElement => screen.getAllByRole(role, { name })[0]

const afficher = () => render(<><ScheduleView /><ConfirmDialogHost /></>)

/** Entre dans le mode sélection et attend que les cases soient là */
async function entrerEnSelection() {
  fireEvent.click(await screen.findByRole('button', { name: 'Sélectionner' }))
  return screen.findByText('Aucun créneau sélectionné')
}

const dialogue = () => screen.findByRole('alertdialog')

describe('Emploi du temps — mode sélection et suppression multiple', () => {
  beforeEach(() => {
    suppressions.length = 0
    etat.echecSur = 0
    etat.rows = [
      creneau('a', 1, '08:30:00', '10:00:00', 'Maths'),
      creneau('b', 1, '10:15:00', '12:00:00', 'Anglais'),
      creneau('c', 2, '14:00:00', '15:30:00', 'Sport'),
    ] as unknown as Record<string, unknown>[]
    useAuthStore.setState({ profile: moi, partnerProfile: elle })
  })

  it('n’affiche aucune case à cocher tant qu’on n’est pas entré dans le mode', async () => {
    afficher()
    await screen.findByRole('button', { name: 'Sélectionner' })
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByText('Aucun créneau sélectionné')).not.toBeInTheDocument()
  })

  it('ne supprime rien tant que la confirmation n’a pas été donnée', async () => {
    afficher()
    await entrerEnSelection()

    fireEvent.click(premier('checkbox', /^Sélectionner Maths/))
    const bouton = await screen.findByRole('button', { name: 'Supprimer 1 créneau' })
    fireEvent.click(bouton)

    // La demande est posée, le nombre exact est annoncé, et rien n’est encore parti.
    const boite = await dialogue()
    expect(within(boite).getByText(/Supprimer ce créneau/)).toBeInTheDocument()
    expect(within(boite).getByText(/1 créneau de ton emploi du temps sera retiré définitivement/)).toBeInTheDocument()
    expect(within(boite).getByText('Action irréversible')).toBeInTheDocument()
    expect(suppressions).toHaveLength(0)

    fireEvent.click(within(boite).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(suppressions).toHaveLength(0)
    // Le créneau est toujours là, et toujours coché : on n’a rien perdu en disant non.
    expect(premier('checkbox', /^Sélectionner Maths/)).toHaveAttribute('aria-checked', 'true')
  })

  it('ne supprime que les créneaux cochés, et seulement les miens', async () => {
    afficher()
    await entrerEnSelection()

    fireEvent.click(premier('checkbox', /^Sélectionner Maths/))
    fireEvent.click(premier('checkbox', /^Sélectionner Sport/))
    expect(await screen.findByText(/2 créneaux sélectionnés sur 3/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 2 créneaux' }))
    const boite = await dialogue()
    expect(within(boite).getByText(/L’emploi du temps de Clarisse n’est pas touché/)).toBeInTheDocument()
    fireEvent.click(within(boite).getByRole('button', { name: 'Supprimer 2 créneaux' }))

    await waitFor(() => expect(suppressions).toHaveLength(1))
    expect(suppressions[0]?.ids).toEqual(['a', 'c'])
    // La requête est bornée à mes propres créneaux, comme la règle d’accès l’exige.
    expect(suppressions[0]?.userId).toBe('moi')

    // Anglais, jamais coché, est toujours là — et le mode se referme tout seul.
    expect(await screen.findByRole('button', { name: 'Sélectionner' })).toBeInTheDocument()
    expect(screen.getAllByText('Anglais').length).toBeGreaterThan(0)
    expect(screen.queryByText('Maths')).not.toBeInTheDocument()
    expect(screen.queryByText('Sport')).not.toBeInTheDocument()
  })

  it('coche tout un jour d’un geste, et rien des autres jours', async () => {
    afficher()
    await entrerEnSelection()

    fireEvent.click(premier('button', 'Tout sélectionner sur lundi'))
    expect(await screen.findByText(/2 créneaux sélectionnés sur 3/)).toBeInTheDocument()
    expect(premier('checkbox', /^Sélectionner Sport/)).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 2 créneaux' }))
    const boite = await dialogue()
    fireEvent.click(within(boite).getByRole('button', { name: 'Supprimer 2 créneaux' }))

    await waitFor(() => expect(suppressions).toHaveLength(1))
    expect(suppressions[0]?.ids).toEqual(['a', 'b'])
    expect(screen.getAllByText('Sport').length).toBeGreaterThan(0)
  })

  it('décoche le jour entier au second geste', async () => {
    afficher()
    await entrerEnSelection()

    fireEvent.click(premier('button', 'Tout sélectionner sur lundi'))
    await screen.findByText(/2 créneaux sélectionnés sur 3/)
    fireEvent.click(premier('button', 'Tout désélectionner sur lundi'))

    expect(await screen.findByText('Aucun créneau sélectionné')).toBeInTheDocument()
    expect(suppressions).toHaveLength(0)
  })

  it('remet la sélection à zéro quand on quitte le mode', async () => {
    afficher()
    await entrerEnSelection()

    fireEvent.click(premier('checkbox', /^Sélectionner Maths/))
    await screen.findByText(/1 créneau sélectionné sur 3/)

    fireEvent.click(screen.getByRole('button', { name: 'Terminer' }))
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0))

    await entrerEnSelection()
    expect(screen.getByText('Aucun créneau sélectionné')).toBeInTheDocument()
    expect(premier('checkbox', /^Sélectionner Maths/)).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Supprimer 0 créneau' })).toBeDisabled()
  })

  it('ne propose jamais un créneau du partenaire à la suppression', async () => {
    etat.rows = [
      creneau('a', 1, '08:30:00', '10:00:00', 'Maths'),
      creneau('z', 1, '09:00:00', '11:00:00', 'Réunion', 'elle'),
    ] as unknown as Record<string, unknown>[]
    afficher()
    await entrerEnSelection()

    expect(premier('checkbox', /^Sélectionner Maths/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /Sélectionner Réunion/ })).not.toBeInTheDocument()
    expect(screen.getByText(/L’emploi du temps de Clarisse n’est jamais concerné/)).toBeInTheDocument()

    // Sur l’emploi du temps de Clarisse : ni case à cocher, ni entrée dans le mode.
    fireEvent.click(screen.getByRole('tab', { name: 'Clarisse' }))
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0))
    expect(screen.queryByRole('button', { name: 'Sélectionner' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Supprimer/ })).not.toBeInTheDocument()

    // De retour chez moi, la sélection est repartie de zéro.
    fireEvent.click(screen.getByRole('tab', { name: 'Moi' }))
    await entrerEnSelection()
    expect(suppressions).toHaveLength(0)
  })

  it('dit la vérité quand la suppression échoue en cours de route', async () => {
    // Soixante créneaux le même jour : la suppression part par paquets de
    // cinquante, et le second paquet est refusé.
    etat.rows = Array.from({ length: 60 }, (_, i) => {
      const debut = 8 * 60 + i * 10
      const heure = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
      return creneau(`l${i}`, 1, heure(debut), heure(debut + 5), `Cours ${i}`)
    }) as unknown as Record<string, unknown>[]
    etat.echecSur = 2

    afficher()
    await entrerEnSelection()
    fireEvent.click(premier('button', 'Tout sélectionner sur lundi'))
    await screen.findByText(/60 créneaux sélectionnés sur 60/)

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer 60 créneaux' }))
    const boite = await dialogue()
    fireEvent.click(within(boite).getByRole('button', { name: 'Supprimer 60 créneaux' }))

    const alerte = await screen.findByRole('alert')
    expect(alerte).toHaveTextContent('50 créneaux sur 60 ont été supprimés.')
    expect(suppressions.map((s) => s.ids.length)).toEqual([50, 10])

    // La liste et le compteur racontent la même histoire : dix créneaux restent,
    // toujours cochés, prêts pour un second essai — les cinquante autres sont partis.
    expect(await screen.findByText(/10 créneaux sélectionnés sur 10/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /^Sélectionner Cours 0,/ })).not.toBeInTheDocument()
    expect(premier('checkbox', /^Sélectionner Cours 55,/)).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: 'Supprimer 10 créneaux' })).toBeEnabled()
  })
})
