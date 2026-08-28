import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Hamster from '@/components/Hamster'

/**
 * L'accueil affiche deux hamsters côte à côte (toi, l'autre). Tant que le dégradé
 * du pelage portait un identifiant en dur, la page contenait deux fois le même
 * `id` : HTML invalide, et le second `url(#…)` renvoyait au dégradé du premier.
 */
describe('Hamster — identifiants uniques par instance', () => {
  it('donne un identifiant différent à chaque dégradé de la page', () => {
    const { container } = render(
      <>
        <Hamster state="joyful" />
        <Hamster state="love" />
        <Hamster state={null} dim />
      </>,
    )
    const ids = Array.from(container.querySelectorAll('radialGradient')).map((g) => g.id)
    expect(ids).toHaveLength(3)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(3)
  })

  it('fait pointer chaque hamster sur SON propre dégradé', () => {
    const { container } = render(
      <>
        <Hamster state="joyful" />
        <Hamster state="love" />
      </>,
    )
    const svgs = Array.from(container.querySelectorAll('svg'))
    expect(svgs).toHaveLength(2)
    for (const svg of svgs) {
      const gradientId = svg.querySelector('radialGradient')?.id
      const corps = Array.from(svg.querySelectorAll('path')).find((p) => (p.getAttribute('fill') ?? '').startsWith('url('))
      expect(gradientId).toBeTruthy()
      expect(corps?.getAttribute('fill')).toBe(`url(#${gradientId})`)
    }
  })

  it('n’écrit que des caractères sûrs dans l’identifiant', () => {
    const { container } = render(<Hamster state="peaceful" />)
    const id = container.querySelector('radialGradient')?.id ?? ''
    expect(id).toMatch(/^hm-fur-[A-Za-z0-9_-]+$/)
  })
})
