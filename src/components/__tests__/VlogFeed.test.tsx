import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Profile, Vlog } from '@/types/database'

/**
 * Le fil des souvenirs, vu depuis un navigateur qui n'est PAS dans le fuseau du
 * profil : Martin est à Varsovie, son navigateur annonce Kiritimati (UTC+14).
 * Un vlog du vendredi 28 août 23:30 doit rester au vendredi 28, à 23:30, et le
 * marquage « Étape » doit pouvoir se corriger après coup depuis la lightbox.
 */
const TZ_INITIALE = process.env.TZ
process.env.TZ = 'Pacific/Kiritimati'
afterAll(() => {
  if (TZ_INITIALE === undefined) delete process.env.TZ
  else process.env.TZ = TZ_INITIALE
})

const VLOG: Vlog = {
  id: 'v1',
  author_id: 'moi',
  media_path: 'moi/v1.jpg',
  media_type: 'image',
  caption: 'Le ciel de ce soir',
  is_milestone: false,
  taken_at: '2026-08-28T21:30:00.000Z', // vendredi 28 août, 23:30 à Varsovie
  created_at: '2026-08-28T21:31:00.000Z',
}

const { rows, updates, mockFrom } = vi.hoisted(() => {
  const rows: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  /** Constructeur de requête minimal : chaînable et « thenable », comme PostgREST. */
  const mockFrom = vi.fn(() => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'range', 'eq', 'delete', 'insert', 'single']) {
      builder[method] = vi.fn(() => builder)
    }
    builder.update = vi.fn((values: Record<string, unknown>) => {
      updates.push(values)
      return builder
    })
    builder.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
    return builder
  })
  return { rows, updates, mockFrom }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) }
      return ch
    }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ remove: vi.fn().mockResolvedValue({ error: null }) })) },
  },
}))

vi.mock('@/lib/vlogMedia', () => ({
  VLOG_BUCKET: 'vlogs',
  VLOG_MAX_BYTES: 50 * 1024 * 1024,
  getSignedUrls: vi.fn(async (paths: string[]) => new Map(paths.map((p) => [p, `https://exemple.test/${p}`]))),
  getSignedUrl: vi.fn(async () => null),
  forgetSignedUrl: vi.fn(),
  extensionFor: vi.fn(() => 'jpg'),
  compressImage: vi.fn(async (f: File) => f),
}))

import VlogFeed from '@/components/vlog/VlogFeed'
import { useAuthStore } from '@/stores/authStore'

const profilVarsovie = {
  id: 'moi',
  display_name: 'Martin',
  timezone: 'Europe/Warsaw',
} as unknown as Profile

function afficherLeFil() {
  return render(<VlogFeed composerOpen={false} onOpenComposer={() => {}} onCloseComposer={() => {}} />)
}

describe('VlogFeed — dates du profil et marquage d’une étape', () => {
  beforeEach(() => {
    rows.length = 0
    updates.length = 0
    rows.push({ ...VLOG })
    useAuthStore.setState({ profile: profilVarsovie, partnerProfile: null })
  })

  it('date le vlog dans le fuseau du profil, pas dans celui du navigateur', async () => {
    afficherLeFil()
    // Pied de carte : date courte + heure de Varsovie (le navigateur, lui, dirait « 29 août · 11:30 »)
    expect(await screen.findByText(/28 août/)).toBeInTheDocument()
    expect(screen.getByText('23:30')).toBeInTheDocument()
    expect(screen.queryByText(/29 août/)).not.toBeInTheDocument()
    // En-tête de mois : août, et non septembre
    expect(screen.getByRole('heading', { name: 'Août 2026' })).toBeInTheDocument()
    // Intitulé du bouton : jour de la semaine complet, dans ton fuseau
    expect(screen.getByRole('button', { name: /Vendredi 28 août/ })).toBeInTheDocument()
  })

  it('laisse l’auteur marquer une étape après coup, sans rechargement', async () => {
    afficherLeFil()
    fireEvent.click(await screen.findByRole('button', { name: /Vendredi 28 août/ }))

    const marquer = await screen.findByRole('button', { name: /Marquer une étape/ })
    expect(screen.queryByText('Étape')).not.toBeInTheDocument()

    fireEvent.click(marquer)
    await waitFor(() => expect(updates).toEqual([{ is_milestone: true }]))
    // Les badges (carte + lightbox) et le libellé du bouton suivent l'état local,
    // sans relire la base.
    expect(await screen.findAllByText('Étape')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /Retirer l’étape/ })).toBeInTheDocument()
  })

  it('ne propose le marquage qu’à l’auteur du vlog', async () => {
    useAuthStore.setState({
      profile: { ...profilVarsovie, id: 'clarisse', display_name: 'Clarisse' } as unknown as Profile,
      partnerProfile: null,
    })
    afficherLeFil()
    fireEvent.click(await screen.findByRole('button', { name: /Vendredi 28 août/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /étape/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument()
  })
})
