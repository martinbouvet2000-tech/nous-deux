import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'

/**
 * Le raccourci de position est l'étape la plus difficile d'Awy, et elle se fait
 * sur un téléphone. Renvoyer en texte brut à un fichier du dépôt n'y menait
 * nulle part : l'essentiel doit être atteignable depuis l'écran des Réglages.
 */

const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn(() => {
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'eq', 'delete']) builder[method] = vi.fn(() => builder)
    builder.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    return builder
  })
  return { mockFrom }
})

vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom, rpc: vi.fn() } }))

import BackgroundLocationTokens from '@/components/settings/BackgroundLocationTokens'
import { useAuthStore } from '@/stores/authStore'
import { URL_INGESTION } from '@/lib/positionArrierePlan'

describe('Position en arrière-plan — le mode d’emploi vit dans l’app', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'martin' } as unknown as User })
  })

  /** Rendu, liste des jetons chargée : sans ça, React râle sur un `act` manquant. */
  async function afficher() {
    render(<BackgroundLocationTokens />)
    await screen.findByText(/Aucun raccourci pour l’instant/)
  }

  it('offre un dépliant plutôt qu’un chemin de fichier à aller chercher', async () => {
    await afficher()
    const depliant = screen.getByText('Régler le raccourci, étape par étape')
    expect(depliant).toBeInTheDocument()
    // Cible tactile : le résumé se touche au doigt comme n’importe quel bouton.
    expect(depliant.className).toContain('tap-44')
    expect(depliant.closest('details')).not.toBeNull()
  })

  it('donne sur place l’adresse, le corps JSON et le principe de l’automatisation', async () => {
    await afficher()
    expect(screen.getByText(URL_INGESTION)).toBeInTheDocument()
    const corps = screen.getByText(/"token"/)
    for (const cle of ['token', 'lat', 'lng', 'accuracy']) expect(corps.textContent).toContain(cle)
    // Le réglage sans lequel rien ne part jamais tout seul.
    expect(screen.getByText(/Demander avant d’exécuter/)).toBeInTheDocument()
    expect(screen.getByText(/Automatisation/)).toBeInTheDocument()
  })

  it('renvoie au document complet en complément, jamais à sa place', async () => {
    await afficher()
    expect(screen.getByText(/docs\/position-en-arriere-plan\.md/)).toBeInTheDocument()
    // La consigne d’origine — « expliquée dans docs/… » — ne doit plus être le
    // seul chemin proposé depuis un téléphone.
    expect(screen.queryByText(/expliquée dans/)).toBeNull()
  })
})
